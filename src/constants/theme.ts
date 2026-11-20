/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * `accent` is also the chart color; both steps were checked for contrast against their card surface.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111214',
    background: '#ECEDF1',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E6E7EC',
    textSecondary: '#60646C',
    textMuted: '#8B8D98',
    border: '#DCDDE3',
    accent: '#E8590C',
    /** Darker end of the accent gradient on hero cards. */
    accentDeep: '#B93D05',
    accentSoft: '#FDEBE0',
    onAccent: '#FFFFFF',
    danger: '#D92D20',
    dangerSoft: '#FDE7E5',
    warning: '#B54708',
    warningSoft: '#FEF0C7',
    success: '#067647',
    successSoft: '#DCFAE6',
  },
  dark: {
    text: '#F4F4F6',
    background: '#0B0B0D',
    backgroundElement: '#1A1B1E',
    backgroundSelected: '#2A2C30',
    textSecondary: '#B0B4BA',
    textMuted: '#7C7F88',
    border: '#2A2C30',
    accent: '#EA5F14',
    accentDeep: '#A83A06',
    accentSoft: '#3A2216',
    onAccent: '#FFFFFF',
    danger: '#FF5A4E',
    dangerSoft: '#3D1A18',
    warning: '#FDB022',
    warningSoft: '#3A2C10',
    success: '#47CD89',
    successSoft: '#123222',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = { [K in ThemeColor]: string };

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

// Room under scrolling content for the floating tab bar (Android's sits above the gesture bar).
export const BottomTabInset = Platform.select({ ios: 50, android: 104 }) ?? 0;
export const MaxContentWidth = 800;
