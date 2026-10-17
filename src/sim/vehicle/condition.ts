/**
 * Vehicle condition (SPEC §6.4, §11). v0.1 only uses dirt, dents and engine flooding;
 * the health values exist so mechanical damage can plug in later. The drivetrain and
 * suspension read multipliers from here (all 1.0 for now).
 */
export interface Dent {
  /** Local-space point on the body and inward direction. */
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
  radius: number;
}

export interface FloodState {
  /** Seconds the intake has been under water (counts down slowly when clear). */
  timer: number;
  stalled: boolean;
  /** Seconds the intake has been clear of water since stalling. */
  dryTime: number;
  /** Intake currently under water. */
  submerged: boolean;
}

export interface VehicleCondition {
  engine: number;
  tyres: [number, number, number, number];
  suspension: [number, number, number, number];
  panels: { front: number; left: number; right: number; rear: number; roof: number };
  /** 0..1 dirt per zone. */
  dirt: { front: number; sides: number; rear: number; wheels: number };
  /** 0..1 how much of the dirt is mud (vs dust). */
  mudShare: number;
  dents: Dent[];
  flood: FloodState;
}

export function createCondition(): VehicleCondition {
  return {
    engine: 1,
    tyres: [1, 1, 1, 1],
    suspension: [1, 1, 1, 1],
    panels: { front: 1, left: 1, right: 1, rear: 1, roof: 1 },
    dirt: { front: 0, sides: 0, rear: 0, wheels: 0 },
    mudShare: 0,
    dents: [],
    flood: { timer: 0, stalled: false, dryTime: 0, submerged: false },
  };
}

/** Multipliers the physics reads. With no mechanical damage in v0.1 these are all 1. */
export function enginePowerMultiplier(c: VehicleCondition): number {
  return Math.max(0, Math.min(1, 0.4 + 0.6 * c.engine));
}

export function tyreGripMultiplier(c: VehicleCondition, wheel: number): number {
  return 0.6 + 0.4 * c.tyres[wheel];
}

export function suspensionStiffnessMultiplier(c: VehicleCondition, wheel: number): number {
  return 0.5 + 0.5 * c.suspension[wheel];
}
