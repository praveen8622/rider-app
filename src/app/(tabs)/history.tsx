import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/button';
import { Card, EmptyState } from '@/components/card';
import { Segmented } from '@/components/form';
import { GradientSurface } from '@/components/gradient-surface';
import { Icon, type IconName } from '@/components/icon';
import { RouteMap } from '@/components/route-map';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  getAllTimeStats,
  getLastRide,
  getRidePoints,
  rideTitle,
  toLatLng,
  type RideWithVehicle,
} from '@/db/rides';
import { useGarage } from '@/hooks/use-garage';
import { useTheme } from '@/hooks/use-theme';
import { averageKmh, formatDuration, formatKm, msToKmh, type LatLng } from '@/lib/geo';

type Tab = 'overview' | 'last';
type Totals = Awaited<ReturnType<typeof getAllTimeStats>>;

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const avgKmh = averageKmh;

export default function HistoryScreen() {
  const db = useSQLiteContext();
  // Links from Home pass which tab to show; `at` makes a repeat link to the same tab count again.
  const params = useLocalSearchParams<{ tab?: Tab; at?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'overview');
  const linkKey = `${params.tab}:${params.at}`;
  const [seenLink, setSeenLink] = useState(linkKey);
  if (linkKey !== seenLink) {
    setSeenLink(linkKey);
    if (params.tab) setTab(params.tab);
  }
  const [totals, setTotals] = useState<Totals | null>(null);
  const [last, setLast] = useState<{ ride: RideWithVehicle; route: LatLng[] } | null>(null);

  const { active, loaded: garageLoaded } = useGarage();
  const vehicleId = active?.id ?? null;

  // Totals follow the vehicle selected in the Garage.
  useFocusEffect(
    useCallback(() => {
      if (!garageLoaded) return;
      getAllTimeStats(db, vehicleId).then(setTotals);
      getLastRide(db, vehicleId).then(async (ride) => {
        if (!ride) return setLast(null);
        const points = await getRidePoints(db, ride.id);
        setLast({ ride, route: points.map(toLatLng) });
      });
    }, [db, garageLoaded, vehicleId]),
  );

  const empty = totals != null && totals.rides === 0;

  return (
    <ThemedView style={styles.container}>
      <SafeView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="subtitle">History</ThemedText>
            {totals ? (
              <ThemedText type="small" themeColor="textSecondary">
                {active ? `${active.name} · ` : ''}
                {totals.rides} {totals.rides === 1 ? 'ride' : 'rides'} · {formatKm(totals.distance)} km all time
              </ThemedText>
            ) : null}
          </View>

          {empty ? (
            <Card>
              <EmptyState
                icon="road-variant"
                title="No rides yet"
                body={
                  active
                    ? `No rides on ${active.name} yet. Start a ride, or pick another vehicle in the Garage.`
                    : 'Tap Start ride on the Ride tab. Your totals and last ride will show up here.'
                }
              />
            </Card>
          ) : (
            <>
              <Segmented
                options={[
                  { value: 'overview', label: 'Overview', icon: 'chart-donut' },
                  { value: 'last', label: 'Last ride', icon: 'history' },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tab === 'overview' && totals ? <Overview totals={totals} /> : null}
              {tab === 'last' && last ? <LastRide ride={last.ride} route={last.route} /> : null}
              <Button
                title="View all rides"
                icon="format-list-bulleted"
                variant="secondary"
                onPress={() => router.push('/all-rides')}
              />
            </>
          )}
        </ScrollView>
      </SafeView>
    </ThemedView>
  );
}

function Overview({ totals }: { totals: Totals }) {
  return (
    <>
      <SpeedHero
        topKmh={msToKmh(totals.topSpeed)}
        avgKmh={avgKmh(totals.distance, totals.moving)}
        distanceM={totals.distance}
        distanceLabel="Total distance"
      />
      <View style={styles.grid}>
        <Tile icon="flag-checkered" label="Rides" value={totals.rides.toLocaleString()} />
        <Tile icon="timer-outline" label="Ride time" value={formatDuration(totals.moving)} hint="while moving" />
        <Tile icon="map-marker-distance" label="Longest ride" value={formatKm(totals.longest)} unit="km" />
        <Tile icon="bell-ring-outline" label="Speed alerts" value={totals.speedAlerts.toLocaleString()} />
      </View>
    </>
  );
}

function LastRide({ ride, route }: { ride: RideWithVehicle; route: LatLng[] }) {
  const date = new Date(ride.started_at).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const openRide = () => router.push({ pathname: '/rides/[id]', params: { id: String(ride.id) } });

  return (
    <>
      <Card onPress={openRide}>
        <View style={styles.rideHead}>
          <View style={styles.flex}>
            <ThemedText type="heading" numberOfLines={1}>
              {rideTitle(ride)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {date}
              {ride.vehicle_name ? ` · ${ride.vehicle_name}` : ''}
            </ThemedText>
          </View>
          <Icon name="chevron-right" size={20} themeColor="textMuted" />
        </View>
        {route.length > 1 ? <RouteMap route={route} height={160} /> : null}
      </Card>

      <SpeedHero
        topKmh={msToKmh(ride.max_speed)}
        avgKmh={avgKmh(ride.distance_m, ride.moving_s)}
        distanceM={ride.distance_m}
        distanceLabel="Distance"
      />

      <View style={styles.grid}>
        <Tile icon="timer-outline" label="Ride time" value={formatDuration(ride.moving_s)} hint="while moving" />
        <Tile icon="clock-outline" label="Total time" value={formatDuration(ride.elapsed_s)} hint="incl. stops" />
        <Tile icon="clock-start" label="Start" value={clock(ride.started_at)} />
        <Tile icon="clock-end" label="End" value={ride.ended_at ? clock(ride.ended_at) : '--'} />
      </View>

      <Button title="Ride details" icon="chart-line" onPress={openRide} />
    </>
  );
}

/** Orange hero: average speed and distance either side of a top-speed dial. */
function SpeedHero({
  topKmh,
  avgKmh,
  distanceM,
  distanceLabel,
}: {
  topKmh: number;
  avgKmh: number;
  distanceM: number;
  distanceLabel: string;
}) {
  return (
    <GradientSurface ringsAt="center" style={styles.hero}>
      <HeroStat icon="speedometer-medium" label="Avg speed" value={avgKmh.toFixed(0)} unit="km/h" />
      <TopSpeedDial kmh={topKmh} />
      <HeroStat icon="map-marker-path" label={distanceLabel} value={formatKm(distanceM)} unit="km" />
    </GradientSurface>
  );
}

function HeroStat({ icon, label, value, unit }: { icon: IconName; label: string; value: string; unit: string }) {
  const theme = useTheme();
  const on = { color: theme.onAccent };
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroIcon}>
        <Icon name={icon} size={18} color={theme.onAccent} />
      </View>
      <ThemedText type="caption" style={[styles.heroLabel, on]} numberOfLines={2}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.heroValue, on]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      <ThemedText type="smallBold" style={[styles.heroUnit, on]}>
        {unit}
      </ThemedText>
    </View>
  );
}

const DIAL = 136;
const DIAL_STROKE = 8;

/** White dial; the arc fills toward 120 km/h (160 once the rider has gone past 120). */
function TopSpeedDial({ kmh }: { kmh: number }) {
  const theme = useTheme();
  const max = kmh > 120 ? 160 : 120;
  const c = DIAL / 2;
  const r = c - DIAL_STROKE - 4;
  // 270° sweep starting bottom-left, like a speedometer.
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
  };
  const arc = (from: number, to: number) => `M ${point(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
  const end = 135 + (Math.min(kmh, max) / max) * 270;

  return (
    <View style={[styles.dial, { backgroundColor: theme.backgroundElement }]}>
      <Svg width={DIAL} height={DIAL} style={StyleSheet.absoluteFill}>
        <Path d={arc(135, 405)} stroke={theme.accentSoft} strokeWidth={DIAL_STROKE} strokeLinecap="round" fill="none" />
        {kmh > 0.5 ? (
          <Path d={arc(135, end)} stroke={theme.accent} strokeWidth={DIAL_STROKE} strokeLinecap="round" fill="none" />
        ) : null}
      </Svg>
      <ThemedText style={styles.dialValue}>{Math.round(kmh)}</ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary">
        km/h
      </ThemedText>
      <ThemedText type="caption" themeColor="accent" style={styles.dialLabel}>
        Top speed
      </ThemedText>
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.tileIcon, { backgroundColor: theme.accentSoft }]}>
        <Icon name={icon} size={18} themeColor="accent" />
      </View>
      <ThemedText type="caption" themeColor="textMuted" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="number" numberOfLines={1}>
        {value}
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            {unit}
          </ThemedText>
        ) : null}
      </ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.tileHint}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingTop: Spacing.two,
    gap: Spacing.half,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.four,
    paddingHorizontal: 12,
    gap: Spacing.two,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  heroIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroLabel: {
    opacity: 0.85,
    fontSize: 11,
    textAlign: 'center',
  },
  heroValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    opacity: 0.85,
    fontSize: 12,
    lineHeight: 16,
  },
  dial: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dialValue: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: 800,
    fontFamily: Fonts?.rounded,
    fontVariant: ['tabular-nums'],
    marginTop: Spacing.two,
  },
  dialLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  rideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  tileHint: {
    fontSize: 12,
    lineHeight: 16,
  },
});
