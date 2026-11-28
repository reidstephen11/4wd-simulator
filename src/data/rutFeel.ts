/**
 * How a rut feels under a wheel (4WD Simulator v0.31). Only where a level hands the vehicles
 * a rut field (`VehicleEnv.ruts`); in Over the Cape nothing does, and it drives as it always
 * has. A wheel in a rut sits lower, drags a little more, and is pulled back into the rut when
 * it tries to climb out sideways.
 */
export const rutFeel = {
  /** The depth of a full rut (m): the rut store's `maxDepth`. */
  fullDepth: 0.08,
  /** Extra rolling resistance in a full-depth rut, as a share of the wheel's load. */
  drag: 0.07,
  /** The sideways pull back into a rut with a full-depth edge, as a share of the wheel's load. */
  hold: 0.2,
  /** How far to each side of the wheel the ground is felt for that edge (m). */
  reach: 0.2,
  /** Seconds a wheel takes to settle into a rut, and the pull to build. */
  settle: 0.12,
  /** Below this speed (m/s) the pull fades out: a standing car is not pushed sideways. */
  pullFromSpeed: 0.8,
};
