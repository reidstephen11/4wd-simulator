import { perentieTuning } from './perentie';
import type { VehicleTuning } from './vehicle';

/**
 * The 1986 Camel Trophy Land Rover Ninety: a County station wagon on the 90 in (2.36 m)
 * wheelbase with the 1.486 m Land Rover track, 7.50R16 tyres, coil springs, the 2.5 L
 * naturally aspirated diesel, the LT77 five-speed gearbox, the LT230 transfer case and
 * 3.54 axles. The suspension, brakes and grip follow the Army 110 (perentie.ts), its
 * longer sister. A raised intake into the left wing breathes at about 2 m. Same local
 * frame as the other vehicles: origin 0.12 m above the parked hubs, x right, z back.
 * Body: src/render/camelBody.ts.
 */
const R = 0.405;
const HALF_TRACK = 0.743;
const HALF_BASE = 1.18;
const MOUNT_Y = 0.32;

export const camelTuning: VehicleTuning = {
  ...perentieTuning,
  id: 'camel',
  transfer: 'fullTime',
  name: 'Camel Trophy Land Rover 90',
  // About 1.9 t with the cage, rack, two spares, jerry cans and crew.
  mass: 1900,
  com: { x: 0, y: 0.28, z: -0.02 },
  inertia: { x: 2500, y: 2700, z: 900 },
  wheelRadius: R,
  wheelWidth: 0.205,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  bodyBoxes: [
    // Chassis rails, and the transfer case tucked up level with their bottoms (as drawn). The
    // body sits 0.12 m further back on its wheels since the November 2026 review, and these with it.
    { cx: -0.43, cy: 0.03, cz: 0.14, hx: 0.05, hy: 0.09, hz: 1.74 },
    { cx: 0.43, cy: 0.03, cz: 0.14, hx: 0.05, hy: 0.09, hz: 1.74 },
    { cx: 0.08, cy: 0.0, cz: -0.13, hx: 0.2, hy: 0.08, hz: 0.3 },
    // Floor and seat box, engine bay, rear body between the wheel boxes.
    { cx: 0, cy: 0.17, cz: 0.1, hx: 0.6, hy: 0.06, hz: 1.68 },
    { cx: 0, cy: 0.45, cz: -1.13, hx: 0.6, hy: 0.24, hz: 0.55 },
    { cx: 0, cy: 0.45, cz: 1.29, hx: 0.6, hy: 0.28, hz: 0.52 },
    // The station wagon's cabin and roof, the bull bar and the rear crossmember.
    { cx: 0, cy: 1.0, cz: 0.64, hx: 0.82, hy: 0.6, hz: 1.18 },
    { cx: 0, cy: 0.25, cz: -1.87, hx: 0.89, hy: 0.3, hz: 0.1 },
    { cx: 0, cy: 0.1, cz: 1.9, hx: 0.75, hy: 0.08, hz: 0.1 },
  ],

  engine: {
    ...perentieTuning.engine,
    // 2.5 L four-cylinder diesel, no turbo: about 50 kW at 4000 rpm and 155 Nm at 1800.
    idleRpm: 750,
    redlineRpm: 4200,
    torqueCurve: [
      [600, 95],
      [1000, 132],
      [1500, 150],
      [1800, 155],
      [2400, 150],
      [3200, 136],
      [4000, 119],
      [4200, 105],
      [4400, 25],
    ],
    airflow: 620000,
    idleAir: 0.026,
    inertia: 0.32,
    engineBrake: 110,
    // The Ninety's rear tank: 54.5 L. Sources: docs/FUEL.md.
    fuel: { tankLitres: 54.5, idleLitresPerHour: 0.6, efficiency: 0.37, energyMJPerLitre: 38.6 },
  },
  gearbox: {
    kind: 'manual',
    // LT77 five-speed.
    ratios: [3.585, 2.301, 1.507, 1.0, 0.831],
    reverse: 3.701,
    finalDrive: 3.54,
    efficiency: 0.85,
    upshiftRpm: { light: 2000, full: 3800 },
    downshiftRpm: { light: 1100, full: 2000 },
    shiftTime: 0.55,
  },
  ranges: {
    // LT230 transfer case: 1.667 high, 3.32 low.
    high: { ratio: 1.667, topSpeedKmh: 105, reverseTopKmh: 18 },
    low: { ratio: 3.32, topSpeedKmh: 30, reverseTopKmh: 10 },
  },
  antiRoll: { front: 6000, rear: 3800 },
  brakeForce: 15000,
  holdBrakeForce: 15000,
  handbrakeForce: 6000,
  dragArea: 1.95,
  steering: { ...perentieTuning.steering, maxAngleDeg: 33 },
  // The raised intake's head beside the left windscreen pillar (src/render/camelBody.ts).
  intakeHeight: 2.03,
  intake: { x: -0.915, y: 1.51, z: -0.47 },
  winchMount: { x: 0, y: 0.3, z: -2.0 },
  towPoint: { x: 0, y: 0.03, z: 1.96 },
  // A civilian tow jaw, not the Army's pintle hook: the No. 5 trailer's ring doesn't go on it.
  hitch: undefined,
};
