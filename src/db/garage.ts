import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';

export type VehicleType = 'scooter' | 'motorbike';

export type Vehicle = {
  id: number;
  name: string;
  type: VehicleType;
  make: string | null;
  model: string | null;
  odometer_km: number;
  created_at: number;
};

export type FuelLog = {
  id: number;
  vehicle_id: number;
  t: number;
  odometer_km: number;
  litres: number;
  cost: number | null;
  full_tank: number;
};

export type ServiceItem = {
  id: number;
  vehicle_id: number;
  name: string;
  icon: IconName;
  interval_km: number | null;
  interval_days: number | null;
  last_done_km: number;
  last_done_at: number;
};

export type ServiceLog = {
  id: number;
  vehicle_id: number;
  item_id: number | null;
  t: number;
  odometer_km: number;
  title: string;
  cost: number | null;
  notes: string | null;
};

export const vehicleIcon = (type: VehicleType): IconName => (type === 'scooter' ? 'moped' : 'motorbike');

/**
 * Typical Indian two-wheeler intervals; a starting point the rider can mark done or delete.
 * Always check the owner's manual for the exact schedule.
 */
const DEFAULT_SERVICE: Record<
  VehicleType,
  { name: string; icon: IconName; interval_km: number | null; interval_days: number | null }[]
> = {
  scooter: [
    { name: 'Engine oil', icon: 'oil', interval_km: 3000, interval_days: 180 },
    { name: 'General service', icon: 'wrench', interval_km: 3000, interval_days: 180 },
    { name: 'Air filter', icon: 'air-filter', interval_km: 6000, interval_days: null },
    { name: 'Brakes check', icon: 'car-brake-alert', interval_km: 5000, interval_days: null },
    { name: 'Tyre pressure', icon: 'tire', interval_km: null, interval_days: 14 },
  ],
  motorbike: [
    { name: 'Engine oil', icon: 'oil', interval_km: 3000, interval_days: 180 },
    { name: 'General service', icon: 'wrench', interval_km: 5000, interval_days: 180 },
    { name: 'Chain clean & lube', icon: 'cog', interval_km: 500, interval_days: null },
    { name: 'Air filter', icon: 'air-filter', interval_km: 10000, interval_days: null },
    { name: 'Brakes check', icon: 'car-brake-alert', interval_km: 5000, interval_days: null },
    { name: 'Tyre pressure', icon: 'tire', interval_km: null, interval_days: 14 },
  ],
};

// ---- vehicles ----

export function listVehicles(db: SQLiteDatabase) {
  return db.getAllAsync<Vehicle>('SELECT * FROM vehicles ORDER BY created_at');
}

export function getVehicle(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Vehicle>('SELECT * FROM vehicles WHERE id = ?', id);
}

export async function createVehicle(
  db: SQLiteDatabase,
  v: Pick<Vehicle, 'name' | 'type' | 'make' | 'model' | 'odometer_km'>,
) {
  const now = Date.now();
  let id = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const res = await txn.runAsync(
      'INSERT INTO vehicles (name, type, make, model, odometer_km, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      v.name,
      v.type,
      v.make,
      v.model,
      v.odometer_km,
      now,
    );
    id = res.lastInsertRowId;
    for (const s of DEFAULT_SERVICE[v.type]) {
      await txn.runAsync(
        `INSERT INTO service_items (vehicle_id, name, icon, interval_km, interval_days, last_done_km, last_done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        s.name,
        s.icon,
        s.interval_km,
        s.interval_days,
        v.odometer_km,
        now,
      );
    }
  });
  return id;
}

export async function updateVehicle(
  db: SQLiteDatabase,
  id: number,
  v: Pick<Vehicle, 'name' | 'type' | 'make' | 'model' | 'odometer_km'>,
) {
  await db.runAsync(
    'UPDATE vehicles SET name = ?, type = ?, make = ?, model = ?, odometer_km = ? WHERE id = ?',
    v.name,
    v.type,
    v.make,
    v.model,
    v.odometer_km,
    id,
  );
}

export async function deleteVehicle(db: SQLiteDatabase, id: number) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM fuel_logs WHERE vehicle_id = ?', id);
    await txn.runAsync('DELETE FROM service_items WHERE vehicle_id = ?', id);
    await txn.runAsync('DELETE FROM service_logs WHERE vehicle_id = ?', id);
    // Rides are kept; they just no longer belong to a vehicle.
    await txn.runAsync('UPDATE rides SET vehicle_id = NULL WHERE vehicle_id = ?', id);
    await txn.runAsync('DELETE FROM vehicles WHERE id = ?', id);
  });
}

export async function addOdometer(db: SQLiteDatabase, id: number, km: number) {
  await db.runAsync('UPDATE vehicles SET odometer_km = odometer_km + ? WHERE id = ?', km, id);
}

/** Readings entered by hand (fuel, service) can move the odometer forward, never back. */
async function bumpOdometer(db: SQLiteDatabase, id: number, km: number) {
  await db.runAsync('UPDATE vehicles SET odometer_km = MAX(odometer_km, ?) WHERE id = ?', km, id);
}

// ---- fuel ----

export function listFuel(db: SQLiteDatabase, vehicleId: number) {
  return db.getAllAsync<FuelLog>(
    'SELECT * FROM fuel_logs WHERE vehicle_id = ? ORDER BY odometer_km DESC, t DESC',
    vehicleId,
  );
}

export async function addFuel(db: SQLiteDatabase, f: Omit<FuelLog, 'id'>) {
  await db.runAsync(
    'INSERT INTO fuel_logs (vehicle_id, t, odometer_km, litres, cost, full_tank) VALUES (?, ?, ?, ?, ?, ?)',
    f.vehicle_id,
    f.t,
    f.odometer_km,
    f.litres,
    f.cost,
    f.full_tank,
  );
  await bumpOdometer(db, f.vehicle_id, f.odometer_km);
}

export async function deleteFuel(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM fuel_logs WHERE id = ?', id);
}

/**
 * Mileage with the full-tank method: between two full fill-ups, the fuel added at the
 * second one equals what was burned since the first. Partial fills are added into the
 * next full one. `logs` must be newest-first (as listFuel returns them).
 */
export function fuelEconomy(logs: FuelLog[]) {
  const asc = [...logs].reverse();
  const perEntry = new Map<number, number>();
  let lastFull: FuelLog | null = null;
  let litresSince = 0;
  let totalKm = 0;
  let totalLitres = 0;

  for (const log of asc) {
    if (lastFull) litresSince += log.litres;
    if (log.full_tank) {
      if (lastFull && litresSince > 0) {
        const km = log.odometer_km - lastFull.odometer_km;
        if (km > 0) {
          perEntry.set(log.id, km / litresSince);
          totalKm += km;
          totalLitres += litresSince;
        }
      }
      lastFull = log;
      litresSince = 0;
    }
  }

  const totalCost = logs.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  return {
    perEntry,
    averageKmpl: totalLitres > 0 ? totalKm / totalLitres : null,
    totalCost,
    costPerKm: totalLitres > 0 && totalKm > 0 ? totalCost / totalKm : null,
  };
}

// ---- service ----

export function listServiceItems(db: SQLiteDatabase, vehicleId: number) {
  return db.getAllAsync<ServiceItem>('SELECT * FROM service_items WHERE vehicle_id = ? ORDER BY id', vehicleId);
}

export function getServiceItem(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<ServiceItem>('SELECT * FROM service_items WHERE id = ?', id);
}

export async function addServiceItem(
  db: SQLiteDatabase,
  item: Omit<ServiceItem, 'id'>,
) {
  await db.runAsync(
    `INSERT INTO service_items (vehicle_id, name, icon, interval_km, interval_days, last_done_km, last_done_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.vehicle_id,
    item.name,
    item.icon,
    item.interval_km,
    item.interval_days,
    item.last_done_km,
    item.last_done_at,
  );
}

export async function deleteServiceItem(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM service_items WHERE id = ?', id);
}

export function listServiceLogs(db: SQLiteDatabase, vehicleId: number) {
  return db.getAllAsync<ServiceLog>('SELECT * FROM service_logs WHERE vehicle_id = ? ORDER BY t DESC', vehicleId);
}

/** Records a service and resets the matching reminder (if any) to "just done". */
export async function logService(db: SQLiteDatabase, log: Omit<ServiceLog, 'id'>) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'INSERT INTO service_logs (vehicle_id, item_id, t, odometer_km, title, cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      log.vehicle_id,
      log.item_id,
      log.t,
      log.odometer_km,
      log.title,
      log.cost,
      log.notes,
    );
    if (log.item_id != null) {
      await txn.runAsync(
        'UPDATE service_items SET last_done_km = ?, last_done_at = ? WHERE id = ?',
        log.odometer_km,
        log.t,
        log.item_id,
      );
    }
    await txn.runAsync(
      'UPDATE vehicles SET odometer_km = MAX(odometer_km, ?) WHERE id = ?',
      log.odometer_km,
      log.vehicle_id,
    );
  });
}

export async function deleteServiceLog(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM service_logs WHERE id = ?', id);
}

export type ServiceStatus = {
  /** 0 = just done, 1 = due now, >1 = overdue. Whichever of km or days is closer. */
  fraction: number;
  kmLeft: number | null;
  daysLeft: number | null;
  label: string;
};

const DAY_MS = 86_400_000;

export function serviceStatus(item: ServiceItem, odometerKm: number, now = Date.now()): ServiceStatus {
  let fraction = 0;
  let kmLeft: number | null = null;
  let daysLeft: number | null = null;

  if (item.interval_km) {
    const used = odometerKm - item.last_done_km;
    kmLeft = item.interval_km - used;
    fraction = Math.max(fraction, used / item.interval_km);
  }
  if (item.interval_days) {
    const usedDays = (now - item.last_done_at) / DAY_MS;
    daysLeft = Math.round(item.interval_days - usedDays);
    fraction = Math.max(fraction, usedDays / item.interval_days);
  }

  const parts: string[] = [];
  if (kmLeft != null) {
    parts.push(kmLeft >= 0 ? `${Math.round(kmLeft)} km left` : `${Math.round(-kmLeft)} km overdue`);
  }
  if (daysLeft != null) {
    parts.push(daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days overdue`);
  }
  return { fraction, kmLeft, daysLeft, label: parts.join(' · ') };
}

/** Reminders at or past 85% of their interval, most urgent first. */
export async function dueServices(db: SQLiteDatabase, vehicle: Vehicle) {
  const items = await listServiceItems(db, vehicle.id);
  return items
    .map((item) => ({ item, status: serviceStatus(item, vehicle.odometer_km) }))
    .filter((x) => x.status.fraction >= 0.85)
    .sort((a, b) => b.status.fraction - a.status.fraction);
}
