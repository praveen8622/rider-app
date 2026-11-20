import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card, Divider, ListRow, SectionHeader } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { deleteAllRides } from '@/db/rides';
import { useSettings } from '@/db/settings';
import { useGarage } from '@/hooks/use-garage';
import { ACCENT_PRESETS, DEFAULT_ACCENT, useAccentColor } from '@/lib/accent';
import { playOverspeedAlert, prepareAlertSound } from '@/lib/alert-sound';
import { applyThemeMode, type ThemeMode } from '@/lib/theme-mode';
import { useTheme } from '@/hooks/use-theme';

const SPEED_STEP = 5;
const MIN_LIMIT = 20;
const MAX_LIMIT = 200;

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: IconName }[] = [
  { mode: 'system', label: 'System', icon: 'theme-light-dark' },
  { mode: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { mode: 'dark', label: 'Dark', icon: 'weather-night' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { settings, update } = useSettings();
  const { vehicles } = useGarage();
  const limit = settings.speedLimitKmh;

  const setLimit = (value: number) =>
    update('speedLimitKmh', Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, value)));

  const setThemeMode = (mode: ThemeMode) => {
    applyThemeMode(mode);
    update('themeMode', mode);
  };

  const accentHex = useAccentColor() ?? DEFAULT_ACCENT;
  const accentName = ACCENT_PRESETS.find((p) => p.hex === accentHex)?.name ?? 'Custom';

  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
  );

  const confirmDeleteRides = () =>
    Alert.alert('Delete all rides?', 'Every recorded ride and route will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => deleteAllRides(db) },
    ]);

  return (
    <ThemedView style={styles.container}>
      <SafeView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" style={styles.title}>
            Settings
          </ThemedText>

          <Card onPress={() => router.push('/profile')}>
            <View style={styles.profileRow}>
              <Avatar name={settings.profile.name} photoUri={settings.profile.photoUri} size={56} />
              <View style={styles.flex}>
                <ThemedText type="heading" numberOfLines={1}>
                  {settings.profile.name || 'Set up your profile'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {settings.profile.email || settings.profile.phone || 'Name, photo and emergency contacts'}
                </ThemedText>
              </View>
              <Icon name="chevron-right" size={20} themeColor="textMuted" />
            </View>
          </Card>

          <SectionHeader title="Appearance" />
          <Card>
            <View style={styles.themeHeader}>
              <ThemedText type="smallBold">Theme</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Dark is easier on the eyes on night rides. System follows your phone.
              </ThemedText>
            </View>
            <View style={[styles.segments, { backgroundColor: theme.backgroundSelected }]} accessibilityRole="radiogroup">
              {THEME_OPTIONS.map(({ mode, label, icon }) => {
                const selected = settings.themeMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setThemeMode(mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${label} theme`}
                    style={[styles.segment, selected && { backgroundColor: theme.accent }]}>
                    <Icon name={icon} size={18} color={selected ? theme.onAccent : theme.textSecondary} />
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.textSecondary }}>
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <Divider />
            <Pressable
              onPress={() => router.push('/accent-color')}
              accessibilityRole="button"
              accessibilityLabel={`Accent color, ${accentName}`}
              style={({ pressed }) => [styles.accentRow, pressed && styles.pressed]}>
              <View style={[styles.accentSwatch, { backgroundColor: accentHex, borderColor: theme.border }]} />
              <View style={styles.flex}>
                <ThemedText type="smallBold">Accent color</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {accentName} · {accentHex}
                </ThemedText>
              </View>
              <Icon name="chevron-right" size={20} themeColor="textMuted" />
            </Pressable>
          </Card>

          <SectionHeader title="Ride alerts" />
          <Card>
            <ListRow
              icon="speedometer"
              title="Overspeed alert"
              subtitle="Red screen, plus a beep and vibration every 2 seconds while you're over the limit"
              trailing={toggle(settings.overspeedAlert, (v) => update('overspeedAlert', v))}
            />
            <Divider />
            <View style={styles.limitRow}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Speed limit</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Shown as a yellow mark on the speedometer
                </ThemedText>
              </View>
              <View style={[styles.stepper, { backgroundColor: theme.backgroundSelected }]}>
                <Pressable onPress={() => setLimit(limit - SPEED_STEP)} hitSlop={8} style={styles.stepButton} accessibilityLabel="Lower limit">
                  <Icon name="chevron-left" size={22} />
                </Pressable>
                <ThemedText type="smallBold" style={styles.limitValue}>
                  {limit} km/h
                </ThemedText>
                <Pressable onPress={() => setLimit(limit + SPEED_STEP)} hitSlop={8} style={styles.stepButton} accessibilityLabel="Raise limit">
                  <Icon name="chevron-right" size={22} />
                </Pressable>
              </View>
            </View>
            <Divider />
            <ListRow
              icon="account-alert"
              title="Voice alerts"
              subtitle="Spoken warnings, through your helmet headset if connected"
              trailing={toggle(settings.voiceAlerts, (v) => update('voiceAlerts', v))}
            />
            <Divider />
            <ListRow
              icon="play"
              title="Test alerts"
              subtitle="Beep and vibrate, then the voice warning"
              onPress={async () => {
                await prepareAlertSound();
                playOverspeedAlert();
                if (settings.voiceAlerts) {
                  setTimeout(() => Speech.speak(`Slow down. ${limit + 5} kilometres per hour.`), 900);
                }
              }}
            />
          </Card>

          <SectionHeader title="Vehicles" />
          <Card>
            <ListRow
              icon="garage"
              title="Manage vehicles"
              subtitle={vehicles.length ? vehicles.map((v) => v.name).join(', ') : 'No vehicles yet'}
              onPress={() => router.navigate('/garage')}
            />
          </Card>

          <SectionHeader title="Data" />
          <Card>
            <ListRow
              icon="shield-check"
              title="Stored on this phone"
              subtitle="Rides, routes and your garage never leave your device. Cloud backup is coming later."
            />
            <Divider />
            <ListRow
              icon="delete-outline"
              iconColor={theme.danger}
              title="Delete all rides"
              onPress={confirmDeleteRides}
            />
          </Card>

          <SectionHeader title="About" />
          <Card>
            <ListRow icon="motorbike" title="Yatri" subtitle={`Version ${Constants.expoConfig?.version ?? '1.0.0'}`} />
            <Divider />
            <ListRow
              icon="flag-checkered"
              title="Show welcome screens"
              onPress={async () => {
                await update('onboarded', false);
                router.push('/onboarding');
              }}
            />
          </Card>
        </ScrollView>
      </SafeView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  title: {
    paddingTop: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.one,
  },
  stepButton: {
    padding: Spacing.two,
  },
  limitValue: {
    minWidth: 64,
    textAlign: 'center',
  },
  themeHeader: {
    gap: Spacing.half,
  },
  segments: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  accentSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
});
