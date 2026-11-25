import type { BufferGeometry } from 'three';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The blend widths (m) the ground material was made with (`TrackEdgeStyle`). */
export interface GroundShadeStyle {
  paintBlend: number;
  patchBlend: number;
}

/** A terrain chunk's geometry as `TerrainMesh.buildGeometry` made it. */
export interface Chunk {
  geo: BufferGeometry;
  /** World position of its min corner, its size and grid step (m). */
  x0: number;
  z0: number;
  size: number;
  step: number;
}

/** Reads a chunk's vertex attributes at a world point, interpolated over its triangle as the GPU does. */
function vertexReader(c: Chunk, x: number, z: number): (name: string) => number[] {
  const cells = c.size / c.step,
    row = cells + 1;
  const fx = (x - c.x0) / c.step,
    fz = (z - c.z0) / c.step;
  const i = Math.min(cells - 1, Math.max(0, Math.floor(fx))),
    j = Math.min(cells - 1, Math.max(0, Math.floor(fz)));
  const u = fx - i,
    v = fz - j;
  const a = j * row + i;
  // The cell's triangles as the mesh splits it: (a, a+row, a+1) and (a+1, a+row, a+row+1).
  const weights: [number, number][] =
    u + v <= 1
      ? [
          [a, 1 - u - v],
          [a + 1, u],
          [a + row, v],
        ]
      : [
          [a + 1, 1 - v],
          [a + row, 1 - u],
          [a + row + 1, u + v - 1],
        ];
  const read = (name: string) => {
    const attr = c.geo.getAttribute(name);
    const out = new Array<number>(attr.itemSize).fill(0);
    for (const [k, w] of weights)
      for (let n = 0; n < attr.itemSize; n++) out[n] += attr.getComponent(k, n) * w;
    return out;
  };
  return read;
}

/**
 * How much of a point is covered by track paint and by a clay bank (0 to 1 each), as the
 * ground shader blends them (without its fine noise), from a terrain chunk's geometry.
 */
export function edgeCover(c: Chunk, x: number, z: number, style: GroundShadeStyle): [number, number] {
  const read = vertexReader(c, x, z);
  const [left, end] = read('trackEdge');
  const e = c.geo.getAttribute('trackRight') ? Math.max(left, read('trackRight')[0]) : left;
  const paint = 1 - smoothstep(end - style.paintBlend, end + style.paintBlend, e);
  const clay = read('clayBank');
  const right = c.geo.getAttribute('trackRight') ? read('trackRight')[0] : -Infinity;
  // Before v1.74 the attribute was the distance out from the bank itself.
  const bankDist = clay.length === 1 ? clay[0] : left >= right ? left - clay[0] : right - clay[1];
  const bank = 1 - smoothstep(-style.patchBlend, style.patchBlend, bankDist);
  return [paint, bank];
}
