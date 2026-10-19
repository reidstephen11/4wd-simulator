/**
 * Particle effects (SPEC §4 effects): dust on dry dirt, mud spray, water splash and wake.
 * Rates are per wheel per second at full strength; the quality preset scales them.
 */
export const particleTuning = {
  /** Pool sizes (enough for the High preset). */
  maxDust: 420,
  maxChunks: 520,
  maxWakes: 90,

  dust: {
    /** Speed (m/s) where dust starts and where it reaches full rate. */
    fromSpeed: 2.5,
    fullSpeed: 12,
    rate: 14,
    /** Gravel and grass throw less dust than dirt. */
    surfaceScale: { dirt: 1, gravel: 0.6, grass: 0.25 },
    life: [1.8, 3.2],
    size: [0.4, 1.9],
    opacity: 0.55,
    /** Ground wetness above this stops dust. */
    maxWetness: 0.3,
    drag: 1.6,
    rise: 0.35,
  },

  mud: {
    /** Per wheel per second from wheelspin (0..1) and from rolling speed. */
    spinRate: 45,
    speedRate: 14,
    life: [0.7, 1.3],
    size: [0.06, 0.15],
    /** Thrown back off the tyre (m/s) and up. */
    throwSpeed: [2, 6],
    lift: [2, 4.5],
  },

  splash: {
    /** Water at the wheel (m) before it splashes: a puddle on the track is enough. */
    minDepth: 0.02,
    /** Speed (m/s) for any splash and for full rate. */
    fromSpeed: 1.2,
    fullSpeed: 6,
    rate: 40,
    life: [0.5, 1.1],
    size: [0.05, 0.12],
    lift: [1.2, 3.6],
    spread: 1.8,
  },

  wake: {
    /** Water depth at the wheels (m) before the car makes a wake. */
    minDepth: 0.18,
    fromSpeed: 1.5,
    /** Rings per second at full speed (bow) and at each rear wheel. */
    rate: 3,
    rearRate: 1,
    life: [1.8, 2.6],
    radius: [0.5, 3.6],
    opacity: 0.85,
  },

  /** A badly hurt engine smokes from under the bonnet while it runs. */
  smoke: {
    /** Engine health below which it starts, puffing harder as the health falls. */
    from: 0.5,
    /** Puffs per second at health 0. */
    rate: 12,
    /** Where it comes out (vehicle frame, m): the bonnet's front edge. */
    y: 1.0,
    z: -1.55,
    life: [1.6, 2.4],
    size: [0.25, 0.7],
    color: '#BDBAB4',
  },

  gravity: 9.81,
} as const;

/** Falling rain (src/render/rain.ts): streaks in a box that follows the camera. */
export const rainTuning = {
  /** Streaks at High quality; the quality preset's particle multiplier scales them. */
  drops: 7000,
  /** Width and depth of the box of rain around the camera, and its height (m). */
  box: 40,
  height: 24,
  /** Fall speed (m/s), streak length (m) and the wind's sideways drift (m/s, x and z). */
  speed: 9,
  length: 0.6,
  wind: [0.9, 0.3] as const,
  color: '#D3DCE2',
  opacity: 0.34,
  /** The vehicle shelters the rain inside this box (local frame: centre and half extents, m). */
  shelter: { centre: [0, 0.55, 0.05] as const, half: [1.0, 1.0, 2.5] as const },
};
