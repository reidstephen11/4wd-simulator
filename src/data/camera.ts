/** Chase camera tuning (SPEC §8). */
export const cameraTuning = {
  fov: 60,
  near: 0.25,
  /** Default follow distance (m); scroll / D-pad adjusts within min..max. */
  distance: 7.5,
  minDistance: 4.5,
  maxDistance: 16,
  zoomStep: 0.8,
  /** Height above the look target (m) at default distance. */
  height: 2.1,
  /** Look at this point above the vehicle origin. */
  targetHeight: 1.0,
  /** Look this far ahead of the vehicle. */
  lookAhead: 1.5,
  /** Heading follow rate (1/s): lower = more lag. */
  yawRate: 2.6,
  positionRate: 7,
  /** Radians of orbit per mouse pixel. */
  dragSensitivity: 0.006,
  /** Orbit easing rate (1/s), including returning behind the vehicle. */
  orbitRate: 12,
  minElevation: (5 * Math.PI) / 180,
  maxElevation: (78 * Math.PI) / 180,
  /** Extra distance at speed (fraction of distance at `speedRef`). */
  speedPullback: 0.3,
  speedRef: 22,
  /** Extra height on steep slopes (m at 30°). */
  slopeLift: 1.2,
  /** Distance multiplier when crawling. */
  crawlCloser: 0.88,
  crawlSpeed: 2.5,
  /** Keep this far from blocking geometry (m). */
  clearance: 0.45,
  /** After being pushed in by an obstacle, ease back out at this rate (1/s). */
  unblockRate: 2.2,
  /** Vertical follow rate of the look target (1/s): smooths bumps on rough tracks. */
  targetHeightRate: 9,
  groundClearance: 0.6,
};
