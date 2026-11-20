/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { accentTokens, useAccentColor } from '@/lib/accent';

// One object per color + scheme, so screens get the same theme reference on every render.
const themes = new Map<string, Theme>();

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? 'dark' : 'light';
  const accent = useAccentColor();

  // No custom color: the hand-tuned orange palette as it was.
  if (!accent) return Colors[theme];
  const key = `${accent}${theme}`;
  let merged = themes.get(key);
  if (!merged) {
    merged = { ...Colors[theme], ...accentTokens(accent, theme) };
    themes.set(key, merged);
  }
  return merged;
}
