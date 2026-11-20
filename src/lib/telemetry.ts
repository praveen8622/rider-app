import type { DeviceMotionMeasurement } from 'expo-sensors';

export const GRAVITY = 9.80665;
const DEG_TO_RAD = Math.PI / 180;
const MAX_LEAN_DEG = 65;
/** Below this speed (m/s, ~11 km/h) lean estimates are just noise. */
const MIN_LEAN_SPEED = 3;

export type MotionSample = {
  /** Positive = one side, negative = the other. Sign depends on how the phone is mounted. */
  leanDeg: number;
  gForce: number;
};

/**
 * Lean angle from the physics of a balanced turn: tan(lean) = v * yawRate / g.
 *
 * Reading lean straight from the accelerometer doesn't work on a bike: in a steady turn,
 * gravity plus cornering force points straight "down" through the bike, so it reads ~0°.
 * Instead we take the rotation rate around the gravity axis (how fast the bike is turning)
 * and combine it with GPS speed. This works for any phone mount orientation.
 */
export function computeMotion(m: DeviceMotionMeasurement, speedMs: number): MotionSample {
  const linear = m.acceleration;
  const withGravity = m.accelerationIncludingGravity;

  let gForce = 0;
  if (linear) {
    gForce = Math.hypot(linear.x, linear.y, linear.z) / GRAVITY;
  }

  let leanDeg = 0;
  const rate = m.rotationRate;
  if (rate && linear && speedMs >= MIN_LEAN_SPEED) {
    const gx = withGravity.x - linear.x;
    const gy = withGravity.y - linear.y;
    const gz = withGravity.z - linear.z;
    const gLen = Math.hypot(gx, gy, gz);
    if (gLen > 1) {
      // rotationRate: alpha = z axis, beta = x axis, gamma = y axis (deg/s).
      const yawRate =
        ((rate.beta * gx + rate.gamma * gy + rate.alpha * gz) / gLen) * DEG_TO_RAD;
      const lean = Math.atan((speedMs * yawRate) / GRAVITY) / DEG_TO_RAD;
      leanDeg = Math.max(-MAX_LEAN_DEG, Math.min(MAX_LEAN_DEG, lean));
    }
  }

  return { leanDeg, gForce };
}

/** Exponential moving average; smaller alpha = smoother. */
export function smooth(prev: number, next: number, alpha: number) {
  return prev + alpha * (next - prev);
}

/** Fixes further apart than this (s) mean tracking stopped, e.g. the phone was locked. */
export const TRACKING_GAP_S = 5;
/** No bike or scooter gains or loses speed faster than this (m/s², ~0.8 g). */
const MAX_ACCEL = 8;
/** After a gap, GPS speed needs a few fixes to settle before it counts toward top speed. */
const SETTLE_FIXES = 3;

/**
 * Decides whether each speed reading may count toward top speed. Readings around a
 * tracking gap and sudden spikes are GPS glitches, not real riding.
 */
export class TopSpeedFilter {
  private prev: { t: number; speed: number } | null = null;
  private settling = 0;

  /** `t` in ms, `speed` in m/s. */
  accept(t: number, speed: number) {
    const prev = this.prev;
    this.prev = { t, speed };
    if (!prev) return true;
    const dt = (t - prev.t) / 1000;
    if (dt > TRACKING_GAP_S) {
      this.settling = SETTLE_FIXES;
      return false;
    }
    if (this.settling > 0) {
      this.settling--;
      return false;
    }
    return dt > 0 && Math.abs(speed - prev.speed) / dt <= MAX_ACCEL;
  }
}

/** Top speed of a recorded ride, ignoring glitches. Points must be in time order. */
export function cleanTopSpeed(points: { t: number; speed: number | null }[]) {
  const filter = new TopSpeedFilter();
  let max = 0;
  for (const p of points) {
    if (p.speed == null) continue;
    if (filter.accept(p.t, p.speed)) max = Math.max(max, p.speed);
  }
  return max;
}
