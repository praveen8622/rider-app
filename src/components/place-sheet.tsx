import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, type Place } from '@/lib/directions';
import { distanceMeters, type LatLng } from '@/lib/geo';

/** Height of the sheet when pulled down: handle, title and filter chips. */
const PEEK = 150;
/** Typical city speed on a bike, to turn straight-line distance into a rough ride time. */
const CITY_KMH = 25;
/** Roads wind; straight-line distance under-counts by about this much. */
const ROAD_FACTOR = 1.3;
const NEAR_M = 1000;

type Sort = 'near' | 'name';

/** Visible sheet height for each snap position, from the screen size. */
export function sheetHeights(screenHeight: number, topInset: number) {
  return { peek: PEEK, half: Math.round(screenHeight * 0.45), full: screenHeight - topInset - 120 };
}

function rideMinutes(meters: number) {
  return Math.max(1, Math.round(((meters * ROAD_FACTOR) / 1000 / CITY_KMH) * 60));
}

function sharePlace(p: Place) {
  const link = `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
  Share.share({ message: [p.name, p.address, link].filter(Boolean).join('\n') });
}

/**
 * Bottom sheet listing places on the map, like a maps app: drag the top to peek, half or full.
 * Tapping a place highlights its pin; Directions plans the route.
 */
export function PlaceSheet({
  title,
  icon,
  color,
  places,
  here,
  activeId,
  loading,
  message,
  headerAction,
  isSaved,
  onFocus,
  onDirections,
  onToggleSave,
  onClose,
}: {
  title: string;
  icon: IconName;
  color: string;
  places: Place[];
  here: LatLng | null;
  activeId: string | null;
  loading: boolean;
  /** Shown instead of the list when there is nothing to show (empty, or an error). */
  message: string | null;
  headerAction?: ReactNode;
  isSaved: (p: Place) => boolean;
  onFocus: (p: Place) => void;
  onDirections: (p: Place) => void;
  onToggleSave: (p: Place) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const heights = sheetHeights(screenHeight, insets.top);
  const listRef = useRef<FlatList<Place>>(null);
  const [sort, setSort] = useState<Sort>('near');
  const [nearOnly, setNearOnly] = useState(false);

  // The sheet is always full height; sliding it down shows less of it. `offset` is how far down.
  const offsetFor = (visible: number) => heights.full - visible;
  const [offset] = useState(() => new Animated.Value(offsetFor(heights.half)));
  const current = useRef(offsetFor(heights.half));
  const snapTo = (visible: number) => {
    current.current = offsetFor(visible);
    Animated.spring(offset, { toValue: current.current, useNativeDriver: true, bounciness: 2 }).start();
  };

  // Dragging the header moves the sheet; letting go snaps to the nearest of peek, half and full.
  const drag = useRef({ startY: 0, lastY: 0, lastT: 0, velocity: 0 });
  const dragTo = (pageY: number) => {
    const d = drag.current;
    const now = Date.now();
    if (now > d.lastT) d.velocity = (pageY - d.lastY) / (now - d.lastT);
    d.lastY = pageY;
    d.lastT = now;
    return Math.min(heights.full - heights.peek, Math.max(0, current.current + pageY - d.startY));
  };
  const dragHandlers = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => {
      const y = e.nativeEvent.pageY;
      drag.current = { startY: y, lastY: y, lastT: Date.now(), velocity: 0 };
    },
    onResponderMove: (e: GestureResponderEvent) => offset.setValue(dragTo(e.nativeEvent.pageY)),
    onResponderRelease: (e: GestureResponderEvent) => {
      const moved = dragTo(e.nativeEvent.pageY);
      // A tap on the header (no real drag) toggles between half and full.
      if (Math.abs(e.nativeEvent.pageY - drag.current.startY) < 6) {
        snapTo(current.current === offsetFor(heights.full) ? heights.half : heights.full);
        return;
      }
      // Where the sheet would land if the flick carried on a little, then the closest snap.
      const visible = heights.full - (moved + drag.current.velocity * 150);
      const target = [heights.peek, heights.half, heights.full].reduce((a, b) =>
        Math.abs(b - visible) < Math.abs(a - visible) ? b : a,
      );
      snapTo(target);
    },
  };

  const distance = (p: Place) => (here ? distanceMeters(here, p) : 0);
  let shown = nearOnly && here ? places.filter((p) => distance(p) <= NEAR_M) : places;
  shown = [...shown].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : distance(a) - distance(b)));

  // When a pin is tapped on the map, bring its row into view.
  useEffect(() => {
    const i = shown.findIndex((p) => p.id === activeId);
    if (i >= 0) listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0 });
    // Only when the highlighted place changes, not on every re-render of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const chip = (label: string, on: boolean, onPress: () => void, chipIcon?: IconName) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { backgroundColor: on ? theme.accentSoft : theme.backgroundSelected }]}>
      {chipIcon ? <Icon name={chipIcon} size={16} themeColor={on ? 'accent' : 'textSecondary'} /> : null}
      <ThemedText type="smallBold" themeColor={on ? 'accent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: heights.full, backgroundColor: theme.backgroundElement, transform: [{ translateY: offset }] },
      ]}>
      <View {...dragHandlers} style={styles.header}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: color }]}>
            <Icon name={icon} size={18} color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <ThemedText type="heading" numberOfLines={1}>
              {title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? 'Searching…' : `${shown.length} ${shown.length === 1 ? 'place' : 'places'}`}
            </ThemedText>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close"
            style={[styles.closeButton, { backgroundColor: theme.backgroundSelected }]}>
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        <View style={styles.chips}>
          {chip('Nearest', sort === 'near', () => setSort('near'), 'sort-numeric-ascending')}
          {chip('A–Z', sort === 'name', () => setSort('name'), 'sort-alphabetical-ascending')}
          {chip('Within 1 km', nearOnly, () => setNearOnly(!nearOnly), 'map-marker-radius-outline')}
        </View>
      </View>

      {headerAction}

      {loading && places.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : shown.length === 0 ? (
        <ThemedText type="small" themeColor={message ? 'textSecondary' : 'textMuted'} style={styles.message}>
          {message ?? (nearOnly ? 'Nothing within 1 km. Turn off the filter to see more.' : 'Nothing to show.')}
        </ThemedText>
      ) : (
        <FlatList
          ref={listRef}
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + heights.full - heights.half + Spacing.three }}
          onScrollToIndexFailed={() => {}}
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.border }]} />}
          renderItem={({ item }) => {
            const on = item.id === activeId;
            const saved = isSaved(item);
            const d = distance(item);
            return (
              <Pressable
                onPress={() => onFocus(item)}
                style={[styles.row, on && { backgroundColor: theme.accentSoft }]}
                accessibilityRole="button"
                accessibilityLabel={item.name}>
                <ThemedText type="heading" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                {item.address ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.address}
                  </ThemedText>
                ) : null}
                {here ? (
                  <View style={styles.metaRow}>
                    <Icon name="map-marker-distance" size={15} themeColor="textMuted" />
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDistance(d)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textMuted">
                      ·
                    </ThemedText>
                    <Icon name="motorbike" size={15} themeColor="textMuted" />
                    <ThemedText type="small" themeColor="textSecondary">
                      about {rideMinutes(d)} min
                    </ThemedText>
                  </View>
                ) : null}
                <View style={styles.actions}>
                  <ActionPill icon="directions" label="Directions" primary onPress={() => onDirections(item)} />
                  <ActionPill icon="share-variant" label="Share" onPress={() => sharePlace(item)} />
                  <ActionPill
                    icon={saved ? 'star' : 'star-outline'}
                    label={saved ? 'Saved' : 'Save'}
                    tint={saved ? theme.warning : undefined}
                    onPress={() => onToggleSave(item)}
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Animated.View>
  );
}

function ActionPill({
  icon,
  label,
  primary,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  tint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const fg = primary ? theme.onAccent : (tint ?? theme.accent);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: primary ? theme.accent : theme.accentSoft },
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} size={18} color={fg} />
      <ThemedText type="smallBold" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 12,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginTop: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.small,
  },
  center: {
    paddingVertical: Spacing.four,
  },
  message: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
  row: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.75,
  },
});
