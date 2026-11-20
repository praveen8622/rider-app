import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { Card, EmptyState } from '@/components/card';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { listRides, rideTitle, type RideWithVehicle } from '@/db/rides';
import { useGarage } from '@/hooks/use-garage';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, formatKm, msToKmh } from '@/lib/geo';

type Section = { title: string; km: number; count: number; data: RideWithVehicle[] };

function groupByMonth(rides: RideWithVehicle[]): Section[] {
  const sections: Section[] = [];
  for (const ride of rides) {
    const title = new Date(ride.started_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let section = sections.at(-1);
    if (!section || section.title !== title) {
      section = { title, km: 0, count: 0, data: [] };
      sections.push(section);
    }
    section.data.push(ride);
    section.km += ride.distance_m;
    section.count++;
  }
  return sections;
}

/** Every saved ride, newest first, grouped by month. Opened from History > View all rides. */
export default function AllRidesScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [rides, setRides] = useState<RideWithVehicle[]>([]);
  const sections = useMemo(() => groupByMonth(rides), [rides]);
  const totalKm = rides.reduce((sum, r) => sum + r.distance_m, 0);
  const { active, loaded: garageLoaded } = useGarage();
  const vehicleId = active?.id ?? null;

  // Only the selected vehicle's rides, like the rest of History.
  useFocusEffect(
    useCallback(() => {
      if (garageLoaded) listRides(db, vehicleId).then(setRides);
    }, [db, garageLoaded, vehicleId]),
  );

  return (
    <ThemedView style={styles.container}>
      <SectionList
        style={styles.listBox}
        sections={sections}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          rides.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {active ? `${active.name} · ` : ''}
              {rides.length} {rides.length === 1 ? 'ride' : 'rides'} · {formatKm(totalKm)} km all time
            </ThemedText>
          ) : undefined
        }
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon="road-variant"
              title="No rides yet"
              body="Tap Start ride on the Ride tab. Your rides will show up here."
            />
          </Card>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <ThemedText type="heading">{section.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatKm(section.km)} km · {section.count} {section.count === 1 ? 'ride' : 'rides'}
            </ThemedText>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/rides/[id]', params: { id: String(item.id) } })}
            style={({ pressed }) => pressed && styles.pressed}>
            <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.dateBox, { backgroundColor: theme.accentSoft }]}>
                <ThemedText type="smallBold" themeColor="accent">
                  {new Date(item.started_at).getDate()}
                </ThemedText>
                <ThemedText type="caption" themeColor="accent">
                  {new Date(item.started_at).toLocaleDateString(undefined, { weekday: 'short' })}
                </ThemedText>
              </View>
              <View style={styles.rowBody}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {rideTitle(item)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {formatKm(item.distance_m)} km · {formatDuration(item.elapsed_s)} · top{' '}
                  {msToKmh(item.max_speed).toFixed(0)} km/h
                </ThemedText>
                {item.vehicle_name ? (
                  <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                    {item.vehicle_name}
                  </ThemedText>
                ) : null}
              </View>
              <Icon name="chevron-right" size={20} themeColor="textMuted" />
            </View>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  listBox: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  list: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: 12,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateBox: {
    width: 52,
    height: 52,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
