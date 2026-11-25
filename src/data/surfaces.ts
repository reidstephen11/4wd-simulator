/** Surface table (SPEC §6.3). Sampled under each wheel. */
export const SurfaceId = {
  Dirt: 0,
  Grass: 1,
  Gravel: 2,
  Rock: 3,
  Mud: 4,
  Water: 5,
  Wood: 6,
  Clay: 7,
  BlackSoil: 8,
  Sand: 9,
  SoftBed: 10,
} as const;
export type SurfaceId = (typeof SurfaceId)[keyof typeof SurfaceId];

export interface SurfaceDef {
  id: SurfaceId;
  name: string;
  grip: number;
  rollingResistance: number;
  /** Max wheel sink depth in metres. */
  sink: number;
  /** Emits dust when dry. */
  dust: boolean;
  /** Emits mud spray. */
  spray: boolean;
  /** How strongly wetness reduces grip on this surface (0..1). */
  wetGripLoss: number;
  /** Dirt build-up rate on the body (per second at speed). */
  dirtRate: number;
}

export const surfaces: Record<SurfaceId, SurfaceDef> = {
  [SurfaceId.Dirt]: {
    id: SurfaceId.Dirt,
    name: 'Dirt track',
    grip: 1.0,
    rollingResistance: 0.02,
    sink: 0,
    dust: true,
    spray: false,
    wetGripLoss: 0.35,
    dirtRate: 0.01,
  },
  [SurfaceId.Grass]: {
    id: SurfaceId.Grass,
    name: 'Dry grass',
    grip: 0.85,
    rollingResistance: 0.04,
    sink: 0,
    dust: false,
    spray: false,
    // Wet grass is slick as soap on a slope: no better than the greasy clay beside it.
    wetGripLoss: 0.5,
    dirtRate: 0.004,
  },
  [SurfaceId.Gravel]: {
    id: SurfaceId.Gravel,
    name: 'Gravel / scree',
    grip: 0.75,
    rollingResistance: 0.03,
    sink: 0,
    dust: true,
    spray: false,
    wetGripLoss: 0.15,
    dirtRate: 0.006,
  },
  [SurfaceId.Rock]: {
    id: SurfaceId.Rock,
    name: 'Rock',
    grip: 1.1,
    rollingResistance: 0.015,
    sink: 0,
    dust: false,
    spray: false,
    wetGripLoss: 0.4,
    dirtRate: 0.001,
  },
  [SurfaceId.Mud]: {
    id: SurfaceId.Mud,
    name: 'Mud',
    grip: 0.45,
    rollingResistance: 0.25,
    sink: 0.15,
    dust: false,
    spray: true,
    wetGripLoss: 0.1,
    dirtRate: 0.08,
  },
  [SurfaceId.Water]: {
    id: SurfaceId.Water,
    name: 'Water (creek bed)',
    grip: 0.6,
    rollingResistance: 0.03,
    sink: 0,
    dust: false,
    spray: false,
    wetGripLoss: 0,
    dirtRate: -0.05,
  },
  // Red clay grips like dirt when dry; after rain it greases over and grips little better than mud.
  [SurfaceId.Clay]: {
    id: SurfaceId.Clay,
    name: 'Red clay',
    grip: 0.95,
    rollingResistance: 0.03,
    sink: 0.04,
    dust: true,
    spray: true,
    wetGripLoss: 0.55,
    dirtRate: 0.03,
  },
  // Wet black soil off the tracks turns to glue: the wheels sink and spin, and barely move
  // the car on the flat. Dry, it is firm enough to drive slowly.
  [SurfaceId.BlackSoil]: {
    id: SurfaceId.BlackSoil,
    name: 'Black soil',
    grip: 0.5,
    rollingResistance: 0.3,
    sink: 0.2,
    dust: false,
    spray: true,
    wetGripLoss: 0.45,
    dirtRate: 0.07,
  },
  // Dry river sand gives under the tyres: it drags hard and lets the wheels dig in.
  // Momentum carries a vehicle across; stopped in it, it has to climb out of its own ruts.
  [SurfaceId.Sand]: {
    id: SurfaceId.Sand,
    name: 'Soft sand',
    grip: 0.55,
    rollingResistance: 0.17,
    sink: 0.14,
    dust: true,
    spray: false,
    wetGripLoss: 0,
    dirtRate: 0.008,
  },
  // The soft sandy bottom of a creek that asks for one (`CreekDef.softBed`), off its bars:
  // under water the sand gives and drags like dry river sand, a little less (it is wet and
  // packed). Low tyre pressures help as they do on sand. Water washes the car as on any bed.
  [SurfaceId.SoftBed]: {
    id: SurfaceId.SoftBed,
    name: 'Soft sand under water',
    grip: 0.42,
    rollingResistance: 1.4,
    sink: 0.2,
    dust: false,
    spray: false,
    wetGripLoss: 0,
    dirtRate: -0.05,
  },
  [SurfaceId.Wood]: {
    id: SurfaceId.Wood,
    name: 'Timber plank',
    grip: 1.05,
    rollingResistance: 0.015,
    sink: 0,
    dust: false,
    spray: false,
    wetGripLoss: 0.3,
    dirtRate: 0,
  },
};

/**
 * Braking past the grip a tyre has locks the wheel (no ABS on either vehicle): it slides
 * with a share of its grip and barely steers until the driver eases off.
 */
export const tyreLock = {
  /** Peak braking grip against the grip used for driving: a tyre just short of locking. */
  peak: 1.12,
  /** Grip of a sliding, locked tyre against its peak grip. */
  slideGrip: 0.75,
  /** Sideways grip of a locked tyre against a rolling one. */
  sideGrip: 0.3,
  /** Below this speed (m/s) the brakes just hold the car. */
  minSpeed: 1.5,
  /**
   * The rear brakes' load-sensing valve lets them brake up to this share of the rear
   * wheels' load (about dry grip), so on dry ground the rears, light under hard braking,
   * don't lock; on wet ground they still can.
   */
  rearValve: 0.95,
};

/** Water drag (SPEC §6.3: scales with depth and speed). */
export const waterDrag = {
  /** N per (m depth · (m/s)^2) */
  quadratic: 260,
  /** N per (m depth · m/s) */
  linear: 900,
  /** Depth (m) at which drag stops increasing (body fully in water). */
  maxDepth: 1.0,
  /** Water moving across the vehicle meets its whole side: this many times the drag head-on. */
  side: 2.2,
};

/**
 * Deep water lifts the body off its tyres, so running water can push it sideways and
 * at last carry it off.
 */
export const waterLift = {
  /** Share of the water the body's parts displace that lifts them (the rest leaks in). */
  share: 0.3,
  /** Weight of water (N per m³). */
  weight: 9810,
  /**
   * Tyres in running water over their hubs creep sideways, keeping only 1 − this of
   * their side grip against a steady push, once the water runs at `creepFlow` (m/s).
   */
  creep: 0.85,
  creepFlow: 1.5,
  /** Share of that creep while standing still (it rises to all of it by 1.5 m/s). */
  standingCreep: 0.75,
};

/** When the current has taken the vehicle (an episode ends on Mild and Realistic damage). */
export const sweptTuning = {
  /** Lifted by at least this share of its weight... */
  lift: 0.45,
  /** ...and moving downstream faster than this (m/s)... */
  speed: 0.5,
  /** ...for this long (s). It counts back down twice as fast once it isn't. */
  seconds: 4,
};

/** Grip multiplier for a surface given wetness (0..1). */
export function surfaceGrip(id: SurfaceId, wetness: number): number {
  const s = surfaces[id];
  return s.grip * (1 - s.wetGripLoss * Math.min(1, Math.max(0, wetness)));
}
