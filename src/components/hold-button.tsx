import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

const HOLD_MS = 1200;

/**
 * Must be held down to trigger, so a bump or a gloved tap can't end a ride by accident.
 * The fill grows while held; releasing early cancels.
 */
export function HoldButton({
  title,
  icon,
  color,
  textColor,
  onComplete,
  compact,
}: {
  title: string;
  icon: IconName;
  color: string;
  textColor: string;
  onComplete: () => void;
  /** Shorter button, for screens with a lot to fit. */
  compact?: boolean;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const start = () => {
    Haptics.selectionAsync();
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      progress.setValue(0);
      onComplete();
    });
  };

  const cancel = () => {
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Press and hold"
      style={[styles.button, { borderColor: color }]}>
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      <View style={[styles.content, compact && styles.compactContent]}>
        <Icon name={icon} size={compact ? 20 : 24} color={textColor} />
        <ThemedText style={[styles.label, compact && styles.compactLabel, { color: textColor }]}>{title}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    borderRadius: Radius.large,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 20,
  },
  label: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
  },
  compactContent: {
    paddingVertical: 13,
  },
  compactLabel: {
    fontSize: 17,
    lineHeight: 22,
  },
});
