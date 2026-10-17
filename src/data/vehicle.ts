/**
 * Vehicle tuning (SPEC §6). Local frame: x = right, y = up, z = back (the vehicle
 * faces -z). The origin is mid-wheelbase, 0.12 m above the parked wheel hubs.
 */
export interface WheelLayout {
  /** Suspension top mount (local). */
  x: number;
  y: number;
  z: number;
  front: boolean;
}

export interface VehicleTuning {
  name: string;
  mass: number;
  /** Centre of mass (local). */
  com: { x: number; y: number; z: number };
  /** Principal inertia: pitch (x), yaw (y), roll (z). */
  inertia: { x: number; y: number; z: number };
  wheelRadius: number;
  wheelWidth: number;
  wheels: WheelLayout[];
  /** Suspension length at full droop (spring force is zero here). */
  suspensionRestLength: number;
  /** Total wheel travel from full droop to bump stop. */
  suspensionTravel: number;
  /** Spring stiffness (per unit vehicle mass, Rapier convention). */
  springStiffness: number;
  damperCompression: number;
  damperRelaxation: number;
  maxSuspensionForce: number;
  /** Chassis collision boxes (local centre + half extents). */
  bodyBoxes: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }[];
  /** Bump-stop spheres at each wheel when fully compressed (radius). */
  bumpRadius: number;
  bodyFriction: number;
  /** Suspension compression speed (m/s) that counts as a hard hit (sound, events). */
  wheelImpactSpeed: number;

  engine: {
    idleRpm: number;
    /** Torque converter stall speed: rpm the engine can reach at standstill with full throttle. */
    stallRpm: number;
    redlineRpm: number;
    /** [rpm, Nm] pairs. */
    torqueCurve: ReadonlyArray<readonly [number, number]>;
    /** Engine braking force at the wheels (N) per unit of total gear ratio. */
    engineBrake: number;
  };
  gearbox: {
    ratios: readonly number[];
    reverse: number;
    finalDrive: number;
    efficiency: number;
    upshiftRpm: { light: number; full: number };
    downshiftRpm: { light: number; full: number };
    shiftTime: number;
  };
  ranges: {
    high: { ratio: number; topSpeedKmh: number; reverseTopKmh: number };
    low: { ratio: number; topSpeedKmh: number; reverseTopKmh: number };
  };
  /** Share of torque an open diff still passes when one wheel on an axle has no grip (0 = textbook open diff). */
  openDiffLeak: number;
  crawling: {
    diffLockMaxKmh: number;
    frontLockSteering: number;
    forwardKmh: number;
    reverseKmh: number;
    speedGain: number;
    brakeGain: number;
    /** Extra loaded sag and droop in low range; ride height and bump stops stay fixed. */
    extraDroop: number;
    antiRollScale: number;
    damperCompression: number;
    damperRelaxation: number;
  };
  /** Base lateral friction coefficient (multiplied by surface grip). */
  lateralGrip: number;
  /**
   * How much of the physically correct roll torque from tyre side forces is applied
   * (Rapier only applies 10% of it internally; we add the rest × this scale).
   */
  rollTorqueScale: number;
  /** Anti-roll bar stiffness per axle (N per metre of left/right compression difference). */
  antiRoll: { front: number; rear: number };
  /** Base longitudinal friction coefficient (multiplied by surface grip). */
  longitudinalGrip: number;
  brakeForce: number;
  brakeFrontBias: number;
  handbrakeForce: number;
  /** Rear side-friction multiplier while the handbrake is held. */
  handbrakeSideGrip: number;
  /** Brake applied when stopped with no input, so the car doesn't creep. */
  holdBrakeForce: number;
  dragArea: number;
  steering: {
    maxAngleDeg: number;
    /** Max angle at high speed. */
    minAngleDeg: number;
    /** Speed (m/s) at which the angle reaches the minimum. */
    minAngleSpeed: number;
    /** Keyboard steering ramp rates (per second). */
    keyboardRiseRate: number;
    keyboardReturnRate: number;
    padRate: number;
  };
  /** Air intake height above ground (SPEC §6.4). */
  intakeHeight: number;
  /** Air intake position (local), used for flooding. */
  intake: { x: number; y: number; z: number };
  /** Winch mount (front bumper, local). */
  winchMount: { x: number; y: number; z: number };
}

const R = 0.38;
const HALF_TRACK = 0.725;
const HALF_BASE = 1.15;
const MOUNT_Y = 0.32;
const SUSPENSION_LIFT = 0.12;

export const vehicleTuning: VehicleTuning = {
  name: 'Short-wheelbase 4WD',
  mass: 1600,
  // Retain the existing centre-of-mass height above ground with the taller suspension.
  com: { x: 0, y: 0.44 - SUSPENSION_LIFT, z: 0.05 },
  inertia: { x: 2300, y: 2500, z: 720 },
  wheelRadius: R,
  wheelWidth: 0.26,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // 0.12 m suspension lift, retaining 0.12 m sag and 0.13 m bump travel.
  suspensionRestLength: MOUNT_Y + 0.12 + SUSPENSION_LIFT,
  suspensionTravel: 0.25,
  springStiffness: 20.4,
  damperCompression: 1.7,
  damperRelaxation: 2.6,
  maxSuspensionForce: 45000,
  bodyBoxes: [
    // Match the visible frame rails and transmission instead of filling the wheel wells.
    { cx: -0.47, cy: 0.02, cz: 0.06, hx: 0.05, hy: 0.08, hz: 1.59 },
    { cx: 0.47, cy: 0.02, cz: 0.06, hx: 0.05, hy: 0.08, hz: 1.59 },
    { cx: 0, cy: 0.015, cz: -0.23, hx: 0.19, hy: 0.075, hz: 0.325 },
    // Narrow floor, doors between the wheel openings, engine and rear tub.
    { cx: 0, cy: 0.13, cz: 0.1, hx: 0.58, hy: 0.06, hz: 1.68 },
    { cx: 0, cy: 0.47, cz: -0.045, hx: 0.8, hy: 0.34, hz: 0.54 },
    { cx: 0, cy: 0.7, cz: -1.23, hx: 0.58, hy: 0.2, hz: 0.61 },
    { cx: 0, cy: 0.49, cz: 1.17, hx: 0.58, hy: 0.3, hz: 0.65 },
    // Bumpers and hardtop follow the drawn model, including their actual overhangs.
    { cx: 0, cy: 0.22, cz: -1.98, hx: 0.92, hy: 0.08, hz: 0.095 },
    { cx: 0, cy: 0.21, cz: 1.94, hx: 0.895, hy: 0.075, hz: 0.085 },
    { cx: 0, cy: 1.19, cz: 0.62, hx: 0.76, hy: 0.5, hz: 1.19 },
  ],
  bumpRadius: 0.24,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,

  engine: {
    idleRpm: 800,
    stallRpm: 2000,
    redlineRpm: 4300,
    torqueCurve: [
      [600, 150],
      [1200, 235],
      [2000, 280],
      [2800, 285],
      [3600, 250],
      [4300, 190],
      [4800, 80],
    ],
    engineBrake: 120,
  },
  gearbox: {
    ratios: [2.48, 1.48, 1.0],
    reverse: 2.08,
    finalDrive: 3.7,
    efficiency: 0.85,
    upshiftRpm: { light: 2100, full: 3800 },
    downshiftRpm: { light: 1150, full: 2300 },
    shiftTime: 0.35,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 100, reverseTopKmh: 18 },
    low: { ratio: 2.5, topSpeedKmh: 25, reverseTopKmh: 10 },
  },
  openDiffLeak: 0.35,
  crawling: {
    diffLockMaxKmh: 5,
    frontLockSteering: 0.72,
    forwardKmh: 3,
    reverseKmh: 2.5,
    speedGain: 3,
    brakeGain: 1.1,
    extraDroop: 0.06,
    antiRollScale: 0.18,
    damperCompression: 2.1,
    damperRelaxation: 3,
  },
  lateralGrip: 0.9,
  rollTorqueScale: 1.0,
  antiRoll: { front: 8000, rear: 5000 },
  longitudinalGrip: 0.95,
  brakeForce: 13500,
  brakeFrontBias: 0.6,
  handbrakeForce: 6000,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 7000,
  dragArea: 1.65,
  steering: {
    maxAngleDeg: 34,
    minAngleDeg: 9,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.6,
    keyboardReturnRate: 4.0,
    padRate: 8,
  },
  intakeHeight: 0.9,
  intake: { x: 0.7, y: 0.9 - R - SUSPENSION_LIFT, z: -0.9 },
  winchMount: { x: 0, y: 0.28, z: -2.0 },
};
