import { patrolTuning } from './patrol';
import type { VehicleTuning } from './vehicle';
import type { CabinLayout } from './vehicles';

/**
 * Sooty MkII-inspired 80 Series. The recovered model's 2.85 m wheelbase, 35-inch
 * tyres and three-inch lift now have their own simulation and collision envelope.
 * Engine output and loaded mass are game estimates, not Sooty's measured dyno data.
 * Australian factory fuel capacity: 95 L main + 50 L sub-tank. Sources in reference/.
 */
export const sooty80Tuning: VehicleTuning = {
  ...patrolTuning,
  id: 'sooty80',
  transfer: 'fullTime',
  name: '80 Series — Sooty MkII',
  mass: 2800,
  com: { x: 0, y: 0.24, z: -0.06 },
  inertia: { x: 5600, y: 5800, z: 1500 },
  wheelRadius: 0.4445,
  wheelWidth: 0.315,
  wheels: patrolTuning.wheels.map((w) => ({ ...w, x: Math.sign(w.x) * 0.835, z: Math.sign(w.z) * 1.425 })),
  suspensionRestLength: 0.636,
  suspensionTravel: 0.23,
  maxSuspensionForce: 78000,
  bodyBoxes: [
    { cx: -0.31, cy: 0.05, cz: -1.43, hx: 0.045, hy: 0.09, hz: 0.67 },
    { cx: 0.31, cy: 0.05, cz: -1.43, hx: 0.045, hy: 0.09, hz: 0.67 },
    { cx: -0.43, cy: 0, cz: 0.82, hx: 0.045, hy: 0.09, hz: 1.48 },
    { cx: 0.43, cy: 0, cz: 0.82, hx: 0.045, hy: 0.09, hz: 1.48 },
    { cx: 0, cy: -0.025, cz: -0.25, hx: 0.18, hy: 0.095, hz: 0.355 },
    { cx: 0, cy: 0.3, cz: -1.5, hx: 0.35, hy: 0.2, hz: 0.55 },
    { cx: 0, cy: 0.42, cz: 0, hx: 0.9, hy: 0.38, hz: 0.86 },
    { cx: 0, cy: 0.62, cz: 1.43, hx: 0.78, hy: 0.13, hz: 0.57 },
    { cx: 0, cy: 0.45, cz: 2.12, hx: 0.88, hy: 0.4, hz: 0.18 },
    { cx: 0, cy: 1.02, cz: 0.8, hx: 0.8, hy: 0.28, hz: 1.2 },
    { cx: 0, cy: 0.35, cz: -2.23, hx: 1.01, hy: 0.25, hz: 0.1 },
    { cx: 0, cy: 0.17, cz: 2.4, hx: 0.94, hy: 0.08, hz: 0.1 },
    { cx: 0.43, cy: 0.75, cz: 2.69, hx: 0.4445, hy: 0.4445, hz: 0.17 },
  ],
  engine: {
    ...patrolTuning.engine,
    // Rebuilt 1HD-T turbo diesel six; a conservative tuned curve for the game.
    torqueCurve: [
      [600, 210],
      [1000, 300],
      [1400, 420],
      [1800, 500],
      [2600, 500],
      [3200, 440],
      [3800, 365],
      [4100, 300],
      [4300, 40],
    ],
    airflow: 1850000,
    idleAir: 0.012,
    fuel: { tankLitres: 145, idleLitresPerHour: 1.0, efficiency: 0.38, energyMJPerLitre: 38.6 },
  },
  gearbox: {
    ...patrolTuning.gearbox,
    // H151F-style five-speed with axle gearing shortened for the 35-inch tyres.
    ratios: [4.529, 2.464, 1.49, 1, 0.881],
    reverse: 4.313,
    finalDrive: 4.3,
    upshiftRpm: { light: 1900, full: 3600 },
  },
  ranges: {
    high: { ratio: 1, topSpeedKmh: 130, reverseTopKmh: 18 },
    low: { ratio: 2.488, topSpeedKmh: 30, reverseTopKmh: 10 },
  },
  brakeForce: 23000,
  holdBrakeForce: 23000,
  dragArea: 2.2,
  steering: { ...patrolTuning.steering, maxAngleDeg: 34 },
  intakeHeight: 2.0585,
  intake: { x: 0.955, y: 1.418, z: -0.256 },
  winchMount: { x: 0, y: 0.22, z: -2.3 },
  towPoint: { x: 0, y: 0.1, z: 2.55 },
};

/** Independent cab data avoids changing the Patrol when selecting the new 80. */
export const sooty80Cabin: CabinLayout = {
  eye: { x: 0.42, y: 1.12, z: 0.17 },
  pitch: -0.16,
  dialY: 0.77,
  dialZ: -0.45,
  dials: {
    speed: { x: 0.5, radius: 0.058, max: 180, major: 20, minor: 10 },
    rpm: { x: 0.34, radius: 0.058, max: 5000, major: 1000, minor: 500 },
    oil: { x: 0.21, radius: 0.032, max: 1, major: 0.5, minor: 0.25 },
  },
  lamps: { xs: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55], y: 0.7, z: -0.44 },
  handbrake: {
    kind: 'lever',
    base: { x: 0.19, y: 0.31, z: 0.26 },
    tip: { x: 0.19, y: 0.47, z: 0.12 },
    travel: 0.6,
  },
  steeringWheel: {
    centre: { x: 0.43, y: 0.79, z: -0.22 },
    columnBase: { x: 0.43, y: 0.51, z: -0.55 },
    radius: 0.19,
    ratio: 17,
    spokes: 4,
  },
};
