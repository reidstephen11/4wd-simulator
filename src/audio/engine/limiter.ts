/**
 * Rev-limiter firing decisions. Pure, so the bounce rhythm can be unit-tested without
 * rendering audio. Only engines with a `limiter` block in their synth tuning use this;
 * everyone else keeps the old random every-other-firing cut.
 */

export type LimiterKind = 'ignition' | 'fuel';

export type LimiterFiring = 'fire' | 'cut' | 'pop' | 'weak';

export interface LimiterTuning {
  /** How far below limiterRpm the extra strain and intake start (rpm). */
  approach: number;
  kind: LimiterKind;
  /**
   * Repeating cycle while bouncing: 0 fire, 1 cut, 2 a weak, partial burn.
   * Ignition-cut petrol uses an uneven bounce; fuel-cut diesel a steadier chop.
   */
  pattern: readonly number[];
  /** Chance a cut firing pops instead (unburnt fuel in the pipe). Petrol higher. */
  bouncePop: number;
  /** Extra intake roar at the limiter, with the throttle open. */
  intake: number;
  /** Extra valve-train tick at the limiter. */
  valves: number;
  /** Extra exhaust turbulence / harshness. */
  grit: number;
  /** Extra block rumble. */
  block: number;
  /** Extra pop / crackle chance on lift-off while still near the limiter. */
  overrunPop: number;
  /** Extra turbo dump on a diesel lift-off at the limiter. */
  dump: number;
}

/** 0 well below the limiter, 1 at or past it, blending in over `approach` rpm. */
export function limiterProximity(rpm: number, limiterRpm: number, approach: number): number {
  if (!(limiterRpm > 0) || !(rpm > 0)) return 0;
  if (rpm >= limiterRpm) return 1;
  if (!(approach > 0)) return 0;
  const start = limiterRpm - approach;
  if (rpm <= start) return 0;
  return (rpm - start) / approach;
}

export function limiterBouncing(rpm: number, limiterRpm: number): boolean {
  return rpm >= limiterRpm;
}

/**
 * How this cylinder should fire. Below the limiter always `'fire'`, so cruise and
 * crawling are unchanged. `rand` is 0..1, typically a noise sample.
 */
export function limiterFiring(
  rpm: number,
  limiterRpm: number,
  fireIndex: number,
  pattern: readonly number[],
  popChance: number,
  rand: number,
): LimiterFiring {
  if (rpm < limiterRpm || pattern.length === 0) return 'fire';
  const step = pattern[((fireIndex % pattern.length) + pattern.length) % pattern.length] ?? 0;
  if (step <= 0) return 'fire';
  if (step >= 2) return 'weak';
  return rand < popChance ? 'pop' : 'cut';
}
