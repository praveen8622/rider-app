import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import { Avatar } from "@/components/avatar";
import { Card, SectionHeader } from "@/components/card";
import { WeekBars } from "@/components/charts";
import { GradientSurface } from "@/components/gradient-surface";
import { GroupRideCard } from "@/components/group-ride-card";
import { Icon, type IconName } from "@/components/icon";
import { RouteMap } from "@/components/route-map";
import { SafeView } from "@/components/safe-view";
import { Stat } from "@/components/stat";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { VehicleSwitcher } from "@/components/vehicle-switcher";
import { Wordmark } from "@/components/wordmark";
import {
  BottomTabInset,
  MaxContentWidth,
  Radius,
  Spacing,
} from "@/constants/theme";
import { dueServices, type ServiceItem, type ServiceStatus } from "@/db/garage";
import {
  getAllTimeStats,
  getDailyDistance,
  getLastRide,
  getRidePoints,
  rideTitle,
  toLatLng,
  type RideWithVehicle,
} from "@/db/rides";
import { useSettings } from "@/db/settings";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useGarage } from "@/hooks/use-garage";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration, formatKm, msToKmh, type LatLng } from "@/lib/geo";
import { formatCode, useGroupCode } from "@/lib/group-ride";
import { applyThemeMode } from "@/lib/theme-mode";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Height shared by the bike chip and the controls pill in the top row. */
const HEADER_CONTROL_HEIGHT = 44;

function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Weeks start on Monday.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function greeting() {
  // getHours() is always 0–23, whatever clock format the phone displays. 12 AM is 0.
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  if (h >= 17 && h < 21) return "Good Evening";
  return "Good Night";
}

/** Sun, sunset or moon next to the date, matching the greeting. */
function greetingIcon(): IconName {
  const h = new Date().getHours();
  if (h >= 5 && h < 17) return "white-balance-sunny";
  if (h >= 17 && h < 21) return "weather-sunset";
  return "weather-night";
}

function timeAgo(t: number) {
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { settings, update } = useSettings();
  const {
    active,
    vehicles,
    select: selectVehicle,
    loaded: garageLoaded,
  } = useGarage();
  const vehicleId = active?.id ?? null;
  const [week, setWeek] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [lastRide, setLastRide] = useState<{
    ride: RideWithVehicle;
    route: LatLng[];
  } | null>(null);
  const [due, setDue] = useState<
    { item: ServiceItem; status: ServiceStatus }[]
  >([]);
  const [totals, setTotals] = useState({
    rides: 0,
    distance: 0,
    moving: 0,
    topSpeed: 0,
  });
  const [parking, setParking] = useState(false);

  // Stats belong to the vehicle selected in the Garage. Wait for it, so we don't flash all rides first.
  useFocusEffect(
    useCallback(() => {
      if (!garageLoaded) return;
      getDailyDistance(db, startOfWeek(), vehicleId).then(setWeek);
      getAllTimeStats(db, vehicleId).then(setTotals);
      getLastRide(db, vehicleId).then(async (ride) => {
        if (!ride) return setLastRide(null);
        const points = await getRidePoints(db, ride.id);
        setLastRide({ ride, route: points.map(toLatLng) });
      });
    }, [db, garageLoaded, vehicleId]),
  );

  useFocusEffect(
    useCallback(() => {
      if (active) dueServices(db, active).then(setDue);
      else setDue([]);
    }, [db, active]),
  );

  const saveParkingHere = async () => {
    if (parking) return;
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Location needed",
        "Allow location access to save where you parked.",
      );
      return;
    }
    // Getting an accurate fix can take a few seconds; show that something is happening.
    setParking(true);
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await update("parked", {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        savedAt: Date.now(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const accuracy = pos.coords.accuracy
        ? ` (accurate to about ${Math.round(pos.coords.accuracy)} m)`
        : "";
      Alert.alert(
        "Parking spot saved",
        `Your bike's location is marked on the map${accuracy}. Not where your bike is? Adjust the pin on the map.`,
        [
          { text: "OK", style: "cancel" },
          {
            text: "Adjust on map",
            onPress: () =>
              router.push({ pathname: "/parked", params: { edit: "1" } }),
          },
        ],
      );
    } catch {
      Alert.alert(
        "Could not get your location",
        "Make sure location is on and try again, ideally with a clear view of the sky.",
      );
    } finally {
      setParking(false);
    }
  };

  const dark = useColorScheme() === "dark";
  // Quick switch to the opposite of what's showing; Settings still offers "System".
  const toggleDark = () => {
    const mode = dark ? "light" : "dark";
    Haptics.selectionAsync();
    applyThemeMode(mode);
    update("themeMode", mode);
  };

  const weekKm = week.reduce((a, b) => a + b, 0);
  const daysRidden = week.filter((m) => m > 0).length;
  const parked = settings.parked;
  const overdue = (due[0]?.status.fraction ?? 0) >= 1;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <ThemedView style={styles.container}>
      <SafeView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Brand on the left; quick controls grouped in one pill on the right. */}
          <View style={styles.header}>
            <Wordmark size={28} />
            <View style={styles.bikeSlot}>
              <VehicleSwitcher
                vehicles={vehicles}
                active={active}
                onSelect={selectVehicle}
                height={HEADER_CONTROL_HEIGHT}
              />
            </View>
            <View
              style={[
                styles.controls,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Pressable
                onPress={toggleDark}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={
                  dark ? "Switch to light mode" : "Switch to dark mode"
                }
                style={({ pressed }) => [
                  styles.controlButton,
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Icon
                  name={dark ? "white-balance-sunny" : "weather-night"}
                  size={20}
                  themeColor="textSecondary"
                />
              </Pressable>
              <Pressable
                onPress={() => router.push("/profile")}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                style={({ pressed }) => [
                  styles.avatarRing,
                  { borderColor: theme.accent },
                  pressed && styles.pressed,
                ]}
              >
                <Avatar
                  name={settings.profile.name}
                  photoUri={settings.profile.photoUri}
                  size={31}
                />
              </Pressable>
            </View>
          </View>

          {/* Greeting, then the bike every stat below belongs to. */}
          <View style={styles.greeting}>
            <View style={styles.dateRow}>
              <Icon name={greetingIcon()} size={15} themeColor="accent" />
              <ThemedText type="caption" themeColor="textMuted">
                {today}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" numberOfLines={1}>
              {greeting()}
              {settings.profile.name
                ? `, ${settings.profile.name.trim().split(/\s+/)[0]}`
                : ""}
            </ThemedText>
          </View>

          <StartRideCard
            subtitle={
              settings.overspeedAlert
                ? `Alert at ${settings.speedLimitKmh} km/h`
                : "Speed alert off"
            }
            vehicle={
              active
                ? `${Math.round(active.odometer_km).toLocaleString()} km`
                : undefined
            }
          />

          <GroupRideCard />

          {due.length > 0 && active ? (
            <Pressable
              onPress={() => router.navigate("/garage")}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.alertBanner,
                {
                  backgroundColor: overdue
                    ? theme.dangerSoft
                    : theme.warningSoft,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.alertIcon,
                  { backgroundColor: overdue ? theme.danger : theme.warning },
                ]}
              >
                <Icon name="wrench" size={18} color={theme.onAccent} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {due[0].item.name} {overdue ? "is overdue" : "is due soon"}
                  {due.length > 1 ? ` (+${due.length - 1} more)` : ""}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {due[0].status.label}
                </ThemedText>
              </View>
              <Icon name="chevron-right" size={20} themeColor="textMuted" />
            </Pressable>
          ) : null}
          <Card>
            <View style={styles.cardTitleRow}>
              <ThemedText type="caption" themeColor="textMuted">
                All rides
              </ThemedText>
              {totals.rides ? (
                <Pressable
                  onPress={() =>
                    router.navigate({
                      pathname: "/history",
                      params: { tab: "overview", at: String(Date.now()) },
                    })
                  }
                  hitSlop={12}
                  style={styles.linkRow}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    History
                  </ThemedText>
                  <Icon name="chevron-right" size={16} themeColor="accent" />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.heroValue}>
              <ThemedText style={styles.heroNumber}>
                {formatKm(totals.distance)}
              </ThemedText>
              <ThemedText type="heading" themeColor="textSecondary">
                km
              </ThemedText>
            </View>
            <View
              style={[styles.statStrip, { backgroundColor: theme.background }]}
            >
              <MiniStat
                icon="flag-checkered"
                label="Total Rides"
                value={totals.rides.toLocaleString()}
              />
              <View style={[styles.vRule, { backgroundColor: theme.border }]} />
              <MiniStat
                icon="speedometer"
                label="Top speed"
                value={msToKmh(totals.topSpeed).toFixed(0)}
                unit="km/h"
              />
              <View style={[styles.vRule, { backgroundColor: theme.border }]} />
              <MiniStat
                icon="timer-outline"
                label="Ride time"
                value={totals.moving > 0 ? formatDuration(totals.moving) : "0m"}
              />
            </View>
          </Card>

          <View style={styles.quickRow}>
            <QuickAction
              icon="navigation-variant"
              label="Navigate"
              onPress={() => router.push("/navigate")}
            />
            <QuickAction
              icon="gas-station"
              label="Add fuel"
              onPress={() =>
                active
                  ? router.push({
                      pathname: "/fuel-form",
                      params: { vehicleId: String(active.id) },
                    })
                  : router.push("/vehicle-form")
              }
            />
            <QuickAction
              icon="parking"
              label={parking ? "Saving…" : "Park here"}
              busy={parking}
              onPress={saveParkingHere}
            />
          </View>

          <SectionHeader title="Parked" />
          <Card onPress={parked ? () => router.push("/parked") : undefined}>
            <View style={styles.row}>
              {parked ? (
                <ParkedThumb
                  latitude={parked.latitude}
                  longitude={parked.longitude}
                />
              ) : (
                <View
                  style={[
                    styles.parkIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Icon
                    name="map-marker-off-outline"
                    size={26}
                    themeColor="textMuted"
                  />
                </View>
              )}
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {parked ? "Bike location saved" : "No location saved"}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {parked
                    ? `Parked ${timeAgo(parked.savedAt)}`
                    : "Saved automatically when you end a ride, or tap Park here."}
                </ThemedText>
              </View>
              {parked ? (
                <View
                  style={[
                    styles.findButton,
                    { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Icon name="walk" size={16} themeColor="accent" />
                  <ThemedText type="smallBold" themeColor="accent">
                    Find
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Card>

          {lastRide ? (
            <>
              <SectionHeader
                title="Last ride"
                action="View last ride"
                onAction={() =>
                  router.navigate({
                    pathname: "/history",
                    params: { tab: "last", at: String(Date.now()) },
                  })
                }
              />
              <Card
                onPress={() =>
                  router.push({
                    pathname: "/rides/[id]",
                    params: { id: String(lastRide.ride.id) },
                  })
                }
              >
                <View>
                  <ThemedText type="heading">
                    {rideTitle(lastRide.ride)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {timeAgo(lastRide.ride.started_at)}
                    {lastRide.ride.vehicle_name
                      ? ` · ${lastRide.ride.vehicle_name}`
                      : ""}
                  </ThemedText>
                </View>
                <RouteMap route={lastRide.route} height={150} />
                <View style={styles.stats}>
                  <Stat
                    compact
                    label="Distance"
                    value={formatKm(lastRide.ride.distance_m)}
                    unit="km"
                  />
                  <Stat
                    compact
                    label="Time"
                    value={formatDuration(lastRide.ride.elapsed_s)}
                  />
                  <Stat
                    compact
                    label="Top"
                    value={msToKmh(lastRide.ride.max_speed).toFixed(0)}
                    unit="km/h"
                  />
                </View>
              </Card>
            </>
          ) : null}

          <SectionHeader title="This week" />
          <Card>
            <View style={styles.weekHead}>
              <View style={styles.heroValue}>
                <ThemedText type="title">{formatKm(weekKm)}</ThemedText>
                <ThemedText type="heading" themeColor="textSecondary">
                  km
                </ThemedText>
              </View>
              <View
                style={[styles.weekPill, { backgroundColor: theme.accentSoft }]}
              >
                <Icon name="calendar-check" size={14} themeColor="accent" />
                <ThemedText type="smallBold" themeColor="accent">
                  {daysRidden} of 7 days
                </ThemedText>
              </View>
            </View>
            <WeekBars
              days={week.map((m, i) => ({
                label: DAY_LABELS[i],
                km: m / 1000,
              }))}
            />
          </Card>
        </ScrollView>
      </SafeView>
    </ThemedView>
  );
}

/** The main call to action: an accent gradient card with a faint speedometer motif. */
function StartRideCard({
  subtitle,
  vehicle,
}: {
  subtitle: string;
  vehicle?: string;
}) {
  const theme = useTheme();
  const on = { color: theme.onAccent };
  // In a group, this ride is shared with it: say so on the button.
  const group = useGroupCode();
  return (
    <Pressable
      onPress={() => router.push("/ride")}
      accessibilityRole="button"
      accessibilityLabel="Start ride"
      style={({ pressed }) => [
        styles.startShadow,
        { shadowColor: theme.accent },
        pressed && styles.pressedScale,
      ]}
    >
      <GradientSurface style={styles.startCard}>
        <View style={[styles.flex, styles.startText]}>
          <ThemedText type="caption" style={[styles.onAccentSoft, on]}>
            Ready when you are
          </ThemedText>
          <ThemedText style={[styles.startTitle, on]}>Start ride</ThemedText>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Icon name="bell-ring-outline" size={13} color={theme.onAccent} />
              <ThemedText type="smallBold" style={[styles.onAccent, on]}>
                {subtitle}
              </ThemedText>
            </View>
            {group ? (
              <View style={styles.tag}>
                <Icon name="account-group" size={13} color={theme.onAccent} />
                <ThemedText type="smallBold" style={[styles.onAccent, on]}>
                  Group {formatCode(group)}
                </ThemedText>
              </View>
            ) : vehicle ? (
              <View style={styles.tag}>
                <Icon name="counter" size={13} color={theme.onAccent} />
                <ThemedText type="smallBold" style={[styles.onAccent, on]}>
                  {vehicle}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.playHalo}>
          <View style={styles.playButton}>
            <Icon name="play" size={34} themeColor="accent" />
          </View>
        </View>
      </GradientSurface>
    </Pressable>
  );
}

function MiniStat({
  icon,
  label,
  value,
  unit,
}: {
  icon?: IconName;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={styles.miniStat}>
      <View style={styles.miniLabel}>
        {icon ? <Icon name={icon} size={13} themeColor="textMuted" /> : null}
        <ThemedText
          type="caption"
          themeColor="textMuted"
          numberOfLines={1}
          style={styles.miniCaption}
        >
          {label}
        </ThemedText>
      </View>
      <ThemedText type="number" numberOfLines={1} style={styles.miniValue}>
        {value}
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {" "}
            {unit}
          </ThemedText>
        ) : null}
      </ThemedText>
    </View>
  );
}

function ParkedThumb({ latitude, longitude }: LatLng) {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <View
      style={[styles.thumb, { borderColor: theme.border }]}
      pointerEvents="none"
    >
      <MapView
        style={StyleSheet.absoluteFill}
        region={{
          latitude,
          longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        }}
        userInterfaceStyle={scheme === "dark" ? "dark" : "light"}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        liteMode
      >
        <Marker coordinate={{ latitude, longitude }} pinColor={theme.accent} />
      </MapView>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  busy,
  onPress,
}: {
  icon: IconName;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quick,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressedScale,
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: theme.accentSoft }]}>
        {busy ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <Icon name={icon} size={20} themeColor="accent" />
        )}
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
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
  pressed: {
    opacity: 0.8,
  },
  pressedScale: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  // Top row: wordmark, bike chip and controls pill. Chip and pill share one height and shape.
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: Spacing.two,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: HEADER_CONTROL_HEIGHT,
    paddingHorizontal: 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    gap: Spacing.half,
    marginTop: Spacing.two,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Takes the space between the wordmark and the controls; the chip sits at its right end
  // and its name shortens with "…" on narrow phones.
  bikeSlot: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  heroNumber: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: 800,
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
    marginTop: -Spacing.two,
  },
  statStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.medium,
    paddingVertical: 12,
    paddingHorizontal: Spacing.two,
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: Spacing.one,
  },
  miniStat: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.half,
    paddingHorizontal: Spacing.one,
  },
  miniLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniCaption: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  miniValue: {
    fontSize: 19,
    lineHeight: 24,
  },
  startShadow: {
    borderRadius: Radius.large,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  startCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingVertical: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.three,
    overflow: "hidden",
  },
  startText: {
    gap: Spacing.one,
  },
  startTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  onAccent: {
    fontSize: 13,
    lineHeight: 18,
  },
  onAccentSoft: {
    opacity: 0.8,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.one,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  playHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: Radius.medium,
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
  },
  quick: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  parkIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.medium,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  findButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  stats: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  weekHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  weekPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
});
