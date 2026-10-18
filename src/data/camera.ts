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

export const cameraPresets = {
  follow: { label: 'Follow', yaw: 0, distance: 7.5, height: 2.1, targetHeight: 1, lookAhead: 1.5 },
  frontLeft: {
    label: 'Front left',
    yaw: -Math.PI * 0.75,
    distance: 4.8,
    height: 1.15,
    targetHeight: 0.2,
    lookAhead: 0.6,
  },
  frontRight: {
    label: 'Front right',
    yaw: Math.PI * 0.75,
    distance: 4.8,
    height: 1.15,
    targetHeight: 0.2,
    lookAhead: 0.6,
  },
  rear: { label: 'Rear close', yaw: 0, distance: 4.8, height: 1.25, targetHeight: 0.3, lookAhead: 0 },
  /** From the driver's seat (see `cockpit`); the other values are unused. */
  cockpit: { label: 'Driver', yaw: 0, distance: 0, height: 0, targetHeight: 0, lookAhead: 0 },
} as const;

/** Driver's-seat view: eye position in the vehicle frame (right-hand drive), look limits, near plane. */
export const cockpit = {
  eye: { x: 0.38, y: 1.24, z: 0.3 },
  /** Looking down a little shows the bonnet and the ground ahead. */
  pitch: -0.12,
  maxYaw: 2.4,
  maxPitch: 1.0,
  near: 0.05,
};

export type CameraPreset = keyof typeof cameraPresets;
export const cameraPresetOrder: readonly CameraPreset[] = [
  'follow',
  'frontLeft',
  'frontRight',
  'rear',
  'cockpit',
];
