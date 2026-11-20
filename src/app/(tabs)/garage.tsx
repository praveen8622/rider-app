import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Fragment, useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, Divider, EmptyState, ListRow, SectionHeader } from '@/components/card';
import { Meter } from '@/components/charts';
import { Icon } from '@/components/icon';
import { Stat } from '@/components/stat';
import { SafeView } from '@/components/safe-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  deleteFuel,
  deleteServiceItem,
  deleteServiceLog,
  fuelEconomy,
  listFuel,
  listServiceItems,
  listServiceLogs,
  serviceStatus,
  vehicleIcon,
  type FuelLog,
  type ServiceItem,
  type ServiceLog,
} from '@/db/garage';
import { useGarage } from '@/hooks/use-garage';
import { useTheme } from '@/hooks/use-theme';

// "Rs" reads right for both Nepali and Indian rupees.
const money = (n: number) => `Rs ${Math.round(n).toLocaleString()}`;
const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function GarageScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { vehicles, active, loaded, select } = useGarage();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [logs, setLogs] = useState<ServiceLog[]>([]);

  const load = useCallback(() => {
    if (!active) return;
    listServiceItems(db, active.id).then(setItems);
    listFuel(db, active.id).then(setFuel);
    listServiceLogs(db, active.id).then(setLogs);
  }, [db, active]);

  useFocusEffect(load);

  const confirm = (title: string, action: () => Promise<void>) =>
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await action();
          load();
        },
      },
    ]);

  if (loaded && !active) {
    return (
      <ThemedView style={styles.container}>
        <SafeView style={styles.safeArea} edges={['top']}>
          <View style={styles.content}>
            <ThemedText type="subtitle">Garage</ThemedText>
            <Card>
              <EmptyState
                icon="garage"
                title="No vehicles yet"
                body="Add your scooter or bike to get service reminders, a fuel log and an odometer that updates from your rides."
              />
              <Button title="Add vehicle" icon="plus" onPress={() => router.push('/vehicle-form')} />
            </Card>
          </View>
        </SafeView>
      </ThemedView>
    );
  }
  if (!active) return <ThemedView style={styles.container} />;

  const economy = fuelEconomy(fuel);
  const sortedItems = items
    .map((item) => ({ item, status: serviceStatus(item, active.odometer_km) }))
    .sort((a, b) => b.status.fraction - a.status.fraction);

  return (
    <ThemedView style={styles.container}>
      <SafeView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle">Garage</ThemedText>
            <Button title="Vehicle" icon="plus" small variant="secondary" onPress={() => router.push('/vehicle-form')} />
          </View>

          {vehicles.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {vehicles.map((v) => {
                const selected = v.id === active.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => select(v.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: selected ? theme.accent : theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <Icon name={vehicleIcon(v.type)} size={16} color={selected ? theme.onAccent : theme.text} />
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
                      {v.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <Card>
            <View style={styles.vehicleHead}>
              <View style={[styles.vehicleIcon, { backgroundColor: theme.accentSoft }]}>
                <Icon name={vehicleIcon(active.type)} size={32} themeColor="accent" />
              </View>
              <View style={styles.flex}>
                <ThemedText type="heading">{active.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {active.model || (active.type === 'scooter' ? 'Scooter' : 'Motorbike')}
                </ThemedText>
              </View>
              <Pressable
                hitSlop={12}
                accessibilityLabel="Edit vehicle"
                onPress={() => router.push({ pathname: '/vehicle-form', params: { id: String(active.id) } })}>
                <Icon name="pencil" size={20} themeColor="textMuted" />
              </Pressable>
            </View>
            <View>
              <ThemedText type="caption" themeColor="textMuted">
                Odometer
              </ThemedText>
              <ThemedText type="title">
                {Math.round(active.odometer_km).toLocaleString()}
                <ThemedText type="default" themeColor="textSecondary">
                  {' '}
                  km
                </ThemedText>
              </ThemedText>
            </View>
            <View style={styles.stats}>
              <Stat compact label="Mileage" value={economy.averageKmpl ? economy.averageKmpl.toFixed(1) : '--'} unit="km/L" />
              <Stat compact label="Fuel spend" value={money(economy.totalCost)} />
              <Stat compact label="Per km" value={economy.costPerKm ? `Rs ${economy.costPerKm.toFixed(2)}` : '--'} />
            </View>
          </Card>

          <SectionHeader
            title="Service reminders"
            action="Add"
            onAction={() =>
              router.push({ pathname: '/service-form', params: { vehicleId: String(active.id), mode: 'reminder' } })
            }
          />
          <Card>
            {sortedItems.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No reminders. Tap Add to create one.
              </ThemedText>
            ) : (
              sortedItems.map(({ item, status }, i) => (
                <Fragment key={item.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onLongPress={() => confirm(`Delete "${item.name}" reminder?`, () => deleteServiceItem(db, item.id))}>
                    <ListRow
                      icon={item.icon}
                      iconColor={status.fraction >= 1 ? theme.danger : status.fraction >= 0.85 ? theme.warning : undefined}
                      title={item.name}
                      subtitle={status.label}
                      trailing={
                        <Button
                          title="Done"
                          small
                          variant={status.fraction >= 0.85 ? 'primary' : 'secondary'}
                          onPress={() =>
                            router.push({
                              pathname: '/service-form',
                              params: { vehicleId: String(active.id), itemId: String(item.id), mode: 'log' },
                            })
                          }
                        />
                      }>
                      <View style={styles.meter}>
                        <Meter fraction={status.fraction} />
                      </View>
                    </ListRow>
                  </Pressable>
                </Fragment>
              ))
            )}
          </Card>

          <SectionHeader
            title="Fuel log"
            action="Add fuel"
            onAction={() => router.push({ pathname: '/fuel-form', params: { vehicleId: String(active.id) } })}
          />
          <Card>
            {fuel.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Log each fill-up to track mileage. Fill the tank fully each time for the best accuracy.
              </ThemedText>
            ) : (
              fuel.slice(0, 8).map((f, i) => {
                const kmpl = economy.perEntry.get(f.id);
                return (
                  <Fragment key={f.id}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable onLongPress={() => confirm('Delete this fill-up?', () => deleteFuel(db, f.id))}>
                      <ListRow
                        icon="gas-station"
                        title={`${f.litres.toFixed(2)} L${f.cost != null ? ` · ${money(f.cost)}` : ''}`}
                        subtitle={`${shortDate(f.t)} · ${Math.round(f.odometer_km).toLocaleString()} km${f.full_tank ? '' : ' · partial'}`}
                        trailing={kmpl ? `${kmpl.toFixed(1)} km/L` : undefined}
                      />
                    </Pressable>
                  </Fragment>
                );
              })
            )}
          </Card>

          <SectionHeader
            title="Service history"
            action="Log service"
            onAction={() =>
              router.push({ pathname: '/service-form', params: { vehicleId: String(active.id), mode: 'log' } })
            }
          />
          <Card>
            {logs.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Services you mark done appear here.
              </ThemedText>
            ) : (
              logs.map((l, i) => (
                <Fragment key={l.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onLongPress={() => confirm('Delete this service record?', () => deleteServiceLog(db, l.id))}>
                    <ListRow
                      icon="wrench"
                      title={l.title}
                      subtitle={`${shortDate(l.t)} · ${Math.round(l.odometer_km).toLocaleString()} km${l.notes ? ` · ${l.notes}` : ''}`}
                      trailing={l.cost != null ? money(l.cost) : undefined}
                    />
                  </Pressable>
                </Fragment>
              ))
            )}
          </Card>

          <ThemedText type="small" themeColor="textMuted" style={styles.hint}>
            Long-press any entry to delete it. Default service intervals are typical values; check your
            owner&apos;s manual.
          </ThemedText>
        </ScrollView>
      </SafeView>
    </ThemedView>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  chips: {
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  vehicleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  meter: {
    marginTop: Spacing.one,
  },
  hint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
});
