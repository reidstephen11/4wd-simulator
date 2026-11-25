import type { StuckVehicleDef } from './stuckVehicle';

/**
 * Someone bogged just off the track who doesn't have to be helped: winch them out and they
 * hand over what they can spare. Placed by how far along a track they are and which side,
 * nose to the track, so they come out towards it.
 */
export interface StrandedDef extends Omit<StuckVehicleDef, 'x' | 'z' | 'headingDeg'> {
  /** The track they slid off. */
  track: string;
  /** How far along it (0 = its first point, 1 = its last). */
  at: number;
  side: 'left' | 'right';
  /** How far from the track's centre line they sit (m). */
  off: number;
  /** What they give you once they're out. */
  reward: { jerryCans?: number; plugs?: number; spares?: number };
}

/** Where a stranded vehicle sits beside its track's centre line. */
export function strandedPose(
  def: StrandedDef,
  points: readonly (readonly [number, number])[],
): StuckVehicleDef {
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const s = Math.min(1, Math.max(0, def.at)) * cum[cum.length - 1];
  let i = 1;
  while (i < points.length - 1 && cum[i] < s) i++;
  const [ax, az] = points[i - 1];
  const [bx, bz] = points[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / seg;
  const dx = (bx - ax) / seg;
  const dz = (bz - az) / seg;
  // Right of the direction of travel is (-dz, dx) with north = -z and east = +x.
  const sign = def.side === 'right' ? 1 : -1;
  const nx = -dz * sign;
  const nz = dx * sign;
  // Facing back to the track: heading 0 = north (-z), 90 = east (+x).
  const headingDeg = (Math.atan2(-nx, nz) * 180) / Math.PI;
  const { id, name, sink, freeAfter, breakout, drag } = def;
  return {
    id,
    name,
    sink,
    freeAfter,
    breakout,
    drag,
    x: ax + (bx - ax) * t + nx * def.off,
    z: az + (bz - az) * t + nz * def.off,
    headingDeg,
  };
}
