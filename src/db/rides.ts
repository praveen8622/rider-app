import type { SQLiteDatabase } from "expo-sqlite";

import { addOdometer } from "@/db/garage";
import { distanceMeters, type LatLng } from "@/lib/geo";

export type Ride = {
  id: number;
  started_at: number;
  ended_at: number | null;
  distance_m: number;
  moving_s: number;
  elapsed_s: number;
  /** m/s */
  max_speed: number;
  /** Max lean to each side in degrees. Which side is left depends on the phone mount. */
  max_lean_a: number;
  max_lean_b: number;
  max_g: number;
  overspeed_count: number;
  vehicle_id: number | null;
  name: string | null;
};

export type RideWithVehicle = Ride & { vehicle_name: string | null };

export type RidePoint = {
  t: number;
  lat: number;
  lng: number;
  speed: number | null;
  alt: number | null;
};

export type RideTotals = Omit<
  Ride,
  "id" | "started_at" | "vehicle_id" | "name"
>;

/** "Morning ride", "Evening ride"… from the start time, used until the rider renames it. */
export function defaultRideName(startedAt: number) {
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h < 12) return "Morning ride";
  if (h >= 12 && h < 17) return "Afternoon ride";
  if (h >= 17 && h < 21) return "Evening ride";
  return "Night ride";
}

export const rideTitle = (r: Pick<Ride, "name" | "started_at">) =>
  r.name || defaultRideName(r.started_at);

export async function createRide(
  db: SQLiteDatabase,
  startedAt: number,
  vehicleId: number | null,
) {
  const result = await db.runAsync(
    "INSERT INTO rides (started_at, vehicle_id) VALUES (?, ?)",
    startedAt,
    vehicleId,
  );
  return result.lastInsertRowId;
}

export async function renameRide(
  db: SQLiteDatabase,
  rideId: number,
  name: string,
) {
  await db.runAsync(
    "UPDATE rides SET name = ? WHERE id = ?",
    name.trim() || null,
    rideId,
  );
}

export async function addPoints(
  db: SQLiteDatabase,
  rideId: number,
  points: RidePoint[],
) {
  if (points.length === 0) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const p of points) {
      await txn.runAsync(
        "INSERT INTO ride_points (ride_id, t, lat, lng, speed, alt) VALUES (?, ?, ?, ?, ?, ?)",
        rideId,
        p.t,
        p.lat,
        p.lng,
        p.speed,
        p.alt,
      );
    }
  });
}

export async function finishRide(
  db: SQLiteDatabase,
  rideId: number,
  totals: RideTotals,
) {
  await db.runAsync(
    `UPDATE rides SET ended_at = ?, distance_m = ?, moving_s = ?, elapsed_s = ?, max_speed = ?,
       max_lean_a = ?, max_lean_b = ?, max_g = ?, overspeed_count = ? WHERE id = ?`,
    totals.ended_at,
    totals.distance_m,
    totals.moving_s,
    totals.elapsed_s,
    totals.max_speed,
    totals.max_lean_a,
    totals.max_lean_b,
    totals.max_g,
    totals.overspeed_count,
    rideId,
  );
}

export async function deleteRide(db: SQLiteDatabase, rideId: number) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM ride_points WHERE ride_id = ?", rideId);
    await txn.runAsync("DELETE FROM rides WHERE id = ?", rideId);
  });
}

export async function deleteAllRides(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("DELETE FROM ride_points");
    await txn.runAsync("DELETE FROM rides");
  });
}

const WITH_VEHICLE = `SELECT rides.*, vehicles.name AS vehicle_name
  FROM rides LEFT JOIN vehicles ON vehicles.id = rides.vehicle_id`;

/**
 * Extra WHERE condition limiting a query to one vehicle's rides. Stats and history
 * follow the vehicle selected in the Garage; `null` means every ride.
 */
function forVehicle(vehicleId: number | null | undefined): [string, number[]] {
  return vehicleId == null
    ? ["", []]
    : [" AND rides.vehicle_id = ?", [vehicleId]];
}

export function listRides(db: SQLiteDatabase, vehicleId?: number | null) {
  const [where, args] = forVehicle(vehicleId);
  return db.getAllAsync<RideWithVehicle>(
    `${WITH_VEHICLE} WHERE ended_at IS NOT NULL${where} ORDER BY started_at DESC`,
    ...args,
  );
}

export function getLastRide(db: SQLiteDatabase, vehicleId?: number | null) {
  const [where, args] = forVehicle(vehicleId);
  return db.getFirstAsync<RideWithVehicle>(
    `${WITH_VEHICLE} WHERE ended_at IS NOT NULL${where} ORDER BY started_at DESC LIMIT 1`,
    ...args,
  );
}

export function getRide(db: SQLiteDatabase, rideId: number) {
  return db.getFirstAsync<RideWithVehicle>(
    `${WITH_VEHICLE} WHERE rides.id = ?`,
    rideId,
  );
}

/** Distance (m) per local day for the 7 days starting at `weekStart`. */
export async function getDailyDistance(
  db: SQLiteDatabase,
  weekStart: number,
  vehicleId?: number | null,
) {
  const [where, args] = forVehicle(vehicleId);
  const rides = await db.getAllAsync<{
    started_at: number;
    distance_m: number;
  }>(
    `SELECT started_at, distance_m FROM rides WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?${where}`,
    weekStart,
    weekStart + 7 * 86_400_000,
    ...args,
  );
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rides) {
    const d = new Date(r.started_at);
    days[(d.getDay() + 6) % 7] += r.distance_m;
  }
  return days;
}

export function getRidePoints(db: SQLiteDatabase, rideId: number) {
  return db.getAllAsync<RidePoint>(
    "SELECT t, lat, lng, speed, alt FROM ride_points WHERE ride_id = ? ORDER BY t",
    rideId,
  );
}

/** Totals over every saved ride (of one vehicle, if given), for the dashboard. */
export async function getAllTimeStats(
  db: SQLiteDatabase,
  vehicleId?: number | null,
) {
  const [where, args] = forVehicle(vehicleId);
  const row = await db.getFirstAsync<{
    rides: number;
    distance: number | null;
    moving: number | null;
    elapsed: number | null;
    top: number | null;
    longest: number | null;
    alerts: number | null;
  }>(
    `SELECT COUNT(*) AS rides, SUM(distance_m) AS distance, SUM(moving_s) AS moving, SUM(elapsed_s) AS elapsed,
            MAX(max_speed) AS top, MAX(distance_m) AS longest, SUM(overspeed_count) AS alerts
       FROM rides WHERE ended_at IS NOT NULL${where}`,
    ...args,
  );
  return {
    rides: row?.rides ?? 0,
    distance: row?.distance ?? 0,
    moving: row?.moving ?? 0,
    elapsed: row?.elapsed ?? 0,
    /** m/s */
    topSpeed: row?.top ?? 0,
    /** Meters, the single longest ride. */
    longest: row?.longest ?? 0,
    speedAlerts: row?.alerts ?? 0,
  };
}

export async function getStatsSince(db: SQLiteDatabase, since: number) {
  const row = await db.getFirstAsync<{
    rides: number;
    distance: number | null;
    moving: number | null;
  }>(
    `SELECT COUNT(*) AS rides, SUM(distance_m) AS distance, SUM(moving_s) AS moving
       FROM rides WHERE ended_at IS NOT NULL AND started_at >= ?`,
    since,
  );
  return {
    rides: row?.rides ?? 0,
    distance: row?.distance ?? 0,
    moving: row?.moving ?? 0,
  };
}

/**
 * Rides left unfinished (e.g. the app was killed mid-ride) are closed on startup using the
 * points saved so far. Telemetry maxima are lost; distance and speed are rebuilt from GPS.
 */
/** Rides shorter than this aren't kept: a test start, GPS drift in the parking lot, a mis-tap. */
export const MIN_RIDE_DISTANCE_M = 50;

export async function recoverUnfinishedRides(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{
    id: number;
    started_at: number;
    vehicle_id: number | null;
  }>("SELECT id, started_at, vehicle_id FROM rides WHERE ended_at IS NULL");
  for (const r of rows) {
    const points = await getRidePoints(db, r.id);
    if (points.length < 2) {
      await deleteRide(db, r.id);
      continue;
    }
    let distance = 0;
    let maxSpeed = 0;
    for (let i = 1; i < points.length; i++) {
      distance += distanceMeters(toLatLng(points[i - 1]), toLatLng(points[i]));
      maxSpeed = Math.max(maxSpeed, points[i].speed ?? 0);
    }
    if (distance < MIN_RIDE_DISTANCE_M) {
      await deleteRide(db, r.id);
      continue;
    }
    const elapsed = (points[points.length - 1].t - r.started_at) / 1000;
    await finishRide(db, r.id, {
      ended_at: points[points.length - 1].t,
      distance_m: distance,
      moving_s: elapsed,
      elapsed_s: elapsed,
      max_speed: maxSpeed,
      max_lean_a: 0,
      max_lean_b: 0,
      max_g: 0,
      overspeed_count: 0,
    });
    if (r.vehicle_id != null)
      await addOdometer(db, r.vehicle_id, distance / 1000);
  }
}

export const toLatLng = (p: RidePoint): LatLng => ({
  latitude: p.lat,
  longitude: p.lng,
});
