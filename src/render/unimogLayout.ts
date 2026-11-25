/**
 * Where the Unimog's parts stand (vehicle frame: x right, y up, z back, 1 unit = 1 m, the
 * origin mid-wheelbase 0.12 m above the parked hubs, so the ground is 0.68 m down).
 * Measured on reference/vehicles/unimog-ul1700l/side.jpg at 369 px/m (the hubs 1,420 px
 * apart for the 3,850 mm wheelbase): the windscreen pillar stands over the front axle,
 * the cab's lower front "cheeks" run forward beside the short bonnet to the grille, and
 * the tray's headboard is right behind the cab. The body, the tilt, the interior and the
 * physics boxes in src/data/unimog.ts all follow these.
 */
export const AXLE_Z = 1.925;

/** The grille plane: the front face of the cab's cheeks and the bonnet's front edge. */
export const NOSE = -2.66;

/** Front bumper: its centre, its front face, and the height of its centre line. */
export const BUMPER = { z: -2.86, face: -2.94, y: 0.3 };

/**
 * Bonnet top: its height at the nose and at the cowl, and the radius its shoulders and
 * nose edge round over. The cheeks share the same sloping top surface.
 */
export const BONNET = { front: 0.92, back: 1.11, round: 0.1 };

/** Bonnet top height at station z. */
export const bonnetTop = (z: number): number =>
  BONNET.front + ((BONNET.back - BONNET.front) * (z - NOSE)) / (CAB.front - NOSE);

/**
 * The cab: `front` is the cowl, where the screen's base stands; the screen pillars lean
 * back `lean` over the screen's height, so the roof starts at `front + lean`.
 */
export const CAB = {
  front: -2.0,
  back: -0.65,
  side: 1.12,
  floor: 0.54,
  waist: 1.19,
  roof: 1.76,
  lean: 0.15,
};

/** The cheeks' bottom edge ahead of the front wheel arch, and the arch's shape. */
export const CHEEK = { bottom: 0.4 };
export const ARCH = { halfLen: 0.62, top: 0.66, centreY: 0.06 };

/** Dropside tray. */
export const TRAY = { front: -0.58, back: 3.45, side: 1.15, floor: 0.7, top: 1.18 };

/** The spare, lying flat on its carrier under the tray's front on the right (its centre). */
export const UNDER_SPARE = { x: 0.66, y: -0.14, z: -0.44 };

/** The second spare on its carrier on the left dropside (its centre). */
export const UNIMOG_SIDE_SPARE = { x: -1.39, y: 0.95, z: 0.85 };
