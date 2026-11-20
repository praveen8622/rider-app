import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AXIS_W = 32;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

function niceMax(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}

function useWidth() {
  const [width, setWidth] = useState(0);
  return [width, (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)] as const;
}

/**
 * Speed over time. Press and drag to read the exact speed at any moment.
 * `points` are [ms timestamp, km/h].
 */
export function SpeedChart({ points, height = 180 }: { points: [number, number][]; height?: number }) {
  const theme = useTheme();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const step = Math.ceil(points.length / 240);
  const data = points.filter((_, i) => i % step === 0);
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const yMax = niceMax(Math.max(...data.map((d) => d[1]), 10), 20);
  const t0 = data[0]?.[0] ?? 0;
  const t1 = data.at(-1)?.[0] ?? 1;
  const x = (t: number) => AXIS_W + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v: number) => PAD_TOP + plotH - (v / yMax) * plotH;

  const line = data.map((d, i) => `${i ? 'L' : 'M'} ${x(d[0])} ${y(d[1])}`).join(' ');
  const area = data.length > 1 ? `${line} L ${x(t1)} ${y(0)} L ${x(t0)} ${y(0)} Z` : '';

  const onTouch = (e: GestureResponderEvent) => {
    if (data.length < 2) return;
    const frac = (e.nativeEvent.locationX - AXIS_W) / plotW;
    const target = t0 + Math.min(1, Math.max(0, frac)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < data.length; i++) {
      if (Math.abs(data[i][0] - target) < Math.abs(data[best][0] - target)) best = i;
    }
    setActive(best);
  };

  const sel = active != null ? data[active] : null;
  const minutes = (t: number) => Math.round((t - t0) / 60000);

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.readout}>
        {sel
          ? `${Math.round(sel[1])} km/h at ${minutes(sel[0])} min`
          : 'Press and drag on the chart to see speed at any point'}
      </ThemedText>
      <View
        onLayout={onLayout}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}>
        {width > 0 && data.length > 1 ? (
          <Svg width={width} height={height}>
            {[0, yMax / 2, yMax].map((v) => (
              <Line key={v} x1={AXIS_W} x2={width} y1={y(v)} y2={y(v)} stroke={theme.border} strokeWidth={1} />
            ))}
            {[0, yMax / 2, yMax].map((v) => (
              <SvgText key={`l${v}`} x={AXIS_W - 6} y={y(v) + 4} fontSize={11} fill={theme.textMuted} textAnchor="end">
                {v}
              </SvgText>
            ))}
            <SvgText x={AXIS_W} y={height - 4} fontSize={11} fill={theme.textMuted}>
              0 min
            </SvgText>
            <SvgText x={width} y={height - 4} fontSize={11} fill={theme.textMuted} textAnchor="end">
              {minutes(t1)} min
            </SvgText>
            <Path d={area} fill={theme.accent} fillOpacity={0.1} />
            <Path d={line} stroke={theme.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            {sel ? (
              <>
                <Line x1={x(sel[0])} x2={x(sel[0])} y1={PAD_TOP} y2={y(0)} stroke={theme.textMuted} strokeWidth={1} />
                <Circle cx={x(sel[0])} cy={y(sel[1])} r={5} fill={theme.accent} stroke={theme.backgroundElement} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/** Distance per day for one week. Tap a day to see its value. */
export function WeekBars({ days, height = 120 }: { days: { label: string; km: number }[]; height?: number }) {
  const theme = useTheme();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(...days.map((d) => d.km), 1);
  const plotH = height - PAD_BOTTOM - 16;
  const band = width / days.length;
  const barW = Math.min(24, band * 0.6);

  /** Column with a 4px rounded top and a square base. */
  const bar = (cx: number, h: number) => {
    const r = Math.min(4, h, barW / 2);
    const x0 = cx - barW / 2;
    const x1 = cx + barW / 2;
    const base = 16 + plotH;
    const top = base - h;
    return `M ${x0} ${base} L ${x0} ${top + r} Q ${x0} ${top} ${x0 + r} ${top} L ${x1 - r} ${top} Q ${x1} ${top} ${x1} ${top + r} L ${x1} ${base} Z`;
  };

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={16 + plotH} y2={16 + plotH} stroke={theme.border} strokeWidth={1} />
          {days.map((d, i) => {
            const cx = band * i + band / 2;
            const h = d.km > 0 ? Math.max(3, (d.km / max) * plotH) : 0;
            const dim = active != null && active !== i;
            return (
              <G key={d.label}>
                {h > 0 ? <Path d={bar(cx, h)} fill={theme.accent} fillOpacity={dim ? 0.35 : 1} /> : null}
                {active === i ? (
                  <SvgText x={cx} y={16 + plotH - h - 6} fontSize={11} fontWeight="700" fill={theme.text} textAnchor="middle">
                    {d.km.toFixed(1)}
                  </SvgText>
                ) : null}
                <SvgText x={cx} y={height - 4} fontSize={11} fill={theme.textMuted} textAnchor="middle">
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
      {/* Tap targets are the whole column, wider than the bar itself. */}
      <View style={[StyleSheet.absoluteFill, styles.hitRow]}>
        {days.map((d, i) => (
          <View
            key={d.label}
            style={styles.hit}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => setActive(active === i ? null : i)}
            accessibilityLabel={`${d.label}: ${d.km.toFixed(1)} kilometres`}
          />
        ))}
      </View>
    </View>
  );
}

/** Progress toward a due service. Fill color carries severity. */
export function Meter({ fraction }: { fraction: number }) {
  const theme = useTheme();
  const f = Math.min(1, Math.max(0, fraction));
  const [fill, track] =
    f >= 1 ? [theme.danger, theme.dangerSoft] : f >= 0.85 ? [theme.warning, theme.warningSoft] : [theme.accent, theme.accentSoft];
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${f * 100}%`, backgroundColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  readout: {
    minHeight: 20,
  },
  hitRow: {
    flexDirection: 'row',
  },
  hit: {
    flex: 1,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
});
