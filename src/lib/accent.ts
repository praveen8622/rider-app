import { useSyncExternalStore } from 'react';

import { Colors } from '@/constants/theme';

/** Yatri's own orange. Choosing it clears the custom color, so the hand-tuned palette is used. */
export const DEFAULT_ACCENT = Colors.light.accent;

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Orange', hex: DEFAULT_ACCENT },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Lime', hex: '#65A30D' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Sky', hex: '#0284C7' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Violet', hex: '#7C3AED' },
  { name: 'Pink', hex: '#DB2777' },
  { name: 'Brown', hex: '#92400E' },
  { name: 'Graphite', hex: '#475569' },
];

const HEX = /^#?([0-9a-f]{6})$/i;

/** "1e90ff", "#1E90FF" -> "#1E90FF"; anything else -> null. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB) {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Hue 0..360, saturation and value 0..1, as the color picker works with them. */
export type HSV = { h: number; s: number; v: number };

export function hsvToHex({ h, s, v }: HSV) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return toHex([f(5), f(3), f(1)]);
}

export function hexToHsv(hex: string): HSV {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

/** `amount` 0..1 of the way from `a` to `b`. */
function mix(a: string, b: string, amount: number) {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as RGB);
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** YIQ brightness: dark text on light colors, white text on dark ones. */
export function readableOn(hex: string, dark: string = Colors.light.text) {
  const [r, g, b] = toRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? dark : '#FFFFFF';
}

/** The accent shades for one scheme, derived from a single picked color. */
export function accentTokens(hex: string, scheme: 'light' | 'dark') {
  const palette = Colors[scheme];
  // The accent is also used for text and icons on cards, so keep it at 3:1 against them:
  // too-light picks get darker in light mode, too-dark picks lighter in dark mode.
  const toward = scheme === 'light' ? '#000000' : '#FFFFFF';
  let accent = hex;
  for (let step = 1; step <= 10 && contrast(accent, palette.backgroundElement) < 3; step++) {
    accent = mix(hex, toward, step * 0.06);
  }
  return {
    accent,
    accentDeep: mix(accent, '#000000', 0.22),
    accentSoft: mix(accent, palette.backgroundElement, scheme === 'light' ? 0.88 : 0.78),
    onAccent: readableOn(accent),
  };
}

// The chosen color lives in memory so every useTheme() updates together; settings persist it.
let current: string | null = null;
const listeners = new Set<() => void>();

/** null = Yatri's default orange. */
export function setAccentColor(hex: string | null) {
  if (hex === current) return;
  current = hex;
  listeners.forEach((l) => l());
}

export function useAccentColor() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
