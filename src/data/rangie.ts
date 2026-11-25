import type { VehicleTuning } from './vehicle';
import type { CabinLayout } from './vehicles';

/**
 * An Australian-delivered early-1980s two-door Range Rover: the original body before the 1986
 * facelift, the 3.5 L Rover V8 on carburettors (92.5 kW, 258 Nm), the LT77 five-speed with the
 * LT230 transfer (full-time four-wheel drive with a centre diff lock, 3.32 low range), 3.54
 * axles, coil springs on both live axles and discs all round. 2.54 m wheelbase, 1.486 m track,
 * 205 R16 tyres. Same local frame as the other vehicles: x right, y up, z back, origin 0.12 m
 * above the parked hubs, so the ground is about 0.495 m below it.
 * Photographs and dimensions: reference/vehicles/range-rover-two-door/SOURCES.md.
 */
const R = 0.375;
const TRACK = 0.743;
const HALF_BASE = 1.27;
const MOUNT_Y = 0.32;

export const rangieTuning: VehicleTuning = {
  id: 'rangie',
  transfer: 'fullTime',
  name: 'Range Rover two-door',
  // About 1.76 t at the kerb; with two aboard, a full tank, the bull bar and winch, the rack,
  // a second spare and the gear about 2.15 t. A low, wide car: its centre of mass sits about
  // 0.70 m off the ground.
  mass: 2150,
  com: { x: 0, y: 0.2, z: -0.05 },
  inertia: { x: 3600, y: 3900, z: 900 },
  wheelRadius: R,
  wheelWidth: 0.21,
  wheels: [
    { x: -TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Long, soft coils at both ends: 0.13 m sag and 0.14 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.27,
  suspensionTravel: 0.27,
  springStiffness: 17.5,
  damperCompression: 1.6,
  damperRelaxation: 2.4,
  maxSuspensionForce: 60000,
  bodyBoxes: [
    // Box-section chassis rails, and the gearbox with its transfer case.
    { cx: -0.45, cy: -0.03, cz: 0.15, hx: 0.04, hy: 0.075, hz: 2.15 },
    { cx: 0.45, cy: -0.03, cz: 0.15, hx: 0.04, hy: 0.075, hz: 2.15 },
    { cx: 0.02, cy: -0.07, cz: -0.3, hx: 0.17, hy: 0.1, hz: 0.36 },
    // Engine bay between the front wheels, the wings over them, and the sump.
    { cx: 0, cy: 0.33, cz: -1.3, hx: 0.62, hy: 0.25, hz: 0.72 },
    { cx: 0, cy: 0.48, cz: -1.3, hx: 0.86, hy: 0.1, hz: 0.72 },
    { cx: 0, cy: -0.06, cz: -1.5, hx: 0.15, hy: 0.08, hz: 0.25 },
    // The doors and sills, the floor between the rear wheels, the body above the wheels to
    // the roof, and the rear quarters behind them.
    { cx: 0, cy: 0.3, cz: 0.0, hx: 0.86, hy: 0.22, hz: 0.65 },
    { cx: 0, cy: 0.25, cz: 1.3, hx: 0.52, hy: 0.2, hz: 0.5 },
    { cx: 0, cy: 0.85, cz: 0.85, hx: 0.85, hy: 0.42, hz: 1.4 },
    { cx: 0, cy: 0.4, cz: 2.05, hx: 0.85, hy: 0.3, hz: 0.22 },
    // Bull bar, the rear bar with its tow ball, and the roof rack with its load.
    { cx: 0, cy: 0.3, cz: -2.3, hx: 0.9, hy: 0.3, hz: 0.16 },
    { cx: 0, cy: 0.07, cz: 2.35, hx: 0.9, hy: 0.06, hz: 0.07 },
    { cx: 0, cy: 1.4, cz: 1.0, hx: 0.72, hy: 0.16, hz: 1.05 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 150,

  engine: {
    // The Rover V8 on twin SUs: a soft 750 idle, pulling cleanly to 5000.
    idleRpm: 750,
    crankSeconds: 1.0,
    crankRpm: 180,
    redlineRpm: 5000,
    torqueCurve: [
      [600, 150],
      [1000, 200],
      [1500, 235],
      [2000, 250],
      [2500, 258],
      [3000, 255],
      [3500, 245],
      [4000, 228],
      [4500, 205],
      [5000, 176],
      [5300, 110],
      [5600, 30],
    ],
    airflow: 1150000,
    idleAir: 0.052,
    throttleCurve: 1.5,
    idleGovernor: 0.08,
    idleDroop: 150,
    friction: { base: 16, perRpm: 0.01, pumpingPerRpm: 0.017 },
    inertia: 0.32,
    engineBrake: 130,
    // The 86 L tank under the load floor. Sources: reference/vehicles/range-rover-two-door/SOURCES.md.
    fuel: { tankLitres: 86, idleLitresPerHour: 1.3, efficiency: 0.27, energyMJPerLitre: 34.2 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 115, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    // LT77 five-speed.
    ratios: [3.65, 2.18, 1.44, 1.0, 0.79],
    reverse: 3.82,
    finalDrive: 3.54,
    efficiency: 0.86,
    upshiftRpm: { light: 2200, full: 4600 },
    downshiftRpm: { light: 1200, full: 2400 },
    shiftTime: 0.5,
  },
  ranges: {
    high: { ratio: 1.192, topSpeedKmh: 150, reverseTopKmh: 20 },
    low: { ratio: 3.32, topSpeedKmh: 45, reverseTopKmh: 12 },
  },
  openDiffLeak: 0.1,
  crawling: {
    diffLockMaxKmh: 5,
    frontLockSteering: 0.85,
    forwardKmh: 5,
    reverseKmh: 4,
    speedGain: 3,
    brakeGain: 1.1,
    extraDroop: 0.05,
    antiRollScale: 0.2,
    damperCompression: 2.0,
    damperRelaxation: 2.8,
  },
  lateralGrip: 0.9,
  rollTorqueScale: 1.0,
  // No anti-roll bars on the early cars: the coils' own roll stiffness, softer than a 60's.
  antiRoll: { front: 7500, rear: 5500 },
  longitudinalGrip: 0.95,
  brakeForce: 17500,
  brakeFrontBias: 0.62,
  handbrakeForce: 6500,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 17500,
  hillStartHold: 1.2,
  dragArea: 1.9,
  steering: {
    maxAngleDeg: 33,
    minAngleDeg: 7,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // The air cleaner sits on top of the V8 under the bonnet, behind the right headlamp.
  intakeHeight: 0.98,
  intake: { x: 0.3, y: 0.98 - R - 0.12, z: -1.6 },
  winchMount: { x: 0, y: 0.1, z: -2.46 },
  towPoint: { x: 0, y: 0.0, z: 2.52 },
};

/**
 * The two-door's cab: a low seat behind a long, flat bonnet and a raked screen, with the
 * square instrument binnacle of the early dash in front of the driver, a two-spoke wheel and
 * the transmission handbrake on the tunnel.
 */
export const rangieCabin: CabinLayout = {
  eye: { x: 0.4, y: 1.05, z: 0.08 },
  pitch: -0.12,
  dialY: 0.78,
  dialZ: -0.4,
  dials: {
    speed: { x: 0.5, radius: 0.066, max: 200, major: 20, minor: 10 },
    rpm: { x: 0.3, radius: 0.066, max: 6000, major: 1000, minor: 500 },
    oil: { x: 0.66, radius: 0.03, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.26, 0.31, 0.36, 0.41, 0.46, 0.51, 0.56], y: 0.685, z: -0.395 },
  // The transmission handbrake lever on the tunnel, left of the driver.
  handbrake: {
    kind: 'lever',
    base: { x: 0.14, y: 0.42, z: -0.06 },
    tip: { x: 0.14, y: 0.62, z: -0.22 },
    travel: 0.55,
  },
  steeringWheel: {
    centre: { x: 0.4, y: 0.82, z: -0.24 },
    columnBase: { x: 0.4, y: 0.6, z: -0.5 },
    radius: 0.2,
    // Power steering, about 1¾ turns to full lock.
    ratio: 18,
    spokes: 2,
  },
};
