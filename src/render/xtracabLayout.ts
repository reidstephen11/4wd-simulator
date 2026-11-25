/**
 * The SR5 Xtra Cab's main stations, shared by its body, its barwork and its cabin (vehicle
 * frame: x right, y up, z back, origin at mid-wheelbase 0.12 m above the parked hubs).
 * Where each comes from: reference/vehicles/hilux-sr5-xtracab-1985/SOURCES.md.
 */
/** Half the sheet metal's width (1.62 m); the flares reach the published 1.69 m. */
export const SIDE = 0.81;
/** The nose skin. */
export const F = -2.04;
/** Half the 2.85 m wheelbase. */
export const AXLE = 1.425;
/** The bed: its front wall, the tailgate's skin, its rail, floor and inner walls. */
export const BED = { front: 0.535, back: 2.49, rail: 0.745, floor: 0.335, inner: 0.72 };
/** The bumper tubes: their radius, the front pair's centre line and heights, and the rear pair's. */
export const TUBE = { r: 0.038, front: F - 0.17, rear: BED.back + 0.13, high: 0.275, low: 0.105 };
/** The roll bar's front hoop: where it stands in the bed and how high and wide it is. */
export const HOOP = { z: BED.front + 0.14, top: 1.215, half: 0.6, r: 0.038 };

/** Lens centres of the four round lamps on the roll bar and the two rectangular ones on the front hoop. */
export const XTRACAB_DRIVING_LAMPS = [
  ...[-0.42, -0.14, 0.14, 0.42].map((x) => ({ x, y: HOOP.top + 0.135, z: HOOP.z - 0.06 })),
  ...[-0.105, 0.105].map((x) => ({ x, y: 0.392, z: TUBE.front - 0.05 })),
];
