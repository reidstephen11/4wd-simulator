/** Recovery tools and light damage tuning (SPEC §6.4, §7). */
export const winchTuning = {
  /** Cable on the drum (m). */
  cableLength: 30,
  /** Winch in/out speed (m/s). */
  speed: 1.0,
  minLength: 1.2,
  /** Pull cap as a multiple of vehicle weight. */
  maxForceFactor: 1.5,
  /** Cable spring (N/m) and damper (N·s/m) when taut. */
  stiffness: 60000,
  damping: 6000,
  /** Extra slack when hooking up (m). */
  slackOnAttach: 0.3,
  /** Anchors behind the vehicle count as this much further away for quick attach. */
  behindPenalty: 2.5,
};

export const plankTuning = {
  count: 2,
  length: 2.4,
  width: 0.3,
  thickness: 0.07,
  /** Collision width: a little wider than drawn so a ray-cast wheel doesn't slip off the edge. */
  colliderWidth: 0.42,
  mass: 45,
  friction: 1.3,
  /** Placement distance ahead of the front wheels (m) and angle range. */
  minDistance: 0.0,
  maxDistance: 4,
  defaultDistance: 0.6,
  maxAngleDeg: 25,
  adjustSpeed: 1.5,
  angleSpeedDeg: 30,
  pickupRange: 4,
  recallDistance: 150,
};

export const jackTuning = {
  tiltDeg: 60,
  stillSpeed: 0.6,
  /** Seconds tipped and nearly still before the prompt shows. */
  waitTime: 2,
  /** Seconds the player holds J. */
  holdTime: 1.5,
  /** Length of the righting animation (s). */
  animTime: 1.2,
  /** How far sideways the car ends up (m). */
  sideOffset: 1.0,
};

export const floodTuning = {
  /** Engine sputters from here (s under water). */
  sputterAt: 5,
  stallAt: 10,
  /** Intake must be clear this long before a restart. */
  restartDryTime: 20,
  /** Timer counts down at this fraction of real time when the intake is clear. */
  recoverRate: 0.25,
};

export const wearTuning = {
  /** Velocity change in one step that dents the body (m/s). */
  dentThreshold: 3.5,
  dentPerMs: 0.018,
  dentMaxDepth: 0.11,
  maxDents: 28,
  /** Water washes dirt off at this rate per metre of depth (per second), down to `washFloor`. */
  washRate: 0.08,
  washFloor: 0.25,
  /** Speed (m/s) at which dirt builds at the full surface rate. */
  dirtSpeedRef: 8,
};
