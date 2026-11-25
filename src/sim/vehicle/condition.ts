import { damageTuning as D } from '../../data/damage';
import { pressureSoftness } from './tyrePressure';

/**
 * Vehicle condition (SPEC §6.4, §11): dirt, dents and engine flooding, and the health
 * of the engine, tyres and suspension corners (1 = as new) that mechanical damage
 * lowers (src/sim/vehicle/damage.ts). The drivetrain and suspension read multipliers
 * from here.
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

/**
 * How a cut tyre is hurt: a puncture leaks slowly and takes a plug; a torn sidewall, or a
 * soft tyre rolled off its rim in a corner, needs a spare.
 */
export type TyreFault = 'none' | 'puncture' | 'sidewall' | 'rim';

export interface VehicleCondition {
  engine: number;
  tyres: [number, number, number, number];
  /** What each tyre is going down to (1 = not cut); `tyres` follows it as the air escapes. */
  tyreTarget: [number, number, number, number];
  tyreFault: [TyreFault, TyreFault, TyreFault, TyreFault];
  /** Seconds of hard wheelspin on rock each tyre has taken since it was last fixed. */
  abrasion: [number, number, number, number];
  /** Spare wheels on board, ready to fit. */
  spares: number;
  /** Tyre plugs left in the repair kit. */
  plugs: number;
  /** Fuel in the tank (L), and full 20 L jerry cans on the rack. */
  fuel: number;
  jerryCans: number;
  suspension: [number, number, number, number];
  panels: { front: number; left: number; right: number; rear: number; roof: number };
  /** 0..1 dirt per zone. */
  dirt: { front: number; sides: number; rear: number; wheels: number };
  /** 0..1 how much of the dirt is mud (vs dust). */
  mudShare: number;
  dents: Dent[];
  flood: FloodState;
  /** Engine temperature: 0 cold, about 0.5 normal running, over 1 overheating (src/sim/vehicle/damage.ts). */
  engineHeat: number;
  /** Tyres let down for grip off the gravel: more grip, but they cut more easily. */
  lowPressure: boolean;
  /** Selected pressure; absent on legacy conditions using the road/trail flag. */
  tyrePressurePsi?: number;
}

export function createCondition(fuel = 70): VehicleCondition {
  return {
    engine: 1,
    tyres: [1, 1, 1, 1],
    tyreTarget: [1, 1, 1, 1],
    tyreFault: ['none', 'none', 'none', 'none'],
    abrasion: [0, 0, 0, 0],
    spares: 2,
    plugs: 0,
    fuel,
    jerryCans: 0,
    suspension: [1, 1, 1, 1],
    panels: { front: 1, left: 1, right: 1, rear: 1, roof: 1 },
    dirt: { front: 0, sides: 0, rear: 0, wheels: 0 },
    mudShare: 0,
    dents: [],
    flood: { timer: 0, stalled: false, dryTime: 0, submerged: false },
    engineHeat: 0.5,
    lowPressure: false,
  };
}

/** Multipliers the physics reads (all 1 on an undamaged vehicle). */
export function enginePowerMultiplier(c: VehicleCondition): number {
  const E = D.engine;
  // A boiling engine pulls less, all the way down to `hotPower` at the top of the dial.
  const hot = Math.min(1, Math.max(0, ((c.engineHeat ?? 0.5) - 1) / (E.maxHeat - 1)));
  return Math.max(0, Math.min(1, 0.4 + 0.6 * c.engine)) * (1 - (1 - E.hotPower) * hot);
}

export function tyreGripMultiplier(c: VehicleCondition, wheel: number): number {
  return (0.6 + 0.4 * c.tyres[wheel]) * (1 + (D.tyre.lowPressureGrip - 1) * pressureSoftness(c));
}

/** Cornering grip a soft or flat tyre keeps as its sidewall folds (1 when inflated). */
export function tyreSideGripMultiplier(c: VehicleCondition, wheel: number): number {
  return 1 - D.tyre.flatSideLoss * (1 - c.tyres[wheel]);
}

/**
 * How far a soft or flat tyre lowers its corner (m): the wheel rolls on its radius less
 * this. A flat one rises a little once a turn as its folded tread comes round (`rotation`,
 * the wheel's angle in radians), which shakes the car at speed.
 */
export function tyreDrop(c: VehicleCondition, wheel: number, rotation: number): number {
  const flat = 1 - c.tyres[wheel];
  if (flat <= 0) return 0;
  const pulse = Math.max(0, Math.cos(rotation)) ** 4;
  return D.tyre.flatDrop * flat - D.tyre.flatThump * flat * flat * pulse;
}

export function suspensionStiffnessMultiplier(c: VehicleCondition, wheel: number): number {
  return 0.5 + 0.5 * c.suspension[wheel];
}
