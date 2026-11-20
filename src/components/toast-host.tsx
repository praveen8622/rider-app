import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useToast } from '@/lib/toast';

/** Renders the current toast over every screen. Mount once, in the root layout. */
export function ToastHost() {
  const toast = useToast();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(200)}
        style={[styles.toast, { backgroundColor: theme.text }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert">
        {toast.icon ? <Icon name={toast.icon as IconName} size={18} color={theme.background} /> : null}
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          {toast.message}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 480,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
