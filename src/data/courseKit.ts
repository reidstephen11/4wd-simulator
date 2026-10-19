import type { PropDef, TrailStoneDef, XZ } from '../sim/world/mapTypes';
import { densify, pointAt, segmentDistance, type DensePolyline } from '../sim/world/polyline';

/**
 * Building blocks shared by the 4WD obstacles on Granite Spur and in Ironbark 4WD Park:
 * stones placed `at` metres along a track and `lateral` metres to its right, and signs
 * that find a clear spot beside a track's ends.
 */
export const boulder = (
  at: number,
  lateral: number,
  height: number,
  width: number,
  length = width,
  yawDeg = 0,
  base = 0,
): TrailStoneDef => ({ shape: 'boulder', at, lateral, height, width, length, yawDeg, base });

export const slab = (
  at: number,
  lateral: number,
  height: number,
  width: number,
  length: number,
  rollDeg = 0,
  yawDeg = 0,
): TrailStoneDef => ({ shape: 'slab', at, lateral, height, width, length, rollDeg, yawDeg });

/** Larger rocks just off the line, sunk `sink` metres into the banks, alternating sides. */
export const banks = (
  from: number,
  to: number,
  step: number,
  offset: number,
  size = 1,
  sink = 0.2,
): TrailStoneDef[] => {
  const out: TrailStoneDef[] = [];
  for (let at = from, k = 0; at <= to; at += step, k++) {
    const side = k % 2 ? 1 : -1;
    const h = (0.55 + ((k * 7) % 4) * 0.12) * size;
    out.push(boulder(at, side * (offset + (k % 3) * 0.15), h + sink, 1.2 * size, 1.5 * size, k * 37, -sink));
  }
  return out;
};

/**
 * A band of bedrock across the track: a riser at its downhill edge, then a tread flatter
 * than the hill that runs back into the slope.
 */
export const rockStep = (
  at: number,
  lateral: number,
  rise: number,
  width: number,
  depth: number,
  rollDeg = 0,
) => ({
  shape: 'ridge' as const,
  at,
  lateral,
  width,
  length: depth,
  height: rise,
  rollDeg,
  profile: [
    [-depth / 2, rise * 0.7],
    [-depth / 2 + 0.25, rise],
    [depth / 2, 0.04],
  ] as const,
});
/** Each tread runs back into the slope about 1.4 m for a 0.4 m riser. */
export const tread = (rise: number) => rise / 0.28 + 0.2;

/** Heading (degrees, 0 = north) of a direction along a polyline. */
export const headingOf = (p: { dx: number; dz: number }) => (Math.atan2(p.dx, -p.dz) * 180) / Math.PI;

/** A track centreline and how far its grading reaches either side. */
export interface GradedLine {
  poly: DensePolyline;
  reach: number;
}

export const gradedLine = (
  points: ReadonlyArray<readonly [number, number] | readonly [number, number, number]>,
  reach: number,
): GradedLine => ({
  poly: densify(
    points.map((p) => [p[0], p[1]] as XZ),
    1,
  ),
  reach,
});

/** True when (x, z) is more than `margin` metres outside every line's grading. */
export const clearOf = (lines: readonly GradedLine[], x: number, z: number, margin = 1.2) =>
  lines.every(({ poly, reach }) => {
    for (let k = 0; k + 1 < poly.count; k++)
      if (segmentDistance(x, z, poly.xs[k], poly.zs[k], poly.xs[k + 1], poly.zs[k + 1]).d < reach + margin)
        return false;
    return true;
  });

/**
 * A signpost at one end of a track facing the traffic arriving there, on the driver's
 * left if there is room, moved along and out until it is clear of every graded line.
 */
export function endSign(line: GradedLine, end: 0 | 1, text: string, lines: readonly GradedLine[]): PropDef {
  const { poly, reach } = line;
  for (let along = 1.5; ; along += 0.5)
    for (const side of end ? [1, -1] : [-1, 1])
      for (const out of [0.9, 1.6, 2.4, 3.2, 4.2]) {
        const p = pointAt(poly, end ? poly.length - along : along),
          off = side * (reach + out);
        const x = p.x - p.dz * off,
          z = p.z + p.dx * off;
        // On a hillside each post gets a small level pad dug into the slope.
        if (clearOf(lines, x, z) || along > 10)
          return {
            kind: 'signpost',
            x,
            z,
            headingDeg: (headingOf(p) + (end ? 0 : 180) + 360) % 360,
            text,
            flatten: 1.6,
          };
      }
}
