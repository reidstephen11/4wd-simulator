import type { VehicleTuning } from './vehicle';
import type { CabinLayout } from './vehicles';

/**
 * Nissan MQ Patrol short-wheelbase hardtop as sold in Australia in 1980–83 (the 160 series
 * before the 1983 MK facelift): the SD33 3.3 L indirect-injection diesel six (70 kW at
 * 3600 rpm, 216 Nm at 1800), the four-speed, a part-time two-speed transfer and leaf
 * springs on both live axles. 2.35 m wheelbase, 7.50R16 tyres; the 1.40 m track is read off
 * the photographs (not published). Same local frame as the other vehicles: x right, y up,
 * z back, origin 0.12 m above the parked hubs, so the ground is about 0.52 m below it.
 * Photographs and dimensions: reference/vehicles/nissan-mq-patrol/SOURCES.md.
 */
const R = 0.4;
const HALF_TRACK = 0.7;
const HALF_BASE = 1.175;
const MOUNT_Y = 0.32;

export const mqTuning: VehicleTuning = {
  id: 'mq',
  transfer: 'partTime',
  name: 'MQ Patrol hardtop',
  // About 1.8 t at the kerb; with two aboard, a full tank, the bull bar and winch, the rack,
  // a second spare and the gear about 2.15 t. Short and tall: the centre of mass sits about
  // 0.76 m off the ground.
  mass: 2150,
  com: { x: 0, y: 0.24, z: -0.05 },
  inertia: { x: 3300, y: 3600, z: 900 },
  wheelRadius: R,
  wheelWidth: 0.21,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Leaf springs at both ends: 0.12 m sag and 0.12 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.24,
  springStiffness: 20.4,
  damperCompression: 1.7,
  damperRelaxation: 2.5,
  maxSuspensionForce: 60000,
  bodyBoxes: [
    // Ladder chassis rails, and the gearbox with its transfer case.
    { cx: -0.42, cy: -0.03, cz: 0.1, hx: 0.04, hy: 0.075, hz: 1.95 },
    { cx: 0.42, cy: -0.03, cz: 0.1, hx: 0.04, hy: 0.075, hz: 1.95 },
    { cx: 0.02, cy: -0.07, cz: -0.3, hx: 0.17, hy: 0.1, hz: 0.36 },
    // Engine bay between the front wheels, the guards over them, and the sump.
    { cx: 0, cy: 0.4, cz: -1.2, hx: 0.6, hy: 0.3, hz: 0.6 },
    { cx: 0, cy: 0.52, cz: -1.2, hx: 0.82, hy: 0.1, hz: 0.6 },
    { cx: 0, cy: -0.06, cz: -1.4, hx: 0.15, hy: 0.08, hz: 0.25 },
    // The doors and sills, the floor between the rear wheels, the body above the wheels to
    // the roof, and the rear corners behind them.
    { cx: 0, cy: 0.25, cz: 0.0, hx: 0.8, hy: 0.25, hz: 0.6 },
    { cx: 0, cy: 0.22, cz: 1.2, hx: 0.5, hy: 0.2, hz: 0.5 },
    { cx: 0, cy: 0.85, cz: 0.72, hx: 0.8, hy: 0.42, hz: 1.36 },
    { cx: 0, cy: 0.3, cz: 1.85, hx: 0.8, hy: 0.2, hz: 0.22 },
    // The spare on its swing-away carrier behind the rear door (MQ_SPARE in mqGear.ts).
    { cx: 0.22, cy: 0.56, cz: 2.37, hx: 0.4, hy: 0.4, hz: 0.15 },
    // Bull bar, the rear bar with its tow hitch, and the roof rack with its load.
    { cx: 0, cy: 0.2, cz: -2.0, hx: 0.9, hy: 0.3, hz: 0.14 },
    { cx: 0, cy: 0.0, cz: 2.22, hx: 0.88, hy: 0.075, hz: 0.07 },
    { cx: 0, cy: 1.5, cz: 0.95, hx: 0.72, hy: 0.16, hz: 1.05 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 150,

  engine: {
    // SD33: a slow, clattery indirect-injection idle at 650, governed a little past 4000.
    idleRpm: 650,
    crankSeconds: 1.6,
    crankRpm: 150,
    redlineRpm: 3900,
    torqueCurve: [
      [600, 140],
      [1000, 185],
      [1400, 208],
      [1800, 216],
      [2200, 213],
      [2600, 206],
      [3000, 198],
      [3600, 186],
      [4000, 150],
      [4200, 30],
    ],
    airflow: 900000,
    idleAir: 0.026,
    throttleCurve: 1.3,
    idleGovernor: 0.2,
    idleDroop: 60,
    // A diesel has no throttle plate, so there's little pumping loss and engine braking.
    friction: { base: 19, perRpm: 0.013, pumpingPerRpm: 0.007 },
    inertia: 0.5,
    engineBrake: 125,
    // Tank size not published; 80 L assumed (SOURCES.md). Sources: docs/FUEL.md.
    fuel: { tankLitres: 80, idleLitresPerHour: 1.0, efficiency: 0.35, energyMJPerLitre: 38.6 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 80, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    // The four-speed (enthusiast figures, unverified).
    ratios: [3.592, 2.246, 1.415, 1.0],
    reverse: 3.657,
    finalDrive: 4.375,
    efficiency: 0.85,
    upshiftRpm: { light: 1800, full: 3400 },
    downshiftRpm: { light: 1000, full: 1900 },
    shiftTime: 0.55,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 115, reverseTopKmh: 18 },
    low: { ratio: 2.0, topSpeedKmh: 35, reverseTopKmh: 10 },
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
  antiRoll: { front: 9000, rear: 6000 },
  longitudinalGrip: 0.95,
  brakeForce: 17000,
  brakeFrontBias: 0.62,
  handbrakeForce: 6500,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 17000,
  hillStartHold: 1.2,
  dragArea: 2.0,
  steering: {
    maxAngleDeg: 33,
    minAngleDeg: 7,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // The air cleaner sits on top of the engine behind the grille, drawing from under the bonnet.
  intakeHeight: 0.9,
  intake: { x: 0.45, y: 0.9 - R - 0.12, z: -1.5 },
  winchMount: { x: 0, y: 0.04, z: -2.16 },
  towPoint: { x: 0, y: 0.0, z: 2.36 },
};

/**
 * The MQ's cab: upright behind a near-vertical screen and a flat bonnet, with a hooded
 * rectangular cluster of two round dials behind a two-spoke wheel.
 */
export const mqCabin: CabinLayout = {
  eye: { x: 0.4, y: 1.1, z: 0.08 },
  pitch: -0.14,
  dialY: 0.8,
  dialZ: -0.5,
  dials: {
    speed: { x: 0.5, radius: 0.056, max: 160, major: 20, minor: 10 },
    rpm: { x: 0.3, radius: 0.056, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.64, radius: 0.03, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55], y: 0.715, z: -0.495 },
  // The handbrake lever on the floor beside the driver's seat.
  handbrake: {
    kind: 'lever',
    base: { x: 0.14, y: 0.4, z: -0.02 },
    tip: { x: 0.14, y: 0.58, z: -0.2 },
    travel: 0.55,
  },
  steeringWheel: {
    centre: { x: 0.4, y: 0.84, z: -0.3 },
    columnBase: { x: 0.4, y: 0.62, z: -0.6 },
    radius: 0.2,
    // Recirculating ball without assistance on the base cars: about two turns to full lock.
    ratio: 22,
    spokes: 2,
  },
};
