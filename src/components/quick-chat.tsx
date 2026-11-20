import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { QUICK_MESSAGES, type QuickMessage } from '@/lib/quick-chat';

/** Colour for a message's tone: hazards in amber/red, plans in the accent, all-clear in green. */
function useToneColor(tone: QuickMessage['tone']) {
  const theme = useTheme();
  return { warn: theme.warning, danger: theme.danger, info: theme.accent, ok: theme.success }[tone];
}

/**
 * Bottom sheet of one-tap messages. Big targets, no keyboard: tap one and it's sent.
 */
export function QuickChatSheet({ onSend, onClose }: { onSend: (m: QuickMessage) => void; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHead}>
            <ThemedText type="heading">Quick message</ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              Tap to send to the group
            </ThemedText>
          </View>
          <View style={styles.grid}>
            {QUICK_MESSAGES.map((m) => (
              <MessageButton
                key={m.id}
                message={m}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onSend(m);
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MessageButton({ message, onPress }: { message: QuickMessage; onPress: () => void }) {
  const theme = useTheme();
  const color = useToneColor(message.tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Send: ${message.text}`}
      style={({ pressed }) => [styles.message, { backgroundColor: theme.background }, pressed && styles.pressed]}>
      <View style={[styles.messageIcon, { backgroundColor: color }]}>
        <Icon name={message.icon} size={20} color="#FFFFFF" />
      </View>
      <ThemedText type="smallBold" numberOfLines={2} style={styles.messageText}>
        {message.text}
      </ThemedText>
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
  const color = useToneColor(message.tone);
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
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  message: {
    // Two per row: big enough to hit with a glove.
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    minHeight: 58,
    borderRadius: Radius.medium,
  },
  messageIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    flex: 1,
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
