import type { SQLiteDatabase } from 'expo-sqlite';

import { cleanTopSpeed } from '@/lib/telemetry';

export const DATABASE_NAME = 'yatri.db';

/** Runs on app start. Bump LATEST_VERSION and add a block for each schema change. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const LATEST_VERSION = 3;
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  if (current >= LATEST_VERSION) return;

  if (current === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE rides (
        id INTEGER PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        distance_m REAL NOT NULL DEFAULT 0,
        moving_s REAL NOT NULL DEFAULT 0,
        elapsed_s REAL NOT NULL DEFAULT 0,
        max_speed REAL NOT NULL DEFAULT 0,
        max_lean_a REAL NOT NULL DEFAULT 0,
        max_lean_b REAL NOT NULL DEFAULT 0,
        max_g REAL NOT NULL DEFAULT 0,
        overspeed_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE ride_points (
        ride_id INTEGER NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
        t INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        speed REAL,
        alt REAL
      );
      CREATE INDEX ride_points_ride ON ride_points (ride_id, t);
      CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    current = 1;
  }

  if (current === 1) {
    await db.execAsync(`
      ALTER TABLE rides ADD COLUMN vehicle_id INTEGER;
      ALTER TABLE rides ADD COLUMN name TEXT;
      CREATE TABLE vehicles (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        make TEXT,
        model TEXT,
        odometer_km REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE fuel_logs (
        id INTEGER PRIMARY KEY NOT NULL,
        vehicle_id INTEGER NOT NULL,
        t INTEGER NOT NULL,
        odometer_km REAL NOT NULL,
        litres REAL NOT NULL,
        cost REAL,
        full_tank INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX fuel_logs_vehicle ON fuel_logs (vehicle_id, odometer_km);
      CREATE TABLE service_items (
        id INTEGER PRIMARY KEY NOT NULL,
        vehicle_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        interval_km REAL,
        interval_days INTEGER,
        last_done_km REAL NOT NULL,
        last_done_at INTEGER NOT NULL
      );
      CREATE TABLE service_logs (
        id INTEGER PRIMARY KEY NOT NULL,
        vehicle_id INTEGER NOT NULL,
        item_id INTEGER,
        t INTEGER NOT NULL,
        odometer_km REAL NOT NULL,
        title TEXT NOT NULL,
        cost REAL,
        notes TEXT
      );
      CREATE INDEX service_logs_vehicle ON service_logs (vehicle_id, t);
    `);
    current = 2;
  }

  if (current === 2) {
    // Older rides could get a fake top speed from the jump after the phone was locked.
    const rides = await db.getAllAsync<{ id: number }>('SELECT id FROM rides');
    for (const { id } of rides) {
      const points = await db.getAllAsync<{ t: number; speed: number | null }>(
        'SELECT t, speed FROM ride_points WHERE ride_id = ? ORDER BY t',
        id,
      );
      await db.runAsync('UPDATE rides SET max_speed = ? WHERE id = ?', cleanTopSpeed(points), id);
    }
    current = 3;
  }

  await db.execAsync(`PRAGMA user_version = ${LATEST_VERSION}`);
}
