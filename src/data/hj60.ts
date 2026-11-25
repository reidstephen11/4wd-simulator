import type { VehicleTuning } from './vehicle';
import type { CabinLayout } from './vehicles';

/**
 * Toyota LandCruiser 60 Series wagon as sold in Australia in 1985–86: the HJ60 Standard with
 * its barn doors and split rims, and the 4.0 L 2H diesel six (76 kW at 3500 rpm, 241 Nm at 1800), the H55F five-speed, the
 * split-case transfer with its 1.959 low range and 4.111 full-floating axles. 2.73 m
 * wheelbase, 1.475 m front and 1.46 m rear track, 7.50R16 tyres, leaf springs on both solid
 * axles. Same local frame as the other vehicles: x right, y up, z back, origin 0.12 m above
 * the parked hubs, so the ground is about 0.52 m below it.
 * Photographs and dimensions: reference/vehicles/landcruiser-60/SOURCES.md.
 */
const R = 0.4;
const FRONT_TRACK = 0.7375;
const REAR_TRACK = 0.73;
const HALF_BASE = 1.365;
const MOUNT_Y = 0.32;

export const hj60Tuning: VehicleTuning = {
  id: 'hj60',
  transfer: 'partTime',
  name: '60 Series wagon',
  // About 2.0 t at the kerb; with two aboard, a full tank, the bull bar, the gutter rack, a
  // second spare and the gear about 2.4 t. Lower than the Troop Carrier and the rack rides
  // lower, so its centre of mass sits about 0.74 m off the ground.
  mass: 2400,
  com: { x: 0, y: 0.22, z: -0.08 },
  inertia: { x: 4300, y: 4700, z: 1000 },
  wheelRadius: R,
  wheelWidth: 0.21,
  wheels: [
    { x: -FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Leaf springs at both ends: 0.12 m sag and 0.12 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.24,
  springStiffness: 20.4,
  damperCompression: 1.7,
  damperRelaxation: 2.5,
  maxSuspensionForce: 65000,
  bodyBoxes: [
    // Ladder chassis rails, and the gearbox with its transfer case.
    { cx: -0.43, cy: -0.03, cz: 0.2, hx: 0.04, hy: 0.075, hz: 2.25 },
    { cx: 0.43, cy: -0.03, cz: 0.2, hx: 0.04, hy: 0.075, hz: 2.25 },
    { cx: 0.02, cy: -0.07, cz: -0.32, hx: 0.17, hy: 0.1, hz: 0.36 },
    // Engine bay between the front wheels, the guards over them, and the sump.
    { cx: 0, cy: 0.45, cz: -1.32, hx: 0.62, hy: 0.33, hz: 0.68 },
    { cx: 0, cy: 0.62, cz: -1.32, hx: 0.87, hy: 0.16, hz: 0.68 },
    { cx: 0, cy: -0.06, cz: -1.6, hx: 0.15, hy: 0.08, hz: 0.25 },
    // The doors and sills, the floor between the rear wheels, the body above the wheels to
    // the roof, and the rear quarters behind them.
    { cx: 0, cy: 0.25, cz: 0.1, hx: 0.86, hy: 0.25, hz: 0.7 },
    { cx: 0, cy: 0.25, cz: 1.45, hx: 0.52, hy: 0.22, hz: 0.5 },
    { cx: 0, cy: 0.85, cz: 0.97, hx: 0.86, hy: 0.38, hz: 1.53 },
    { cx: 0, cy: 0.3, cz: 2.25, hx: 0.86, hy: 0.2, hz: 0.3 },
    // The first spare slung under the back.
    { cx: 0, cy: -0.22, cz: 2.06, hx: 0.4, hy: 0.11, hz: 0.4 },
    // Bull bar, the rear bar with its tow hitch, and the roof rack with its load.
    { cx: 0, cy: 0.3, cz: -2.25, hx: 0.94, hy: 0.3, hz: 0.21 },
    { cx: 0, cy: 0.075, cz: 2.63, hx: 0.92, hy: 0.075, hz: 0.07 },
    { cx: 0, cy: 1.43, cz: 1.17, hx: 0.76, hy: 0.17, hz: 1.25 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 160,

  engine: {
    // 2H: a slow, clattery indirect-injection idle at 650, governed a little past 4000.
    idleRpm: 650,
    crankSeconds: 1.5,
    crankRpm: 155,
    redlineRpm: 3900,
    torqueCurve: [
      [600, 150],
      [1000, 205],
      [1400, 232],
      [1800, 241],
      [2400, 236],
      [3000, 224],
      [3500, 207],
      [3800, 188],
      [4000, 150],
      [4200, 30],
    ],
    airflow: 1000000,
    idleAir: 0.026,
    throttleCurve: 1.3,
    idleGovernor: 0.2,
    idleDroop: 60,
    // A diesel has no throttle plate, so there's little pumping loss and engine braking.
    friction: { base: 21, perRpm: 0.014, pumpingPerRpm: 0.007 },
    inertia: 0.55,
    engineBrake: 140,
    // The 90 L main tank under the floor. Sources: reference/vehicles/landcruiser-60/SOURCES.md.
    fuel: { tankLitres: 90, idleLitresPerHour: 1.1, efficiency: 0.35, energyMJPerLitre: 38.6 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 82, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    // H55F five-speed.
    ratios: [4.843, 2.619, 1.516, 1.0, 0.845],
    reverse: 4.843,
    finalDrive: 4.111,
    efficiency: 0.85,
    upshiftRpm: { light: 1800, full: 3500 },
    downshiftRpm: { light: 1000, full: 1900 },
    shiftTime: 0.55,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 120, reverseTopKmh: 18 },
    // The split-case transfer's low range is taller than the 70 Series' 2.488.
    low: { ratio: 1.959, topSpeedKmh: 35, reverseTopKmh: 10 },
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
  antiRoll: { front: 10000, rear: 6500 },
  longitudinalGrip: 0.95,
  brakeForce: 18000,
  brakeFrontBias: 0.62,
  handbrakeForce: 7000,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 18000,
  hillStartHold: 1.2,
  dragArea: 2.0,
  steering: {
    maxAngleDeg: 32,
    minAngleDeg: 7,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // The air cleaner draws from inside the right front guard, behind the headlamp.
  intakeHeight: 0.92,
  intake: { x: 0.62, y: 0.92 - R - 0.12, z: -1.75 },
  winchMount: { x: 0, y: 0.1, z: -2.44 },
  towPoint: { x: 0, y: 0.0, z: 2.77 },
};

/**
 * The 60's cab: the driver sits fairly upright behind a raked screen and a long bonnet that
 * slopes away, with the two big dials under a hood behind a two-spoke wheel.
 */
export const hj60Cabin: CabinLayout = {
  eye: { x: 0.42, y: 1.08, z: 0.1 },
  pitch: -0.13,
  dialY: 0.77,
  dialZ: -0.41,
  dials: {
    speed: { x: 0.54, radius: 0.056, max: 160, major: 20, minor: 10 },
    rpm: { x: 0.3, radius: 0.056, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.68, radius: 0.03, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.27, 0.32, 0.37, 0.42, 0.47, 0.52, 0.57], y: 0.685, z: -0.405 },
  // The umbrella-handle handbrake under the dash, left of the column.
  handbrake: {
    kind: 'pull',
    base: { x: 0.17, y: 0.58, z: -0.45 },
    tip: { x: 0.17, y: 0.57, z: -0.33 },
    travel: 0.1,
  },
  steeringWheel: {
    centre: { x: 0.42, y: 0.8, z: -0.25 },
    columnBase: { x: 0.42, y: 0.6, z: -0.52 },
    radius: 0.2,
    // Power steering, about 1¾ turns to full lock.
    ratio: 19,
    spokes: 2,
  },
};
