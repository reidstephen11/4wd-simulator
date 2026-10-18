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
  /** Chassis impulse (N·s) on first touching the ground that counts as a knock (sound, events). */
  bodyKnockImpulse: number;

  engine: {
    idleRpm: number;
    redlineRpm: number;
    /** Full-throttle torque at the flywheel (after friction): [rpm, Nm] pairs. */
    torqueCurve: ReadonlyArray<readonly [number, number]>;
    /**
     * Air the wide-open throttle passes, as torque × rpm (Nm·rpm). Part throttle lets
     * through a share of this, so its torque falls as the revs rise.
     */
    airflow: number;
    /** Share of `airflow` with the throttle closed (idle air). */
    idleAir: number;
    /** Throttle opening → air: share = throttle ^ curve (fine control near closed). */
    throttleCurve: number;
    /** The idle governor adds up to this much throttle as the revs sag this far below idle. */
    idleGovernor: number;
    idleDroop: number;
    /** Friction and pumping losses: base + perRpm·rpm + pumpingPerRpm·rpm·(1 − throttle) Nm. */
    friction: { base: number; perRpm: number; pumpingPerRpm: number };
    /** Rotating inertia of crank and flywheel (kg·m²). */
    inertia: number;
    /** Drag at the wheels from a stalled engine (N) per unit of total gear ratio, halved. */
    engineBrake: number;
  };
  /**
   * Torque converter between engine and gearbox. Pump torque = (rpm / capacity)² minus
   * the same for the turbine; the turbine gets up to `stallRatio` × that below the
   * coupling point (turbine / engine speed).
   */
  converter: { capacity: number; stallRatio: number; couplingPoint: number };
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
  /** Brake applied when stopped with no input (the driver's foot on the brake), so it doesn't creep or roll. */
  holdBrakeForce: number;
  /** Hill-start assist: longest the brakes stay on while drive builds on a slope (s). */
  hillStartHold: number;
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
  bodyKnockImpulse: 120,

  engine: {
    idleRpm: 800,
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
    airflow: 950000,
    idleAir: 0.03,
    throttleCurve: 1.5,
    idleGovernor: 0.08,
    idleDroop: 150,
    // About 80 Nm with the throttle closed at 2500 rpm, as for a 4.2 L petrol six.
    friction: { base: 15, perRpm: 0.01, pumpingPerRpm: 0.016 },
    inertia: 0.3,
    engineBrake: 120,
  },
  // Stalls (full throttle, wheels held) at about 2000 rpm.
  converter: { capacity: 120, stallRatio: 1.15, couplingPoint: 0.8 },
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
  openDiffLeak: 0.1,
  crawling: {
    diffLockMaxKmh: 5,
    frontLockSteering: 0.85,
    forwardKmh: 6,
    reverseKmh: 5,
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
  holdBrakeForce: 13500,
  hillStartHold: 1.2,
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
