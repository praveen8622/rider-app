import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field, parseNumber, Segmented } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { createVehicle, deleteVehicle, getVehicle, updateVehicle, type VehicleType } from '@/db/garage';
import { saveSetting } from '@/db/settings';

export default function VehicleFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const vehicleId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [type, setType] = useState<VehicleType>('scooter');
  const [model, setModel] = useState('');
  const [odometer, setOdometer] = useState('');

  useEffect(() => {
    if (vehicleId == null) return;
    getVehicle(db, vehicleId).then((v) => {
      if (!v) return;
      setName(v.name);
      setType(v.type);
      setModel(v.model ?? '');
      setOdometer(String(Math.round(v.odometer_km)));
    });
  }, [db, vehicleId]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name needed', 'Give your vehicle a name, like "My Ntorq".');
      return;
    }
    const data = {
      name: name.trim(),
      type,
      make: null,
      model: model.trim() || null,
      odometer_km: parseNumber(odometer) ?? 0,
    };
    if (vehicleId == null) {
      const newId = await createVehicle(db, data);
      await saveSetting(db, 'activeVehicleId', newId);
    } else {
      await updateVehicle(db, vehicleId, data);
    }
    router.back();
  };

  const remove = () => {
    if (vehicleId == null) return;
    Alert.alert(
      `Delete ${name}?`,
      'Its fuel log, reminders and service history will be deleted. Your rides are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteVehicle(db, vehicleId);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: vehicleId == null ? 'Add vehicle' : 'Edit vehicle' }} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic">
          <Segmented
            label="Type"
            options={[
              { value: 'scooter', label: 'Scooter', icon: 'moped' },
              { value: 'motorbike', label: 'Motorbike', icon: 'motorbike' },
            ]}
            value={type}
            onChange={setType}
          />
          <Field label="Name" placeholder="e.g. My Ntorq" value={name} onChangeText={setName} />
          <Field label="Make & model" placeholder="e.g. TVS Ntorq 125" value={model} onChangeText={setModel} />
          <Field
            label="Odometer"
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="km"
            value={odometer}
            onChangeText={setOdometer}
            hint="Updates automatically from rides you record with this vehicle."
          />
          <Button title="Save" onPress={save} />
          {vehicleId != null ? (
            <Button title="Delete vehicle" icon="delete-outline" variant="ghost" onPress={remove} />
          ) : null}
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
