import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ListRow } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { isNorthUp, MapCompass } from '@/components/map-compass';
import { PlaceSheet, sheetHeights } from '@/components/place-sheet';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { FAVORITE_PLACES_MAX, loadSettings, RECENT_PLACES_MAX, saveSetting } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  arrivalClock,
  fetchRoute,
  formatDistance,
  formatEta,
  NEARBY,
  placeAt,
  searchNearby,
  searchPlaces,
  type NearbyCategory,
  type Place,
  type Route,
} from '@/lib/directions';
import { distanceMeters, regionFor, type LatLng } from '@/lib/geo';
import { setGroupDestination } from '@/lib/group-ride';

const SEARCH_DELAY_MS = 400;
/** Two places closer than this (m) count as the same saved place. */
const SAME_PLACE_M = 25;
const PIN_SIZE = 44;
/** Nepal's ambulance number, offered while browsing hospitals. */
const AMBULANCE = '102';
const NEARBY_TITLES: Record<NearbyCategory, string> = {
  fuel: 'Fuel stations',
  hospital: 'Hospitals & clinics',
  food: 'Restaurants & cafés',
  parking: 'Parking',
  toilet: 'Public toilets',
};

export default function NavigateScreen() {
  // Opened from Group ride by the leader: the chosen place becomes the group's destination.
  const forGroup = useLocalSearchParams<{ purpose?: string }>().purpose === 'group';
  const [savingGroup, setSavingGroup] = useState(false);
  const db = useSQLiteContext();
  const theme = useTheme();
  const scheme = useColorScheme();
  const mapRef = useRef<MapView>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [recent, setRecent] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [nearby, setNearby] = useState<Place[]>([]);
  // "Choose on map" mode: a pin fixed at the map centre; the rider drags the map under it.
  const [picking, setPicking] = useState(false);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  // Recent places only appear while the search box is in use, so they don't cover the map.
  const [focused, setFocused] = useState(false);
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  // Nearby and saved places list in a bottom sheet; the highlighted one is bright on the map.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which way the map is turned (0 = north up), for the compass.
  const [mapHeading, setMapHeading] = useState(0);
  const readHeading = () => {
    mapRef.current
      ?.getCamera()
      .then((c) => setMapHeading(c.heading ?? 0))
      .catch(() => {});
  };
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Frame pins between the search bar + chips on top and the half-open sheet below.
  const mapPadding = { top: 190, right: 60, bottom: sheetHeights(screenHeight, insets.top).half + 20, left: 60 };

  /** Same place if it has the same id, or is within a few metres (map-picked spots get new ids). */
  const findFavorite = (place: Place) =>
    favorites.find((f) => f.id === place.id || distanceMeters(f, place) < SAME_PLACE_M);

  const saveFavorites = (next: Place[]) => {
    setFavorites(next);
    saveSetting(db, 'favoritePlaces', next);
  };

  const toggleFavorite = (place: Place) => {
    const existing = findFavorite(place);
    if (existing) {
      saveFavorites(favorites.filter((f) => f !== existing));
      return;
    }
    if (favorites.length >= FAVORITE_PLACES_MAX) {
      Alert.alert('Saved places full', `You can save up to ${FAVORITE_PLACES_MAX} places. Remove one first.`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveFavorites([...favorites, place]);
  };

  const openSaved = () => {
    Keyboard.dismiss();
    setSelected(null);
    setRoute(null);
    setQuery('');
    setCategory(null);
    setError(null);
    setShowSaved(true);
    setActiveId(null);
    if (favorites.length > 0) {
      mapRef.current?.fitToCoordinates(here ? [here, ...favorites] : favorites, {
        edgePadding: mapPadding,
        animated: true,
      });
    }
  };

  /** Highlights one place: its pin turns bright and the map moves to show it next to you. */
  const focusPlace = (place: Place) => {
    setActiveId(place.id);
    mapRef.current?.fitToCoordinates(here ? [here, place] : [place], {
      edgePadding: mapPadding,
      animated: true,
    });
  };

  const closeBrowse = () => {
    setCategory(null);
    setShowSaved(false);
    setActiveId(null);
    setError(null);
  };

  const startPicking = () => {
    Keyboard.dismiss();
    setSelected(null);
    setRoute(null);
    setCategory(null);
    setShowSaved(false);
    setError(null);
    setPicking(true);
    if (here) mapRef.current?.animateCamera({ center: here, zoom: 16 });
  };

  const markAt = async (point: LatLng) => {
    setLocating(true);
    try {
      const place = await placeAt(point);
      setPicking(false);
      await choose(place);
    } finally {
      setLocating(false);
    }
  };

  const showNearby = async (cat: NearbyCategory) => {
    Keyboard.dismiss();
    setSelected(null);
    setRoute(null);
    setQuery('');
    setShowSaved(false);
    setCategory(cat);
    setNearby([]);
    setActiveId(null);
    if (!here) {
      setError('Waiting for your location…');
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const found = await searchNearby(cat, here);
      setNearby(found);
      if (found.length === 0) setError(`No ${NEARBY_TITLES[cat].toLowerCase()} found within 5 km.`);
      else {
        // Frame the closest few so the pins are readable, not all 20 spread across town.
        mapRef.current?.fitToCoordinates([here, ...found.slice(0, 6)], {
          edgePadding: mapPadding,
          animated: true,
        });
      }
    } catch {
      setError('Could not load nearby places. Check your internet connection.');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadSettings(db).then((s) => {
      setRecent(s.recentPlaces);
      setFavorites(s.favoritePlaces);
    });
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) setHere({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })().catch(() => {});
  }, [db]);

  // Search as the rider types, waiting for a short pause so we don't hit the server per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchPlaces(q, here);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Search failed. Check your internet connection.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `here` is only a search bias; a better fix shouldn't re-run a finished search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const choose = async (place: Place) => {
    Keyboard.dismiss();
    setSelected(place);
    setRoute(null);
    setError(null);
    const nextRecent = [place, ...recent.filter((p) => p.id !== place.id)].slice(0, RECENT_PLACES_MAX);
    setRecent(nextRecent);
    saveSetting(db, 'recentPlaces', nextRecent);

    if (!here) {
      setError('Waiting for your location…');
      return;
    }
    setRouting(true);
    try {
      const r = await fetchRoute(here, place);
      setRoute(r);
      // Leave room for the search bar on top and the route card at the bottom.
      mapRef.current?.fitToCoordinates(r.coords, {
        edgePadding: { top: 140, right: 40, bottom: 280, left: 40 },
        animated: true,
      });
    } catch {
      setError('Could not find a route there. Check your internet connection.');
    } finally {
      setRouting(false);
    }
  };

  const start = async () => {
    if (!selected) return;
    if (forGroup) {
      setSavingGroup(true);
      try {
        await setGroupDestination(selected);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch (e) {
        Alert.alert('Could not set destination', (e as Error).message);
      } finally {
        setSavingGroup(false);
      }
      return;
    }
    router.replace({
      pathname: '/ride',
      params: { destLat: String(selected.latitude), destLng: String(selected.longitude), destName: selected.name },
    });
  };

  const clearSelection = () => {
    setSelected(null);
    setRoute(null);
    setError(null);
  };

  const typed = query.trim().length >= 3;
  // Nearby/saved places browse on the map with cards; typed search and recents use the top list.
  const browsing = (!!category || showSaved) && !selected && !picking;
  const places = showSaved ? favorites : nearby;
  const placeIcon = showSaved ? 'star' : category ? NEARBY[category].icon : 'map-marker';
  const placeColor = showSaved ? theme.warning : category === 'hospital' ? theme.danger : theme.accent;
  const sheetTitle = showSaved ? 'Saved places' : category ? NEARBY_TITLES[category] : '';
  const list = typed ? results : focused ? recent : [];
  const listLabel = !typed && list.length ? 'Recent' : null;
  const rowIcon = typed ? 'map-marker' : 'clock-outline';
  const selectedSaved = selected ? !!findFavorite(selected) : false;
  const region = regionFor(here ? [here] : [], 1) ?? {
    // Kathmandu, until we know where the rider is.
    latitude: 27.7172,
    longitude: 85.324,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  return (
    <ThemedView style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...region, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        showsUserLocation
        // While previewing a route, show live traffic so jams on the way are visible before starting.
        showsTraffic={!!route}
        userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
        toolbarEnabled={false}
        showsMyLocationButton={false}
        // Our own compass replaces the built-in one, which would sit under the search bar.
        showsCompass={false}
        onRegionChange={readHeading}
        onRegionChangeComplete={(r) => {
          setCenter({ latitude: r.latitude, longitude: r.longitude });
          readHeading();
        }}
        // Long-press anywhere to mark a destination directly.
        onLongPress={(e) => !locating && markAt(e.nativeEvent.coordinate)}>
        {route ? (
          <Polyline coordinates={route.coords} strokeColor={theme.accent} strokeWidth={6} lineJoin="round" lineCap="round" />
        ) : null}
        {selected ? <Marker coordinate={selected} title={selected.name} pinColor={theme.accent} /> : null}
        {browsing
          ? places.map((p) => {
              const on = p.id === activeId;
              return (
                <Marker
                  // The key includes the highlight so the custom pin view redraws.
                  key={`${p.id}-${on}`}
                  coordinate={p}
                  zIndex={on ? 2 : 1}
                  onPress={() => focusPlace(p)}
                  // iPhone (Apple Maps) reports taps on custom pins as a selection; Android uses onPress.
                  onSelect={Platform.OS === 'ios' ? () => focusPlace(p) : undefined}>
                  <PlacePin icon={placeIcon} color={placeColor} label={p.name} active={on} />
                </Marker>
              );
            })
          : null}
      </MapView>

      {!isNorthUp(mapHeading) ? (
        <MapCompass
          heading={mapHeading}
          onPress={() => mapRef.current?.animateCamera({ heading: 0 }, { duration: 400 })}
          style={[styles.compass, { top: insets.top + 132 }]}
        />
      ) : null}

      {picking ? (
        <View style={styles.centerPin} pointerEvents="none">
          <View style={styles.centerPinIcon}>
            <Icon name="map-marker" size={PIN_SIZE} color={theme.accent} />
          </View>
        </View>
      ) : null}

      <SafeView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
            <Icon name="chevron-left" size={26} />
          </Pressable>
          <TextInput
          
            value={selected ? selected.name : query}
            onChangeText={(t) => {
              if (selected) clearSelection();
              setCategory(null);
              setShowSaved(false);
              setPicking(false);
              setQuery(t);
            }}
            onFocus={() => {
              setFocused(true);
              if (selected) clearSelection();
            }}
            onBlur={() => setFocused(false)}
            placeholder={forGroup ? 'Where is the group riding to?' : 'Choose Destination'}
            placeholderTextColor={theme.textMuted}
            // autoFocus
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {searching ? <ActivityIndicator color={theme.accent} /> : null}
          {query || selected || category || showSaved || picking ? (
            <Pressable
              onPress={() => {
                clearSelection();
                setQuery('');
                setResults([]);
                setCategory(null);
                setShowSaved(false);
                setPicking(false);
              }}
              hitSlop={10}
              accessibilityLabel="Clear">
              <Icon name="close-circle" size={20} themeColor="textMuted" />
            </Pressable>
          ) : null}
          {!picking ? (
            <>
              <View style={[styles.searchDivider, { backgroundColor: theme.border }]} />
              <Pressable onPress={startPicking} hitSlop={10} accessibilityRole="button" accessibilityLabel="Choose on map">
                <Icon name="map-marker-radius" size={24} themeColor="accent" />
              </Pressable>
            </>
          ) : null}
        </View>

        {!selected && !picking ? (
          // One row that scrolls sideways, running to the screen edges.
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.chipScroll}
            contentContainerStyle={styles.chips}>
            <Pressable
              onPress={() => (showSaved ? setShowSaved(false) : openSaved())}
              accessibilityRole="button"
              accessibilityLabel="Saved places"
              style={[
                styles.chip,
                { backgroundColor: showSaved ? theme.accent : theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Icon name="star" size={18} color={showSaved ? theme.onAccent : theme.warning} />
              <ThemedText type="smallBold" style={{ color: showSaved ? theme.onAccent : theme.text }}>
                Saved
              </ThemedText>
            </Pressable>
            {(Object.keys(NEARBY) as NearbyCategory[]).map((cat) => {
              const on = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => showNearby(cat)}
                  accessibilityRole="button"
                  accessibilityLabel={`Nearby ${NEARBY[cat].label}`}
                  style={[
                    styles.chip,
                    { backgroundColor: on ? theme.accent : theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <Icon name={NEARBY[cat].icon} size={18} color={on ? theme.onAccent : theme.accent} />
                  <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : theme.text }}>
                    {NEARBY[cat].label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {!selected && !picking && !browsing && (list.length > 0 || error || (typed && !searching)) ? (
          <View style={[styles.results, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {error ? (
              <ThemedText type="small" themeColor="danger" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}
            {listLabel ? (
              <ThemedText type="caption" themeColor="textMuted" style={styles.listLabel}>
                {listLabel}
              </ThemedText>
            ) : null}
            <FlatList
              data={list}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                typed && !searching && !error ? (
                  <ThemedText type="small" themeColor="textMuted" style={styles.error}>
                    No places found.
                  </ThemedText>
                ) : undefined
              }
              ListFooterComponent={
                typed ? (
                  <View style={styles.resultRow}>
                    <ListRow
                      icon="map-marker-radius"
                      title="Choose on map"
                      subtitle="Can't find it? Mark the spot yourself"
                      onPress={startPicking}
                    />
                  </View>
                ) : undefined
              }
              renderItem={({ item }) => (
                <View style={styles.resultRow}>
                  <ListRow
                    icon={rowIcon}
                    title={item.name}
                    subtitle={item.address}
                    trailing={
                      here ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDistance(distanceMeters(here, item))}
                        </ThemedText>
                      ) : null
                    }
                    onPress={() => choose(item)}
                  />
                </View>
              )}
            />
          </View>
        ) : null}

        {selected ? (
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.sheetHead}>
              <View style={styles.flex}>
                <ThemedText type="heading" numberOfLines={1}>
                  {selected.name}
                </ThemedText>
                {selected.address ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {selected.address}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable
                onPress={() => toggleFavorite(selected)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={selectedSaved ? 'Remove from saved places' : 'Save place'}
                style={[styles.starButton, { backgroundColor: selectedSaved ? theme.warningSoft : theme.backgroundSelected }]}>
                <Icon
                  name={selectedSaved ? 'star' : 'star-outline'}
                  size={22}
                  color={selectedSaved ? theme.warning : theme.textSecondary}
                />
              </Pressable>
            </View>
            {routing ? (
              <ActivityIndicator color={theme.accent} />
            ) : route ? (
              <View style={styles.routeStats}>
                <View>
                  <ThemedText type="subtitle">{formatEta(route.duration)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDistance(route.distance)} · arrive {arrivalClock(route.duration)}
                  </ThemedText>
                </View>
              </View>
            ) : error ? (
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            ) : null}
            {forGroup ? (
              <Button
                title={savingGroup ? 'Setting…' : 'Set as group destination'}
                icon="flag-checkered"
                large
                disabled={savingGroup}
                onPress={start}
              />
            ) : (
              <Button title="Start ride" icon="navigation-variant" large disabled={!route} onPress={start} />
            )}
            <ThemedText type="small" themeColor="textMuted" style={styles.note}>
              {forGroup
                ? 'Everyone in the group sees it on the map and gets directions when they start riding.'
                : 'Travel time is estimated for normal traffic.'}
            </ThemedText>
          </View>
        ) : null}

        {picking ? (
          <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="heading">Choose on map</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Drag the map to put the pin on your destination, or long-press any spot.
            </ThemedText>
            <Button
              title={locating ? 'Finding place…' : 'Set destination'}
              icon="map-marker-check"
              large
              disabled={locating || !(center ?? here)}
              onPress={() => {
                const point = center ?? here;
                if (point) markAt(point);
              }}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setPicking(false)} />
          </View>
        ) : null}
      </SafeView>

      {browsing ? (
        <PlaceSheet
          // A fresh sheet (half open, default sort) for each category.
          key={showSaved ? 'saved' : category}
          title={sheetTitle}
          icon={placeIcon}
          color={placeColor}
          places={places}
          here={here}
          activeId={activeId}
          loading={searching}
          message={
            error ??
            (showSaved ? 'No saved places yet. Search for a place, then tap Save or the star to keep it here.' : null)
          }
          headerAction={
            category === 'hospital' ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${AMBULANCE}`)}
                accessibilityRole="button"
                style={[styles.emergency, { backgroundColor: theme.dangerSoft }]}>
                <Icon name="ambulance" size={22} themeColor="danger" />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" themeColor="danger">
                    Call {AMBULANCE} for an ambulance
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    In an emergency, call before riding anywhere.
                  </ThemedText>
                </View>
                <Icon name="phone" size={20} themeColor="danger" />
              </Pressable>
            ) : null
          }
          isSaved={(p) => !!findFavorite(p)}
          onFocus={focusPlace}
          onDirections={choose}
          onToggleSave={toggleFavorite}
          onClose={closeBrowse}
        />
      ) : null}
    </ThemedView>
  );
}

/** Map pin for a nearby or saved place: a round category icon with the name beside it. */
function PlacePin({ icon, color, label, active }: { icon: IconName; color: string; label: string; active: boolean }) {
  const theme = useTheme();
  return (
    // The drawing must not take touches itself, or on iPhone the marker never hears the tap.
    <View style={styles.pin} pointerEvents="none">
      <View
        style={[
          styles.pinBubble,
          active && styles.pinBubbleActive,
          { backgroundColor: active ? color : theme.backgroundElement, borderColor: color },
        ]}>
        <Icon name={icon} size={active ? 18 : 14} color={active ? '#FFFFFF' : color} />
      </View>
      <ThemedText
        numberOfLines={1}
        style={[styles.pinLabel, active && styles.pinLabelActive, { color: theme.text, textShadowColor: theme.background }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 14,
  },
  // Bleeds past the screen padding so chips scroll in from the edge; vertical room keeps
  // their shadows from being clipped by the scroll view.
  chipScroll: {
    flexGrow: 0,
    marginHorizontal: -Spacing.three,
    marginVertical: -6,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  centerPin: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPinIcon: {
    // Lift the icon so its tip, not its middle, sits on the map centre.
    marginBottom: PIN_SIZE,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  results: {
    maxHeight: '60%',
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  listLabel: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.one,
  },
  resultRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  error: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  sheet: {
    marginTop: 'auto',
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  starButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compass: {
    position: 'absolute',
    right: Spacing.three,
  },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: 12,
    borderRadius: Radius.medium,
  },
  pin: {
    alignItems: 'center',
    maxWidth: 120,
  },
  pinBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  pinBubbleActive: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderColor: '#FFFFFF',
  },
  pinLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 700,
    marginTop: 2,
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
  pinLabelActive: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 800,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  note: {
    textAlign: 'center',
  },
});
