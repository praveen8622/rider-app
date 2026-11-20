import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { formatAway, timeAgoShort } from '@/components/rider-marker';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceMeters, type LatLng } from '@/lib/geo';
import { STALE_COLOR, type Rider, type RiderIdentity } from '@/lib/group-ride';
import { AvatarFor } from '@/components/rider-sheet';

/**
 * Riders over the ride map. Closed: one small chip ("2 riders"). Open: a single row of
 * compact cards along the top edge; tap one to fly to that rider. The map stays visible.
 */
export function RiderStrip({
  riders,
  self,
  selfIdentity,
  me,
  now,
  open,
  selected,
  onToggle,
  onSelect,
  onShowAll,
  style,
}: {
  /** Friends only (not you). */
  riders: Rider[];
  /** You, shown as a "You" card to change your nickname or look. */
  self?: Rider | null;
  selfIdentity?: RiderIdentity | null;
  me: LatLng | null;
  now: number;
  open: boolean;
  selected: string | null;
  onToggle: () => void;
  onSelect: (rider: Rider) => void;
  onShowAll: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const live = riders.filter((r) => !r.stale).length;
  const total = riders.length + 1;
  const shadow = [styles.shadow, { backgroundColor: theme.backgroundElement }];

  const toggle = () => {
    Haptics.selectionAsync();
    onToggle();
  };

  return (
    <View style={[styles.row, style]} pointerEvents="box-none">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide riders' : `Show ${total} riders`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [shadow, open ? styles.close : styles.chip, pressed && styles.pressed]}>
        {open ? (
          <Icon name="close" size={20} themeColor="text" />
        ) : (
          <>
            <Icon name="account-group" size={18} themeColor="accent" />
            <ThemedText type="smallBold">{total} riders</ThemedText>
            {live > 0 ? <View style={styles.liveDot} /> : null}
          </>
        )}
      </Pressable>

      {open ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.cards}>
          <Pressable
            onPress={onShowAll}
            accessibilityRole="button"
            accessibilityLabel="Show everyone on the map"
            style={({ pressed }) => [shadow, styles.card, pressed && styles.pressed]}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
              <Icon name="fit-to-screen-outline" size={18} themeColor="accent" />
            </View>
            <View>
              <ThemedText type="smallBold">Everyone</ThemedText>
              <ThemedText style={[styles.status, { color: theme.textSecondary }]}>
                {live + 1} of {total} live
              </ThemedText>
            </View>
          </Pressable>

          {self ? (
            <Pressable
              onPress={() => onSelect(self)}
              accessibilityRole="button"
              accessibilityLabel="Show me on the map"
              style={({ pressed }) => [
                shadow,
                styles.card,
                { borderColor: selected === self.uid ? theme.accent : 'transparent' },
                pressed && styles.pressed,
              ]}>
              <AvatarFor rider={self} identity={selfIdentity ?? null} size={34} myColor={theme.accent} />
              <View style={styles.text}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {self.nickname ?? 'You'}
                </ThemedText>
                <ThemedText style={[styles.status, { color: theme.textSecondary }]}>
                  {self.nickname ? 'You' : 'Your location'}
                </ThemedText>
              </View>
            </Pressable>
          ) : null}

          {riders.map((r) => {
            const on = selected === r.uid;
            const status = !r.position
              ? 'No GPS yet'
              : r.stale
                ? r.seenAt != null
                  ? timeAgoShort(r.seenAt, now)
                  : 'Offline'
                : `${r.speedKmh} km/h${me ? ` · ${formatAway(distanceMeters(me, r.position))}` : ''}`;
            return (
              <Pressable
                key={r.uid}
                onPress={() => onSelect(r)}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}, ${status}`}
                style={({ pressed }) => [
                  shadow,
                  styles.card,
                  { borderColor: on ? r.color : 'transparent' },
                  pressed && styles.pressed,
                ]}>
                <RiderAvatar
                  name={r.name}
                  avatar={r.avatar}
                  photo={r.photo}
                  color={r.stale ? STALE_COLOR : r.color}
                  stale={r.stale}
                  leader={r.isLeader}
                  size={34}
                />
                <View style={styles.text}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {r.name}
                  </ThemedText>
                  <ThemedText
                    numberOfLines={1}
                    style={[styles.status, { color: r.stale ? theme.textMuted : theme.textSecondary }]}>
                    {status}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shadow: {
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: {
    opacity: 0.8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  scroll: {
    flex: 1,
    // Room for card shadows, which a ScrollView would otherwise clip.
    marginVertical: -8,
  },
  cards: {
    gap: 8,
    paddingVertical: 8,
    paddingRight: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  crown: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    maxWidth: 120,
  },
  status: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
});
