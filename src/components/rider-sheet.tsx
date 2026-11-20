import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { formatAway, timeAgoShort } from '@/components/rider-marker';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceMeters, type LatLng } from '@/lib/geo';
import {
  makeLeader,
  NICKNAME_MAX,
  setNickname,
  setRiderAvatar,
  STALE_COLOR,
  type Rider,
  type RiderIdentity,
} from '@/lib/group-ride';
import { AVATAR_PRESETS, avatarLabel } from '@/lib/rider-avatar';

/**
 * How you look: the avatar the group picked for you if any, else your own choice
 * (straight from this phone, so it shows before the group sends it back).
 */
export function myLook(self: Rider | null | undefined, identity: RiderIdentity | null) {
  if (self?.avatarByGroup) return { avatar: self.avatar, photo: null };
  return {
    avatar: identity?.avatar ?? null,
    photo: identity?.avatar === 'photo' ? identity.photoUri : null,
  };
}

/** Avatar for anyone: your own look straight from this phone, the shared one for friends. */
export function AvatarFor({
  rider,
  identity,
  size,
  ring,
  myColor,
  plain,
}: {
  rider: Rider;
  identity: RiderIdentity | null;
  size: number;
  ring?: string;
  myColor: string;
  /** No leader crown (e.g. in small overlapping faces). */
  plain?: boolean;
}) {
  if (rider.isMe && identity && !rider.avatarByGroup) {
    const look = myLook(rider, identity);
    return (
      <RiderAvatar
        name={rider.name}
        avatar={look.avatar}
        photo={look.photo}
        color={myColor}
        size={size}
        ring={ring}
        leader={!plain && rider.isLeader}
      />
    );
  }
  return (
    <RiderAvatar
      name={rider.name}
      avatar={rider.avatar}
      photo={rider.photo}
      color={rider.isMe ? myColor : rider.stale ? STALE_COLOR : rider.color}
      stale={!rider.isMe && rider.stale}
      size={size}
      ring={ring}
      leader={!plain && rider.isLeader}
    />
  );
}

/**
 * Rider card (bottom sheet): face, live speed / distance / last update, a nickname the
 * whole group sees, and actions. Used on the Group ride screen and during a ride.
 */
export function RiderSheet({
  rider,
  identity,
  me,
  now,
  mySpeedKmh,
  canMakeLeader,
  onClose,
  onShowOnMap,
}: {
  rider: Rider;
  identity: RiderIdentity | null;
  /** Your position, for the distance. */
  me: LatLng | null;
  now: number;
  /** Your own speed, when this is your card during a ride. */
  mySpeedKmh?: number | null;
  canMakeLeader: boolean;
  onClose: () => void;
  onShowOnMap?: () => void;
}) {
  const theme = useTheme();
  const [nick, setNick] = useState(rider.nickname ?? '');
  const [saving, setSaving] = useState(false);
  const changed = nick.trim() !== (rider.nickname ?? '');

  const saveNick = async () => {
    setSaving(true);
    try {
      await setNickname(rider.uid, nick);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      Alert.alert('Could not save nickname', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Saved straight away, like tapping a sticker: everyone's map updates in a moment.
  const pickAvatar = (preset: string | null) => {
    if (preset === (rider.avatarByGroup ? rider.avatar : null)) return;
    Haptics.selectionAsync();
    setRiderAvatar(rider.uid, preset).catch((e) => Alert.alert('Could not change avatar', e.message));
  };

  // Three quick facts. Friends: their speed, how far, how fresh. You: your speed and status.
  const live = rider.isMe || !rider.stale;
  const speed = rider.isMe ? mySpeedKmh : live && rider.position ? rider.speedKmh : null;
  const away = !rider.isMe && me && rider.position ? formatAway(distanceMeters(me, rider.position)) : null;
  const updated = rider.isMe ? 'Now' : rider.seenAt != null ? timeAgoShort(rider.seenAt, now) : 'No GPS yet';

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={styles.head}>
            <AvatarFor rider={rider} identity={identity} size={68} myColor={theme.accent} />
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <ThemedText type="subtitle" numberOfLines={1} style={styles.shrink}>
                  {rider.name}
                </ThemedText>
                {rider.isLeader ? (
                  <View style={styles.leaderTag}>
                    <Icon name="crown" size={12} color="#7A4E00" />
                    <ThemedText style={styles.leaderText}>Leader</ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[rider.nickname ? rider.realName : null, rider.bike].filter(Boolean).join(' · ') || (rider.isMe ? 'You' : ' ')}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.stats, { backgroundColor: theme.background }]}>
            <Stat
              icon="speedometer"
              label="Speed"
              value={speed == null ? '—' : String(Math.round(speed))}
              unit={speed == null ? undefined : 'km/h'}
            />
            <View style={[styles.rule, { backgroundColor: theme.border }]} />
            <Stat
              icon={rider.isMe ? 'account' : 'map-marker-distance'}
              label={rider.isMe ? 'You' : 'Distance'}
              value={rider.isMe ? 'Sharing' : (away ?? '—')}
            />
            <View style={[styles.rule, { backgroundColor: theme.border }]} />
            <Stat
              icon={live ? 'access-point' : 'clock-outline'}
              label={live ? 'Updated' : 'Last seen'}
              value={updated}
              dim={!live}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">{rider.isMe ? 'Your nickname' : 'Nickname'}</ThemedText>
            <View style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Icon name="tag-outline" size={18} themeColor="textMuted" />
              <TextInput
                value={nick}
                onChangeText={(t) => setNick(t.slice(0, NICKNAME_MAX))}
                placeholder={rider.isMe ? 'A ride nickname for yourself' : `A nickname for ${rider.realName}`}
                placeholderTextColor={theme.textMuted}
                maxLength={NICKNAME_MAX}
                returnKeyType="done"
                onSubmitEditing={() => changed && saveNick()}
                style={[styles.inputText, { color: theme.text }]}
              />
              {nick ? (
                <Pressable onPress={() => setNick('')} hitSlop={8} accessibilityLabel="Clear nickname">
                  <Icon name="close-circle" size={18} themeColor="textMuted" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {changed ? (
            <Button
              title={saving ? 'Saving…' : nick.trim() ? 'Save nickname' : 'Remove nickname'}
              icon="check"
              disabled={saving}
              onPress={saveNick}
            />
          ) : (
            <ThemedText type="small" themeColor="textMuted" style={styles.center}>
              Nickname and avatar are seen by everyone in this group.
            </ThemedText>
          )}

          <View style={styles.field}>
            <View style={styles.avatarHead}>
              <ThemedText type="smallBold">Avatar</ThemedText>
              {rider.avatarByGroup ? (
                <ThemedText type="small" themeColor="textMuted">
                  Picked by the group
                </ThemedText>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
              <Pressable
                onPress={() => pickAvatar(null)}
                accessibilityRole="button"
                accessibilityLabel={rider.isMe ? 'Use my own look' : 'Use their own look'}
                accessibilityState={{ selected: !rider.avatarByGroup }}
                style={({ pressed }) => [
                  styles.avatarChoice,
                  { borderColor: !rider.avatarByGroup ? theme.accent : 'transparent', backgroundColor: theme.background },
                  pressed && styles.pressed,
                ]}>
                <Icon name="account-reactivate-outline" size={22} themeColor={!rider.avatarByGroup ? 'accent' : 'textSecondary'} />
                <ThemedText style={[styles.ownLabel, { color: !rider.avatarByGroup ? theme.accent : theme.textSecondary }]}>
                  {rider.isMe ? 'Mine' : 'Theirs'}
                </ThemedText>
              </Pressable>
              {AVATAR_PRESETS.map((preset) => {
                const on = rider.avatarByGroup && rider.avatar === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => pickAvatar(preset)}
                    accessibilityRole="button"
                    accessibilityLabel={avatarLabel(preset)}
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.avatarChoice,
                      { borderColor: on ? theme.accent : 'transparent' },
                      pressed && styles.pressed,
                    ]}>
                    <RiderAvatar name="" avatar={preset} color={on ? theme.accent : rider.color} size={44} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.actions}>
            {onShowOnMap && rider.position && !rider.isMe ? (
              <Action icon="crosshairs-gps" label="Show on map" onPress={onShowOnMap} />
            ) : null}
            {rider.isMe ? (
              <Action
                icon="account-edit-outline"
                label="Change my look"
                onPress={() => {
                  onClose();
                  router.push('/ride-avatar');
                }}
              />
            ) : null}
            {canMakeLeader ? (
              <Action
                icon="crown-outline"
                label="Make leader"
                onPress={() =>
                  makeLeader(rider.uid)
                    .then(onClose)
                    .catch((e) => Alert.alert('Could not change leader', e.message))
                }
              />
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
  dim,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  dim?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabel}>
        <Icon name={icon} size={13} themeColor="textMuted" />
        <ThemedText type="caption" themeColor="textMuted" numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <ThemedText style={styles.statValue} themeColor={dim ? 'textMuted' : 'text'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {` ${unit}`}
          </ThemedText>
        ) : null}
      </ThemedText>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, { backgroundColor: theme.background }, pressed && styles.pressed]}>
      <Icon name={icon} size={22} themeColor="accent" />
      <ThemedText type="smallBold" style={styles.center}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginTop: -Spacing.one,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  shrink: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  leaderTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: '#FDE68A',
  },
  leaderText: {
    color: '#7A4E00',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.medium,
    paddingVertical: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.one,
  },
  statLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: Spacing.one,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: 12,
  },
  inputText: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 12,
  },
  avatarHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  avatarRow: {
    gap: Spacing.two,
  },
  avatarChoice: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.medium,
  },
});
