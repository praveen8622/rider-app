import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { loadSettings, saveSetting } from '@/db/settings';
import { loadRiderIdentity } from '@/hooks/use-rider-identity';
import { useTheme } from '@/hooks/use-theme';
import { syncMyLook, type RiderIdentity } from '@/lib/group-ride';
import { ART_PRESETS, avatarLabel, CHARACTER_PRESETS, resolveAvatar } from '@/lib/rider-avatar';


/** Choose how you look in group rides: profile photo, initials, or a ride avatar. */
export default function RideAvatarScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [identity, setIdentity] = useState<RiderIdentity | null>(null);
  // What's highlighted: 'photo', 'initials' or a preset.
  const [choice, setChoice] = useState<string>('initials');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([loadRiderIdentity(db), loadSettings(db)]).then(([id, settings]) => {
      setIdentity(id);
      setChoice(resolveAvatar(settings.rideAvatar, id.photoUri) ?? 'initials');
    });
  }, [db]);

  if (!identity) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  const pick = (value: string) => {
    Haptics.selectionAsync();
    setChoice(value);
  };

  const save = async () => {
    setSaving(true);
    await saveSetting(db, 'rideAvatar', choice);
    const next = { ...identity, avatar: resolveAvatar(choice, identity.photoUri) };
    // If in a group, friends see the new look right away (photo upload continues in the background).
    syncMyLook(next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const preview = resolveAvatar(choice, identity.photoUri);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <View style={styles.preview}>
        <RiderAvatar
          name={identity.name}
          avatar={preview}
          photo={preview === 'photo' ? identity.photoUri : null}
          color={theme.accent}
          size={96}
          ring={theme.backgroundElement}
        />
        <Pressable
          onPress={() => router.push('/profile-form')}
          accessibilityRole="button"
          accessibilityLabel="Edit your name"
          style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}>
          <ThemedText type="subtitle" numberOfLines={1}>
            {identity.name.trim() || 'Add your name'}
          </ThemedText>
          <Icon name="pencil" size={18} themeColor="accent" />
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          This is how friends see you on the group map.
        </ThemedText>
      </View>

      <Card>
        <ThemedText type="heading">Photo or initials</ThemedText>
        <View style={styles.options}>
          {identity.photoUri ? (
            <Option label="Profile photo" selected={choice === 'photo'} onPress={() => pick('photo')}>
              <RiderAvatar name={identity.name} photo={identity.photoUri} color={theme.accent} size={52} />
            </Option>
          ) : (
            <Option label="Add a photo" selected={false} onPress={() => router.push('/profile')}>
              <View style={[styles.addPhoto, { borderColor: theme.textMuted }]}>
                <Icon name="camera-plus-outline" size={22} themeColor="textMuted" />
              </View>
            </Option>
          )}
          <Option label="Initials" selected={choice === 'initials'} onPress={() => pick('initials')}>
            <RiderAvatar name={identity.name} color={theme.accent} size={52} />
          </Option>
        </View>
      </Card>

      <Card>
        <ThemedText type="heading">Characters</ThemedText>
        <PresetGrid presets={CHARACTER_PRESETS} columns={4} choice={choice} onPick={pick} labels />
      </Card>

      <Card>
        <ThemedText type="heading">Helmets & riders</ThemedText>
        <PresetGrid presets={ART_PRESETS} columns={6} choice={choice} onPick={pick} />
      </Card>

      <Button title={saving ? 'Saving…' : 'Use this look'} icon="check" large disabled={saving} onPress={save} />
    </ScrollView>
  );
}

/** A grid of avatars to pick from; the chosen one gets an accent ring. */
function PresetGrid({
  presets,
  columns,
  choice,
  onPick,
  labels,
}: {
  presets: readonly string[];
  columns: number;
  choice: string;
  onPick: (preset: string) => void;
  /** Show each avatar's name under it. */
  labels?: boolean;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const content = Math.min(width, MaxContentWidth) - Spacing.three * 4;
  // A couple of points spare so rounding never pushes the last tile onto the next row.
  const cell = Math.floor((content - 2 - Spacing.two * (columns - 1)) / columns);
  return (
    <View style={styles.grid}>
      {presets.map((preset) => {
        const on = choice === preset;
        return (
          <Pressable
            key={preset}
            onPress={() => onPick(preset)}
            accessibilityRole="button"
            accessibilityLabel={avatarLabel(preset)}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.cellWrap, { width: cell }, pressed && styles.pressed]}>
            <View style={[styles.cell, { width: cell, height: cell, borderColor: on ? theme.accent : 'transparent' }]}>
              <RiderAvatar name="" avatar={preset} color={on ? theme.accent : theme.border} size={cell - 10} />
            </View>
            {labels ? (
              <ThemedText
                type="caption"
                themeColor={on ? 'accent' : 'textSecondary'}
                numberOfLines={1}
                // Never wider than the tile, or iPhone wraps the row early.
                style={[styles.cellLabel, { width: cell }]}>
                {avatarLabel(preset)}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Option({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accentSoft : theme.background },
        pressed && styles.pressed,
      ]}>
      {children}
      <ThemedText type="smallBold" themeColor={selected ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  preview: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  options: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  addPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cellWrap: {
    alignItems: 'center',
    gap: 2,
  },
  cellLabel: {
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  cell: {
    borderRadius: Radius.medium,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
