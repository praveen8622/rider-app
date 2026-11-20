import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ToastHost } from '@/components/toast-host';
import { recoverUnfinishedRides } from '@/db/rides';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { loadSettings } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { setAccentColor } from '@/lib/accent';
import { restoreGroup } from '@/lib/group-ride';
// Registers the background GPS task; must load before any screen.
import '@/lib/ride-location-task';
import { applyThemeMode } from '@/lib/theme-mode';

async function initDb(db: SQLiteDatabase) {
  // If another connection is mid-write (e.g. an app reload while a ride was saving),
  // wait up to 5 s for it instead of failing with "database is locked".
  await db.execAsync('PRAGMA busy_timeout = 5000');
  await migrateDbIfNeeded(db);
  await recoverUnfinishedRides(db);
  // Screens render after onInit, so the chosen theme is in place before the first frame.
  const { themeMode, accentColor, groupCode } = await loadSettings(db);
  applyThemeMode(themeMode);
  setAccentColor(accentColor);
  // Network: don't hold up the first screen for it.
  restoreGroup(db, groupCode);
}

// A cold start from an invite link (yatri://join/CODE) still has Home underneath to go back to.
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const colors = useTheme();
  const navTheme = dark ? DarkTheme : DefaultTheme;

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDb}>
      <ThemeProvider
        value={{
          ...navTheme,
          colors: {
            ...navTheme.colors,
            primary: colors.accent,
            background: colors.background,
            card: colors.background,
            text: colors.text,
            border: colors.border,
          },
        }}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="ride"
            options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="navigate" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="parked" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="all-rides" options={{ title: 'All rides' }} />
          <Stack.Screen name="rides/[id]" options={{ title: '' }} />
          <Stack.Screen name="vehicle-form" options={{ presentation: 'modal', title: 'Vehicle' }} />
          <Stack.Screen name="fuel-form" options={{ presentation: 'modal', title: 'Add fuel' }} />
          <Stack.Screen name="service-form" options={{ presentation: 'modal', title: 'Service' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile' }} />
          <Stack.Screen name="profile-form" options={{ presentation: 'modal', title: 'Edit profile' }} />
          <Stack.Screen name="contact-form" options={{ presentation: 'modal', title: 'Emergency contact' }} />
          <Stack.Screen name="accent-color" options={{ presentation: 'modal', title: 'Accent color' }} />
          <Stack.Screen name="group" options={{ title: 'Group ride' }} />
          <Stack.Screen name="ride-avatar" options={{ presentation: 'modal', title: 'Your ride look' }} />
          <Stack.Screen name="join/[code]" options={{ headerShown: false }} />
        </Stack>
        <ToastHost />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
