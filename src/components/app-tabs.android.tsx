import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Android tabs: a floating pill bar like iOS's glass tab bar (Android's stock bar is a flat strip).
 * iOS keeps the native bar in app-tabs.tsx.
 */
const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  index: { label: 'Ride', icon: 'speedometer-medium', iconOn: 'speedometer' },
  history: { label: 'History', icon: 'history', iconOn: 'history' },
  garage: { label: 'Garage', icon: 'tools', iconOn: 'tools' },
  settings: { label: 'Settings', icon: 'cog-outline', iconOn: 'cog' },
};

export const TAB_BAR_HEIGHT = 66;
const PAD = 6;

export default function AppTabs() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
      tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Ride' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="garage" options={{ title: 'Garage' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

function FloatingTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const itemWidth = width > 0 ? (width - PAD * 2) / count : 0;

  // The highlight glides to the selected tab.
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(state.index * itemWidth, { damping: 20, stiffness: 220, mass: 0.8 });
  }, [state.index, itemWidth, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 8) + 6 }]}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          styles.bar,
          {
            // Slightly see-through so content scrolling underneath is hinted, like iOS glass.
            backgroundColor: dark ? 'rgba(32,34,38,0.94)' : 'rgba(255,255,255,0.95)',
            borderColor: theme.border,
          },
        ]}>
        {itemWidth > 0 ? (
          <Animated.View
            style={[
              styles.indicator,
              { width: itemWidth, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(17,24,39,0.07)' },
              indicator,
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const tab = TABS[route.name] ?? { label: route.name, icon: 'circle-outline', iconOn: 'circle' };
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              android_ripple={{ color: 'transparent' }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <Icon
                name={focused ? tab.iconOn : tab.icon}
                size={24}
                color={focused ? theme.accent : theme.textSecondary}
              />
              <ThemedText
                numberOfLines={1}
                style={[styles.label, { color: focused ? theme.accent : theme.textSecondary }, focused && styles.labelOn]}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
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
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 520,
    height: TAB_BAR_HEIGHT,
    padding: PAD,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  indicator: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: (TAB_BAR_HEIGHT - PAD * 2) / 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  labelOn: {
    fontWeight: '800',
  },
});
