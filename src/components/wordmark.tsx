import { useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Y_GLYPH } from '@/components/wordmark-glyph';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ASPHALT = '#1A1B1E';
/** Where the map-marker icon's tip sits in its box (Material Community Icons, 24-unit grid). */
const PIN_TIP = 22 / 24;

/**
 * "Yatri" set as the brand: the Y is the logo's Y-road (in the accent color), "atr" in a
 * heavy rounded face, and the i's dot is a map pin. Lines everything up on the font's real
 * baseline, measured from the text, so it sits right with iOS and Android fonts alike.
 */
export function Wordmark({ size = 30, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  // Font metrics in px. Sensible guesses until the text reports the real ones.
  const [m, setM] = useState({ cap: size * 0.71, x: size * 0.53, below: size * 0.24 });

  // A touch taller than the capitals: the road's far end sits lower than a letter's top.
  const yHeight = m.cap * 1.3;
  const yWidth = yHeight * Y_GLYPH.aspect;
  const stem = Math.max(3, size * 0.17);
  const pin = size * 0.54;
  const gap = size * 0.06;
  const iHeight = m.x + gap + pin;

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Yatri">
      {/* Y: the logo's arms and road. */}
      <Svg
        width={yWidth}
        height={yHeight}
        viewBox={Y_GLYPH.viewBox}
        // Tuck "atr" under the road's far end, which leaves the glyph's lower right empty.
        style={{ marginBottom: m.below, marginRight: -yWidth * 0.22 }}>
        <Path d={Y_GLYPH.arm} fill={theme.accent} />
        <Path d={Y_GLYPH.armInner} fill={theme.accent} opacity={0.6} />
        <Path d={Y_GLYPH.roadOuter} fill={theme.accent} />
        <Path d={Y_GLYPH.roadAsphalt} fill={ASPHALT} />
        <Path d={Y_GLYPH.roadLane} fill="#FFFFFF" />
      </Svg>

      <Text
        allowFontScaling={false}
        onTextLayout={(e) => {
          const line = e.nativeEvent.lines[0];
          if (!line) return;
          const baseline = line.y + line.ascender;
          const next = {
            cap: line.capHeight > 0 ? line.capHeight : m.cap,
            x: line.xHeight > 0 ? line.xHeight : m.x,
            below: Math.max(0, line.height - baseline),
          };
          if (Math.abs(next.cap - m.cap) + Math.abs(next.x - m.x) + Math.abs(next.below - m.below) > 0.5) setM(next);
        }}
        style={[styles.text, { fontSize: size, color: theme.text }]}>
        atr
      </Text>

      {/* i: a rounded stem with a map pin for its dot. */}
      <View style={{ width: Math.max(stem, pin * 0.7), height: iHeight, marginBottom: m.below, marginLeft: size * 0.02 }}>
        <View
          style={[
            styles.stem,
            { width: stem, height: m.x, borderRadius: stem / 2, backgroundColor: theme.text, left: (Math.max(stem, pin * 0.7) - stem) / 2 },
          ]}
        />
        <View
          style={[
            styles.pin,
            { bottom: m.x + gap - pin * (1 - PIN_TIP), left: (Math.max(stem, pin * 0.7) - pin) / 2, width: pin, height: pin },
          ]}>
          <Icon name="map-marker" size={pin} color={theme.accent} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    fontWeight: '800',
    fontFamily: Fonts?.rounded,
    letterSpacing: -0.6,
    // Android adds padding above/below text by default, which would throw the baseline off.
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  stem: {
    position: 'absolute',
    bottom: 0,
  },
  pin: {
    position: 'absolute',
  },
});
