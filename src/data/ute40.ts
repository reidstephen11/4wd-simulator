import type { VehicleTuning } from './vehicle';
import { vehicleTuning } from './vehicle';

/**
 * A 40 Series cab-chassis ute: the game's short-wheelbase 40 (the same front, cab, 4.2 L
 * petrol six and three-speed automatic) on the HJ47's 2,950 mm "super long" chassis with a
 * steel farm tray behind the single cab, built up like a Cape York farm truck: a bull bar
 * with a winch and three spotlights, a snorkel, a UHF aerial, a headboard with the high-lift
 * jack, the tarped load and the second spare on the tray. Same local frame as the 40: x
 * right, y up, z back, origin at mid-wheelbase 0.12 m above the parked hubs (the ground is
 * 0.5 m below it). The cab is the 40's cab moved forward with the front axle, so every cab
 * height is the 40's and every cab z is the 40's plus `UTE_CAB_SHIFT`.
 * Sources and the owner's look reference: reference/vehicles/landcruiser-45-ute/SOURCES.md.
 */
const R = 0.38;
const HALF_TRACK = 0.725;
/** Half the HJ47's 2.95 m wheelbase. */
const HALF_BASE = 1.475;
const MOUNT_Y = 0.32;
/** How far forward of the ute's origin the 40 Series cab (built in its own frame) sits. */
export const UTE_CAB_SHIFT = -(HALF_BASE - 1.15);

export const ute40Tuning: VehicleTuning = {
  ...vehicleTuning,
  id: 'ute40',
  name: '40 Series ute',
  // About 1.75 t at the kerb with the tray; 1.9 t with the driver, the bar, the winch, two
  // spares and the load under the tarp. Longer and heavier than the 40, so it pitches and
  // yaws more slowly.
  mass: 1900,
  com: { x: 0, y: 0.3, z: 0.12 },
  inertia: { x: 4600, y: 5000, z: 860 },
  wheelRadius: R,
  wheels: [
    { x: -HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: HALF_TRACK, y: MOUNT_Y, z: -HALF_BASE, front: true },
    { x: -HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
    { x: HALF_TRACK, y: MOUNT_Y, z: HALF_BASE, front: false },
  ],
  maxSuspensionForce: 55000,
  bodyBoxes: [
    // The long chassis rails and the transmission.
    { cx: -0.43, cy: 0.02, cz: 0.5, hx: 0.05, hy: 0.08, hz: 2.3 },
    { cx: 0.43, cy: 0.02, cz: 0.5, hx: 0.05, hy: 0.08, hz: 2.3 },
    { cx: 0, cy: 0.015, cz: -0.555, hx: 0.19, hy: 0.075, hz: 0.325 },
    // The cab: its floor, the doors between the front wheels and the tray, the engine and
    // the roof.
    { cx: 0, cy: 0.13, cz: -0.3, hx: 0.58, hy: 0.06, hz: 0.6 },
    { cx: 0, cy: 0.47, cz: -0.17, hx: 0.8, hy: 0.34, hz: 0.47 },
    { cx: 0, cy: 0.7, cz: -1.555, hx: 0.58, hy: 0.2, hz: 0.61 },
    { cx: 0, cy: 1.19, cz: -0.17, hx: 0.76, hy: 0.5, hz: 0.47 },
    // The tray with its sides, the headboard and the load under the tarp.
    { cx: 0, cy: 0.52, cz: 1.6, hx: 0.9, hy: 0.14, hz: 1.2 },
    { cx: 0, cy: 1.1, cz: 0.42, hx: 0.88, hy: 0.55, hz: 0.04 },
    { cx: 0.32, cy: 0.82, cz: 1.0, hx: 0.52, hy: 0.2, hz: 0.55 },
    // Bull bar, rear bar and the spare slung under the tray.
    { cx: 0, cy: 0.3, cz: -2.3, hx: 0.92, hy: 0.3, hz: 0.12 },
    { cx: 0, cy: 0.22, cz: 2.85, hx: 0.9, hy: 0.06, hz: 0.07 },
    { cx: 0, cy: 0.1, cz: 2.25, hx: 0.4, hy: 0.11, hz: 0.4 },
  ],
  bodyKnockImpulse: 140,
  antiRoll: { front: 8500, rear: 6000 },
  brakeForce: 15000,
  holdBrakeForce: 15000,
  dragArea: 1.9,
  // The snorkel's head beside the left screen pillar, 1.62 m off the ground.
  intakeHeight: 1.62,
  intake: { x: -0.84, y: 1.62 - 0.5, z: -0.42 + UTE_CAB_SHIFT },
  winchMount: { x: 0, y: 0.28, z: -2.0 + UTE_CAB_SHIFT },
  towPoint: { x: 0, y: 0.05, z: 2.9 },
};
