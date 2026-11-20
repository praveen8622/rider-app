import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { AvatarFor } from '@/components/rider-sheet';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useRiderIdentity } from '@/hooks/use-rider-identity';
import { useTheme } from '@/hooks/use-theme';
import { formatCode, ridersOf, useGroupCode, useGroupSummary } from '@/lib/group-ride';

/** Home's entry to group rides: an invitation when you're not in one, a live summary when you are. */
export function GroupRideCard() {
  const code = useGroupCode();
  return code ? <InGroupCard /> : <InviteCard />;
}

function InviteCard() {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.inviteTop}>
        <View style={styles.flex}>
          <View style={styles.eyebrow}>
            <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
            <ThemedText type="caption" themeColor="textMuted">
              Group ride
            </ThemedText>
          </View>
          <ThemedText type="heading">Ride together</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Friends live on one map: who&apos;s ahead, how fast, how far.
          </ThemedText>
        </View>
        <Cluster />
      </View>

      {/* Opens Group ride, where you create a group or join one with a code. */}
      <Pressable
        onPress={() => router.push('/group')}
        accessibilityRole="button"
        accessibilityLabel="Start group ride"
        style={({ pressed }) => [styles.action, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
        <Icon name="account-group" size={20} color={theme.onAccent} />
        <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
          Start group ride
        </ThemedText>
        <Icon name="arrow-right" size={18} color={theme.onAccent} />
      </Pressable>
    </View>
  );
}

/** Artwork: three riders, one leading. */
function Cluster() {
  const theme = useTheme();
  return (
    <View style={styles.cluster}>
      <RiderAvatar name="" avatar="char-wolf" color="#2563EB" size={40} style={styles.c1} />
      <RiderAvatar name="" avatar="char-cheetah" color={theme.accent} size={46} leader style={styles.c2} />
      <RiderAvatar name="" avatar="char-bear" color="#16A34A" size={40} style={styles.c3} />
    </View>
  );
}

function InGroupCard() {
  const theme = useTheme();
  const group = useGroupSummary();
  const identity = useRiderIdentity();
  const riders = ridersOf(group, 0);
  const leader = riders.find((r) => r.isLeader);
  const shown = riders.slice(0, 5);

  return (
    <Pressable
      onPress={() => router.push('/group')}
      accessibilityRole="button"
      accessibilityLabel="Open your group ride"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.accent },
        styles.activeCard,
        pressed && styles.pressed,
      ]}>
      <View style={styles.activeTop}>
        <View style={styles.eyebrow}>
          <View style={[styles.liveDot, { backgroundColor: group.ended ? theme.textMuted : theme.success }]} />
          <ThemedText type="caption" themeColor={group.ended ? 'textMuted' : 'success'}>
            {group.ended ? 'Group ride ended' : 'Group ride on'}
          </ThemedText>
        </View>
        <View style={[styles.codeChip, { backgroundColor: theme.accentSoft }]}>
          <Icon name="pound" size={13} themeColor="accent" />
          <ThemedText type="smallBold" themeColor="accent" style={styles.codeText}>
            {formatCode(group.code ?? '')}
          </ThemedText>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.faces}>
          {shown.map((r, i) => (
            <View key={r.uid} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i }}>
              <AvatarFor rider={r} identity={identity} size={38} ring={theme.backgroundElement} myColor={theme.accent} plain />
            </View>
          ))}
          {riders.length > shown.length ? (
            <View style={[styles.more, { backgroundColor: theme.backgroundSelected, borderColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                +{riders.length - shown.length}
              </ThemedText>
            </View>
          ) : null}
          {riders.length === 0 ? <ActivityIndicator color={theme.accent} /> : null}
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">
            {riders.length} {riders.length === 1 ? 'rider' : 'riders'}
          </ThemedText>
          {leader ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              Led by {leader.isMe ? 'you' : leader.name}
            </ThemedText>
          ) : null}
        </View>
        <Icon name="chevron-right" size={22} themeColor="textMuted" />
      </View>

      {group.destination ? (
        <View style={[styles.dest, { backgroundColor: theme.background }]}>
          <Icon name="flag-checkered" size={16} themeColor="accent" />
          <ThemedText type="small" numberOfLines={1} style={styles.flex}>
            Riding to <ThemedText type="smallBold">{group.destination.name}</ThemedText>
          </ThemedText>
        </View>
      ) : riders.length <= 1 && !group.ended ? (
        <View style={[styles.dest, { backgroundColor: theme.background }]}>
          <Icon name="account-plus-outline" size={16} themeColor="accent" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Waiting for friends. Open to share the code.
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
  },
  activeCard: {
    borderWidth: 1.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cluster: {
    width: 104,
    height: 72,
  },
  c1: {
    position: 'absolute',
    left: 0,
    top: 22,
  },
  c2: {
    position: 'absolute',
    left: 30,
    top: 4,
    zIndex: 2,
  },
  c3: {
    position: 'absolute',
    left: 64,
    top: 26,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 14,
    borderRadius: Radius.medium,
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  codeText: {
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  more: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.medium,
  },
});
