import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { loadSettings, useSettings } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { fetchRoute, formatDistance, formatEta, type Route } from '@/lib/directions';
import { bearing, distanceMeters, type LatLng } from '@/lib/geo';
import { Navigator, type NavState } from '@/lib/navigator';

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Closer than this, you're at the bike. */
const AT_BIKE_M = 15;
const REROUTE_EVERY_MS = 15_000;

/**
 * Walking directions from you to your parked bike: the route is drawn as soon as we know
 * where you are, the next turn is shown, and it re-plans if you walk off the route.
 */
export default function ParkedScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const scheme = useColorScheme();
  const { settings, loaded, update } = useSettings();
  const params = useLocalSearchParams<{ edit?: string }>();
  const mapRef = useRef<MapView>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [walk, setWalk] = useState<Route | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [routing, setRouting] = useState(false);
  const [walkError, setWalkError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // Pin-adjust mode: a fixed pin in the middle of the map; the rider moves the map under it.
  const [editing, setEditing] = useState(params.edit === '1');
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const parked = settings.parked;

  const startEditing = () => {
    if (!parked) return;
    setDraft(parked);
    setEditing(true);
    mapRef.current?.animateCamera({ center: parked, zoom: 18, altitude: 300 }, { duration: 400 });
  };

  const confirmLocation = async () => {
    const spot = draft ?? parked;
    if (!spot || !parked) return;
    setSaving(true);
    // Keep the original parking time; only the position is being corrected.
    await update('parked', { latitude: spot.latitude, longitude: spot.longitude, savedAt: parked.savedAt });
    setSaving(false);
    setEditing(false);
    setWalk(null);
    setNav(null);
    setRetry((n) => n + 1); // re-plan the walking route to the corrected spot
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Parking location saved', 'Your bike is marked at the new spot.');
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let sub: Location.LocationSubscription | null = null;
      let navigator: Navigator | null = null;
      let fetching = false;
      let lastPlan = 0;
      let framed = false;

      const plan = async (from: LatLng, bike: LatLng) => {
        fetching = true;
        lastPlan = Date.now();
        setRouting(true);
        try {
          const r = await fetchRoute(from, bike, 'walk');
          if (cancelled) return;
          navigator = new Navigator(r, false);
          setWalk(r);
          setNav(navigator.update(from));
          setWalkError(null);
          // Don't move the map while the rider is positioning the pin.
          if (!framed && !editingRef.current) {
            framed = true;
            mapRef.current?.fitToCoordinates([...r.coords, from], {
              edgePadding: { top: 120, right: 60, bottom: 320, left: 60 },
              animated: true,
            });
          }
        } catch {
          if (!cancelled) setWalkError('Could not get a walking route. Check your internet connection.');
        } finally {
          fetching = false;
          if (!cancelled) setRouting(false);
        }
      };

      (async () => {
        const [perm, { parked: bike }] = await Promise.all([
          Location.requestForegroundPermissionsAsync(),
          loadSettings(db),
        ]);
        if (!perm.granted || !bike || cancelled) return;

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 3 },
          (loc) => {
            const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setHere(pos);
            if (distanceMeters(pos, bike) < AT_BIKE_M || fetching) return;
            if (!navigator) {
              plan(pos, bike);
              return;
            }
            const state = navigator.update(pos);
            setNav(state);
            if (state.offRoute && Date.now() - lastPlan > REROUTE_EVERY_MS) plan(pos, bike);
          },
        );
        if (cancelled) sub.remove();
      })().catch(() => {});

      return () => {
        cancelled = true;
        sub?.remove();
      };
      // `retry` restarts everything after a failed route request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, retry]),
  );

  if (loaded && !parked) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Icon name="parking" size={48} themeColor="textMuted" />
        <ThemedText type="heading">No parking spot saved</ThemedText>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </ThemedView>
    );
  }
  if (!parked) return <ThemedView style={styles.container} />;

  const straight = here ? distanceMeters(here, parked) : null;
  const atBike = straight != null && straight < AT_BIKE_M;
  const direction = here ? COMPASS[Math.round(bearing(here, parked) / 45) % 8] : null;
  const parkedAt = new Date(parked.savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  let title = 'Locating you…';
  let subtitle = 'Your bike is marked on the map';
  if (atBike) {
    title = "You're at your bike";
    subtitle = `Parked at ${parkedAt}`;
  } else if (nav && walk) {
    title = formatDistance(nav.remaining);
    subtitle = `${formatEta(nav.remainingS)} walk · parked at ${parkedAt}`;
  } else if (straight != null) {
    title = formatDistance(straight);
    subtitle = `${direction} of you · parked at ${parkedAt}`;
  }

  const next = nav?.next;
  const showStep = !atBike && next && !nav?.offRoute;
  const pin = draft ?? parked;
  const pinFromYou = here ? distanceMeters(here, pin) : null;

  return (
    <ThemedView style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={
          editing
            ? { ...parked, latitudeDelta: 0.0015, longitudeDelta: 0.0015 }
            : { ...parked, latitudeDelta: 0.005, longitudeDelta: 0.005 }
        }
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => {
          if (editing) setDraft({ latitude: r.latitude, longitude: r.longitude });
        }}
        onPress={(e) => {
          // Tap a spot to move the pin there.
          if (editing) mapRef.current?.animateCamera({ center: e.nativeEvent.coordinate }, { duration: 300 });
        }}>
        {walk && !atBike && !editing ? (
          <Polyline
            coordinates={walk.coords}
            strokeColor={theme.accent}
            strokeWidth={6}
            lineDashPattern={[2, 10]}
            lineCap="round"
          />
        ) : null}
        {!editing ? <Marker coordinate={parked} title="Your bike" pinColor={theme.accent} /> : null}
      </MapView>

      {editing ? (
        // The pin's tip sits exactly on the map's centre, which is what gets saved.
        <View style={[StyleSheet.absoluteFill, styles.centerPin]} pointerEvents="none">
          <View style={styles.pinLift}>
            <Icon name="map-marker" size={52} themeColor="accent" />
          </View>
          <View style={[styles.pinDot, { backgroundColor: theme.text }]} />
        </View>
      ) : null}

      <SafeView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <Button title="Close" icon="close" variant="secondary" small style={styles.close} onPress={() => router.back()} />

        {editing ? (
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
                <Icon name="map-marker-radius" size={26} themeColor="accent" />
              </View>
              <View style={styles.flex}>
                <ThemedText type="heading">Set your bike&apos;s location</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Drag the map so the pin is on your bike, or tap the spot.
                  {pinFromYou != null ? ` Pin is ${formatDistance(pinFromYou)} from you.` : ''}
                </ThemedText>
              </View>
            </View>
            <Button
              title={saving ? 'Saving…' : 'Confirm parking location'}
              icon="check"
              large
              disabled={saving}
              onPress={confirmLocation}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => {
                setEditing(false);
                setDraft(null);
              }}
            />
          </View>
        ) : (
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: atBike ? theme.successSoft : theme.accentSoft }]}>
                <Icon name={atBike ? 'check-circle' : 'walk'} size={26} themeColor={atBike ? 'success' : 'accent'} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="subtitle">{title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {subtitle}
                </ThemedText>
              </View>
            </View>

            {showStep ? (
              <View style={[styles.step, { backgroundColor: theme.text }]}>
                <Icon name={next.type === 'arrive' ? 'motorbike' : next.icon} size={32} color={theme.background} />
                <View style={styles.flex}>
                  <ThemedText type="heading" style={{ color: theme.background }}>
                    {formatDistance(nav!.distanceToNext)}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.background }} numberOfLines={2}>
                    {next.type === 'arrive' ? 'Your bike is ahead' : next.instruction}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {!atBike && (routing || nav?.offRoute) ? (
              <ThemedText type="small" themeColor="textSecondary">
                {walk ? 'Updating route…' : 'Finding walking route…'}
              </ThemedText>
            ) : null}

            {walkError && !atBike ? (
              <>
                <ThemedText type="small" themeColor="danger">
                  {walkError}
                </ThemedText>
                <Button title="Try again" icon="backup-restore" variant="secondary" onPress={() => setRetry((n) => n + 1)} />
              </>
            ) : null}

            <Button title="Adjust bike location" icon="map-marker-radius" variant="secondary" onPress={startEditing} />
          </View>
        )}
      </SafeView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  overlay: {
    flex: 1,
    padding: Spacing.three,
  },
  close: {
    alignSelf: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  sheet: {
    marginTop: 'auto',
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLift: {
    // Raise the icon by its own height so the point of the pin, not its middle, is on centre.
    marginBottom: 52,
  },
  pinDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
});
