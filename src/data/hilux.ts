import type { VehicleTuning } from './vehicle';

/**
 * Early Toyota Hilux 4WD single cab with the factory styleside tub, as sold in Australia
 * from 1979 to 1983 (the RN36 and RN46): 2.8 m wheelbase, 1.43 m front and 1.40 m rear
 * track, 7.00-16 tyres, leaf springs on both solid axles, the 2.0 L 18R petrol four
 * (about 65 kW and 150 Nm), a four-speed manual, the RF1A transfer case (1.0 and 2.28)
 * and 4.375 axles. Same local frame as the other vehicles: x right, y up, z back, origin
 * 0.12 m above the parked hubs, so the ground is 0.52 m below it.
 */
/** 7.00-16 tyres, about 0.80 m across. */
const R = 0.4;
const FRONT_TRACK = 0.715;
const REAR_TRACK = 0.7;
const HALF_BASE = 1.4;
const MOUNT_Y = 0.32;

export const hiluxTuning: VehicleTuning = {
  id: 'hilux',
  transfer: 'partTime',
  name: 'Hilux single cab',
  // About 1.43 t empty; with two aboard, the bull bar, winch, rack and gear about 1.65 t.
  // The engine sits over the front axle and the tub is light, so about 57% is on the front.
  // The centre of mass is about 0.78 m off the ground (the rack and its load sit high): it
  // rolls over in a full-lock turn at 60 km/h, as the other vehicles do, but not at 50. Its
  // height above the origin came down 25 mm with the bigger tyres (v1.30) to keep that.
  mass: 1650,
  com: { x: 0, y: 0.255, z: -0.2 },
  inertia: { x: 3300, y: 3550, z: 700 },
  wheelRadius: R,
  wheelWidth: 0.19,
  wheels: [
    { x: -FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Stiff leaf springs: 0.12 m sag and 0.11 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.23,
  springStiffness: 20.4,
  damperCompression: 1.8,
  damperRelaxation: 2.7,
  maxSuspensionForce: 45000,
  bodyBoxes: [
    // Ladder chassis rails, which kick up 0.155 m behind the cab (v2.09), and the gearbox with
    // its transfer case.
    { cx: -0.42, cy: -0.02, cz: -0.6, hx: 0.05, hy: 0.08, hz: 1.39 },
    { cx: 0.42, cy: -0.02, cz: -0.6, hx: 0.05, hy: 0.08, hz: 1.39 },
    { cx: -0.42, cy: 0.135, cz: 1.57, hx: 0.05, hy: 0.08, hz: 0.78 },
    { cx: 0.42, cy: 0.135, cz: 1.57, hx: 0.05, hy: 0.08, hz: 0.78 },
    { cx: 0.04, cy: -0.04, cz: -0.32, hx: 0.2, hy: 0.08, hz: 0.32 },
    // Engine bay between the front wheels and the sump under it.
    { cx: 0, cy: 0.32, cz: -1.53, hx: 0.5, hy: 0.28, hz: 0.6 },
    { cx: 0, cy: -0.05, cz: -1.72, hx: 0.28, hy: 0.08, hz: 0.24 },
    // The cab, from the sills to the waist and from the waist to the roof (v2.09: the waist is
    // 0.74 m up and the body 1.61 m wide).
    { cx: 0, cy: 0.37, cz: -0.28, hx: 0.8, hy: 0.37, hz: 0.64 },
    { cx: 0, cy: 0.99, cz: -0.14, hx: 0.74, hy: 0.26, hz: 0.5 },
    // The tub: between the rear wheels, full width ahead of and behind them, and its top
    // over them.
    { cx: 0, cy: 0.3, cz: 1.43, hx: 0.58, hy: 0.3, hz: 1.0 },
    { cx: 0, cy: 0.37, cz: 0.69, hx: 0.8, hy: 0.37, hz: 0.26 },
    { cx: 0, cy: 0.37, cz: 2.13, hx: 0.8, hy: 0.37, hz: 0.3 },
    { cx: 0, cy: 0.58, cz: 1.43, hx: 0.8, hy: 0.16, hz: 1.0 },
    // Bull bar, the rear step bumper, the spare slung under the tub, and the rack's top.
    { cx: 0, cy: 0.27, cz: -2.27, hx: 0.85, hy: 0.24, hz: 0.07 },
    { cx: 0, cy: 0.1, cz: 2.5, hx: 0.8, hy: 0.06, hz: 0.07 },
    { cx: 0, cy: -0.06, cz: 2.02, hx: 0.4, hy: 0.11, hz: 0.4 },
    { cx: 0, cy: 1.28, cz: 1.42, hx: 0.8, hy: 0.04, hz: 1.0 },
  ],
  bumpRadius: 0.22,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 110,

  engine: {
    // A 2.0 L single-cam four: idles quicker than the six, peak torque high up, revs to 5500.
    idleRpm: 750,
    crankSeconds: 0.85,
    crankRpm: 210,
    redlineRpm: 5500,
    torqueCurve: [
      [600, 85],
      [1200, 118],
      [2000, 136],
      [2800, 146],
      [3600, 150],
      [4400, 141],
      [5200, 120],
      [5500, 108],
      [6000, 30],
    ],
    airflow: 780000,
    idleAir: 0.018,
    throttleCurve: 1.5,
    idleGovernor: 0.12,
    idleDroop: 90,
    // About 40 Nm with the throttle closed at 2500 rpm, half the petrol six's.
    friction: { base: 8, perRpm: 0.005, pumpingPerRpm: 0.008 },
    inertia: 0.18,
    engineBrake: 100,
    // Toyota's 1979 RN46 brochure: 61 L. Sources: docs/FUEL.md.
    fuel: { tankLitres: 61, idleLitresPerHour: 0.8, efficiency: 0.3, energyMJPerLitre: 34.2 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 150, stallRatio: 1.2, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    ratios: [3.57, 2.06, 1.38, 1.0],
    reverse: 3.75,
    finalDrive: 4.375,
    efficiency: 0.86,
    upshiftRpm: { light: 2300, full: 5000 },
    downshiftRpm: { light: 1300, full: 2800 },
    shiftTime: 0.5,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 110, reverseTopKmh: 18 },
    low: { ratio: 2.28, topSpeedKmh: 30, reverseTopKmh: 10 },
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
  // No anti-roll bars: the leaf springs' own roll stiffness.
  antiRoll: { front: 7000, rear: 4500 },
  longitudinalGrip: 0.95,
  brakeForce: 14000,
  brakeFrontBias: 0.62,
  handbrakeForce: 5500,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 14000,
  hillStartHold: 1.2,
  dragArea: 1.55,
  steering: {
    maxAngleDeg: 31,
    minAngleDeg: 8,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // The air cleaner's snout faces forward behind the grille, at about headlamp height.
  intakeHeight: 0.85,
  intake: { x: 0.25, y: 0.85 - R - 0.12, z: -1.75 },
  winchMount: { x: 0, y: 0.1, z: -2.33 },
  towPoint: { x: 0, y: 0.02, z: 2.55 },
};
