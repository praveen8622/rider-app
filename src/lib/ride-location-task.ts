import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

/** Background GPS for a ride. Imported from the root layout so the task exists before any screen mounts. */
export const RIDE_LOCATION_TASK = 'yatri-ride-location';

type Listener = (locations: Location.LocationObject[]) => void;

let listener: Listener | null = null;

/** The recording ride receives fixes here, whether Yatri is on screen or the phone is locked. */
export function setRideLocationListener(next: Listener | null) {
  listener = next;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RIDE_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Ride location task error', error.message);
    return;
  }
  if (listener) {
    listener(data.locations);
    return;
  }
  // No ride is listening (the app restarted mid-ride): don't leave GPS running.
  await Location.stopLocationUpdatesAsync(RIDE_LOCATION_TASK).catch(() => {});
});
