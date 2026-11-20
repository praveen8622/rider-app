import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { EMPTY_PROFILE, loadSettings, saveSetting, type Profile } from '@/db/settings';

export default function ProfileFormScreen() {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings(db).then((s) => {
      setProfile(s.profile);
      setLoaded(true);
    });
  }, [db]);

  const set = (key: keyof Omit<Profile, 'photoUri' | 'emergencyContacts'>) => (text: string) =>
    setProfile((p) => ({ ...p, [key]: text }));

  const save = async () => {
    const trimmed = { ...profile };
    for (const key of ['name', 'email', 'phone', 'city', 'country'] as const) trimmed[key] = profile[key].trim();
    await saveSetting(db, 'profile', trimmed);
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic">
          <Field label="Full name" placeholder="Your name" textContentType="name" value={profile.name} onChangeText={set('name')} />
          <Field
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            value={profile.email}
            onChangeText={set('email')}
          />
          <Field
            label="Mobile number"
            placeholder="+977 98XXXXXXXX"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={profile.phone}
            onChangeText={set('phone')}
          />
          <Field label="City" placeholder="Kathmandu" value={profile.city} onChangeText={set('city')} />
          <Field label="Country" placeholder="Nepal" value={profile.country} onChangeText={set('country')} />
          <ThemedText type="small" themeColor="textMuted">
            All fields are optional and stay on this phone.
          </ThemedText>
          <Button title="Save profile" icon="check" disabled={!loaded} onPress={save} />
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
