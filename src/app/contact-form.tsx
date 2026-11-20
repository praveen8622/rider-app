import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { loadSettings, saveSetting, type EmergencyContact, type Profile } from '@/db/settings';

/** Add or edit one emergency contact. Pass `id` to edit. */
export default function ContactFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');

  useEffect(() => {
    loadSettings(db).then((s) => {
      setProfile(s.profile);
      const existing = s.profile.emergencyContacts.find((c) => c.id === id);
      if (existing) {
        setName(existing.name);
        setPhone(existing.phone);
        setRelation(existing.relation);
      }
    });
  }, [db, id]);

  const write = async (contacts: EmergencyContact[]) => {
    if (!profile) return;
    await saveSetting(db, 'profile', { ...profile, emergencyContacts: contacts });
    router.back();
  };

  const save = () => {
    if (!profile) return;
    if (!name.trim() || phone.replace(/\D/g, '').length < 7) {
      Alert.alert('Missing details', 'Enter a name and a phone number.');
      return;
    }
    const contact = { id: id ?? String(Date.now()), name: name.trim(), phone: phone.trim(), relation: relation.trim() };
    const others = profile.emergencyContacts.filter((c) => c.id !== contact.id);
    write(id ? profile.emergencyContacts.map((c) => (c.id === id ? contact : c)) : [...others, contact]);
  };

  const remove = () =>
    Alert.alert('Remove contact?', `${name} will no longer be an emergency contact.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => profile && write(profile.emergencyContacts.filter((c) => c.id !== id)),
      },
    ]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: id ? 'Edit contact' : 'Emergency contact' }} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic">
          <Field label="Name" placeholder="Contact's name" textContentType="name" value={name} onChangeText={setName} />
          <Field
            label="Phone number"
            placeholder="+977 98XXXXXXXX"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />
          <Field label="Relation" placeholder="e.g. Brother, Friend (optional)" value={relation} onChangeText={setRelation} />
          <Button title="Save contact" icon="check" disabled={!profile} onPress={save} />
          {id ? <Button title="Remove contact" icon="delete-outline" variant="ghost" onPress={remove} /> : null}
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
