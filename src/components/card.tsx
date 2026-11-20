import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const base = [
    styles.card,
    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** Title row above a group of content, with an optional action on the right. */
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <ThemedText type="heading">{title}</ThemedText>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12}>
          <ThemedText type="smallBold" themeColor="accent">
            {action}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable row: leading icon, title + subtitle, trailing text or chevron. */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  trailing,
  onPress,
  children,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconBubble, { backgroundColor: theme.backgroundSelected }]}>
          <Icon name={icon} size={20} color={iconColor ?? theme.text} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
        {children}
      </View>
      {typeof trailing === 'string' ? (
        <ThemedText type="smallBold">{trailing}</ThemedText>
      ) : (
        trailing
      )}
      {onPress && trailing === undefined ? (
        <Icon name="chevron-right" size={20} themeColor="textMuted" />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} themeColor="textMuted" />
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>
        {body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    // Soft lift off the page. Android elevation looks heavy next to the hairline border, so iOS only.
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  emptyBody: {
    textAlign: 'center',
  },
});
