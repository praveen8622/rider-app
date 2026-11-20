import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card, Divider } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useSettings, type Profile } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';

const MAX_EMERGENCY_CONTACTS = 5;

/** Copies a picked photo into the app's own folder; the picker's copy lives in a cache that can be cleared. */
async function keepPhoto(uri: string) {
  const dest = new File(Paths.document, `avatar-${Date.now()}.jpg`);
  await new File(uri).copy(dest);
  return dest.uri;
}

function removePhotoFile(uri: string | null) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone; nothing to clean up.
  }
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { settings, update } = useSettings();
  const profile = settings.profile;

  const save = (patch: Partial<Profile>) => update('profile', { ...profile, ...patch });

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      const uri = await keepPhoto(result.assets[0].uri);
      removePhotoFile(profile.photoUri);
      await save({ photoUri: uri });
    } catch {
      Alert.alert('Could not save photo', 'Please try another picture.');
    }
  };

  const changePhoto = () => {
    if (!profile.photoUri) {
      pickPhoto();
      return;
    }
    Alert.alert('Profile photo', undefined, [
      { text: 'Choose new photo', onPress: pickPhoto },
      {
        text: 'Remove photo',
        style: 'destructive',
        onPress: () => {
          removePhotoFile(profile.photoUri);
          save({ photoUri: null });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const editProfile = () => router.push('/profile-form');
  const contacts = profile.emergencyContacts;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <Card style={styles.hero}>
          <Pressable onPress={editProfile} hitSlop={12} style={styles.heroEdit} accessibilityLabel="Edit profile">
            <Icon name="pencil-outline" size={22} themeColor="accent" />
          </Pressable>
          <Pressable onPress={changePhoto} accessibilityRole="button" accessibilityLabel="Change profile photo">
            <View style={[styles.avatarRing, { borderColor: theme.accentSoft }]}>
              <Avatar name={profile.name} photoUri={profile.photoUri} size={96} />
            </View>
            <View style={[styles.cameraBadge, { backgroundColor: theme.accent, borderColor: theme.backgroundElement }]}>
              <Icon name="camera" size={16} color={theme.onAccent} />
            </View>
          </Pressable>
          {profile.name ? (
            <ThemedText type="heading" style={styles.center}>
              {profile.name}
            </ThemedText>
          ) : (
            <Pressable onPress={editProfile}>
              <ThemedText type="smallBold" themeColor="accent">
                Add your name
              </ThemedText>
            </Pressable>
          )}
          {profile.city || profile.country ? (
            <View style={styles.placeRow}>
              <Icon name="map-marker-outline" size={14} themeColor="textSecondary" />
              <ThemedText type="small" themeColor="textSecondary">
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </ThemedText>
            </View>
          ) : null}
        </Card>

        <Card>
          <CardTitle title="Contact" onEdit={editProfile} />
          <InfoRow icon="email-outline" label="Email" value={profile.email} />
          <Divider />
          <InfoRow icon="phone-outline" label="Mobile number" value={profile.phone} />
        </Card>

        <Card>
          <CardTitle title="Location" onEdit={editProfile} />
          <InfoRow icon="city-variant-outline" label="City" value={profile.city} />
          <Divider />
          <InfoRow icon="earth" label="Country" value={profile.country} />
        </Card>

        <Card>
          <View>
            <CardTitle title="Emergency contacts" />
            <ThemedText type="small" themeColor="textSecondary">
              People you trust to call if something happens on a ride. Later, Yatri will be able to share
              your location with them.
            </ThemedText>
          </View>
          {contacts.map((c) => (
            <View key={c.id} style={styles.contactRow}>
              <Pressable
                style={[styles.contactMain, styles.flex]}
                onPress={() => router.push({ pathname: '/contact-form', params: { id: c.id } })}
                accessibilityLabel={`Edit ${c.name}`}>
                <Avatar name={c.name} size={44} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {c.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[c.relation, c.phone].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(`tel:${c.phone.replace(/[^\d+]/g, '')}`)}
                style={[styles.callButton, { backgroundColor: theme.successSoft }]}
                accessibilityLabel={`Call ${c.name}`}>
                <Icon name="phone" size={20} themeColor="success" />
              </Pressable>
            </View>
          ))}
          {contacts.length < MAX_EMERGENCY_CONTACTS ? (
            <Pressable
              onPress={() => router.push('/contact-form')}
              style={({ pressed }) => [styles.addRow, { borderColor: theme.border }, pressed && styles.pressed]}
              accessibilityRole="button">
              <View style={[styles.addIcon, { backgroundColor: theme.accent }]}>
                <Icon name="plus" size={20} color={theme.onAccent} />
              </View>
              <ThemedText type="smallBold" themeColor="accent">
                Add emergency contact
              </ThemedText>
            </Pressable>
          ) : null}
        </Card>

        <ThemedText type="small" themeColor="textMuted" style={styles.center}>
          Your profile is stored only on this phone.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function CardTitle({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <View style={styles.cardTitle}>
      <ThemedText type="heading">{title}</ThemedText>
      {onEdit ? (
        <Pressable onPress={onEdit} hitSlop={12} accessibilityLabel={`Edit ${title.toLowerCase()}`}>
          <Icon name="pencil-outline" size={20} themeColor="accent" />
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name={icon} size={20} themeColor="textSecondary" />
      </View>
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold" themeColor={value ? 'text' : 'textMuted'} numberOfLines={1}>
          {value || 'Not added'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    gap: Spacing.two,
  },
  heroEdit: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 60,
    borderWidth: 3,
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -Spacing.one,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  contactMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
