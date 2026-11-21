import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import type { Place } from '@/lib/directions';
import type { LatLng } from '@/lib/geo';
import type { ThemeMode } from '@/lib/theme-mode';

export type ParkedSpot = LatLng & { savedAt: number };

export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  /** "Brother", "Friend"… optional. */
  relation: string;
};

export type Profile = {
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  /** Local file copied into the app's documents folder, or null for initials. */
  photoUri: string | null;
  emergencyContacts: EmergencyContact[];
};

export const EMPTY_PROFILE: Profile = {
  name: '',
  email: '',
  phone: '',
  city: '',
  country: '',
  photoUri: null,
  emergencyContacts: [],
};

export type Settings = {
  speedLimitKmh: number;
  overspeedAlert: boolean;
  voiceAlerts: boolean;
  parked: ParkedSpot | null;
  activeVehicleId: number | null;
  onboarded: boolean;
  /** We explained and asked for "allow all the time" location once; don't ask on every ride. */
  backgroundLocationAsked: boolean;
  themeMode: ThemeMode;
  /** Custom accent as "#RRGGBB", or null for Yatri's orange. */
  accentColor: string | null;
  /** Newest first, at most RECENT_PLACES_MAX. */
  recentPlaces: Place[];
  /** Places the rider starred for quick navigation, in the order they were saved. */
  favoritePlaces: Place[];
  profile: Profile;
  /** The group ride this phone is in, so it reconnects after the app restarts. */
  groupCode: string | null;
  /** How you look in group rides: 'photo', an avatar preset, 'initials', or null (photo if you have one). */
  rideAvatar: string | null;
  /** Live traffic colours on the ride map. */
  showTraffic: boolean;
};

export const RECENT_PLACES_MAX = 4;
export const FAVORITE_PLACES_MAX = 20;

export const DEFAULT_SETTINGS: Settings = {
  speedLimitKmh: 60,
  overspeedAlert: true,
  voiceAlerts: true,
  parked: null,
  activeVehicleId: null,
  onboarded: false,
  backgroundLocationAsked: false,
  themeMode: 'system',
  accentColor: null,
  recentPlaces: [],
  favoritePlaces: [],
  profile: EMPTY_PROFILE,
  groupCode: null,
  rideAvatar: null,
  showTraffic: true,
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored: Partial<Settings> = {};
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      (stored as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
  value: Settings[K],
) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

/** Settings plus a setter that persists. Reloads whenever the screen comes into focus. */
export function useSettings() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSettings(db).then((s) => {
        setSettings(s);
        setLoaded(true);
      });
    }, [db]),
  );

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      await saveSetting(db, key, value);
    },
    [db],
  );

  return { settings, loaded, update };
}
