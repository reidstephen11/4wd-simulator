import { floodTuning } from '../../data/tools';
import type { FloodState } from './condition';

export type FloodEvent = 'stalled' | 'restarted' | null;

/**
 * Engine flooding (SPEC §6.4). The timer counts up while the air intake is under water
 * and slowly back down when clear. At 10 s the engine stalls; it restarts on throttle
 * once the intake has been clear for 20 s.
 */
export function updateFlood(
  f: FloodState,
  submerged: boolean,
  throttle: number,
  dt: number,
  t = floodTuning,
): FloodEvent {
  f.submerged = submerged;
  if (submerged) f.timer += dt;
  else f.timer = Math.max(0, f.timer - dt * t.recoverRate);
  if (!f.stalled) {
    if (f.timer >= t.stallAt) {
      f.stalled = true;
      f.dryTime = 0;
      return 'stalled';
    }
    return null;
  }
  f.dryTime = submerged ? 0 : f.dryTime + dt;
  if (f.dryTime >= t.restartDryTime && throttle > 0.05) {
    f.stalled = false;
    f.timer = 0;
    f.dryTime = 0;
    return 'restarted';
  }
  return null;
}

/** Engine power multiplier while flooding: random cut-outs once past the sputter point. */
export function floodPower(f: FloodState, rand: number, t = floodTuning): number {
  if (f.stalled) return 0;
  if (f.timer < t.sputterAt) return 1;
  const severity = Math.min(1, (f.timer - t.sputterAt) / (t.stallAt - t.sputterAt));
  return rand < 0.25 + severity * 0.45 ? 0.15 : 1;
}

export function isSputtering(f: FloodState, t = floodTuning): boolean {
  return !f.stalled && f.timer >= t.sputterAt;
}
