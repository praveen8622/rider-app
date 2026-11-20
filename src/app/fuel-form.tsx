import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field, parseNumber, Segmented } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { addFuel, getVehicle } from '@/db/garage';

export default function FuelFormScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const vid = Number(vehicleId);
  const db = useSQLiteContext();
  const [odometer, setOdometer] = useState('');
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
  const [tank, setTank] = useState<'full' | 'partial'>('full');

  useEffect(() => {
    getVehicle(db, vid).then((v) => v && setOdometer(String(Math.round(v.odometer_km))));
  }, [db, vid]);

  const litresN = parseNumber(litres);
  const costN = parseNumber(cost);
  const pricePerL = litresN && costN ? costN / litresN : null;

  const save = async () => {
    const odo = parseNumber(odometer);
    if (odo == null || litresN == null || litresN <= 0) {
      Alert.alert('Missing details', 'Enter the odometer reading and how many litres you filled.');
      return;
    }
    await addFuel(db, {
      vehicle_id: vid,
      t: Date.now(),
      odometer_km: odo,
      litres: litresN,
      cost: costN,
      full_tank: tank === 'full' ? 1 : 0,
    });
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} 
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
          <Field
            label="Odometer"
            keyboardType="decimal-pad"
            suffix="km"
            value={odometer}
            onChangeText={setOdometer}
            hint="Check your speedometer; correct it if it differs from Yatri's estimate."
          />
          <Field label="Fuel" keyboardType="decimal-pad" suffix="litres" placeholder="0.00" value={litres} onChangeText={setLitres}/>
          <Field label="Total cost" keyboardType="decimal-pad" suffix="Rs" placeholder="optional" value={cost} onChangeText={setCost} />
          {pricePerL ? (
            <ThemedText type="small" themeColor="textSecondary">
              Rs {pricePerL.toFixed(2)} per litre
            </ThemedText>
          ) : null}
          <Segmented
            label="Tank"
            options={[
              { value: 'full', label: 'Filled to full' },
              { value: 'partial', label: 'Partial' },
            ]}
            value={tank}
            onChange={setTank}
          />
          <ThemedText type="small" themeColor="textMuted">
            Mileage is calculated between two full-tank fill-ups.
          </ThemedText>
          <Button title="Save fill-up" icon="gas-station" onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
});
