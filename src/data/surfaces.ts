/** Surface table (SPEC §6.3). Sampled under each wheel. */
export const SurfaceId = {
  Dirt: 0,
  Grass: 1,
  Gravel: 2,
  Rock: 3,
  Mud: 4,
  Water: 5,
  Wood: 6,
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
    wetGripLoss: 0.3,
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

/** Water drag (SPEC §6.3: scales with depth and speed). */
export const waterDrag = {
  /** N per (m depth · (m/s)^2) */
  quadratic: 260,
  /** N per (m depth · m/s) */
  linear: 900,
  /** Depth (m) at which drag stops increasing (body fully in water). */
  maxDepth: 1.0,
};

/** Grip multiplier for a surface given wetness (0..1). */
export function surfaceGrip(id: SurfaceId, wetness: number): number {
  const s = surfaces[id];
  return s.grip * (1 - s.wetGripLoss * Math.min(1, Math.max(0, wetness)));
}
