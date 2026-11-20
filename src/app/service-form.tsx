import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field, parseNumber } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { addServiceItem, getServiceItem, getVehicle, logService, type ServiceItem } from '@/db/garage';

/**
 * mode=log: record a service (resets the reminder when itemId is given).
 * mode=reminder: create a new custom reminder.
 */
export default function ServiceFormScreen() {
  const { vehicleId, itemId, mode } = useLocalSearchParams<{ vehicleId: string; itemId?: string; mode: 'log' | 'reminder' }>();
  const vid = Number(vehicleId);
  const db = useSQLiteContext();
  const [item, setItem] = useState<ServiceItem | null>(null);
  const [title, setTitle] = useState('');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [intervalKm, setIntervalKm] = useState('');
  const [intervalDays, setIntervalDays] = useState('');

  useEffect(() => {
    getVehicle(db, vid).then((v) => v && setOdometer(String(Math.round(v.odometer_km))));
    if (itemId) {
      getServiceItem(db, Number(itemId)).then((i) => {
        setItem(i);
        if (i) setTitle(i.name);
      });
    }
  }, [db, vid, itemId]);

  const save = async () => {
    const odo = parseNumber(odometer);
    if (!title.trim() || odo == null) {
      Alert.alert('Missing details', 'Enter a name and the odometer reading.');
      return;
    }
    if (mode === 'reminder') {
      const km = parseNumber(intervalKm);
      const days = parseNumber(intervalDays);
      if (!km && !days) {
        Alert.alert('Set an interval', 'Remind every so many km, days, or both.');
        return;
      }
      await addServiceItem(db, {
        vehicle_id: vid,
        name: title.trim(),
        icon: 'wrench',
        interval_km: km || null,
        interval_days: days ? Math.round(days) : null,
        last_done_km: odo,
        last_done_at: Date.now(),
      });
    } else {
      await logService(db, {
        vehicle_id: vid,
        item_id: item?.id ?? null,
        t: Date.now(),
        odometer_km: odo,
        title: title.trim(),
        cost: parseNumber(cost),
        notes: notes.trim() || null,
      });
    }
    router.back();
  };

  const isReminder = mode === 'reminder';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: isReminder ? 'New reminder' : item ? `${item.name} done` : 'Log service' }} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" >
          {!item ? (
            <Field
              label={isReminder ? 'Reminder name' : 'What was done'}
              placeholder={isReminder ? 'e.g. Spark plug' : 'e.g. Full service at TVS centre'}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
          ) : null}
          <Field
            label={isReminder ? 'Last done at' : 'Odometer'}
            keyboardType="decimal-pad"
            suffix="km"
            value={odometer}
            onChangeText={setOdometer}
          />
          {isReminder ? (
            <>
              <Field label="Every" keyboardType="number-pad" suffix="km" placeholder="e.g. 3000" value={intervalKm} onChangeText={setIntervalKm} />
              <Field label="Or every" keyboardType="number-pad" suffix="days" placeholder="optional" value={intervalDays} onChangeText={setIntervalDays} />
              <ThemedText type="small" themeColor="textMuted">
                You&apos;ll be reminded at whichever comes first.
              </ThemedText>
            </>
          ) : (
            <>
              <Field label="Cost" keyboardType="decimal-pad" suffix="Rs" placeholder="optional" value={cost} onChangeText={setCost} />
              <Field label="Notes" placeholder="optional, e.g. Motul 10W-30" value={notes} onChangeText={setNotes} />
            </>
          )}
          <Button title="Save" icon="check" onPress={save} />
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
