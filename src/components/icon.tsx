import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({
  name,
  size = 22,
  color,
  themeColor = 'text',
}: {
  name: IconName;
  size?: number;
  /** Raw color; wins over themeColor. */
  color?: string;
  themeColor?: ThemeColor;
}) {
  const theme = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? theme[themeColor]} />;
}
