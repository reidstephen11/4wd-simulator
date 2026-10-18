import { audioTuning, type TyreLayer } from '../data/audio';
import { SurfaceId } from '../data/surfaces';

/**
 * Pure mapping from vehicle and world state to sound levels. Kept free of Web Audio so it
 * can be unit tested.
 */

export interface WheelSound {
  contact: boolean;
  surface: SurfaceId;
  spin: number;
  slide: number;
  water: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Engine firing frequency (Hz) for an rpm. */
export function firingHz(rpm: number, cylinders: number = audioTuning.engine.cylinders): number {
  return (Math.max(0, rpm) / 60) * (cylinders / 2);
}

/** Which tyre layer a surface plays through. */
export function surfaceLayer(surface: SurfaceId): TyreLayer {
  switch (surface) {
    case SurfaceId.Gravel:
      return 'gravel';
    case SurfaceId.Grass:
      return 'grass';
    case SurfaceId.Rock:
      return 'rock';
    case SurfaceId.Mud:
      return 'mud';
    case SurfaceId.Water:
      return 'water';
    case SurfaceId.Wood:
      return 'wood';
    default:
      return 'dirt';
  }
}

export type LayerWeights = Record<TyreLayer, number>;

export function emptyWeights(): LayerWeights {
  return { dirt: 0, gravel: 0, grass: 0, rock: 0, mud: 0, water: 0, wood: 0, scrub: 0, squeal: 0 };
}

/**
 * Tyre noise level per layer (0..1): each wheel on the ground adds a quarter, scaled by
 * rolling speed and wheelspin. Deep water at a wheel switches it to the water layer;
 * sideways sliding adds scrub on firm ground.
 */
export function tyreWeights(
  wheels: readonly WheelSound[],
  speed: number,
  out: LayerWeights = emptyWeights(),
): LayerWeights {
  const T = audioTuning.tyres;
  for (const k of Object.keys(out) as TyreLayer[]) out[k] = 0;
  const rolling = Math.pow(clamp01(Math.abs(speed) / T.fullSpeed), 0.8);
  for (const w of wheels) {
    const inWater = w.water > T.waterDepth;
    if (!w.contact && !inWater) continue;
    const amount = clamp01(rolling + w.spin * T.spinWeight) * 0.25;
    const layer = inWater ? 'water' : surfaceLayer(w.surface);
    out[layer] += amount;
    if (layer !== 'water' && layer !== 'mud') out.scrub += clamp01(w.slide / T.fullSlide) * 0.25;
    // Rubber chirps and squeals when it spins on hard rock or timber.
    if (layer === 'rock' || layer === 'wood')
      out.squeal += clamp01((w.spin - T.squealFrom) / (1 - T.squealFrom)) * 0.25;
  }
  for (const k of Object.keys(out) as TyreLayer[]) out[k] = clamp01(out[k]);
  return out;
}

/** Thump loudness (0..1) for a suspension compression speed; 0 below the threshold. */
export function thumpLevel(speed: number): number {
  const t = audioTuning.thump;
  if (speed < t.from) return 0;
  return 0.15 + 0.85 * clamp01((speed - t.from) / (t.full - t.from));
}

/** Engine output gain from rpm, load and throttle (before the volume setting). */
export function engineGain(
  rpm: number,
  load: number,
  throttle: number,
  idleRpm: number,
  redline: number,
): number {
  const g = audioTuning.engine.gain;
  const rev = clamp01((rpm - idleRpm) / (redline - idleRpm));
  return (g.idle + g.load * load + g.throttle * throttle) * (0.8 + 0.4 * rev);
}

/** Winch motor pitch (Hz): drops as the pull approaches its limit. */
export function winchPitch(loadFraction: number, motor: number): number {
  const w = audioTuning.winch;
  const load = motor < 0 ? clamp01(loadFraction) * 0.3 : clamp01(loadFraction);
  return w.freeHz + (w.loadedHz - w.freeHz) * load;
}

/** Wind level (0..1) from altitude. */
export function windLevel(altitude: number): number {
  const w = audioTuning.ambience.wind;
  return clamp01((altitude - w.lowAltitude) / (w.highAltitude - w.lowAltitude));
}

/** Level (0..1) for a sound heard within `range` metres, louder close in. */
export function proximityLevel(distance: number, range: number): number {
  const f = clamp01(1 - distance / range);
  return f * f;
}

/** Chassis scrape level (0..1): needs both pressure on the ground and sliding. */
export function scrapeLevel(force: number, slide: number, weight: number): number {
  const S = audioTuning.scrape;
  if (force <= 0) return 0;
  const press = Math.sqrt(clamp01(force / (S.fullForce * weight)));
  return press * Math.pow(clamp01(slide / S.fullSlide), 0.7);
}

/** Chassis knock loudness (0..1) for an impulse (N·s); 0 below the threshold. */
export function knockLevel(impulse: number): number {
  const k = audioTuning.knock;
  if (impulse < k.from) return 0;
  return 0.2 + 0.8 * clamp01((impulse - k.from) / (k.full - k.from));
}

/** Spring and body squeaks per second from summed suspension movement (m/s) and speed. */
export function squeakRate(articulation: number, speed: number): number {
  const q = audioTuning.squeak;
  if (Math.abs(speed) > q.maxSpeed) return 0;
  return q.rate * clamp01(articulation / q.fullArticulation);
}
