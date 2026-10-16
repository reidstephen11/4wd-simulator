/**
 * Vehicle tuning (SPEC §6). Local frame: x = right, y = up, z = back (the vehicle
 * faces -z). The origin is mid-wheelbase at wheel-hub height when parked.
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
  /** Centre of mass (local). Height above ground = comY + wheelRadius. */
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

export const vehicleTuning: VehicleTuning = {
  name: 'Short-wheelbase 4WD',
  mass: 1600,
  com: { x: 0, y: 0.44, z: 0.05 },
  inertia: { x: 2300, y: 2500, z: 720 },
  wheelRadius: R,
  wheelWidth: 0.26,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Parked: 0.12 m of sag from full droop, leaving 0.13 m of bump travel.
  suspensionRestLength: MOUNT_Y + 0.12,
  suspensionTravel: 0.25,
  springStiffness: 20.4,
  damperCompression: 1.7,
  damperRelaxation: 2.6,
  maxSuspensionForce: 45000,
  bodyBoxes: [
    // Body tub and chassis rails.
    { cx: 0, cy: 0.33, cz: 0, hx: 0.8, hy: 0.44, hz: 1.86 },
    // Cabin.
    { cx: 0, cy: 1.1, cz: 0.3, hx: 0.76, hy: 0.36, hz: 1.05 },
  ],
  bumpRadius: 0.3,
  bodyFriction: 0.45,

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
    engineBrake: 55,
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
  intake: { x: 0.7, y: 0.9 - R, z: -0.9 },
  winchMount: { x: 0, y: 0.05, z: -1.95 },
};
