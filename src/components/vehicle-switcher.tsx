import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { vehicleIcon, type Vehicle } from '@/db/garage';
import { useTheme } from '@/hooks/use-theme';

const MENU_WIDTH = 280;

/**
 * The vehicle chip in the Home header. Tapping it opens a dropdown to switch the active
 * vehicle (which every stat on Home and History follows), add one, or open the Garage.
 */
export function VehicleSwitcher({
  vehicles,
  active,
  onSelect,
  height = 36,
}: {
  vehicles: Vehicle[];
  active: Vehicle | null;
  onSelect: (id: number) => void;
  /** Chip height, to match neighbouring controls. */
  height?: number;
}) {
  const iconSize = height - 10;
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chipRef = useRef<ComponentRef<typeof View>>(null);
  // Where to draw the menu: just under the chip, kept on screen.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () => {
    if (!active) {
      router.push('/vehicle-form');
      return;
    }
    chipRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 6, right: Math.max(Spacing.three, screenWidth - (x + w)) });
    });
  };
  const close = () => setAnchor(null);
  const go = (to: () => void) => {
    close();
    to();
  };

  return (
    <>
      <Pressable
        ref={chipRef}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={active ? `Vehicle: ${active.name}. Tap to switch` : 'Add vehicle'}
        style={({ pressed }) => [
          styles.chip,
          {
            height,
            paddingLeft: (height - iconSize) / 2,
            backgroundColor: theme.backgroundElement,
            borderColor: anchor ? theme.accent : theme.border,
          },
          pressed && styles.pressed,
        ]}>
        <View
          style={[
            styles.chipIcon,
            { width: iconSize, height: iconSize, borderRadius: iconSize / 2, backgroundColor: theme.accentSoft },
          ]}>
          <Icon name={active ? vehicleIcon(active.type) : 'plus'} size={Math.round(iconSize * 0.55)} themeColor="accent" />
        </View>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.chipText}>
          {active ? active.name : 'Add vehicle'}
        </ThemedText>
        {active ? <Icon name={anchor ? 'chevron-up' : 'chevron-down'} size={16} themeColor="textMuted" /> : null}
      </Pressable>

      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close vehicle menu">
          {anchor ? (
            // Stops taps inside the menu from closing it through the backdrop.
            <Pressable
              onPress={() => {}}
              style={[
                styles.menu,
                {
                  top: anchor.top,
                  right: anchor.right,
                  width: Math.min(MENU_WIDTH, screenWidth - Spacing.three * 2),
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText type="caption" themeColor="textMuted" style={styles.menuLabel}>
                Switch vehicle
              </ThemedText>
              {vehicles.map((v) => {
                const on = v.id === active?.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() =>
                      go(() => {
                        if (!on) {
                          Haptics.selectionAsync();
                          onSelect(v.id);
                        }
                      })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.row,
                      on && { backgroundColor: theme.accentSoft },
                      pressed && !on && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <View style={[styles.rowIcon, { backgroundColor: on ? theme.accent : theme.backgroundSelected }]}>
                      <Icon name={vehicleIcon(v.type)} size={20} color={on ? theme.onAccent : theme.textSecondary} />
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {v.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {[v.make, v.model].filter(Boolean).join(' ') || (v.type === 'scooter' ? 'Scooter' : 'Motorbike')} ·{' '}
                        {Math.round(v.odometer_km).toLocaleString()} km
                      </ThemedText>
                    </View>
                    {on ? <Icon name="check-circle" size={20} themeColor="accent" /> : null}
                  </Pressable>
                );
              })}
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MenuLink icon="plus-circle-outline" label="Add vehicle" onPress={() => go(() => router.push('/vehicle-form'))} />
              <MenuLink icon="garage" label="Open Garage" onPress={() => go(() => router.navigate('/garage'))} />
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function MenuLink({ icon, label, onPress }: { icon: 'plus-circle-outline' | 'garage'; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <Icon name={icon} size={20} themeColor="accent" />
      <ThemedText type="smallBold" themeColor="accent">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    // Shrinks with the row (the name gets "…"), but never wider than this.
    flexShrink: 1,
    maxWidth: 170,
  },
  chipIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  menu: {
    position: 'absolute',
    padding: Spacing.two,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  menuLabel: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.two,
    borderRadius: Radius.medium,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
    marginHorizontal: Spacing.two,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.two,
    paddingVertical: 12,
    borderRadius: Radius.medium,
  },
});
