import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ColorPicker } from '@/components/color-picker';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/db/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  ACCENT_PRESETS,
  accentTokens,
  DEFAULT_ACCENT,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  readableOn,
  setAccentColor,
  useAccentColor,
  type HSV,
} from '@/lib/accent';

export default function AccentColorScreen() {
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { update } = useSettings();

  // Starts from the color in use. `hex` is the exact pick (presets and typed codes stay exact);
  // `hsv` only positions the picker.
  const saved = useAccentColor();
  const [hex, setHex] = useState(saved ?? DEFAULT_ACCENT);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hex));
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState(false);

  const choose = (next: string) => {
    setHex(next);
    setHsv(hexToHsv(next));
  };

  const onPick = (next: HSV) => {
    setHsv(next);
    setHex(hsvToHex(next));
  };

  const applyDraft = () => {
    // Done on an empty box is not a mistake; just ignore it.
    if (!draft.trim()) return;
    const typed = normalizeHex(draft);
    setDraftError(!typed);
    if (!typed) return;
    choose(typed);
    setDraft('');
  };

  const save = async (picked: string) => {
    // The default orange means "no custom color": the hand-tuned palette.
    const value = picked === DEFAULT_ACCENT ? null : picked;
    setAccentColor(value);
    await update('accentColor', value);
    router.back();
  };

  // What the app will look like with this color, before saving.
  const preview = accentTokens(hex, scheme);
  const presetName = ACCENT_PRESETS.find((p) => p.hex === hex)?.name;

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <Card>
          <ThemedText type="caption" themeColor="textMuted">
            Preview
          </ThemedText>
          <View style={[styles.previewHero, { backgroundColor: preview.accent }]}>
            <View style={styles.flex}>
              <ThemedText type="caption" style={{ color: preview.onAccent, opacity: 0.8 }}>
                Ready when you are
              </ThemedText>
              <ThemedText type="heading" style={{ color: preview.onAccent }}>
                Start ride
              </ThemedText>
            </View>
            <View style={[styles.previewPlay, { backgroundColor: preview.onAccent }]}>
              <Icon name="play" size={22} color={preview.accent} />
            </View>
          </View>
          <View style={styles.previewRow}>
            <View style={[styles.previewChip, { backgroundColor: preview.accentSoft }]}>
              <Icon name="speedometer" size={16} color={preview.accent} />
              <ThemedText type="smallBold" style={{ color: preview.accent }}>
                62 km/h
              </ThemedText>
            </View>
            <View style={[styles.previewChip, { backgroundColor: preview.accentSoft }]}>
              <Icon name="map-marker-path" size={16} color={preview.accent} />
              <ThemedText type="smallBold" style={{ color: preview.accent }}>
                18.4 km
              </ThemedText>
            </View>
          </View>
        </Card>

        <Card>
          <ColorPicker value={hsv} onChange={onPick} />
          <View style={styles.hexRow}>
            <View style={[styles.hexSwatch, { backgroundColor: hex, borderColor: theme.border }]} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{presetName ?? 'Custom'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {hex}
              </ThemedText>
            </View>
          </View>
        </Card>

        <Card>
          <ThemedText type="smallBold">Quick picks</ThemedText>
          <View style={styles.swatches}>
            {ACCENT_PRESETS.map((p) => {
              const selected = p.hex === hex;
              return (
                <Pressable
                  key={p.hex}
                  onPress={() => choose(p.hex)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={p.name}
                  style={[styles.swatch, { backgroundColor: p.hex, borderColor: selected ? theme.text : 'transparent' }]}>
                  {selected ? <Icon name="check" size={18} color={readableOn(p.hex)} /> : null}
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="smallBold">Color code</ThemedText>
          <View style={styles.hexRow}>
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                setDraftError(false);
              }}
              onSubmitEditing={applyDraft}
              placeholder="#1E90FF"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              returnKeyType="done"
              accessibilityLabel="Color code"
              style={[styles.hexInput, { color: theme.text, borderColor: draftError ? theme.danger : theme.border }]}
            />
            <Button title="Use code" variant="secondary" small onPress={applyDraft} disabled={!draft.trim()} />
          </View>
          {draftError ? (
            <ThemedText type="small" themeColor="danger">
              Use a 6-digit color code like #1E90FF.
            </ThemedText>
          ) : null}
        </Card>

        <Button title="Use this color" icon="check" large onPress={() => save(hex)} />
        <Button title="Reset to Yatri orange" variant="ghost" onPress={() => save(DEFAULT_ACCENT)} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  previewHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  previewPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  previewRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  hexSwatch: {
    width: 44,
    height: 44,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: Radius.small,
    borderWidth: 1,
  },
});
