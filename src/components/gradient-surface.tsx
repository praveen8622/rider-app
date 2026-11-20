import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Yatri's hero surface: an accent gradient with faint speedometer rings.
 * `ringsAt` places the rings' centre behind the right edge or the middle of the content.
 */
export function GradientSurface({
  children,
  ringsAt = 'right',
  style,
}: {
  children: ReactNode;
  ringsAt?: 'right' | 'center';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  // Gradient ids must be unique on screen, or two surfaces share one gradient.
  const id = `g${useId().replace(/:/g, '')}`;
  // The SVG needs real pixel sizes; percentages don't follow the view when it grows.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const cx = ringsAt === 'right' ? size.width - 66 : size.width / 2;

  return (
    <View
      style={[styles.surface, { backgroundColor: theme.accent }, style]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {size.width > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={theme.accent} />
              <Stop offset="1" stopColor={theme.accentDeep} />
            </LinearGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill={`url(#${id})`} />
          {[70, 105, 140].map((r, i) => (
            <Circle
              key={r}
              cx={cx}
              cy={size.height / 2}
              r={ringsAt === 'right' ? r : r + 20}
              stroke={theme.onAccent}
              strokeOpacity={0.14 - i * 0.045}
              strokeWidth={1.5}
              fill="none"
            />
          ))}
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
});
