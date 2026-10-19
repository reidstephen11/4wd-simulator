import type { VehicleTuning } from './vehicle';

/**
 * Land Rover 110 "Perentie" General Service soft top, as Les Hiddins drove in the first
 * Bush Tucker Man series: 110 in (2.794 m) wheelbase, 1.486 m track, 7.50R16 tyres,
 * coil springs, the Australian Army's 3.9 L Isuzu 4BD1 diesel, the LT95A four-speed
 * gearbox with its two-speed transfer case and 3.54 axles. Same local frame as the
 * short-wheelbase 4WD: x right, y up, z back, origin 0.12 m above the parked hubs.
 */
const R = 0.4;
const HALF_TRACK = 0.743;
const HALF_BASE = 1.397;
const MOUNT_Y = 0.32;

export const perentieTuning: VehicleTuning = {
  id: 'perentie',
  name: 'Land Rover 110 Perentie',
  // About 2.15 t with crew and gear; the diesel and bull bar put a little more on the front.
  // The centre of mass is about 0.78 m off the ground: it rolls over in a full-lock turn
  // at 60 km/h, as the short-wheelbase 4WD does, but not at 50.
  mass: 2150,
  com: { x: 0, y: 0.26, z: -0.06 },
  inertia: { x: 3800, y: 4100, z: 1020 },
  wheelRadius: R,
  wheelWidth: 0.21,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Long-travel coils: 0.12 m sag, 0.15 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.27,
  springStiffness: 20.4,
  damperCompression: 1.6,
  damperRelaxation: 2.4,
  maxSuspensionForce: 60000,
  bodyBoxes: [
    // Galvanised ladder chassis rails and the transfer case, as drawn.
    { cx: -0.43, cy: 0.03, cz: 0.08, hx: 0.05, hy: 0.09, hz: 2.02 },
    { cx: 0.43, cy: 0.03, cz: 0.08, hx: 0.05, hy: 0.09, hz: 2.02 },
    { cx: 0.08, cy: -0.02, cz: -0.25, hx: 0.2, hy: 0.09, hz: 0.3 },
    // Seat box and floor between the wheel arches, engine bay, rear tub.
    { cx: 0, cy: 0.17, cz: 0.15, hx: 0.6, hy: 0.06, hz: 2.05 },
    { cx: 0, cy: 0.42, cz: -0.32, hx: 0.86, hy: 0.32, hz: 0.5 },
    { cx: 0, cy: 0.45, cz: -1.42, hx: 0.6, hy: 0.24, hz: 0.6 },
    { cx: 0, cy: 0.45, cz: 1.38, hx: 0.6, hy: 0.28, hz: 0.98 },
    // Bull bar over the bumper, the rear crossmember with its pintle hook, the spare wheel
    // slung under the rear floor, and the canvas tilt.
    { cx: 0, cy: 0.3, cz: -2.16, hx: 0.86, hy: 0.36, hz: 0.1 },
    { cx: 0, cy: 0.02, cz: 2.35, hx: 0.76, hy: 0.07, hz: 0.1 },
    { cx: 0, cy: 0.03, cz: 1.94, hx: 0.4, hy: 0.1, hz: 0.4 },
    { cx: 0, cy: 1.06, cz: 0.75, hx: 0.84, hy: 0.42, hz: 1.55 },
  ],
  bumpRadius: 0.25,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 150,

  engine: {
    // 3.9 L four-cylinder diesel: idles slowly, peak torque low down, governed at 3600.
    idleRpm: 700,
    redlineRpm: 3600,
    torqueCurve: [
      [600, 150],
      [1000, 205],
      [1500, 238],
      [1900, 245],
      [2400, 238],
      [3000, 220],
      [3400, 200],
      [3600, 182],
      [3800, 40],
    ],
    airflow: 900000,
    // Settles the idle at 700 rpm against the friction below.
    idleAir: 0.024,
    throttleCurve: 1.3,
    // Holds about 680 rpm against the drive's drag when stopped in gear.
    idleGovernor: 0.18,
    idleDroop: 60,
    // A diesel has no throttle plate, so there's little pumping loss and engine braking.
    friction: { base: 18, perRpm: 0.012, pumpingPerRpm: 0.006 },
    inertia: 0.45,
    engineBrake: 140,
  },
  // The game drives the gears itself; this coupling stands in for the clutch.
  converter: { capacity: 90, stallRatio: 1.25, couplingPoint: 0.8 },
  gearbox: {
    ratios: [4.069, 2.448, 1.505, 1.0],
    reverse: 3.664,
    finalDrive: 3.54,
    efficiency: 0.85,
    upshiftRpm: { light: 1900, full: 3300 },
    downshiftRpm: { light: 1050, full: 1900 },
    shiftTime: 0.55,
  },
  ranges: {
    high: { ratio: 1.174, topSpeedKmh: 105, reverseTopKmh: 18 },
    low: { ratio: 3.32, topSpeedKmh: 30, reverseTopKmh: 10 },
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
  // Early 110s had no anti-roll bars; this is the coils' and bushes' own roll stiffness.
  antiRoll: { front: 6500, rear: 4000 },
  longitudinalGrip: 0.95,
  brakeForce: 16500,
  brakeFrontBias: 0.6,
  handbrakeForce: 6500,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 16500,
  hillStartHold: 1.2,
  dragArea: 1.9,
  steering: {
    maxAngleDeg: 31,
    minAngleDeg: 8,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // Air cleaner intake behind the left wing's side vent.
  intakeHeight: 0.95,
  intake: { x: -0.66, y: 0.95 - R - 0.12, z: -1.02 },
  winchMount: { x: 0, y: 0.06, z: -2.25 },
  towPoint: { x: 0, y: 0.0, z: 2.4 },
};
