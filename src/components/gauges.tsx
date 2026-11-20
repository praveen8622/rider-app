import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Fonts, type Theme } from '@/constants/theme';

/** Point on a circle; 0° = right, angles grow clockwise (SVG y points down). */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

const START = 135;
const SWEEP = 270;

/**
 * Speedometer dial. `theme` is passed in because the ride screen is always dark,
 * whatever the phone's setting.
 */
export function Speedometer({
  speedKmh,
  maxKmh,
  limitKmh,
  overspeeding,
  label,
  theme,
  size = 280,
}: {
  speedKmh: number | null;
  maxKmh: number;
  limitKmh?: number;
  overspeeding: boolean;
  label: string;
  theme: Theme;
  size?: number;
}) {
  const stroke = 14;
  const c = size / 2;
  const r = c - stroke;
  const toDeg = (kmh: number) => START + (Math.min(Math.max(kmh, 0), maxKmh) / maxKmh) * SWEEP;
  const valueColor = overspeeding ? theme.danger : theme.accent;

  const ticks = [];
  for (let v = 0; v <= maxKmh; v += 20) {
    const d = toDeg(v);
    const outer = polar(c, c, r - stroke, d);
    const inner = polar(c, c, r - stroke - (v % 40 === 0 ? 10 : 6), d);
    ticks.push(
      <Line
        key={`t${v}`}
        x1={outer.x}
        y1={outer.y}
        x2={inner.x}
        y2={inner.y}
        stroke={theme.textMuted}
        strokeWidth={v % 40 === 0 ? 2 : 1}
        strokeLinecap="round"
      />,
    );
    if (v % 40 === 0) {
      const p = polar(c, c, r - stroke - 26, d);
      ticks.push(
        <SvgText
          key={`l${v}`}
          x={p.x}
          y={p.y + 4}
          fontSize={12}
          fontWeight="600"
          fill={theme.textMuted}
          textAnchor="middle">
          {v}
        </SvgText>,
      );
    }
  }

  const limitPoint =
    limitKmh != null && limitKmh <= maxKmh
      ? [polar(c, c, r + stroke / 2 + 2, toDeg(limitKmh)), polar(c, c, r - stroke / 2 - 2, toDeg(limitKmh))]
      : null;

  return (
    <View style={{ width: size, height: size * 0.86 }}>
      <Svg width={size} height={size}>
        <Path
          d={arc(c, c, r, START, START + SWEEP)}
          stroke={theme.backgroundSelected}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        {speedKmh != null && speedKmh > 0.5 ? (
          <Path
            d={arc(c, c, r, START, toDeg(speedKmh))}
            stroke={valueColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {limitPoint ? (
          <Line
            x1={limitPoint[0].x}
            y1={limitPoint[0].y}
            x2={limitPoint[1].x}
            y2={limitPoint[1].y}
            stroke={theme.warning}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : null}
        {ticks}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <ThemedText
          style={[styles.speed, { color: overspeeding ? theme.danger : theme.text }]}
          accessibilityLabel={speedKmh == null ? 'No GPS' : `${Math.round(speedKmh)} kilometres per hour`}>
          {speedKmh == null ? '--' : Math.round(speedKmh)}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.textSecondary }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

/** Half-dial showing the current lean, with tick marks at the ride's max on each side. */
export function LeanGauge({
  leanDeg,
  maxA,
  maxB,
  theme,
  width = 150,
}: {
  leanDeg: number;
  maxA: number;
  maxB: number;
  theme: Theme;
  width?: number;
}) {
  const r = width / 2 - 8;
  const cx = width / 2;
  const cy = r + 8;
  // -60..60° of lean maps onto the top half of the dial.
  const toDeg = (lean: number) => 270 + Math.max(-60, Math.min(60, lean)) * 1.5;
  const needle = polar(cx, cy, r - 10, toDeg(leanDeg));
  const mark = (lean: number, key: string) => {
    const a = polar(cx, cy, r + 4, toDeg(lean));
    const b = polar(cx, cy, r - 6, toDeg(lean));
    return <Line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={theme.warning} strokeWidth={3} strokeLinecap="round" />;
  };

  return (
    <View style={styles.leanBox}>
      <Svg width={width} height={cy + 6}>
        <Path d={arc(cx, cy, r, 180, 360)} stroke={theme.backgroundSelected} strokeWidth={6} strokeLinecap="round" fill="none" />
        {maxA > 1 ? mark(maxA, 'a') : null}
        {maxB > 1 ? mark(-maxB, 'b') : null}
        <Line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={theme.accent} strokeWidth={4} strokeLinecap="round" />
      </Svg>
      <ThemedText type="number" style={{ color: theme.text }}>
        {Math.abs(leanDeg).toFixed(0)}°
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: '8%',
  },
  speed: {
    fontSize: 84,
    lineHeight: 92,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  leanBox: {
    alignItems: 'center',
  },
});
