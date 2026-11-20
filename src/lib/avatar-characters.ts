import type { ImageSourcePropType } from 'react-native';

/**
 * Character avatars: animals riding sport bikes. Made from the art in D:\yatri-avatars by
 * scripts/export-character-avatars.ps1 (cropped, on a coloured background, 256px JPEG).
 * Bundled with the app, so they show instantly and offline; only the id is shared with the group.
 */
export const CHARACTER_AVATARS = [
  { id: 'char-cheetah', label: 'Cheetah', source: require('@/assets/avatars/cheetah.jpg') },
  { id: 'char-tiger', label: 'Tiger', source: require('@/assets/avatars/tiger.jpg') },
  { id: 'char-lion', label: 'Lion', source: require('@/assets/avatars/lion.jpg') },
  { id: 'char-wolf', label: 'Wolf', source: require('@/assets/avatars/wolf.jpg') },
  { id: 'char-fox', label: 'Fox', source: require('@/assets/avatars/fox.jpg') },
  { id: 'char-bear', label: 'Bear', source: require('@/assets/avatars/bear.jpg') },
  { id: 'char-bull', label: 'Bull', source: require('@/assets/avatars/bull.jpg') },
  { id: 'char-horse', label: 'Horse', source: require('@/assets/avatars/horse.jpg') },
  { id: 'char-eagle', label: 'Eagle', source: require('@/assets/avatars/eagle.jpg') },
  { id: 'char-panda', label: 'Panda', source: require('@/assets/avatars/panda.jpg') },
  { id: 'char-koala', label: 'Koala', source: require('@/assets/avatars/koala.jpg') },
  { id: 'char-otter', label: 'Otter', source: require('@/assets/avatars/otter.jpg') },
  { id: 'char-rabbit', label: 'Rabbit', source: require('@/assets/avatars/rabbit.jpg') },
  { id: 'char-cat', label: 'Cat', source: require('@/assets/avatars/cat.jpg') },
  { id: 'char-penguin', label: 'Penguin', source: require('@/assets/avatars/penguin.jpg') },
  { id: 'char-turtle', label: 'Turtle', source: require('@/assets/avatars/turtle.jpg') },
] as const satisfies readonly { id: string; label: string; source: ImageSourcePropType }[];
