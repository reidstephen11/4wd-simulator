import type { VehicleTuning } from './vehicle';

/**
 * Toyota LandCruiser 79 Series single cab (VDJ79), built up hard for the bush: the 4.5 L
 * 1VD-FTV twin-turbo diesel V8 tuned to about 200 kW and 750 Nm, a 4 inch lift with the
 * rear leaf springs swapped for coils, 37×12.5R17 mud-terrain tyres on spacers, 4.3 axle
 * gears to turn them, a steel bar with a winch, a snorkel, an alloy tray with a canopy,
 * one spare on the canopy's rear door and a second on its roof rack. 3.18 m wheelbase, 1.6 m track over the
 * spacers, the five-speed manual with a 2.488 low range, and the factory 130 L tank.
 * Same local frame as the other vehicles: x right, y up, z back, origin 0.12 m above the
 * parked hubs, so the ground is about 0.59 m below it.
 */
const R = 0.47;
const HALF_TRACK = 0.8;
const HALF_BASE = 1.59;
const MOUNT_Y = 0.34;

/** The 4 inch lift: how far the body and cab sit above a standard 70 Series'. */
export const LC79_CAB_LIFT = 0.1;

export const lc79Tuning: VehicleTuning = {
  id: 'lc79',
  transfer: 'partTime',
  autoHubs: true,
  name: 'LC79 V8',
  // About 2.4 t empty; with two aboard, the bar, winch, tray, canopy, water, gear and a
  // full tank about 3 t. The lift and the big tyres put the centre of mass about 0.86 m
  // off the ground, but the wide track holds it up in a full-lock turn at 50 km/h.
  mass: 3000,
  com: { x: 0, y: 0.27, z: -0.12 },
  inertia: { x: 6200, y: 6600, z: 1450 },
  wheelRadius: R,
  wheelWidth: 0.32,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Long-travel coils at both ends: 0.12 m sag and 0.2 m of bump travel above that.
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.32,
  springStiffness: 21,
  damperCompression: 1.7,
  damperRelaxation: 2.5,
  maxSuspensionForce: 82000,
  bodyBoxes: [
    // Ladder chassis rails and the gearbox with its transfer case.
    { cx: -0.43, cy: 0.0, cz: 0.2, hx: 0.05, hy: 0.09, hz: 2.55 },
    { cx: 0.43, cy: 0.0, cz: 0.2, hx: 0.05, hy: 0.09, hz: 2.55 },
    { cx: 0.04, cy: -0.02, cz: -0.45, hx: 0.21, hy: 0.09, hz: 0.36 },
    // Engine bay between the front wheels and the sump under it.
    { cx: 0, cy: 0.52, cz: -1.68, hx: 0.62, hy: 0.34, hz: 0.66 },
    { cx: 0, cy: -0.02, cz: -1.78, hx: 0.3, hy: 0.08, hz: 0.26 },
    // The cab: the floor between the wheels, then full width up to the roof.
    { cx: 0, cy: 0.36, cz: -0.25, hx: 0.66, hy: 0.2, hz: 0.76 },
    { cx: 0, cy: 1.08, cz: -0.25, hx: 0.86, hy: 0.5, hz: 0.76 },
    // The tray over the rear wheels and the canopy on it. The tray hangs out a long way
    // behind the rear axle, so it drags its tail over a sharp crest.
    { cx: 0, cy: 0.5, cz: 1.79, hx: 0.93, hy: 0.14, hz: 1.17 },
    { cx: 0, cy: 1.1, cz: 1.77, hx: 0.9, hy: 0.46, hz: 0.81 },
    // The spare on the canopy's rear door, inside the end of the tray.
    { cx: 0, cy: 1.17, cz: 2.8, hx: 0.47, hy: 0.47, hz: 0.17 },
    // Bull bar with the winch, and the rear bar with its tow hitch.
    { cx: 0, cy: 0.38, cz: -2.53, hx: 0.94, hy: 0.32, hz: 0.1 },
    { cx: 0, cy: 0.12, cz: 2.98, hx: 0.84, hy: 0.07, hz: 0.07 },
  ],
  bumpRadius: 0.27,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 180,

  engine: {
    // 1VD-FTV, tuned: 200 kW at 3400 rpm, 750 Nm from 1800 to 2600, cut at 4200.
    idleRpm: 680,
    crankSeconds: 1.1,
    crankRpm: 170,
    redlineRpm: 4100,
    torqueCurve: [
      [600, 300],
      [1000, 470],
      [1400, 650],
      [1800, 750],
      [2600, 750],
      [3200, 640],
      [3600, 560],
      [4000, 480],
      [4300, 60],
    ],
    airflow: 2600000,
    // Settles the idle at 680 rpm against the friction below.
    idleAir: 0.0145,
    throttleCurve: 1.35,
    idleGovernor: 0.2,
    idleDroop: 60,
    // A diesel has no throttle plate, so there's little pumping loss and engine braking.
    friction: { base: 30, perRpm: 0.018, pumpingPerRpm: 0.008 },
    inertia: 0.7,
    engineBrake: 190,
    // Toyota's VDJ79 single cab has 130 L as standard. Sources: docs/FUEL.md.
    fuel: { tankLitres: 130, idleLitresPerHour: 1.2, efficiency: 0.4, energyMJPerLitre: 38.6 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 82, stallRatio: 1.15, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    ratios: [4.313, 2.33, 1.436, 1.0, 0.838],
    reverse: 4.22,
    finalDrive: 4.3,
    efficiency: 0.86,
    upshiftRpm: { light: 1800, full: 3800 },
    downshiftRpm: { light: 1050, full: 2000 },
    shiftTime: 0.45,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 140, reverseTopKmh: 18 },
    low: { ratio: 2.488, topSpeedKmh: 32, reverseTopKmh: 10 },
  },
  openDiffLeak: 0.1,
  crawling: {
    diffLockMaxKmh: 5,
    frontLockSteering: 0.85,
    forwardKmh: 6,
    reverseKmh: 5,
    speedGain: 3,
    brakeGain: 1.1,
    extraDroop: 0.07,
    antiRollScale: 0.18,
    damperCompression: 2.1,
    damperRelaxation: 3,
  },
  // Soft mud-terrain tyres: a little less side grip on hard ground.
  lateralGrip: 0.88,
  rollTorqueScale: 1.0,
  antiRoll: { front: 11500, rear: 7500 },
  longitudinalGrip: 0.97,
  brakeForce: 23000,
  brakeFrontBias: 0.62,
  handbrakeForce: 8500,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 23000,
  hillStartHold: 1.2,
  // Tall and wide on the big tyres, with the canopy square to the wind.
  dragArea: 2.35,
  steering: {
    // The long wheelbase turns a wide circle.
    maxAngleDeg: 31,
    minAngleDeg: 7,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.3,
    keyboardReturnRate: 3.7,
    padRate: 7,
  },
  // Snorkel head beside the right windscreen pillar, a little above the roof.
  intakeHeight: 2.31,
  intake: { x: 0.93, y: 2.31 - R - 0.12, z: -0.85 },
  winchMount: { x: 0, y: 0.2, z: -2.62 },
  towPoint: { x: 0, y: 0.06, z: 3.12 },
};
