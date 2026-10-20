import type { VehicleTuning } from './vehicle';

/**
 * Nissan GQ Patrol wagon, as set up for touring in the late 1980s and 90s: 2.97 m
 * wheelbase, 1.555 m track, coil springs on both solid axles, 31×10.5R15 tyres, the 4.2 L
 * TD42 six-cylinder diesel, the FS5R50A five-speed with a 2.02 low range and 4.11 axles,
 * plus a steel bull bar with a winch, a snorkel and a roof rack. Same local frame as the
 * other vehicles: x right, y up, z back, origin 0.12 m above the parked hubs.
 */
const R = 0.394;
const HALF_TRACK = 0.7775;
const HALF_BASE = 1.485;
const MOUNT_Y = 0.32;

export const patrolTuning: VehicleTuning = {
  id: 'patrol',
  name: 'GQ Patrol',
  // About 2.4 t with two people, fuel, a bull bar, winch and roof rack. The centre of
  // mass sits about 0.8 m up: high, but the wide track keeps it on its wheels in a
  // full-lock turn at 50 km/h.
  mass: 2400,
  com: { x: 0, y: 0.28, z: -0.08 },
  inertia: { x: 4600, y: 4800, z: 1300 },
  wheelRadius: R,
  wheelWidth: 0.265,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Long-travel coils front and rear: 0.12 m sag and 0.16 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.28,
  springStiffness: 20.4,
  damperCompression: 1.6,
  damperRelaxation: 2.4,
  maxSuspensionForce: 66000,
  bodyBoxes: [
    // Ladder chassis rails and the transfer case, as drawn.
    { cx: -0.47, cy: 0.02, cz: 0.04, hx: 0.05, hy: 0.09, hz: 2.2 },
    { cx: 0.47, cy: 0.02, cz: 0.04, hx: 0.05, hy: 0.09, hz: 2.2 },
    { cx: 0.06, cy: -0.03, cz: -0.2, hx: 0.21, hy: 0.09, hz: 0.32 },
    // Floor, the body between the wheel arches, the engine bay and the body beside and
    // behind the rear arches.
    { cx: 0, cy: 0.17, cz: 0.1, hx: 0.64, hy: 0.06, hz: 2.3 },
    { cx: 0, cy: 0.42, cz: -0.01, hx: 0.9, hy: 0.36, hz: 0.95 },
    { cx: 0, cy: 0.5, cz: -1.62, hx: 0.66, hy: 0.22, hz: 0.66 },
    { cx: 0, cy: 0.48, cz: 1.78, hx: 0.64, hy: 0.31, hz: 0.68 },
    // Wagon roof and glasshouse.
    { cx: 0, cy: 1.06, cz: 0.86, hx: 0.86, hy: 0.28, hz: 1.6 },
    // Bull bar with the winch, the rear bar, and the spare wheel on the rear door.
    { cx: 0, cy: 0.33, cz: -2.36, hx: 0.92, hy: 0.36, hz: 0.1 },
    { cx: 0, cy: 0.04, cz: 2.52, hx: 0.9, hy: 0.08, hz: 0.08 },
    { cx: -0.3, cy: 0.5, cz: 2.61, hx: 0.39, hy: 0.39, hz: 0.13 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 160,

  engine: {
    // TD42: 4.2 L six-cylinder diesel, no turbo. 85 kW at 4000 rpm, 264 Nm at 2000.
    idleRpm: 650,
    crankSeconds: 1.15,
    crankRpm: 160,
    redlineRpm: 4000,
    torqueCurve: [
      [600, 170],
      [1000, 228],
      [1500, 256],
      [2000, 264],
      [2600, 258],
      [3200, 240],
      [3800, 212],
      [4100, 196],
      [4300, 40],
    ],
    airflow: 1050000,
    // Settles the idle at 650 rpm against the friction below.
    idleAir: 0.021,
    throttleCurve: 1.3,
    idleGovernor: 0.18,
    idleDroop: 60,
    // No throttle plate on a diesel: little pumping loss and little engine braking.
    friction: { base: 22, perRpm: 0.013, pumpingPerRpm: 0.006 },
    inertia: 0.55,
    engineBrake: 150,
  },
  // The game drives the gears itself; this coupling stands in for the clutch.
  converter: { capacity: 95, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    ratios: [4.556, 2.625, 1.519, 1.0, 0.836],
    reverse: 4.991,
    finalDrive: 4.111,
    efficiency: 0.85,
    upshiftRpm: { light: 1900, full: 3600 },
    downshiftRpm: { light: 1050, full: 2000 },
    shiftTime: 0.5,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 125, reverseTopKmh: 18 },
    low: { ratio: 2.02, topSpeedKmh: 30, reverseTopKmh: 10 },
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
    damperCompression: 2,
    damperRelaxation: 2.9,
  },
  lateralGrip: 0.9,
  rollTorqueScale: 1.0,
  // Front and rear anti-roll bars.
  antiRoll: { front: 9000, rear: 5500 },
  longitudinalGrip: 0.95,
  brakeForce: 19000,
  brakeFrontBias: 0.62,
  handbrakeForce: 7000,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 19000,
  hillStartHold: 1.2,
  dragArea: 2.0,
  steering: {
    // Power steering; about a 12.4 m turning circle.
    maxAngleDeg: 33,
    minAngleDeg: 8,
    minAngleSpeed: 28,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // Snorkel head beside the left windscreen pillar, a little above the roof.
  intakeHeight: 1.95,
  intake: { x: -0.9, y: 1.95 - R - 0.12, z: -0.58 },
  winchMount: { x: 0, y: 0.1, z: -2.43 },
  towPoint: { x: 0, y: 0.02, z: 2.6 },
};
