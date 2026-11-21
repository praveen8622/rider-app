import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { QUICK_MESSAGES, type QuickGroup, type QuickMessage, type QuickTone } from '@/lib/quick-chat';

/** Solid and soft colours for a tone: red = needs you now, amber = hazard, accent = plan, green = all clear. */
function useTone(tone: QuickTone) {
  const theme = useTheme();
  return {
    danger: { solid: theme.danger, soft: theme.dangerSoft },
    warn: { solid: theme.warning, soft: theme.warningSoft },
    info: { solid: theme.accent, soft: theme.accentSoft },
    ok: { solid: theme.success, soft: theme.successSoft },
  }[tone];
}

const SECTIONS: { group: QuickGroup; title: string; icon: IconName; layout: 'wide' | 'compact' }[] = [
  { group: 'urgent', title: 'Urgent', icon: 'alert-circle', layout: 'wide' },
  { group: 'road', title: 'On the road ahead', icon: 'road-variant', layout: 'compact' },
  { group: 'plan', title: 'Plans', icon: 'calendar-check', layout: 'wide' },
];

/** How long the ✓ shows on the tapped tile before the sheet closes. */
const SENT_FLASH_MS = 450;

/**
 * Bottom sheet of one-tap messages, grouped by what they mean so the right one is found at a
 * glance: urgent first, then hazards, then plans. Big targets, no keyboard. A tap sends, the
 * tile confirms with a tick, and the sheet gets out of the way.
 */
export function QuickChatSheet({
  onSend,
  onClose,
  recipients,
}: {
  onSend: (m: QuickMessage) => void;
  onClose: () => void;
  /** Other riders in the group, for "Sends to 3 riders". */
  recipients: number;
}) {
  const theme = useTheme();
  const [sentId, setSentId] = useState<string | null>(null);

  const send = (m: QuickMessage) => {
    if (sentId) return;
    Haptics.notificationAsync(
      m.tone === 'danger' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    );
    setSentId(m.id);
    setTimeout(() => onSend(m), SENT_FLASH_MS);
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />

          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: theme.accentSoft }]}>
              <Icon name="message-flash" size={22} themeColor="accent" />
            </View>
            <View style={styles.flex}>
              <ThemedText type="heading">Quick message</ThemedText>
              <View style={styles.headSub}>
                <Icon name="account-group" size={13} themeColor="textMuted" />
                <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                  {recipients > 0 ? `Sends to ${recipients} ${recipients === 1 ? 'rider' : 'riders'}` : 'Sends to your group'}
                  {' · with your location'}
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.close, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
              <Icon name="close" size={18} themeColor="textSecondary" />
            </Pressable>
          </View>

          {SECTIONS.map((section) => {
            const items = QUICK_MESSAGES.filter((m) => m.group === section.group);
            return (
              <View key={section.group} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Icon name={section.icon} size={14} themeColor="textMuted" />
                  <ThemedText type="caption" themeColor="textMuted">
                    {section.title}
                  </ThemedText>
                </View>
                <View style={styles.grid}>
                  {items.map((m) =>
                    section.layout === 'wide' ? (
                      <WideTile key={m.id} message={m} sent={sentId === m.id} dimmed={!!sentId && sentId !== m.id} onPress={() => send(m)} />
                    ) : (
                      <CompactTile key={m.id} message={m} sent={sentId === m.id} dimmed={!!sentId && sentId !== m.id} onPress={() => send(m)} />
                    ),
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

type TileProps = { message: QuickMessage; sent: boolean; dimmed: boolean; onPress: () => void };

/** Icon badge that turns into a tick once the message is sent. */
function Badge({ message, sent, size }: { message: QuickMessage; sent: boolean; size: number }) {
  const tone = useTone(message.tone);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: tone.solid }]}>
      {sent ? (
        <Animated.View entering={ZoomIn.duration(180)}>
          <Icon name="check-bold" size={size * 0.52} color="#FFFFFF" />
        </Animated.View>
      ) : (
        <Icon name={message.icon} size={size * 0.52} color="#FFFFFF" />
      )}
    </View>
  );
}

/** Two per row, icon beside the text: for the few messages that matter most. */
function WideTile({ message, sent, dimmed, onPress }: TileProps) {
  const tone = useTone(message.tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={dimmed || sent}
      accessibilityRole="button"
      accessibilityLabel={`Send: ${message.text}`}
      style={({ pressed }) => [
        styles.wide,
        { backgroundColor: tone.soft, borderColor: sent ? tone.solid : 'transparent' },
        pressed && styles.pressed,
        dimmed && styles.dimmed,
      ]}>
      <Badge message={message} sent={sent} size={40} />
      <ThemedText type="smallBold" numberOfLines={2} style={styles.flex}>
        {sent ? 'Sent' : message.text}
      </ThemedText>
    </Pressable>
  );
}

/** Three per row, icon over a short label: for the longer list of road hazards. */
function CompactTile({ message, sent, dimmed, onPress }: TileProps) {
  const tone = useTone(message.tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={dimmed || sent}
      accessibilityRole="button"
      accessibilityLabel={`Send: ${message.text}`}
      style={({ pressed }) => [
        styles.compact,
        { backgroundColor: tone.soft, borderColor: sent ? tone.solid : 'transparent' },
        pressed && styles.pressed,
        dimmed && styles.dimmed,
      ]}>
      <Badge message={message} sent={sent} size={38} />
      <Animated.View key={sent ? 'sent' : 'label'} entering={FadeIn.duration(150)}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.compactLabel}>
          {sent ? 'Sent' : message.short}
        </ThemedText>
      </Animated.View>
    </Pressable>
  );
}

/**
 * An incoming quick message, shown briefly over the ride screen: who, what, and how far away.
 * `key` it by the message so each new one animates in.
 */
export function QuickChatBanner({
  message,
  from,
  away,
  onPress,
}: {
  message: QuickMessage;
  from: { name: string; avatar: string | null; photo: string | null; color: string };
  /** e.g. "1.2 km away" */
  away: string | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const color = useTone(message.tone).solid;
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(200)} style={styles.bannerWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="alert"
        accessibilityLabel={`${from.name}: ${message.text}`}
        style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: color }]}>
        <View style={[styles.bannerIcon, { backgroundColor: color }]}>
          <Icon name={message.icon} size={22} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {message.text}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {from.name}
            {away ? ` · ${away}` : ''}
          </ThemedText>
        </View>
        <RiderAvatar name={from.name} avatar={from.avatar} photo={from.photo} color={from.color} size={34} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  sheetWrap: {
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
    gap: 12,
  },
  headIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Two per row, big enough to hit with a glove.
  wide: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    minHeight: 60,
    borderRadius: Radius.medium,
    borderWidth: 2,
  },
  // Three per row: icon over a short label.
  compact: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.medium,
    borderWidth: 2,
  },
  compactLabel: {
    textAlign: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
  bannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingRight: 12,
    borderRadius: Radius.large,
    borderWidth: 2,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
