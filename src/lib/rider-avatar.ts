import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ImageSourcePropType } from 'react-native';

import { AVATAR_ART } from '@/lib/avatar-art';
import { CHARACTER_AVATARS } from '@/lib/avatar-characters';

/**
 * Ride avatars a rider can pick when they don't use (or have) a profile photo:
 * characters on bikes (bundled images), then helmets and riders (drawn in scripts/avatar-art.js).
 */
export const CHARACTER_PRESETS = CHARACTER_AVATARS.map((a) => a.id);
export const ART_PRESETS = AVATAR_ART.map((a) => a.id);
export const AVATAR_PRESETS = [...CHARACTER_PRESETS, ...ART_PRESETS];

export type AvatarPreset = (typeof CHARACTER_AVATARS)[number]['id'] | (typeof AVATAR_ART)[number]['id'];

const ART_BY_ID = new Map<string, (typeof AVATAR_ART)[number]>(AVATAR_ART.map((a) => [a.id, a]));
const CHARACTER_BY_ID = new Map<string, (typeof CHARACTER_AVATARS)[number]>(CHARACTER_AVATARS.map((a) => [a.id, a]));

/** SVG markup for a drawn preset, or null. */
export const avatarArt = (id: string) => ART_BY_ID.get(id)?.xml ?? null;
/** Bundled picture for a character preset, or null. */
export const avatarImage = (id: string): ImageSourcePropType | null => CHARACTER_BY_ID.get(id)?.source ?? null;
export const avatarLabel = (id: string) => CHARACTER_BY_ID.get(id)?.label ?? ART_BY_ID.get(id)?.label ?? id;

/** What the rider chose: their profile photo, a preset, or null for initials. */
export type AvatarChoice = 'photo' | AvatarPreset | null;

/** False for ids from older versions (e.g. the first icon avatars): those fall back to photo or initials. */
export function isAvatarPreset(value: unknown): value is AvatarPreset {
  return typeof value === 'string' && (CHARACTER_BY_ID.has(value) || ART_BY_ID.has(value));
}

/**
 * The saved setting ('photo', a preset, 'initials', or null for automatic) to what to show:
 * automatic uses the profile photo when there is one.
 */
export function resolveAvatar(saved: string | null, photoUri: string | null): AvatarChoice {
  if (isAvatarPreset(saved)) return saved;
  if (saved === 'initials') return null;
  return photoUri ? 'photo' : null;
}

/** Pixel size of the photo shared with the group: sharp on markers, a few KB on mobile data. */
const THUMB_PX = 128;

/**
 * Shrinks a profile photo to a small square JPEG, as a data URI that can be stored
 * in the group (about 5–10 KB). Square-crops from the centre first.
 */
export async function photoThumbnail(uri: string): Promise<string> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(source.width, source.height);
  const image = await ImageManipulator.manipulate(source)
    .crop({ originX: (source.width - side) / 2, originY: (source.height - side) / 2, width: side, height: side })
    .resize({ width: THUMB_PX, height: THUMB_PX })
    .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) throw new Error('Could not read the photo.');
  return `data:image/jpeg;base64,${saved.base64}`;
}
