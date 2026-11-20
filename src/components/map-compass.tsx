import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** Treat the map as facing north when it's within this many degrees. */
const NORTH_TOLERANCE = 2;

export function isNorthUp(heading: number) {
  const h = ((heading % 360) + 360) % 360;
  return h < NORTH_TOLERANCE || h > 360 - NORTH_TOLERANCE;
}

/**
 * Compass button like Google Maps: the red needle always points to real north, so it turns
 * as the map rotates. Tap it to turn the map back to north-up.
 * `heading` is the map camera's heading in degrees (0 = north at the top).
 */
export function MapCompass({
  heading,
  onPress,
  active,
  style,
}: {
  heading: number;
  onPress: () => void;
  /** Highlights the ring, e.g. while the ride map is locked north-up. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Compass. Turn map to face your direction' : 'Compass. Turn map to face north'}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundElement, borderColor: active ? theme.accent : theme.border },
        pressed && styles.pressed,
        style,
      ]}>
      <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
        <Svg width={26} height={26} viewBox="0 0 26 26">
          {/* North half red, south half grey, like a real compass needle. */}
          <Path d="M13 1 L18 13 L8 13 Z" fill={theme.danger} />
          <Path d="M13 25 L18 13 L8 13 Z" fill={theme.textMuted} />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pressed: {
    opacity: 0.8,
  },
});
