import * as Speech from 'expo-speech';

import type { Route, RouteStep } from '@/lib/directions';
import { speakDistance } from '@/lib/directions';
import { distanceMeters, type LatLng } from '@/lib/geo';

/** Farther than this from the route line counts as off route. */
const OFF_ROUTE_M = 45;
/** Consecutive off-route fixes before we reroute; one bad GPS fix shouldn't. */
const OFF_ROUTE_FIXES = 3;
const ARRIVED_M = 30;
const ANNOUNCE_FAR_M = 300;
const ANNOUNCE_NEAR_M = 60;

export type NavState = {
  next: RouteStep | null;
  /** Meters to the next manoeuvre. */
  distanceToNext: number;
  remaining: number;
  remainingS: number;
  offRoute: boolean;
  arrived: boolean;
};

/** Lower-cases only the first letter, so street names keep their capitals. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Flat projection around a point; plenty accurate over a few hundred meters. */
function toXY(origin: LatLng, p: LatLng) {
  const k = 111_320;
  return {
    x: (p.longitude - origin.longitude) * k * Math.cos((origin.latitude * Math.PI) / 180),
    y: (p.latitude - origin.latitude) * k,
  };
}

/** Distance from p to segment a-b, and how far along the segment (0..1) the closest point is. */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const B = toXY(a, b);
  const P = toXY(a, p);
  const len2 = B.x * B.x + B.y * B.y;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2)) : 0;
  return { dist: Math.hypot(P.x - t * B.x, P.y - t * B.y), t };
}

/**
 * Follows the rider along a route: which turn is next, how far, remaining distance and time,
 * spoken prompts, off-route detection and arrival.
 */
export class Navigator {
  private cum: number[] = [0];
  private stepAlong: number[];
  private segment = 0;
  private offCount = 0;
  private announced = new Map<number, 'far' | 'near'>();
  private arrivedSpoken = false;

  constructor(
    readonly route: Route,
    private voice: boolean,
  ) {
    const c = route.coords;
    for (let i = 1; i < c.length; i++) this.cum.push(this.cum[i - 1] + distanceMeters(c[i - 1], c[i]));
    this.stepAlong = route.steps.map((s) => this.locate(s.location, 0, c.length - 1).along);
  }

  get total() {
    return this.cum.at(-1) ?? 0;
  }

  setVoice(on: boolean) {
    this.voice = on;
  }

  update(pos: LatLng): NavState {
    const c = this.route.coords;
    // Search near where we were last; fall back to the whole route if that's far off.
    let hit = this.locate(pos, Math.max(0, this.segment - 5), Math.min(c.length - 1, this.segment + 80));
    if (hit.dist > OFF_ROUTE_M) hit = this.locate(pos, 0, c.length - 1);
    this.segment = hit.segment;

    this.offCount = hit.dist > OFF_ROUTE_M ? this.offCount + 1 : 0;
    const along = hit.along;
    const remaining = Math.max(0, this.total - along);
    const remainingS = this.total > 0 ? (this.route.duration * remaining) / this.total : 0;

    const nextIndex = this.stepAlong.findIndex((a, i) => i > 0 && a > along + 5);
    const next = nextIndex >= 0 ? this.route.steps[nextIndex] : null;
    const distanceToNext = nextIndex >= 0 ? this.stepAlong[nextIndex] - along : remaining;

    const arrived = remaining < ARRIVED_M || distanceMeters(pos, c.at(-1)!) < ARRIVED_M;
    if (arrived && !this.arrivedSpoken) {
      this.arrivedSpoken = true;
      this.say('You have arrived at your destination.');
    } else if (!arrived && next && nextIndex >= 0) {
      this.announce(nextIndex, next, distanceToNext);
    }

    return {
      next,
      distanceToNext,
      remaining,
      remainingS,
      offRoute: this.offCount >= OFF_ROUTE_FIXES,
      arrived,
    };
  }

  /** Speaks the first instruction when navigation starts. */
  start() {
    const first = this.route.steps[0];
    const second = this.route.steps[1];
    if (first) this.say(second ? `${first.spoken}, then ${lowerFirst(second.spoken)}` : first.spoken);
  }

  private announce(index: number, step: RouteStep, distance: number) {
    const done = this.announced.get(index);
    if (distance <= ANNOUNCE_NEAR_M && done !== 'near') {
      this.announced.set(index, 'near');
      this.say(step.spoken);
    } else if (distance <= ANNOUNCE_FAR_M && distance > ANNOUNCE_NEAR_M * 1.5 && !done) {
      this.announced.set(index, 'far');
      this.say(`In ${speakDistance(distance)}, ${lowerFirst(step.spoken)}`);
    }
  }

  private say(text: string) {
    if (this.voice) Speech.speak(text);
  }

  private locate(p: LatLng, from: number, to: number) {
    const c = this.route.coords;
    let best = { dist: Infinity, segment: 0, along: 0 };
    if (c.length < 2) return { dist: c[0] ? distanceMeters(p, c[0]) : Infinity, segment: 0, along: 0 };
    for (let i = from; i < Math.min(to, c.length - 1); i++) {
      const { dist, t } = projectOnSegment(p, c[i], c[i + 1]);
      if (dist < best.dist) best = { dist, segment: i, along: this.cum[i] + t * (this.cum[i + 1] - this.cum[i]) };
    }
    return best;
  }
}
