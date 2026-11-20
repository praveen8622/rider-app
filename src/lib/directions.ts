/**
 * Place search and routing. Everything that talks to a map service lives here, so the
 * provider can be swapped without touching screens.
 *
 * Current providers are free OpenStreetMap services with no API key:
 *   - Photon (photon.komoot.io) for search
 *   - OSRM demo server (router.project-osrm.org) for routes
 * Both are fair-use servers meant for testing. Before publishing to the stores, move to a
 * paid provider (Mapbox or Google) or self-host; only this file needs to change.
 */
import type { IconName } from '@/components/icon';
import { distanceMeters, type LatLng } from '@/lib/geo';

const SEARCH_URL = 'https://photon.komoot.io/api/';
const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';
// The OSRM demo server only has car routes; FOSSGIS runs a foot profile with the same API.
const WALK_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
const TIMEOUT_MS = 10_000;
/**
 * Fair-use OSM servers ask apps to identify themselves, and Photon refuses Android's default
 * client name ("okhttp/…") with 403, so search and nearby places failed on Android only.
 */
const USER_AGENT = 'Yatri/1.2 (motorbike riding app)';

export type Place = LatLng & {
  id: string;
  name: string;
  address: string;
};

export type RouteStep = {
  instruction: string;
  /** Same as instruction, minus street names the English voice can't pronounce. */
  spoken: string;
  icon: IconName;
  /** Where the manoeuvre happens. */
  location: LatLng;
  /** Meters to ride after the manoeuvre, until the next one. */
  distance: number;
  type: string;
};

export type Route = {
  /** Meters */
  distance: number;
  /** Seconds, for a car; close enough for a two-wheeler in traffic. */
  duration: number;
  coords: LatLng[];
  steps: RouteStep[];
};

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function toPlace(f: PhotonFeature, fallbackName = 'Unnamed place'): Place {
  const p = f.properties;
  const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || fallbackName;
  const parts = [p.street && p.name ? p.street : null, p.district, p.city, p.state, p.country];
  const address = [...new Set(parts.filter((x): x is string => !!x && x !== name))].join(', ');
  const [longitude, latitude] = f.geometry.coordinates;
  return { id: `${p.osm_type}${p.osm_id}${longitude}`, name, address, latitude, longitude };
}

/** Places matching `query`, biased towards `near` (usually the rider's position). */
export async function searchPlaces(query: string, near?: LatLng | null): Promise<Place[]> {
  // lang=en returns English names where OpenStreetMap has them.
  let url = `${SEARCH_URL}?limit=8&lang=en&q=${encodeURIComponent(query)}`;
  if (near) url += `&lat=${near.latitude}&lon=${near.longitude}`;
  const data = await getJson<{ features: PhotonFeature[] }>(url);
  return data.features.map((f) => toPlace(f));
}

/**
 * The place at a point the rider marked on the map. Falls back to plain coordinates when
 * there's nothing named there (or no internet), so a marked point can always be routed to.
 */
export async function placeAt(point: LatLng): Promise<Place> {
  const id = `pin${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
  const coords = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
  try {
    const url = `${SEARCH_URL.replace('/api/', '/reverse')}?lat=${point.latitude}&lon=${point.longitude}&limit=1&lang=en`;
    const data = await getJson<{ features: PhotonFeature[] }>(url);
    const f = data.features[0];
    if (f) {
      const near = toPlace(f, 'Marked location');
      // Keep the exact marked point; the nearest feature may be a few hundred meters off.
      return { ...near, id, address: near.address || coords, ...point };
    }
  } catch {}
  return { id, name: 'Marked location', address: coords, ...point };
}

export type NearbyCategory = 'fuel' | 'hospital' | 'food' | 'parking' | 'toilet';

export const NEARBY: Record<NearbyCategory, { label: string; icon: IconName; tags: string[]; unnamed: string }> = {
  fuel: { label: 'Fuel', icon: 'gas-station', tags: ['amenity:fuel'], unnamed: 'Fuel station' },
  hospital: { label: 'Hospital', icon: 'hospital-building', tags: ['amenity:hospital', 'amenity:clinic'], unnamed: 'Hospital' },
  food: {
    label: 'Food',
    icon: 'silverware-fork-knife',
    tags: ['amenity:restaurant', 'amenity:fast_food', 'amenity:cafe'],
    unnamed: 'Restaurant',
  },
  // Motorcycle parking first: OpenStreetMap tags it separately from car parks.
  parking: {
    label: 'Parking',
    icon: 'parking',
    tags: ['amenity:motorcycle_parking', 'amenity:parking'],
    unnamed: 'Parking',
  },
  toilet: { label: 'Toilets', icon: 'toilet', tags: ['amenity:toilets'], unnamed: 'Public toilet' },
};

/** Places of one kind within `radiusKm` of `near`, closest first. */
export async function searchNearby(category: NearbyCategory, near: LatLng, radiusKm = 5): Promise<Place[]> {
  const { tags, unnamed } = NEARBY[category];
  const url =
    `${SEARCH_URL.replace('/api/', '/reverse')}?lat=${near.latitude}&lon=${near.longitude}` +
    `&radius=${radiusKm}&limit=20&lang=en` +
    tags.map((t) => `&osm_tag=${encodeURIComponent(t)}`).join('');
  const data = await getJson<{ features: PhotonFeature[] }>(url);
  return data.features
    .map((f) => toPlace(f, unnamed))
    .sort((a, b) => distanceMeters(near, a) - distanceMeters(near, b));
}

type OsrmStep = {
  distance: number;
  name: string;
  maneuver: { type: string; modifier?: string; location: [number, number]; exit?: number };
};

type OsrmResponse = {
  code: string;
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: { steps: OsrmStep[] }[];
  }[];
};

export async function fetchRoute(from: LatLng, to: LatLng, mode: 'ride' | 'walk' = 'ride'): Promise<Route> {
  const url =
    `${mode === 'walk' ? WALK_URL : ROUTE_URL}${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    '?overview=full&geometries=geojson&steps=true';
  const data = await getJson<OsrmResponse>(url);
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) throw new Error('No route found');

  return {
    distance: route.distance,
    // Walking times from the foot profile are already realistic.
    duration: mode === 'walk' ? route.duration : realisticDuration(route.distance, route.duration),
    coords: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    steps: route.legs.flatMap((leg) =>
      leg.steps.map((s) => ({
        instruction: describe(s, s.name),
        spoken: describe(s, isLatin(s.name) ? s.name : ''),
        icon: maneuverIcon(s.maneuver.type, s.maneuver.modifier),
        location: { latitude: s.maneuver.location[1], longitude: s.maneuver.location[0] },
        distance: s.distance,
        type: s.maneuver.type,
      })),
    ),
  };
}

const TURN_WORDS: Record<string, string> = {
  uturn: 'Make a U-turn',
  'sharp right': 'Turn sharp right',
  right: 'Turn right',
  'slight right': 'Bear right',
  straight: 'Continue straight',
  'slight left': 'Bear left',
  left: 'Turn left',
  'sharp left': 'Turn sharp left',
};

function ordinal(n: number) {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n - 1] ?? `${n}th`;
}

/**
 * OSRM's times assume free-flowing car traffic, far too optimistic for city riding
 * (it gave 6 min for 6 km across Kathmandu). Cap the average speed at typical two-wheeler
 * speeds: ~25 km/h in town, ~45 km/h on longer trips that include highways.
 */
function realisticDuration(distance: number, osrmSeconds: number) {
  const maxSpeed = (distance < 20_000 ? 25 : 45) / 3.6;
  return Math.max(osrmSeconds, distance / maxSpeed);
}

/** Street names in Devanagari etc. come out garbled from an English voice. */
const isLatin = (s: string) => /^[\u0000-ɏ\s]*$/.test(s);

/** Turns an OSRM manoeuvre into a short instruction, naming `street` if given. */
function describe(step: OsrmStep, street: string): string {
  const { type, modifier, exit } = step.maneuver;
  const onto = street ? ` onto ${street}` : '';
  const turn = TURN_WORDS[modifier ?? 'straight'] ?? 'Continue';

  switch (type) {
    case 'depart':
      return street ? `Head out on ${street}` : 'Start riding';
    case 'arrive':
      return 'You have arrived';
    case 'roundabout':
    case 'rotary':
      return exit ? `At the roundabout, take the ${ordinal(exit)} exit${onto}` : `Enter the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Exit the roundabout${onto}`;
    case 'fork':
      return `Keep ${modifier?.includes('left') ? 'left' : 'right'}${onto}`;
    case 'merge':
      return `Merge${onto}`;
    case 'on ramp':
      return `Take the ramp${onto}`;
    case 'off ramp':
      return `Take the exit${onto}`;
    case 'end of road':
      return `At the end of the road, ${turn.toLowerCase()}${onto}`;
    case 'new name':
    case 'continue':
      return modifier && modifier !== 'straight' ? `${turn}${onto}` : `Continue${onto}`;
    default:
      return `${turn}${onto}`;
  }
}

function maneuverIcon(type: string, modifier?: string): IconName {
  if (type === 'arrive') return 'flag-checkered';
  if (type === 'depart') return 'navigation-variant';
  // Nepal and India ride on the left, so roundabouts go clockwise.
  if (type.includes('roundabout') || type.includes('rotary')) return 'rotate-right';
  switch (modifier) {
    case 'uturn':
      return 'arrow-u-left-top';
    case 'sharp right':
      return 'arrow-right';
    case 'right':
      return 'arrow-right-top';
    case 'slight right':
      return 'arrow-top-right';
    case 'slight left':
      return 'arrow-top-left';
    case 'left':
      return 'arrow-left-top';
    case 'sharp left':
      return 'arrow-left';
    default:
      return 'arrow-up';
  }
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Spoken form: "200 metres", "1.5 kilometres". */
export function speakDistance(meters: number) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 50) * 50)} metres`;
  return `${(meters / 1000).toFixed(1)} kilometres`;
}

export function formatEta(seconds: number) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function arrivalClock(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
