import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { loadSettings } from '@/db/settings';
import { loadActiveVehicle } from '@/hooks/use-garage';
import type { RiderIdentity } from '@/lib/group-ride';
import { resolveAvatar } from '@/lib/rider-avatar';

/** How this rider appears in group rides: profile name, active bike, chosen avatar. */
export async function loadRiderIdentity(db: SQLiteDatabase): Promise<RiderIdentity> {
  const [settings, { active }] = await Promise.all([loadSettings(db), loadActiveVehicle(db)]);
  const photoUri = settings.profile.photoUri;
  return {
    name: settings.profile.name,
    bike: active ? active.model || active.name : null,
    avatar: resolveAvatar(settings.rideAvatar, photoUri),
    photoUri,
  };
}

/**
 * The identity, re-read whenever the screen comes into focus (e.g. back from editing it).
 * Null until loaded, so nothing shares a blank name by mistake.
 */
export function useRiderIdentity() {
  const db = useSQLiteContext();
  const [identity, setIdentity] = useState<RiderIdentity | null>(null);
  useFocusEffect(
    useCallback(() => {
      loadRiderIdentity(db).then(setIdentity);
    }, [db]),
  );
  return identity;
}
