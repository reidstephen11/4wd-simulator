import type { VehicleTuning } from './vehicle';

/**
 * 1985 Toyota Pickup (Hilux) SR5 Xtracab 4x4, North American and left-hand drive: the last
 * year with a leaf-sprung solid front axle and the first with the reworked injected 22R-E.
 * Toyota's 1985 Trucks brochure gives the 4x4 SR5 Xtracab a 112.2 in (2.85 m) wheelbase,
 * 56.3 in front and 55.5 in rear tread, 4.100 axles, a 1.000/2.276 transfer case, a 19.3 US
 * gal (73 L) tank and 116 hp at 4,800 rpm with 140 lb ft at 2,800. The five-speed is the W56
 * (3.954, 2.141, 1.384, 1.000, 0.850). This one stands at stock height on 31×10.50R15 tyres
 * with tubular bumpers, a roll bar and driving lamps. Sources and what could not be
 * confirmed: reference/vehicles/hilux-sr5-xtracab-1985/SOURCES.md. Same local frame as the
 * other vehicles: x right, y up, z back, origin 0.12 m above the parked hubs, so the ground
 * is about 0.51 m below it.
 */
/** 31×10.50R15: 787 mm across, 267 mm wide. */
const R = 0.394;
const FRONT_TRACK = 0.715;
const REAR_TRACK = 0.705;
const HALF_BASE = 1.425;
const MOUNT_Y = 0.32;

export const xtracabTuning: VehicleTuning = {
  id: 'xtracab',
  transfer: 'partTime',
  name: 'Hilux SR5 Xtra Cab',
  // The brochure's gross weight less its payload is 3,400 lb (1,540 kg) empty; with two
  // aboard, the tube bumpers, roll bar, lamps, winch, recovery boards and a full tank about
  // 1.85 t. The engine sits over the front axle and the tub is empty, so about 55% is on the
  // front. Nothing is carried above the tub's rails, so the centre of mass is about 0.72 m
  // off the ground.
  mass: 1850,
  com: { x: 0, y: 0.205, z: -0.14 },
  inertia: { x: 3850, y: 4100, z: 780 },
  wheelRadius: R,
  wheelWidth: 0.265,
  wheels: [
    { x: -FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: FRONT_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: REAR_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  // Stiff leaf springs on both solid axles: 0.12 m of sag, then 0.09 m of bump travel before
  // the 31 inch tyres would reach the stock wheel openings (0.11 m on the earlier Hilux).
  suspensionRestLength: MOUNT_Y + 0.24,
  suspensionTravel: 0.21,
  springStiffness: 20.4,
  damperCompression: 1.8,
  damperRelaxation: 2.7,
  maxSuspensionForce: 50000,
  bodyBoxes: [
    // Ladder chassis rails and the gearbox with its transfer case.
    { cx: -0.42, cy: -0.02, cz: 0.2, hx: 0.05, hy: 0.08, hz: 2.2 },
    { cx: 0.42, cy: -0.02, cz: 0.2, hx: 0.05, hy: 0.08, hz: 2.2 },
    { cx: 0.04, cy: -0.04, cz: -0.3, hx: 0.2, hy: 0.08, hz: 0.34 },
    // Engine bay between the front wheels and the sump under it.
    { cx: 0, cy: 0.4, cz: -1.5, hx: 0.5, hy: 0.28, hz: 0.55 },
    { cx: 0, cy: -0.05, cz: -1.7, hx: 0.28, hy: 0.08, hz: 0.24 },
    // The cab, from the sills to the roof.
    { cx: 0, cy: 0.4, cz: -0.2, hx: 0.8, hy: 0.33, hz: 0.72 },
    { cx: 0, cy: 0.97, cz: -0.02, hx: 0.74, hy: 0.25, hz: 0.52 },
    // The tub: between the rear wheels, full width ahead of and behind them, and its top
    // over them.
    { cx: 0, cy: 0.4, cz: 1.5, hx: 0.56, hy: 0.3, hz: 0.98 },
    { cx: 0, cy: 0.42, cz: 0.74, hx: 0.8, hy: 0.28, hz: 0.2 },
    { cx: 0, cy: 0.42, cz: 2.22, hx: 0.8, hy: 0.28, hz: 0.27 },
    { cx: 0, cy: 0.62, cz: 1.5, hx: 0.8, hy: 0.1, hz: 0.98 },
    // The tube bumpers front and rear, the spare slung under the tub, and the roll bar.
    { cx: 0, cy: 0.2, cz: -2.2, hx: 0.84, hy: 0.14, hz: 0.07 },
    { cx: 0, cy: 0.12, cz: 2.6, hx: 0.82, hy: 0.09, hz: 0.07 },
    { cx: 0, cy: 0.0, cz: 2.02, hx: 0.39, hy: 0.17, hz: 0.39 },
    { cx: 0, cy: 1.05, cz: 0.72, hx: 0.72, hy: 0.25, hz: 0.06 },
  ],
  bumpRadius: 0.22,
  bodyFriction: 0.45,
  wheelImpactSpeed: 1.2,
  bodyKnockImpulse: 120,

  engine: {
    // 22R-E, 2,366 cc, injected: 116 hp (86.5 kW) at 4,800 rpm and 140 lb ft (190 Nm) at
    // 2,800 in the brochure. The 5,500 rpm limit is the tachometer's red zone as other
    // sources give it, not a brochure figure.
    idleRpm: 750,
    crankSeconds: 0.8,
    crankRpm: 220,
    redlineRpm: 5500,
    torqueCurve: [
      [600, 112],
      [1200, 152],
      [2000, 178],
      [2800, 190],
      [3600, 186],
      [4400, 178],
      [4800, 172],
      [5200, 158],
      [5500, 144],
      [6000, 30],
    ],
    airflow: 960000,
    idleAir: 0.016,
    throttleCurve: 1.5,
    idleGovernor: 0.14,
    idleDroop: 80,
    friction: { base: 9, perRpm: 0.005, pumpingPerRpm: 0.008 },
    inertia: 0.19,
    engineBrake: 105,
    // 19.3 US gal in the brochure for the 4x4 Xtracab. Sources: docs/FUEL.md.
    fuel: { tankLitres: 73, idleLitresPerHour: 0.8, efficiency: 0.31, energyMJPerLitre: 34.2 },
  },
  // Automatic mode's coupling: the game changes gear itself and this stands in for the clutch.
  converter: { capacity: 150, stallRatio: 1.2, couplingPoint: 0.8 },
  gearbox: {
    kind: 'manual',
    ratios: [3.954, 2.141, 1.384, 1.0, 0.85],
    reverse: 4.091,
    finalDrive: 4.1,
    efficiency: 0.86,
    upshiftRpm: { light: 2300, full: 5000 },
    downshiftRpm: { light: 1300, full: 2800 },
    shiftTime: 0.45,
  },
  ranges: {
    high: { ratio: 1.0, topSpeedKmh: 135, reverseTopKmh: 18 },
    low: { ratio: 2.276, topSpeedKmh: 32, reverseTopKmh: 10 },
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
  // Wide all-terrain radials: a little more grip than the earlier Hilux's cross-plies.
  lateralGrip: 0.92,
  rollTorqueScale: 1.0,
  // A front stabiliser bar (in the brochure) and the leaf springs' own roll stiffness.
  antiRoll: { front: 8500, rear: 4500 },
  longitudinalGrip: 0.96,
  brakeForce: 15500,
  brakeFrontBias: 0.62,
  handbrakeForce: 6000,
  handbrakeSideGrip: 0.45,
  holdBrakeForce: 15500,
  hillStartHold: 1.2,
  dragArea: 1.6,
  steering: {
    // A 42 ft (12.8 m) turning circle on the 2.85 m wheelbase.
    maxAngleDeg: 29,
    minAngleDeg: 8,
    minAngleSpeed: 26,
    keyboardRiseRate: 2.4,
    keyboardReturnRate: 3.8,
    padRate: 7,
  },
  // No snorkel: the air cleaner's snout is behind the left headlamp, at about its height.
  intakeHeight: 0.98,
  intake: { x: -0.45, y: 0.98 - R - 0.12, z: -1.8 },
  winchMount: { x: 0, y: 0.19, z: -2.25 },
  towPoint: { x: 0, y: -0.03, z: 2.62 },
};
