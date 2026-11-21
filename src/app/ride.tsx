import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Platform, Pressable, StyleSheet, useWindowDimensions, Vibration, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/button';
import { Speedometer } from '@/components/gauges';
import { MiniMap } from '@/components/mini-map';
import { MapCompass } from '@/components/map-compass';
import { HoldButton } from '@/components/hold-button';
import { Icon, type IconName } from '@/components/icon';
import { QuickChatBanner, QuickChatSheet } from '@/components/quick-chat';
import { formatAway, RiderMarker, riderMarkerKey, riderStatus, RidingMarker } from '@/components/rider-marker';
import { myLook, RiderSheet } from '@/components/rider-sheet';
import { RiderStrip } from '@/components/rider-strip';
import { Stat } from '@/components/stat';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ToastHost } from '@/components/toast-host';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { MIN_RIDE_DISTANCE_M } from '@/db/rides';
import { loadSettings, saveSetting, type Settings } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadActiveVehicle } from '@/hooks/use-garage';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useRiderIdentity } from '@/hooks/use-rider-identity';
import { showToast } from '@/lib/toast';
import {
  currentGroupCode,
  listenQuickChat,
  ridersOf,
  sendQuickChat,
  useGroupRide,
  type QuickChat,
  type Rider,
} from '@/lib/group-ride';
import { quickMessage, type QuickMessage } from '@/lib/quick-chat';
import { arrivalClock, fetchRoute, formatDistance, formatEta, type Route } from '@/lib/directions';
import { averageKmh, distanceMeters, formatDuration, formatKm, msToKmh, type LatLng } from '@/lib/geo';
import { Navigator, type NavState } from '@/lib/navigator';
import { PermissionError, RideSession, type RideSnapshot } from '@/lib/ride-session';
import { TRACKING_GAP_S } from '@/lib/telemetry';

const UI_REFRESH_MS = 250;
const REROUTE_EVERY_MS = 15_000;

function gpsQuality(accuracy: number | null) {
  if (accuracy == null) return { label: 'Searching GPS', color: 'textMuted' as const };
  if (accuracy <= 10) return { label: 'GPS strong', color: 'success' as const };
  if (accuracy <= 25) return { label: 'GPS fair', color: 'warning' as const };
  return { label: 'GPS weak', color: 'danger' as const };
}

/**
 * Whether the ride can keep recording with the phone locked. The first time, explains why and asks
 * for "Allow all the time" (Android opens its settings page for this); after that it only checks.
 */
async function canTrackInBackground(db: SQLiteDatabase, settings: Settings): Promise<boolean> {
  if (!(await TaskManager.isAvailableAsync())) return false;
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) return true;
  if (settings.backgroundLocationAsked || !bg.canAskAgain) return false;

  await saveSetting(db, 'backgroundLocationAsked', true);
  const allow = await new Promise<boolean>((resolve) =>
    Alert.alert(
      'Keep recording when locked?',
      'To record your whole ride with the phone locked or in your pocket, Yatri needs location ' +
        '"Allow all the time". Yatri only uses it while a ride is recording.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    ),
  );
  if (!allow) return false;
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}

export default function RideScreen() {
  useKeepAwake();
  const db = useSQLiteContext();
  const theme = useTheme();
  const scheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ destLat?: string; destLng?: string; destName?: string }>();
  // A place you picked yourself in Navigate. It stays yours: the group's destination doesn't replace it.
  const ownDestination: (LatLng & { name: string }) | null =
    params.destLat && params.destLng
      ? { latitude: Number(params.destLat), longitude: Number(params.destLng), name: params.destName ?? 'Destination' }
      : null;
  // Otherwise, in a group ride, head for the group's destination, and follow it if the leader changes it.
  const group = useGroupRide();
  const groupDestination = group.code && !group.ended ? group.destination : null;
  const destination = ownDestination ?? groupDestination;
  const destKey = destination ? `${destination.latitude},${destination.longitude},${destination.name}` : '';

  const sessionRef = useRef<RideSession | null>(null);
  // The destination as of the latest render, for code that runs outside React (GPS ticks).
  const destRef = useRef(destination);
  useEffect(() => {
    destRef.current = destination;
  });
  const planRouteRef = useRef<((from: LatLng, voice: boolean) => Promise<void>) | null>(null);
  const sessionStartedRef = useRef(false);
  const mapRef = useRef<MapView>(null);
  const navRef = useRef<Navigator | null>(null);
  const [snap, setSnap] = useState<RideSnapshot | null>(null);
  const [nav, setNav] = useState<NavState | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [navError, setNavError] = useState<string | null>(null);
  // Navigating or riding with a group: the map matters most, so start there.
  const [view, setView] = useState<'map' | 'gauge'>(() => (destination || currentGroupCode() ? 'map' : 'gauge'));
  const [following, setFollowing] = useState(true);
  const [meta, setMeta] = useState({ limit: 60, alertOn: true, gaugeMax: 120 });
  // Live traffic layer on the map; the choice is remembered.
  const [traffic, setTraffic] = useState(true);
  const toggleTraffic = () => {
    const next = !traffic;
    setTraffic(next);
    saveSetting(db, 'showTraffic', next);
    showToast(next ? 'Live traffic on' : 'Live traffic off', { icon: 'traffic-light', durationMs: 1500 });
  };
  // How you look on the map: same avatar friends see. Re-read after "Change my look".
  const look = useRiderIdentity();

  // Group ride: friends on the map (empty when not in a group).
  const now = useNow();
  const everyone = group.code && !group.ended ? ridersOf(group, now) : [];
  const friends = everyone.filter((r) => !r.isMe);
  const self = everyone.find((r) => r.isMe) ?? null;
  const [stripOpen, setStripOpen] = useState(false);
  const [focusedRider, setFocusedRider] = useState<string | null>(null);
  // Rider card (speed, distance, nickname, look). Looked up each render so it stays live.
  const [sheetUid, setSheetUid] = useState<string | null>(null);
  const sheetRider = sheetUid ? everyone.find((r) => r.uid === sheetUid) : undefined;

  // Quick chat: one-tap messages out, a banner (and voice) for messages in.
  const [chatOpen, setChatOpen] = useState(false);
  const chatAvailable = !!group.code && !group.ended;
  const [incoming, setIncoming] = useState<(QuickChat & { message: QuickMessage }) | null>(null);
  const voiceRef = useRef(true);
  const everyoneRef = useRef(everyone);
  useEffect(() => {
    everyoneRef.current = everyone;
  });
  useEffect(() => {
    if (!group.code || group.ended) return;
    return listenQuickChat((m) => {
      const message = quickMessage(m.msg);
      if (!message) return;
      if (m.uid === group.me) {
        showToast(`Sent: ${message.text}`, { icon: 'check' });
        return;
      }
      setIncoming({ ...m, message });
      Vibration.vibrate(120);
      const name = everyoneRef.current.find((r) => r.uid === m.uid)?.name ?? 'A rider';
      if (voiceRef.current) Speech.speak(`${name}: ${message.text}`);
    });
  }, [group.code, group.ended, group.me]);
  // The banner stays a few seconds, then gets out of the way.
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => setIncoming(null), 7000);
    return () => clearTimeout(t);
  }, [incoming]);
  const sender = incoming ? everyone.find((r) => r.uid === incoming.uid) : undefined;
  const incomingFrom = sender
    ? { name: sender.name, avatar: sender.avatar, photo: sender.photo, color: sender.color }
    : null;

  // Heading-up (map turns with you) by default; the compass switches to north-up and back.
  const [northUp, setNorthUp] = useState(false);
  const [mapHeading, setMapHeading] = useState(0);

  // Read inside the interval callback, which outlives any one render.
  const followRef = useRef(true);
  const viewRef = useRef(view);
  const northUpRef = useRef(northUp);
  useEffect(() => {
    followRef.current = following;
    viewRef.current = view;
    northUpRef.current = northUp;
  }, [following, view, northUp]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let session: RideSession | null = null;
    let lastFix = 0;
    let lastReroute = 0;
    let rerouting = false;

    // Always routes to the current destination (it can change mid-ride in a group).
    const planRoute = async (from: LatLng, voice: boolean) => {
      const dest = destRef.current;
      if (!dest) return;
      rerouting = true;
      try {
        const r = await fetchRoute(from, dest);
        // Dropped if the destination changed again while this was loading.
        const now = destRef.current;
        if (cancelled || !now || now.latitude !== dest.latitude || now.longitude !== dest.longitude) return;
        navRef.current = new Navigator(r, voice);
        setRoute(r);
        setNavError(null);
        navRef.current.start();
      } catch {
        if (!cancelled) setNavError('No directions right now. Still recording your ride.');
      } finally {
        rerouting = false;
      }
    };
    planRouteRef.current = planRoute;

    const onTick = () => {
      if (!session) return;
      const s = session.snapshot();
      setSnap(s);
      if (!s.position || s.fixAt === lastFix) return;
      lastFix = s.fixAt;

      const navigator = navRef.current;
      if (navigator) {
        const state = navigator.update(s.position);
        setNav(state);
        const now = Date.now();
        if (state.offRoute && !state.arrived && !rerouting && now - lastReroute > REROUTE_EVERY_MS) {
          lastReroute = now;
          planRoute(s.position, true);
        }
      }

      if (followRef.current && viewRef.current === 'map') {
        // Heading-up with no real direction yet (not moving): keep the map's current rotation.
        const heading = northUpRef.current ? 0 : s.heading;
        mapRef.current?.animateCamera(
          { center: s.position, ...(heading != null && { heading }), pitch: navigator ? 45 : 0, zoom: 17, altitude: 500 },
          { duration: 900 },
        );
      }
    };

    (async () => {
      const [settings, { active }] = await Promise.all([loadSettings(db), loadActiveVehicle(db)]);
      setMeta({
        limit: settings.speedLimitKmh,
        alertOn: settings.overspeedAlert,
        gaugeMax: active?.type === 'motorbike' ? 160 : 120,
      });
      // Quick messages are read out with the same switch as the other voice alerts.
      voiceRef.current = settings.voiceAlerts;
      setTraffic(settings.showTraffic);
      session = new RideSession(db, settings, active?.id ?? null);
      try {
        const background = await canTrackInBackground(db, settings).catch(() => false);
        await session.start(background);
      } catch (e) {
        await session.stop(false).catch(() => {});
        if (cancelled) return;
        const message = e instanceof PermissionError ? e.message : 'Could not start GPS.';
        Alert.alert('Cannot start ride', message, [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      if (cancelled) {
        await session.stop(false);
        return;
      }
      sessionRef.current = session;
      timer = setInterval(onTick, UI_REFRESH_MS);

      sessionStartedRef.current = true;
      if (destRef.current) {
        const pos =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelled && pos) planRoute({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, settings.voiceAlerts);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      // Screen closed without pressing Stop: keep the ride if it went somewhere,
      // and either way remember where the bike ended up.
      if (session && sessionRef.current === session) {
        sessionRef.current = null;
        const snap = session.snapshot();
        session
          .stop(snap.distance >= MIN_RIDE_DISTANCE_M)
          .then(() => (snap.position ? saveSetting(db, 'parked', { ...snap.position, savedAt: Date.now() }) : undefined))
          .catch(() => {});
      }
    };
    // The ride is set up once per screen; later destination changes are handled below.
  }, [db]);

  // The group's destination was set, changed or cleared mid-ride: re-plan from where you are.
  const lastDestKeyRef = useRef(destKey);
  useEffect(() => {
    if (lastDestKeyRef.current === destKey) return;
    lastDestKeyRef.current = destKey;
    // Before the ride has started, the start-up code plans the first route itself.
    if (!sessionStartedRef.current) return;
    const dest = destRef.current;
    if (!dest) {
      navRef.current = null;
      setRoute(null);
      setNav(null);
      setNavError(null);
      showToast('Group destination removed', { icon: 'flag-off-outline' });
      return;
    }
    navRef.current = null;
    setNav(null);
    setRoute(null);
    setFollowing(true);
    setView('map');
    showToast(`New destination: ${dest.name}`, { icon: 'flag-checkered', durationMs: 3500 });
    if (voiceRef.current) Speech.speak(`New destination: ${dest.name}`);
    const from = sessionRef.current?.snapshot().position;
    if (from) planRouteRef.current?.(from, voiceRef.current);
    else
      Location.getLastKnownPositionAsync()
        .then((p) => p && planRouteRef.current?.({ latitude: p.coords.latitude, longitude: p.coords.longitude }, voiceRef.current))
        .catch(() => {});
  }, [destKey]);

  const end = async (save: boolean) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) {
      router.back();
      return;
    }
    const endPoint = await session.stop(save);
    if (save) {
      if (endPoint) await saveSetting(db, 'parked', { ...endPoint, savedAt: Date.now() });
      router.replace({ pathname: '/rides/[id]', params: { id: String(session.rideId), fresh: '1' } });
    } else {
      router.back();
    }
  };

  /**
   * Too short to count as a ride: discard it without asking, but the bike may still have
   * moved (e.g. across the parking lot), so update where it's parked.
   */
  const endShort = async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) {
      router.back();
      return;
    }
    const lastFix = session.snapshot().position;
    await session.stop(false);
    if (lastFix) await saveSetting(db, 'parked', { ...lastFix, savedAt: Date.now() });
    showToast(`Too short to save (under ${MIN_RIDE_DISTANCE_M} m)`, { icon: 'information-outline' });
    router.back();
  };

  const finish = () => {
    const s = sessionRef.current?.snapshot();
    // Under the minimum isn't a ride (a test start, GPS drift): don't ask, discard and leave.
    if (!s || s.distance < MIN_RIDE_DISTANCE_M) {
      endShort();
      return;
    }
    Alert.alert('Save this ride?', `${formatKm(s.distance)} km in ${formatDuration(s.elapsedS)}`, [
      { text: 'Discard', style: 'destructive', onPress: () => end(false) },
      { text: 'Save', style: 'default', onPress: () => end(true) },
    ]);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Ride in progress', 'Hold the Finish button to end your ride.');
      return true;
    });
    return () => sub.remove();
  }, []);

  // Without background permission GPS only runs while Yatri is on screen.
  // If the rider locks the phone, say so when they're back.
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        leftAt ??= Date.now();
        return;
      }
      const away = leftAt ? (Date.now() - leftAt) / 1000 : 0;
      leftAt = null;
      const session = sessionRef.current;
      if (!session || session.backgroundTracking || session.snapshot().paused || away < TRACKING_GAP_S) return;
      Alert.alert(
        'Ride not tracked while locked',
        `Yatri couldn't record for ${formatDuration(away)}, so that part shows as a straight line. ` +
          'Keep Yatri open while riding, or allow location "All the time" for Yatri in your phone settings.',
      );
    });
    return () => sub.remove();
  }, []);

  const togglePause = () => {
    const session = sessionRef.current;
    if (!session || !snap) return;
    if (snap.paused) session.resume();
    else session.pause();
    setSnap(session.snapshot());
  };

  const recenter = (north = northUp) => {
    setFollowing(true);
    setFocusedRider(null);
    if (snap?.position) {
      mapRef.current?.animateCamera(
        {
          center: snap.position,
          // Heading-up before there's a real direction (not moving yet): leave the map as it is.
          heading: north ? 0 : (snap.heading ?? mapHeading),
          pitch: route ? 45 : 0,
          zoom: 17,
          altitude: 500,
        },
        { duration: 500 },
      );
    }
  };

  /** Compass tap: switch between north-up and heading-up, and follow the rider again. */
  const toggleNorthUp = () => {
    const next = !northUp;
    setNorthUp(next);
    recenter(next);
  };

  /**
   * Strip card tap: just fly to where they are (tap their icon on the map for their card).
   * Your own card brings the map back to you.
   */
  const focusRider = (rider: Rider) => {
    if (rider.isMe) {
      recenter();
      return;
    }
    if (!rider.position) return;
    setFollowing(false);
    setFocusedRider(rider.uid);
    mapRef.current?.animateCamera({ center: rider.position, zoom: 16, pitch: 0 }, { duration: 700 });
  };

  /** "Everyone": zoom out to show every rider, and stop following until re-centred. */
  const showGroup = () => {
    const points = friends.flatMap((r) => (r.position ? [r.position] : []));
    if (snap?.position) points.push(snap.position);
    if (points.length === 0) return;
    setFollowing(false);
    setFocusedRider(null);
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 60, bottom: 120, left: 60 },
      animated: true,
    });
  };

  const readHeading = () => {
    mapRef.current
      ?.getCamera()
      .then((c) => setMapHeading(c.heading ?? 0))
      .catch(() => {});
  };

  const s = snap;
  const kmh = s?.hasFix ? msToKmh(s.speed) : null;
  const avgKmh = s ? averageKmh(s.distance, s.movingS) : 0;
  const gps = gpsQuality(s?.gpsAccuracy ?? null);
  const status = s?.paused ? 'PAUSED' : s?.hasFix ? 'KM/H' : 'WAITING FOR GPS';
  // The map above gets the rest of the height; keep the dial big but not greedy.
  const gaugeSize = Math.min(width - Spacing.four * 2, 270, Math.round(height * 0.3));
  const overspeed = !!s?.overspeeding;
  // How far the sender was from you when they sent it.
  const incomingAway =
    incoming?.position && s?.position ? `${formatAway(distanceMeters(s.position, incoming.position))} away` : null;

  return (
    <View style={[styles.container, { backgroundColor: overspeed ? theme.dangerSoft : theme.background }]}>
      <SafeView style={styles.safeArea}>
        <View style={styles.topBar}>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.dot, { backgroundColor: theme[gps.color] }]} />
            <ThemedText type="small">{gps.label}</ThemedText>
          </View>
          <ThemedText type="number">{formatDuration(s?.elapsedS ?? 0)}</ThemedText>
          <View style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}>
            {(['map', 'gauge'] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                accessibilityLabel={v === 'map' ? 'Map view' : 'Speedometer view'}
                style={[styles.toggleBtn, view === v && { backgroundColor: theme.accent }]}>
                <Icon name={v === 'map' ? 'map' : 'speedometer'} size={18} color={view === v ? theme.onAccent : theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Incoming quick message from the group, over whatever is below the top bar. */}
        <View style={styles.chatSlot} pointerEvents="box-none">
          {incoming && incomingFrom ? (
            <QuickChatBanner
              key={incoming.key}
              message={incoming.message}
              from={incomingFrom}
              away={incomingAway}
              onPress={() => setIncoming(null)}
            />
          ) : null}
        </View>

        {overspeed ? (
          <View style={[styles.banner, { backgroundColor: theme.danger }]}>
            <Icon name="alert-circle" size={20} color={theme.onAccent} />
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Slow down · limit {meta.limit} 
              
            </ThemedText>
          </View>
        ) : null}

        {destination && (nav || navError) ? (
          <View style={[styles.turn, { backgroundColor: nav?.arrived ? theme.success : theme.accent }]}>
            {nav?.arrived ? (
              <>
                <Icon name="flag-checkered" size={36} color={theme.background} />
                <View style={styles.flex}>
                  <ThemedText type="heading" style={{ color: theme.background }}>
                    You&apos;ve arrived
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.background }} numberOfLines={1}>
                    {destination.name} · hold Finish to save your ride
                  </ThemedText>
                </View>
              </>
            ) : nav?.next ? (
              <>
                <View style={styles.turnIcon}>
                  <Icon name={nav.next.icon} size={36} color={theme.onAccent} />
                </View>
                <View style={styles.flex}>
                  <ThemedText style={[styles.turnDistance, { color: theme.onAccent }]}>
                    {formatDistance(nav.distanceToNext)}
                  </ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.onAccent }} numberOfLines={2}>
                    {nav.offRoute ? 'Finding a new route…' : nav.next.instruction}
                  </ThemedText>
                </View>
              </>
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                {navError ?? 'Getting directions…'}
              </ThemedText>
            )}
          </View>
        ) : null}

        {view === 'map' ? (
          <View style={[styles.mapBox, { borderColor: overspeed ? theme.danger : 'transparent' }]}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              // Our own marker replaces the blue dot once GPS has a good fix.
              showsUserLocation={!s?.position}
              showsMyLocationButton={false}
              toolbarEnabled={false}
              showsPointsOfInterests={false}
              // Live traffic colours on the roads (Google on Android, Apple on iPhone; no extra cost).
              showsTraffic={traffic}
              userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
              initialCamera={
                s?.position
                  ? { center: s.position, heading: s.heading ?? 0, pitch: 0, zoom: 17, altitude: 500 }
                  : undefined
              }
              showsCompass={false}
              onRegionChangeComplete={readHeading}
              onPanDrag={() => following && setFollowing(false)}>
              {route ? (
                <Polyline coordinates={route.coords} strokeColor={theme.accent} strokeWidth={7} lineJoin="round" lineCap="round" />
              ) : null}
              {s && s.route.length > 1 ? (
                <Polyline
                  coordinates={s.route}
                  strokeColor={route ? theme.textMuted : theme.accent}
                  strokeWidth={route ? 4 : 5}
                  lineJoin="round"
                  lineCap="round"
                />
              ) : null}
              {destination ? <Marker coordinate={destination} title={destination.name} pinColor={theme.accent} /> : null}
              {group.destination && !destination && !group.ended ? (
                <Marker
                  coordinate={group.destination}
                  title={group.destination.name}
                  description="Group destination"
                  pinColor={theme.accent}
                />
              ) : null}
              {s?.position ? (
                // You: a rider on a bike, pointing where you're heading.
                <RidingMarker
                  position={s.position}
                  heading={s.heading}
                  mapHeading={mapHeading}
                  color={theme.accent}
                  onPress={self ? () => setSheetUid(self.uid) : undefined}
                />
              ) : null}
              {friends.map((r) => (
                <RiderMarker
                  key={riderMarkerKey(r)}
                  onPress={() => setSheetUid(r.uid)}
                  rider={r}
                  description={riderStatus(r, s?.position ?? null, now)}
                />
              ))}
            </MapView>

            {group.code && !group.ended ? (
              <RiderStrip
                riders={friends}
                self={self}
                selfIdentity={look}
                me={s?.position ?? null}
                now={now}
                open={stripOpen}
                selected={focusedRider}
                onToggle={() => setStripOpen((o) => !o)}
                onSelect={focusRider}
                onShowAll={showGroup}
                style={styles.strip}
              />
            ) : null}

            <View style={[styles.speedBubble, { backgroundColor: theme.backgroundElement, borderColor: overspeed ? theme.danger : theme.border }]}>
              <ThemedText style={[styles.bubbleSpeed, { color: overspeed ? theme.danger : theme.text }]}>
                {kmh == null ? '--' : Math.round(kmh)}
              </ThemedText>
              <ThemedText type="caption" themeColor="textMuted">
                km/h
              </ThemedText>
            </View>

            <MapCompass heading={mapHeading} active={northUp} onPress={toggleNorthUp} style={styles.compass} />

            <Pressable
              onPress={toggleTraffic}
              accessibilityRole="switch"
              accessibilityState={{ checked: traffic }}
              accessibilityLabel="Live traffic"
              style={({ pressed }) => [
                styles.trafficButton,
                { backgroundColor: theme.backgroundElement, borderColor: traffic ? theme.accent : theme.border },
                pressed && styles.fabPressed,
              ]}>
              <Icon name="traffic-light" size={22} color={traffic ? theme.accent : theme.textMuted} />
            </Pressable>

            {!following ? (
              <Pressable
                onPress={() => recenter()}
                // Sits above the chat button when that's showing.
                style={[styles.recenter, chatAvailable && styles.recenterRaised, { backgroundColor: theme.backgroundElement }]}
                accessibilityLabel="Re-centre map">
                <Icon name="crosshairs-gps" size={24} themeColor="accent" />
              </Pressable>
            ) : null}

            {chatAvailable ? <ChatFab onPress={() => setChatOpen(true)} style={styles.chatFab} /> : null}
          </View>
        ) : (
          <>
            {/* Top: a live map (route when navigating, friends in a group). Tap for the full map. */}
            <View style={styles.glanceMap}>
            <MiniMap
              style={styles.flex}
              position={s?.position ?? null}
              heading={northUp ? 0 : (s?.heading ?? null)}
              travelHeading={s?.heading ?? null}
              traffic={traffic}
              route={route?.coords ?? null}
              destination={destination ?? (group.ended ? null : group.destination)}
              friends={friends}
              me={{ name: self?.name ?? look?.name ?? '', ...myLook(self, look), color: theme.accent }}
              label={
                nav && !nav.arrived
                  ? `${formatDistance(nav.remaining)} to go`
                  : friends.length > 0
                    ? `${friends.filter((r) => !r.stale).length + 1} riding`
                    : undefined
              }
              onPress={() => setView('map')}
            />
            {chatAvailable ? <ChatFab onPress={() => setChatOpen(true)} style={styles.chatFabMini} small /> : null}
            </View>

            <View style={styles.gauge}>
              <Speedometer
                speedKmh={kmh}
                maxKmh={meta.gaugeMax}
                limitKmh={meta.alertOn ? meta.limit : undefined}
                overspeeding={overspeed}
                label={status}
                theme={theme}
                size={gaugeSize}
              />
            </View>

            <View style={styles.motionRow}>
              <MotionTile
                icon="angle-acute"
                label="Lean"
                value={`${Math.round(Math.abs(s?.leanDeg ?? 0))}°`}
                max={`max ${Math.round(Math.max(s?.maxLeanA ?? 0, s?.maxLeanB ?? 0))}°`}
              />
              <MotionTile
                icon="axis-arrow"
                label="G-force"
                value={(s?.gForce ?? 0).toFixed(2)}
                max={`max ${(s?.maxG ?? 0).toFixed(2)} g`}
              />
            </View>
          </>
        )}

        <View style={[styles.statsRow, { backgroundColor: theme.backgroundElement }]}>
          {nav && !nav.arrived ? (
            <>
              <Stat compact label="Arrive" value={arrivalClock(nav.remainingS)} />
              <Stat compact label="Left" value={formatEta(nav.remainingS)} />
              <Stat compact label="To go" value={formatDistance(nav.remaining)} />
            </>
          ) : (
            <>
              <Stat compact label="Distance" value={formatKm(s?.distance ?? 0)} unit="km" />
              <Stat compact label="Average" value={avgKmh.toFixed(0)} unit="km/h" />
              <Stat compact label="Top" value={msToKmh(s?.maxSpeed ?? 0).toFixed(0)} unit="km/h" />
            </>
          )}
        </View>

        <View style={styles.controls}>
          <Button
            title={s?.paused ? 'Resume' : 'Pause'}
            icon={s?.paused ? 'play' : 'pause'}
            variant="secondary"
            style={[styles.flex, styles.controlButton]}
            onPress={togglePause}
          />
          <HoldButton
            title="Hold to finish"
            icon="flag-checkered"
            color={theme.danger}
            textColor={theme.text}
            onComplete={finish}
            compact
          />
        </View>
      </SafeView>

      {/* iPhone shows this screen as a separate full-screen layer above the app's own toast;
          give it its own so "Sent" and "New destination" are visible. Android shares one. */}
      {Platform.OS === 'ios' ? <ToastHost /> : null}

      {chatOpen ? (
        <QuickChatSheet
          recipients={friends.length}
          onClose={() => setChatOpen(false)}
          onSend={(m) => {
            setChatOpen(false);
            sendQuickChat(m.id, snap?.position ?? null).catch((e) =>
              Alert.alert('Message not sent', (e as Error).message),
            );
          }}
        />
      ) : null}

      {sheetRider ? (
        <RiderSheet
          key={sheetRider.uid}
          rider={sheetRider}
          identity={look}
          me={s?.position ?? null}
          now={now}
          mySpeedKmh={kmh}
          canMakeLeader={group.leader === group.me && !sheetRider.isMe}
          onClose={() => setSheetUid(null)}
          onShowOnMap={() => {
            setSheetUid(null);
            if (sheetRider.position) {
              setView('map');
              setFollowing(false);
              setFocusedRider(sheetRider.uid);
              mapRef.current?.animateCamera({ center: sheetRider.position, zoom: 16, pitch: 0 }, { duration: 700 });
            }
          }}
        />
      ) : null}
    </View>
  );
}

/** Round accent button for quick messages, sized for a gloved thumb. */
function ChatFab({ onPress, style, small }: { onPress: () => void; style?: object; small?: boolean }) {
  const theme = useTheme();
  const size = small ? 48 : 56;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Send a quick message to the group"
      hitSlop={8}
      style={({ pressed }) => [
        styles.fab,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent, shadowColor: theme.accent },
        pressed && styles.fabPressed,
        style,
      ]}>
      <Icon name="message-flash" size={small ? 22 : 26} color={theme.onAccent} />
    </Pressable>
  );
}

/** Lean / G-force: label and max on the left, the live value large on the right. */
function MotionTile({ icon, label, value, max }: { icon: IconName; label: string; value: string; max: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.motionTile, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.flex}>
        <View style={styles.miniLabel}>
          <Icon name={icon} size={14} themeColor="textMuted" />
          <ThemedText type="caption" themeColor="textMuted">
            {label}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {max}
        </ThemedText>
      </View>
      <ThemedText style={styles.miniValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggle: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 3,
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.94 }],
  },
  // Bottom right of the map: where the right thumb rests.
  chatFab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
  },
  chatFabMini: {
    position: 'absolute',
    right: 10,
    bottom: 10,
  },
  recenterRaised: {
    bottom: Spacing.three + 56 + 12,
  },
  // Zero-height anchor right under the top bar; the banner floats over what's below.
  chatSlot: {
    height: 0,
    // Cancels the screen's 12pt gap so this empty anchor adds no space.
    marginBottom: -12,
    zIndex: 20,
    elevation: 20,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  turn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
  },
  turnIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnDistance: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
  },
  mapBox: {
    flex: 1,
    borderRadius: Radius.large,
    overflow: 'hidden',
    borderWidth: 3,
  },
  speedBubble: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleSpeed: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  compass: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  // Under the compass, same size and shape.
  trafficButton: {
    position: 'absolute',
    top: 12 + 46 + 10,
    right: 12,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  strip: {
    position: 'absolute',
    top: 12,
    left: 12,
    // Clear of the compass in the top-right corner.
    right: 64,
  },
  recenter: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  gauge: {
    alignItems: 'center',
  },
  controlButton: {
    borderRadius: Radius.large,
  },
  glanceMap: {
    // Takes whatever height is left, so the map grows on taller phones.
    flex: 1,
    minHeight: 130,
  },
  motionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  motionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.large,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  miniLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniValue: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: 'auto',
  },
});
