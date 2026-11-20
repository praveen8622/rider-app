import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { initials } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { avatarArt, avatarImage, isAvatarPreset } from '@/lib/rider-avatar';

/**
 * A rider's face everywhere in group rides (lists, strip, map markers): their photo,
 * else their picked avatar on their color, else initials. Grey when `stale`.
 * Uses React Native's Image so it also draws inside map markers.
 */
export function RiderAvatar({
  name,
  avatar,
  photo,
  color,
  size = 40,
  ring,
  leader,
  stale,
  style,
}: {
  name: string;
  avatar?: string | null;
  /** data: URI or file URI */
  photo?: string | null;
  color: string;
  size?: number;
  /** Border color, e.g. white on maps. */
  ring?: string;
  leader?: boolean;
  stale?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  const preset = !photo && isAvatarPreset(avatar) ? avatar : null;
  const character = preset ? avatarImage(preset) : null;
  const art = preset && !character ? avatarArt(preset) : null;
  const picked = !!(character || art);
  // Picked avatars bring their own colours, so the rider's colour becomes a ring around them.
  const border = leader ? '#FACC15' : picked ? color : ring;
  const borderWidth = border ? Math.max(picked ? 2.5 : 2, Math.round(size / (picked ? 12 : 14))) : 0;
  const crown = Math.round(size * 0.42);

  return (
    <View style={[round, style]}>
      <View
        style={[
          styles.center,
          round,
          { backgroundColor: picked ? '#FFFFFF' : color, borderColor: border, borderWidth, overflow: 'hidden' },
        ]}>
        {photo ? (
          <Image source={{ uri: photo }} style={[StyleSheet.absoluteFill, stale && styles.stale]} />
        ) : character ? (
          // Bundled images carry their own size (256x256); without an explicit size React Native
          // draws them at that size and the circle shows only the top-left corner (background).
          <Image source={character} resizeMode="cover" style={[styles.fill, stale && styles.stale]} />
        ) : art ? (
          <SvgXml xml={art} width="100%" height="100%" style={stale ? styles.stale : undefined} />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name) || '?'}</Text>
        )}
      </View>
      {leader ? (
        <View
          style={[
            styles.crown,
            { width: crown, height: crown, borderRadius: crown / 2, top: -crown * 0.3, right: -crown * 0.3 },
          ]}>
          <Icon name="crown" size={crown * 0.62} color="#7A4E00" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  stale: {
    opacity: 0.45,
  },
  crown: {
    position: 'absolute',
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
