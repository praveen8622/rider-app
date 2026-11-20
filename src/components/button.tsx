import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  large?: boolean;
  small?: boolean;
};

export function Button({ title, variant = 'primary', icon, large, small, style, disabled, ...rest }: Props) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundSelected,
    danger: theme.danger,
    ghost: 'transparent',
  }[variant];
  const color = variant === 'secondary' ? theme.text : variant === 'ghost' ? theme.accent : theme.onAccent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      style={(state) => [
        styles.button,
        large && styles.large,
        small && styles.small,
        { backgroundColor: background, opacity: disabled ? 0.4 : state.pressed ? 0.75 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {icon ? <Icon name={icon} size={large ? 24 : 20} color={color} /> : null}
      <ThemedText
        style={[styles.label, large && styles.largeLabel, small && styles.smallLabel, { color }]}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: 14,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    paddingVertical: 20,
    borderRadius: Radius.large,
  },
  small: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
  },
  label: {
    fontWeight: 700,
  },
  largeLabel: {
    fontSize: 20,
    lineHeight: 26,
  },
  smallLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
});
