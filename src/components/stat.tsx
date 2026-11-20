import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function Stat({
  label,
  value,
  unit,
  icon,
  compact,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: IconName;
  /** Three per row instead of two. */
  compact?: boolean;
}) {
  return (
    <View style={[styles.stat, compact && styles.compact]}>
      <View style={styles.labelRow}>
        {icon ? <Icon name={icon} size={14} themeColor="textMuted" /> : null}
        <ThemedText type="caption" themeColor="textMuted" numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <ThemedText type="number" numberOfLines={1}>
        {value}
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            {unit}
          </ThemedText>
        ) : null}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flexBasis: '45%',
    flexGrow: 1,
    gap: Spacing.half,
  },
  compact: {
    flexBasis: '28%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
