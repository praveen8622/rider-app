import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, SectionHeader } from '@/components/card';
import { SpeedChart } from '@/components/charts';
import { Icon } from '@/components/icon';
import { RouteMap } from '@/components/route-map';
import { Stat } from '@/components/stat';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  deleteRide,
  getRide,
  getRidePoints,
  renameRide,
  rideTitle,
  toLatLng,
  type RidePoint,
  type RideWithVehicle,
} from '@/db/rides';
import { useTheme } from '@/hooks/use-theme';
import { averageKmh, formatDuration, formatKm, msToKmh } from '@/lib/geo';

export default function RideSummaryScreen() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const rideId = Number(id);
  const db = useSQLiteContext();
  const theme = useTheme();
  const [ride, setRide] = useState<RideWithVehicle | null>(null);
  const [points, setPoints] = useState<RidePoint[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    getRide(db, rideId).then((r) => {
      setRide(r);
      if (r) setName(rideTitle(r));
    });
    getRidePoints(db, rideId).then(setPoints);
  }, [db, rideId]);

  const saveName = async () => {
    setEditing(false);
    await renameRide(db, rideId, name);
    const r = await getRide(db, rideId);
    setRide(r);
    if (r) setName(rideTitle(r));
  };

  const confirmDelete = () => {
    Alert.alert('Delete this ride?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRide(db, rideId);
          router.back();
        },
      },
    ]);
  };

  if (!ride) return <ThemedView style={styles.container} />;

  const avgKmh = averageKmh(ride.distance_m, ride.moving_s);
  const date = new Date(ride.started_at).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  const share = () =>
    Share.share({
      message:
        `${rideTitle(ride)} on Yatri\n` +
        `${formatKm(ride.distance_m)} km · ${formatDuration(ride.elapsed_s)} · ` +
        `avg ${avgKmh.toFixed(0)} km/h · top ${msToKmh(ride.max_speed).toFixed(0)} km/h`,
    });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable onPress={share} hitSlop={12} accessibilityLabel="Share ride">
              <Icon name="share-variant" size={22} themeColor="accent" />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        {fresh ? (
          <View style={[styles.done, { backgroundColor: theme.successSoft }]}>
            <Icon name="check-circle" size={20} themeColor="success" />
            <ThemedText type="smallBold">Ride saved. Parking spot updated.</ThemedText>
          </View>
        ) : null}

        <View>
          {editing ? (
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              onSubmitEditing={saveName}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              style={[styles.nameInput, { color: theme.text, borderColor: theme.accent }]}
            />
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow} accessibilityLabel="Rename ride">
              <ThemedText type="subtitle" style={styles.flex}>
                {rideTitle(ride)}
              </ThemedText>
              <Icon name="pencil" size={20} themeColor="textMuted" />
            </Pressable>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {date}
            {ride.vehicle_name ? ` · ${ride.vehicle_name}` : ''}
          </ThemedText>
        </View>

        <View style={styles.hero}>
          <View>
            <ThemedText type="title">{formatKm(ride.distance_m)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              kilometres
            </ThemedText>
          </View>
          <View>
            <ThemedText type="title">{formatDuration(ride.elapsed_s)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              total time
            </ThemedText>
          </View>
        </View>

        {points.length > 1 ? <RouteMap route={points.map(toLatLng)} height={260} interactive /> : null}

        <SectionHeader title="Speed" />
        <Card>
          <SpeedChart points={points.map((p) => [p.t, msToKmh(p.speed ?? 0)])} />
        </Card>

        <SectionHeader title="Details" />
        <Card>
          <View style={styles.stats}>
            <Stat icon="speedometer" label="Avg speed" value={avgKmh.toFixed(0)} unit="km/h" />
            <Stat icon="gauge" label="Top speed" value={msToKmh(ride.max_speed).toFixed(0)} unit="km/h" />
            <Stat icon="timer-outline" label="Moving time" value={formatDuration(ride.moving_s)} />
            <Stat icon="bell-ring" label="Speed alerts" value={String(ride.overspeed_count)} />
            <Stat
              icon="angle-acute"
              label="Max lean"
              value={`${ride.max_lean_a.toFixed(0)}° / ${ride.max_lean_b.toFixed(0)}°`}
            />
            <Stat icon="chart-bell-curve-cumulative" label="Max G" value={ride.max_g.toFixed(2)} unit="g" />
          </View>
          <ThemedText type="small" themeColor="textMuted">
            Lean (each side) and G-force are estimates from your phone&apos;s sensors, most accurate
            with the phone firmly mounted on the handlebar.
          </ThemedText>
        </Card>

        <Button title="Delete ride" icon="delete-outline" variant="ghost" onPress={confirmDelete} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  flex: {
    flex: 1,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 12,
    borderRadius: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nameInput: {
    fontSize: 26,
    fontWeight: 800,
    borderBottomWidth: 2,
    paddingVertical: Spacing.one,
  },
  hero: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
    columnGap: Spacing.three,
  },
});
