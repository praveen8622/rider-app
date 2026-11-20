import * as Location from 'expo-location';
import { Vibration } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import * as Speech from 'expo-speech';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addOdometer } from '@/db/garage';
import { addPoints, createRide, deleteRide, finishRide, type RidePoint } from '@/db/rides';
import { playOverspeedAlert, prepareAlertSound, releaseAlertSound } from '@/lib/alert-sound';
import { bearing, distanceMeters, msToKmh, type LatLng } from '@/lib/geo';
import { reportGroupPosition } from '@/lib/group-ride';
import { RIDE_LOCATION_TASK, setRideLocationListener } from '@/lib/ride-location-task';
import { computeMotion, smooth, TopSpeedFilter, TRACKING_GAP_S } from '@/lib/telemetry';

/** Fixes worse than this (meters) are ignored; they make the route jump around. */
const MAX_ACCURACY_M = 30;
/** Faster than this between two fixes (m/s, ~250 km/h) is a GPS glitch, not riding. */
const MAX_PLAUSIBLE_SPEED = 70;
/** Below this (m/s, ~3 km/h) we count as stopped, so GPS drift at a signal doesn't add distance. */
const MOVING_SPEED = 0.8;
/** Direction of travel is only trusted above this (m/s, ~8 km/h)... */
const HEADING_MIN_SPEED = 2.2;
/** ...and with a fix at least this good (m). */
const HEADING_MAX_ACCURACY_M = 20;
const FLUSH_EVERY = 15;
const VOICE_REPEAT_MS = 30_000;
/** Every GPS fix is ~1 s apart, so this beeps on roughly every other fix. */
const BEEP_REPEAT_MS = 2_000;
const OVERSPEED_HYSTERESIS_KMH = 3;

export type RideAlerts = {
  speedLimitKmh: number;
  overspeedAlert: boolean;
  voiceAlerts: boolean;
};

export type RideSnapshot = {
  paused: boolean;
  hasFix: boolean;
  /** m/s */
  speed: number;
  distance: number;
  elapsedS: number;
  movingS: number;
  maxSpeed: number;
  leanDeg: number;
  maxLeanA: number;
  maxLeanB: number;
  gForce: number;
  maxG: number;
  overspeeding: boolean;
  overspeedCount: number;
  /** Meters, from the last fix (accepted or not). Null before the first fix. */
  gpsAccuracy: number | null;
  /** Last accepted fix. */
  position: LatLng | null;
  /** Direction of travel in degrees (0 = north), when moving. */
  heading: number | null;
  /** Timestamp of the last accepted fix; changes when there is a new position. */
  fixAt: number;
  route: LatLng[];
  /** Seconds with no GPS while riding, e.g. because the phone was locked. */
  gapS: number;
};

export class PermissionError extends Error {}

/** One recording: GPS + motion sensors -> stats, saved to SQLite as it goes. */
export class RideSession {
  readonly startedAt = Date.now();
  rideId = 0;
  /** True when GPS keeps recording with the phone locked (background permission + foreground service). */
  backgroundTracking = false;

  private locationSub: Location.LocationSubscription | null = null;
  private motionSub: { remove(): void } | null = null;
  private buffer: RidePoint[] = [];
  private last: { point: LatLng; t: number } | null = null;
  private activeMs = 0;
  private lastTick = Date.now();
  private lastVoiceAlert = 0;
  private lastBeep = 0;
  private writes: Promise<void> = Promise.resolve();
  private topSpeed = new TopSpeedFilter();

  private s: RideSnapshot = {
    paused: false,
    hasFix: false,
    speed: 0,
    distance: 0,
    elapsedS: 0,
    movingS: 0,
    maxSpeed: 0,
    leanDeg: 0,
    maxLeanA: 0,
    maxLeanB: 0,
    gForce: 0,
    maxG: 0,
    overspeeding: false,
    overspeedCount: 0,
    gpsAccuracy: null,
    position: null,
    heading: null,
    fixAt: 0,
    route: [],
    gapS: 0,
  };

  constructor(
    private db: SQLiteDatabase,
    private alerts: RideAlerts,
    private vehicleId: number | null,
  ) {}

  /** `background`: the rider allowed location "all the time", so try to keep recording while locked. */
  async start(background = false) {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) throw new PermissionError('Location permission is needed to record a ride.');

    this.rideId = await createRide(this.db, this.startedAt, this.vehicleId);
    await prepareAlertSound().catch((e) => console.warn('Alert sound unavailable', e));

    const gps = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 };
    if (background) {
      try {
        // A ride that crashed may have left the service running.
        if (await Location.hasStartedLocationUpdatesAsync(RIDE_LOCATION_TASK)) {
          await Location.stopLocationUpdatesAsync(RIDE_LOCATION_TASK);
        }
        setRideLocationListener((locations) => locations.forEach((loc) => this.onLocation(loc)));
        await Location.startLocationUpdatesAsync(RIDE_LOCATION_TASK, {
          ...gps,
          activityType: Location.ActivityType.OtherNavigation,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Recording your ride',
            notificationBody: 'Yatri keeps tracking while your phone is locked. Open Yatri to finish.',
            notificationColor: '#E8590C',
            killServiceOnDestroy: true,
          },
        });
        this.backgroundTracking = true;
      } catch (e) {
        // Expo Go, or the system refused the service: record while on screen instead.
        console.warn('Background location unavailable', e);
        setRideLocationListener(null);
      }
    }
    if (!this.backgroundTracking) {
      this.locationSub = await Location.watchPositionAsync(gps, (loc) => this.onLocation(loc));
    }

    // Telemetry is a bonus: the ride still records if motion sensors are missing or denied.
    try {
      if (await DeviceMotion.isAvailableAsync()) {
        await DeviceMotion.requestPermissionsAsync();
        DeviceMotion.setUpdateInterval(50);
        this.motionSub = DeviceMotion.addListener((m) => this.onMotion(m));
      }
    } catch (e) {
      console.warn('Motion sensors unavailable', e);
    }
  }

  setAlerts(alerts: RideAlerts) {
    this.alerts = alerts;
  }

  pause() {
    this.tick();
    this.s.paused = true;
    // Next fix after resuming must not count the distance travelled while paused.
    this.last = null;
  }

  resume() {
    this.lastTick = Date.now();
    this.s.paused = false;
  }

  /** Current stats. Call regularly (e.g. 4x per second) to drive the UI. */
  snapshot(): RideSnapshot {
    this.tick();
    // New array each time: the map only redraws the track when it gets a new reference.
    return { ...this.s, route: this.s.route.slice() };
  }

  /** Stops sensors. Saves the ride, or deletes it when `save` is false. Returns the end point. */
  async stop(save: boolean): Promise<LatLng | null> {
    this.tick();
    this.locationSub?.remove();
    this.motionSub?.remove();
    this.locationSub = null;
    this.motionSub = null;
    if (this.backgroundTracking) {
      this.backgroundTracking = false;
      setRideLocationListener(null);
      await Location.stopLocationUpdatesAsync(RIDE_LOCATION_TASK).catch(() => {});
    }
    Speech.stop();
    releaseAlertSound();

    if (!save) {
      await deleteRide(this.db, this.rideId);
      return null;
    }

    await this.flush();
    await finishRide(this.db, this.rideId, {
      ended_at: Date.now(),
      distance_m: this.s.distance,
      moving_s: this.s.movingS,
      elapsed_s: this.s.elapsedS,
      max_speed: this.s.maxSpeed,
      max_lean_a: this.s.maxLeanA,
      max_lean_b: this.s.maxLeanB,
      max_g: this.s.maxG,
      overspeed_count: this.s.overspeedCount,
    });
    if (this.vehicleId != null) await addOdometer(this.db, this.vehicleId, this.s.distance / 1000);
    return this.s.route.at(-1) ?? null;
  }

  private tick() {
    const now = Date.now();
    if (!this.s.paused) this.activeMs += now - this.lastTick;
    this.lastTick = now;
    this.s.elapsedS = this.activeMs / 1000;
  }

  private onLocation(loc: Location.LocationObject) {
    if (this.s.paused) return;
    const { coords, timestamp } = loc;
    this.s.gpsAccuracy = coords.accuracy;
    if (coords.accuracy != null && coords.accuracy > MAX_ACCURACY_M) return;

    const point = { latitude: coords.latitude, longitude: coords.longitude };
    let speed = coords.speed != null && coords.speed >= 0 ? coords.speed : null;

    if (this.last) {
      const d = distanceMeters(this.last.point, point);
      const dt = (timestamp - this.last.t) / 1000;
      if (dt <= 0) return;
      const avg = d / dt;
      if (avg > MAX_PLAUSIBLE_SPEED) return;
      // No GPS for a while (phone locked or app in the background): the straight line
      // still counts as distance, but an average over a jump is not a real speed.
      const gap = dt > TRACKING_GAP_S;
      if (gap) this.s.gapS += dt;
      else speed ??= avg;
      if ((gap ? avg : (speed ?? avg)) >= MOVING_SPEED) {
        this.s.distance += d;
        this.s.movingS += dt;
      }
    }
    speed ??= 0;

    // Direction only from real movement. Standing still or crawling, GPS heading wanders
    // (and Android reports 0 when it has none), which would spin a heading-up map at random.
    const goodFix = coords.accuracy == null || coords.accuracy <= HEADING_MAX_ACCURACY_M;
    if (speed >= HEADING_MIN_SPEED && goodFix) {
      if (coords.heading != null && coords.heading > 0) this.s.heading = coords.heading;
      else if (this.last && distanceMeters(this.last.point, point) >= 5) this.s.heading = bearing(this.last.point, point);
    }

    this.last = { point, t: timestamp };
    this.s.position = point;
    this.s.fixAt = timestamp;
    this.s.hasFix = true;
    this.s.speed = speed;
    const trusted = this.topSpeed.accept(timestamp, speed);
    if (trusted) this.s.maxSpeed = Math.max(this.s.maxSpeed, speed);
    this.s.route.push(point);
    // In a group ride, friends see this (throttled; a no-op when not in a group).
    reportGroupPosition(point, speed, this.s.heading);
    // A glitch reading shouldn't set off the overspeed alarm either.
    this.checkOverspeed(trusted ? speed : 0);

    this.buffer.push({
      t: timestamp,
      lat: point.latitude,
      lng: point.longitude,
      speed,
      alt: coords.altitude,
    });
    if (this.buffer.length >= FLUSH_EVERY) {
      this.flush().catch((e) => console.warn('Failed to save ride points', e));
    }
  }

  private onMotion(m: Parameters<typeof computeMotion>[0]) {
    const { leanDeg, gForce } = computeMotion(m, this.s.speed);
    this.s.leanDeg = smooth(this.s.leanDeg, leanDeg, 0.15);
    this.s.gForce = smooth(this.s.gForce, gForce, 0.2);
    if (this.s.paused || this.s.speed < MOVING_SPEED) return;
    if (this.s.leanDeg > 0) this.s.maxLeanA = Math.max(this.s.maxLeanA, this.s.leanDeg);
    else this.s.maxLeanB = Math.max(this.s.maxLeanB, -this.s.leanDeg);
    this.s.maxG = Math.max(this.s.maxG, this.s.gForce);
  }

  private checkOverspeed(speed: number) {
    const { speedLimitKmh, overspeedAlert, voiceAlerts } = this.alerts;
    const kmh = msToKmh(speed);

    if (!overspeedAlert || kmh < speedLimitKmh - OVERSPEED_HYSTERESIS_KMH) {
      this.s.overspeeding = false;
      return;
    }
    if (kmh <= speedLimitKmh) return;

    const now = Date.now();
    const justStarted = !this.s.overspeeding;
    if (justStarted) this.s.overspeedCount++;

    // Voice on crossing the limit and every 30 s; beep + buzz every 2 s in between,
    // so the rider keeps feeling it for as long as they're over.
    const speak = voiceAlerts && (justStarted || now - this.lastVoiceAlert > VOICE_REPEAT_MS);
    if (speak) {
      this.lastVoiceAlert = now;
      this.lastBeep = now;
      Vibration.vibrate();
      Speech.speak(`Slow down. ${Math.round(kmh)} kilometres per hour.`);
    } else if (justStarted || now - this.lastBeep >= BEEP_REPEAT_MS) {
      this.lastBeep = now;
      playOverspeedAlert();
    }
    this.s.overspeeding = true;
  }

  /** Writes are chained so two flushes never run their transactions at the same time. */
  private flush() {
    const points = this.buffer;
    this.buffer = [];
    // .catch keeps one failed write from blocking every later one.
    this.writes = this.writes.catch(() => {}).then(() => addPoints(this.db, this.rideId, points));
    return this.writes;
  }
}
