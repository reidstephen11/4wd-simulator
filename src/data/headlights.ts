/** Headlights: off, dipped (low beam) or main (high beam). N cycles through them. */
export type HeadlightMode = 'off' | 'low' | 'high';

export const headlightModes: readonly HeadlightMode[] = ['off', 'low', 'high'];

export function nextHeadlightMode(mode: HeadlightMode): HeadlightMode {
  return headlightModes[(headlightModes.indexOf(mode) + 1) % headlightModes.length];
}

export interface BeamTuning {
  /** Candela-like strength at the centre of the beam (the pair of lamps together). */
  intensity: number;
  /** Beyond this distance (m) the lamp lights nothing. */
  distance: number;
  /** Half-angle of the beam (degrees). */
  angleDeg: number;
  /** 0..1 how soft the edge of the beam is: the share of the half-angle over which it fades out. */
  penumbra: number;
  /** Aim below level (degrees): low beam lights the track just ahead. */
  dipDeg: number;
  /** How quickly the light fades with distance (2 = physical; lower carries further). */
  decay: number;
}

/**
 * How the lamps light the ground at dusk and night (src/render/headlights.ts). The beams
 * start a little ahead of the front of the car, so the bull bar and bumper aren't lit
 * from a few centimetres away.
 */
export const headlightTuning = {
  low: {
    intensity: 560,
    distance: 60,
    angleDeg: 40,
    penumbra: 1,
    dipDeg: 9,
    decay: 1.2,
  } satisfies BeamTuning,
  high: {
    intensity: 1450,
    distance: 150,
    angleDeg: 30,
    penumbra: 0.9,
    dipDeg: 3,
    decay: 1.2,
  } satisfies BeamTuning,
  /** The Camel Trophy car's four roof lamps, wired to high beam like real driving lamps. */
  roof: {
    intensity: 1550,
    distance: 170,
    angleDeg: 24,
    penumbra: 0.85,
    dipDeg: 4,
    decay: 1.2,
  } satisfies BeamTuning,
  /** Metres ahead of the front of the body where the beams start. */
  beamAhead: 0.08,
  /** Lens glow (emissive intensity) for the headlamps and the roof lamps. */
  lensGlow: { off: 0.14, low: 2.4, high: 3.4 },
  roofLensGlow: { off: 0.14, on: 3.4 },
  /** Dial needles and number-plate lettering: lit with the headlights, like dash lights. */
  panelGlow: { off: 0.14, on: 1.3 },
  /** The dials' markings, in their own ivory and red: dark by day, lit with the headlights. */
  dialGlow: { off: 0, on: 1.1 },
  /** Tail lamps: off, on with the headlights, and under braking (either way). */
  tailGlow: { off: 0.13, on: 0.55, brake: 0.9, brakeWithLights: 1.4 },
};
