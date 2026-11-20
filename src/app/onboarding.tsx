import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field, parseNumber, Segmented } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { createVehicle, type VehicleType } from '@/db/garage';
import { saveSetting } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'speedometer', title: 'Track every ride', body: 'Route, speed, distance, lean angle and G-force.' },
  { icon: 'bell-ring', title: 'Ride safer', body: 'Overspeed alerts with voice through your helmet.' },
  { icon: 'wrench', title: 'Look after your machine', body: 'Service reminders, fuel log and mileage.' },
  { icon: 'parking', title: 'Find your bike', body: 'Your parking spot is saved when you end a ride.' },
];

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const [locationGranted, setLocationGranted] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<VehicleType>('scooter');
  const [model, setModel] = useState('');
  const [odometer, setOdometer] = useState('');

  const finish = async (withVehicle: boolean) => {
    if (withVehicle) {
      const id = await createVehicle(db, {
        name: name.trim() || (type === 'scooter' ? 'My scooter' : 'My bike'),
        type,
        make: null,
        model: model.trim() || null,
        odometer_km: parseNumber(odometer) ?? 0,
      });
      await saveSetting(db, 'activeVehicleId', id);
    }
    await saveSetting(db, 'onboarded', true);
    router.replace('/');
  };

  const askLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(perm.granted);
    if (perm.granted) setStep(2);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeView style={styles.safeArea}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i === step ? theme.accent : theme.backgroundSelected }, i === step && styles.dotActive]}
            />
          ))}
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <>
                <View style={[styles.hero, { backgroundColor: theme.accent }]}>
                  <Icon name="motorbike" size={56} color={theme.onAccent} />
                </View>
                <ThemedText type="title">Welcome to Yatri</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Your riding companion for scooters and motorbikes.
                </ThemedText>
                <View style={styles.features}>
                  {FEATURES.map((f) => (
                    <View key={f.title} style={styles.feature}>
                      <View style={[styles.featureIcon, { backgroundColor: theme.accentSoft }]}>
                        <Icon name={f.icon} size={22} themeColor="accent" />
                      </View>
                      <View style={styles.flex}>
                        <ThemedText type="smallBold">{f.title}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {f.body}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <View style={[styles.hero, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="crosshairs-gps" size={52} themeColor="accent" />
                </View>
                <ThemedText type="title">Allow location</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Yatri uses GPS to record your route and speed while you ride, and to remember where
                  you parked. Your rides are stored only on this phone.
                </ThemedText>
                <ThemedText type="small" themeColor="textMuted">
                  Tip: for accurate lean angle, mount your phone firmly on the handlebar.
                </ThemedText>
              </>
            )}

            {step === 2 && (
              <>
                <ThemedText type="title">Add your vehicle</ThemedText>
                <ThemedText themeColor="textSecondary">
                  We&apos;ll set up service reminders and keep its odometer updated from your rides.
                </ThemedText>
                <Segmented
                  options={[
                    { value: 'scooter', label: 'Scooter', icon: 'moped' },
                    { value: 'motorbike', label: 'Motorbike', icon: 'motorbike' },
                  ]}
                  value={type}
                  onChange={setType}
                />
                <Field label="Name" placeholder="e.g. My Ntorq" value={name} onChangeText={setName} />
                <Field label="Make & model (optional)" placeholder="e.g. TVS Ntorq 125" value={model} onChangeText={setModel} />
                <Field
                  label="Current odometer"
                  placeholder="0"
                  keyboardType="decimal-pad"
                  suffix="km"
                  value={odometer}
                  onChangeText={setOdometer}
                  hint="Check the reading on your speedometer."
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          {step === 0 && <Button title="Get started" large onPress={() => setStep(1)} />}
          {step === 1 && (
            <>
              <Button title={locationGranted ? 'Continue' : 'Allow location'} large onPress={askLocation} />
              <Button title="Not now" variant="ghost" onPress={() => setStep(2)} />
            </>
          )}
          {step === 2 && (
            <>
              <Button title="Finish" large onPress={() => finish(true)} />
              <Button title="Skip for now" variant="ghost" onPress={() => finish(false)} />
            </>
          )}
        </View>
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
  flex: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    width: 96,
    height: 96,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.three,
  },
  features: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  feature: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
