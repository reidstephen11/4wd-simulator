import type { VehicleTuning } from './vehicle';

/**
 * Toyota LandCruiser 75 Series Troop Carrier (HZJ75, 1990–99): the long, tall steel
 * wagon that is a common sight on Cape York trips. 2.98 m wheelbase, 1.42 m
 * front and 1.40 m rear track, 7.50R16 tyres, leaf springs on both solid axles, the
 * 4.2 L 1HZ diesel six (96 kW, 285 Nm), the H55F five-speed, a 2.488 low range and
 * 4.111 axles. Two fuel tanks: the 90 L main tank and a 90 L sub-tank. Same local frame
 * as the other vehicles: x right, y up, z back, origin 0.12 m above the parked hubs, so
 * the ground is about 0.52 m below it.
 */
const R = 0.4;
const FRONT_TRACK = 0.71;
const REAR_TRACK = 0.7;
const HALF_BASE = 1.49;
const MOUNT_Y = 0.32;

/** Physical capacity, independent of the episode's starting fill. Sources: docs/FUEL.md. */
export const TROOPY_SUB_TANK = 90;

/** Extra starting fuel for the game; the sub-tank need not start full. */
export const TROOPY_START_FUEL = 60;

export const troopyTuning: VehicleTuning = {
  id: 'troopy',
  transfer: 'partTime',
  name: 'Troop Carrier',
  // About 2.2 t empty; with two aboard, both tanks, the bull bar, winch, roof rack, a
  // second spare and the gear about 2.75 t. The roof rack and its load sit 2 m up, so the
  // centre of mass is about 0.8 m off the ground, the highest of them all: it rolls over in
  // a full-lock turn at 50 km/h (the others hold on to 60) and on a gentler side slope.
  mass: 2750,
  com: { x: 0, y: 0.28, z: -0.05 },
  inertia: { x: 5600, y: 5900, z: 1350 },
  wheelRadius: R,
  wheelWidth: 0.21,
  wheels: [
    { x: -FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Stiff, heavy-duty leaf springs: 0.12 m sag and 0.12 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.24,
  springStiffness: 20.4,
  damperCompression: 1.7,
  damperRelaxation: 2.5,
  maxSuspensionForce: 75000,
  bodyBoxes: [
    // Ladder chassis rails and the gearbox with its transfer case.
    { cx: -0.43, cy: -0.02, cz: 0.12, hx: 0.05, hy: 0.09, hz: 2.36 },
    { cx: 0.43, cy: -0.02, cz: 0.12, hx: 0.05, hy: 0.09, hz: 2.36 },
    { cx: 0.04, cy: -0.04, cz: -0.4, hx: 0.21, hy: 0.09, hz: 0.36 },
    // Engine bay between the front wheels and the sump under it.
    { cx: 0, cy: 0.36, cz: -1.57, hx: 0.6, hy: 0.28, hz: 0.55 },
    { cx: 0, cy: -0.04, cz: -1.75, hx: 0.3, hy: 0.08, hz: 0.26 },
    // The body from the cowl to the back doors: the floor between the wheels, then full
    // width from the tops of the wheel arches to the roof. Behind the rear wheels it hangs
    // low and long, so it drags its tail over a sharp crest.
    { cx: 0, cy: 0.3, cz: 0.82, hx: 0.6, hy: 0.2, hz: 1.78 },
    { cx: 0, cy: 1.03, cz: 0.82, hx: 0.84, hy: 0.53, hz: 1.78 },
    { cx: 0, cy: 0.3, cz: 2.3, hx: 0.84, hy: 0.2, hz: 0.3 },
    // Bull bar, the rear bar with its tow hitch, and the roof rack with its load.
    { cx: 0, cy: 0.33, cz: -2.27, hx: 0.88, hy: 0.3, hz: 0.08 },
    { cx: 0, cy: 0.05, cz: 2.66, hx: 0.84, hy: 0.07, hz: 0.07 },
    { cx: 0, cy: 1.72, cz: 1.4, hx: 0.8, hy: 0.15, hz: 1.02 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 170,

  engine: {
    // 4.2 L diesel six: a slow, smooth idle, broad torque from low down, governed at 4000.
    idleRpm: 700,
    crankSeconds: 1.4,
    crankRpm: 165,
    redlineRpm: 4400,
    torqueCurve: [
      [600, 170],
      [1000, 232],
      [1600, 268],
      [2200, 285],
      [2950, 278],
      [3650, 262],
      [4150, 240],
      [4400, 208],
      [4650, 39],
    ],
    airflow: 1150000,
    topEnd: { fromRpm: 2200, air: 0.107 },
    idleAir: 0.026,
    throttleCurve: 1.3,
    idleGovernor: 0.2,
    idleDroop: 60,
    // A diesel has no throttle plate, so there's little pumping loss and engine braking.
    friction: { base: 22, perRpm: 0.014, pumpingPerRpm: 0.007 },
    inertia: 0.55,
    engineBrake: 150,
    // Two factory 90 L tanks, counted as one by the fuel gauge.
    fuel: {
      tankLitres: 90 + TROOPY_SUB_TANK,
      idleLitresPerHour: 1.1,
      efficiency: 0.38,
      energyMJPerLitre: 38.6,
    },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 85, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    ratios: [4.925, 2.643, 1.519, 1.0, 0.862],
    reverse: 4.925,
    finalDrive: 4.111,
    efficiency: 0.85,
    upshiftRpm: { light: 1900, full: 4050 },
    downshiftRpm: { light: 1050, full: 2000 },
    shiftTime: 0.55,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 110, reverseTopKmh: 18 },
    low: { ratio: 2.488, topSpeedKmh: 30, reverseTopKmh: 10 },
  },
  openDiffLeak: 0.1,
  crawling: {
    diffLockMaxKmh: 5,
    frontLockSteering: 0.85,
    forwardKmh: 6,
    reverseKmh: 5,
    speedGain: 3,
    brakeGain: 1.1,
    extraDroop: 0.05,
    antiRollScale: 0.18,
    damperCompression: 2.1,
    damperRelaxation: 3,
  },
  lateralGrip: 0.9,
  rollTorqueScale: 1.0,
  // A front anti-roll bar; at the back, the leaf springs' own roll stiffness.
  antiRoll: { front: 11000, rear: 7000 },
  longitudinalGrip: 0.95,
  brakeForce: 20000,
  brakeFrontBias: 0.62,
  handbrakeForce: 8000,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 20000,
  hillStartHold: 1.2,
  // Tall and square: the most frontal area of the five.
  dragArea: 2.25,
  steering: {
    // The long wheelbase turns a wide circle.
    maxAngleDeg: 30,
    minAngleDeg: 7,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.3,
    keyboardReturnRate: 3.7,
    padRate: 7,
  },
  // The air cleaner draws from behind the left headlamp, under the wing.
  intakeHeight: 0.95,
  intake: { x: -0.62, y: 0.95 - R - 0.12, z: -1.75 },
  winchMount: { x: 0, y: 0.12, z: -2.33 },
  towPoint: { x: 0, y: 0.0, z: 2.75 },
};
