import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

/** Round profile picture: the photo if there is one, else initials, else a person icon. */
export function Avatar({ name, photoUri, size = 40 }: { name: string; photoUri?: string | null; size?: number }) {
  const theme = useTheme();
  const text = initials(name);
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (photoUri) {
    return <Image source={{ uri: photoUri }} style={[round, { backgroundColor: theme.accentSoft }]} contentFit="cover" />;
  }
  return (
    <View style={[styles.center, round, { backgroundColor: theme.accentSoft }]}>
      {text ? (
        <ThemedText themeColor="accent" style={{ fontSize: size * 0.38, lineHeight: size * 0.46, fontWeight: 800 }}>
          {text}
        </ThemedText>
      ) : (
        <Icon name="account" size={size * 0.55} themeColor="accent" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
