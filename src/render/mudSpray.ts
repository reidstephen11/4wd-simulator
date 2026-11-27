import { particleTuning as P } from '../data/particles';

/**
 * How mud leaves a tyre (v2.30). Pure, so the direction and the size of the flecks can be
 * tested without drawing anything; `Particles` (particles.ts) does the drawing.
 */

type Range = readonly [number, number];
const lerp = (r: Range, t: number) => r[0] + (r[1] - r[0]) * t;

/**
 * Which way a wheel is turning: 1 forwards, -1 backwards. A wheel that is spinning turns
 * the way its gear drives it, whatever the car is doing: a bogged car's speed sits near
 * zero and reads a little forwards one moment and a little backwards the next. A wheel
 * that is only rolling turns the way the car is going.
 *
 * `speed` is the car's speed along its nose (m/s), `spin` the wheel's wheelspin (0..1) and
 * `gear` the gearbox's gear (below 0 is reverse).
 */
export function wheelTurning(speed: number, spin: number, gear: number): 1 | -1 {
  if (spin > P.mud.spinFrom) return gear < 0 ? -1 : 1;
  return speed >= 0 ? 1 : -1;
}

/**
 * Where a fleck starts and how fast it goes, along the car's nose (+ is forwards): mud
 * leaves the tyre the way the tread leaves the ground, against the wheel's turning, and
 * faster the harder the wheel spins. `rand` is 0..1.
 */
export function mudThrow(turning: 1 | -1, spin: number, rand: number): { along: number; behind: number } {
  return { along: -turning * lerp(P.mud.throwSpeed, rand) * (0.5 + spin), behind: -turning * P.mud.behind };
}

/**
 * One fleck: mostly small, now and then a clod, each drawn out along its path so it reads
 * as flung mud and not a lump. Both draws are 0..1.
 */
export function mudFleck(kind: number, size: number): { radius: number; stretch: number } {
  const clod = kind < P.mud.clodChance;
  return {
    radius: lerp(clod ? P.mud.clodSize : P.mud.size, size),
    // The small ones are drawn out the most.
    stretch: lerp(P.mud.stretch, clod ? 0 : 1 - size),
  };
}

/** Flecks a wheel throws each second at full quality: from wheelspin (0..1) and from rolling speed (m/s). */
export function mudRate(spin: number, speed: number): number {
  return P.mud.spinRate * spin + P.mud.speedRate * Math.min(1, Math.abs(speed) / 6);
}
