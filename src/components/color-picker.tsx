import { useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Radius } from '@/constants/theme';
import { hsvToHex, type HSV } from '@/lib/accent';

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
const THUMB = 28;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Drag on the square to pick saturation (left -> right) and brightness (top -> bottom),
 * and on the bar below to pick the hue. Controlled: the screen owns the HSV value.
 */
export function ColorPicker({ value, onChange }: { value: HSV; onChange: (hsv: HSV) => void }) {
  const [square, setSquare] = useState({ width: 0, height: 0 });
  const [barWidth, setBarWidth] = useState(0);

  // Rebuilt each render so the handlers see the current value; they only read the touch position,
  // so swapping them mid-drag is harmless.
  const pick = (handler: (e: GestureResponderEvent) => void) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag when the finger wanders vertically; otherwise the screen would scroll.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: handler,
      onPanResponderMove: handler,
    });

  const squarePan = pick((e) => {
    if (!square.width) return;
    onChange({
      h: value.h,
      s: clamp(e.nativeEvent.locationX / square.width),
      v: 1 - clamp(e.nativeEvent.locationY / square.height),
    });
  });

  const huePan = pick((e) => {
    if (!barWidth) return;
    onChange({ ...value, h: clamp(e.nativeEvent.locationX / barWidth) * 360 });
  });

  const pureHue = hsvToHex({ h: value.h, s: 1, v: 1 });
  const current = hsvToHex(value);

  return (
    <View style={styles.container}>
      <View
        style={styles.square}
        onLayout={(e) => setSquare({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        accessibilityLabel="Color saturation and brightness"
        {...squarePan.panHandlers}>
        {/* pointerEvents none: touches land on the square itself, so locationX/Y are relative to it. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={pureHue} />
            <Rect width="100%" height="100%" fill="url(#sat)" />
            <Rect width="100%" height="100%" fill="url(#val)" />
          </Svg>
          <View
            style={[
              styles.thumb,
              {
                left: value.s * square.width - THUMB / 2,
                top: (1 - value.v) * square.height - THUMB / 2,
                backgroundColor: current,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={styles.hueBar}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        accessibilityLabel="Hue"
        {...huePan.panHandlers}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
                {HUE_STOPS.map((c, i) => (
                  <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={c} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={14} fill="url(#hue)" />
          </Svg>
          <View
            style={[styles.thumb, styles.hueThumb, { left: (value.h / 360) * barWidth - THUMB / 2, backgroundColor: pureHue }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  square: {
    height: 200,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  hueBar: {
    height: 28,
    borderRadius: 14,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  hueThumb: {
    top: 0,
  },
});
