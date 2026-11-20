import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { listVehicles, type Vehicle } from '@/db/garage';
import { loadSettings, saveSetting } from '@/db/settings';

/** The selected vehicle, falling back to the first one if the saved id is gone. */
export async function loadActiveVehicle(db: SQLiteDatabase) {
  const [vehicles, settings] = await Promise.all([listVehicles(db), loadSettings(db)]);
  const active = vehicles.find((v) => v.id === settings.activeVehicleId) ?? vehicles[0] ?? null;
  return { vehicles, active };
}

/** All vehicles + the active one; reloads when the screen comes into focus. */
export function useGarage() {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ vehicles: Vehicle[]; active: Vehicle | null; loaded: boolean }>({
    vehicles: [],
    active: null,
    loaded: false,
  });

  const reload = useCallback(() => {
    loadActiveVehicle(db).then((s) => setState({ ...s, loaded: true }));
  }, [db]);

  useFocusEffect(reload);

  const select = useCallback(
    async (id: number) => {
      await saveSetting(db, 'activeVehicleId', id);
      reload();
    },
    [db, reload],
  );

  return { ...state, select, reload };
}
