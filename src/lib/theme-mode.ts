import { Appearance } from 'react-native';

/** "system" follows the phone's dark mode setting. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** Overrides the color scheme app-wide: every useColorScheme(), the maps and system dialogs follow. */
export function applyThemeMode(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}
