import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Field({
  label,
  hint,
  suffix,
  ...input
}: TextInputProps & { label: string; hint?: string; suffix?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={[styles.inputBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <TextInput
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text }]}
          {...input}
        />
        {suffix ? (
          <ThemedText type="small" themeColor="textSecondary">
            {suffix}
          </ThemedText>
        ) : null}
      </View>
      {hint ? (
        <ThemedText type="small" themeColor="textMuted">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      <View style={[styles.segments, { backgroundColor: theme.backgroundSelected }]}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && { backgroundColor: theme.backgroundElement }]}>
              {o.icon ? <Icon name={o.icon} size={20} themeColor={selected ? 'accent' : 'textSecondary'} /> : null}
              <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Parses a number typed with either "." or "," as the decimal mark. Empty -> null. */
export function parseNumber(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() === '' || !Number.isFinite(n) ? null : n;
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 14,
  },
  segments: {
    flexDirection: 'row',
    borderRadius: Radius.medium,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radius.small,
  },
});
