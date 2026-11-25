import { describe, expect, it } from 'vitest';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { buildWorld } from '../src/sim/world/world';
import { TerrainMesh } from '../src/render/terrainMesh';
import { edgeCover, type Chunk, type GroundShadeStyle } from './helpers/groundShade';

// v1.74: a track's edge and the clay banks beside it were drawn in a different place by each
// terrain detail level (the coarser chunks' vertices are 2, 4 and 8 m apart), so the road
// edge visibly changed shape as the player drove up to it, and the bank's edge was ragged
// at 1 m, a saw-tooth seen low and ahead. These sample the ground shader's blend (as
// tests/helpers/groundShade.ts works it out from each chunk's vertices) across every
// track's edges on Ironbark Creek (a map with clay banks, as the CREB map they were found
// on had) at every level.

const world = buildWorld(ironbarkMap);
const t = world.terrain;
const mesh = new TerrainMesh(t, 1);
// The blend widths in src/render/terrainMesh.ts.
const style: GroundShadeStyle = { paintBlend: 0.45, patchBlend: 0.3 };
/** Node size and grid step (m) of each level, as `TerrainMesh` builds them. */
const LEVELS = [
  [64, 1],
  [64, 2],
  [128, 4],
  [256, 8],
] as const;
const chunks = new Map<string, Chunk>();
function chunk(level: number, x: number, z: number): Chunk {
  const [size, step] = LEVELS[level];
  const ix = Math.floor((x + t.halfX) / size) * size,
    iz = Math.floor((z + t.halfZ) / size) * size;
  const key = `${level}:${ix}:${iz}`;
  let c = chunks.get(key);
  if (!c) {
    c = { geo: mesh.buildGeometry(ix, iz, size, step), x0: ix - t.halfX, z0: iz - t.halfZ, size, step };
    chunks.set(key, c);
  }
  return c;
}

/** Points across each track every 4 m along it, out to 3 m beyond either edge. */
const points: [number, number][] = [];
for (const track of world.features.tracks) {
  const { xs, zs, count } = track.poly;
  const hw = track.def.width / 2;
  for (let k = 1; k < count - 1; k += 4) {
    const dx = xs[k + 1] - xs[k - 1],
      dz = zs[k + 1] - zs[k - 1];
    const length = Math.hypot(dx, dz);
    for (let o = -(hw + 3); o <= hw + 3; o += 0.5) {
      const x = xs[k] - (dz / length) * o,
        z = zs[k] + (dx / length) * o;
      if (Math.abs(x) < t.halfX - 2 && Math.abs(z) < t.halfZ - 2) points.push([x, z]);
    }
  }
}

describe('track edges at every terrain detail level (v1.74)', () => {
  // Share of points where the paint or the bank differs from the 1 m mesh by more than half
  // its cover, and the mean difference. Before v1.74 the 8 m level was 31% and 0.32 for the
  // paint and 20% and 0.21 for the bank; the 4 m level 3.4% for the paint.
  const limits = [
    null,
    { paint: 0.005, bank: 0.01, mean: 0.02 },
    { paint: 0.015, bank: 0.03, mean: 0.04 },
    { paint: 0.05, bank: 0.08, mean: 0.08 },
  ];
  for (const level of [1, 2, 3]) {
    it(`draws them where the 1 m mesh does at ${LEVELS[level][1]} m`, () => {
      let paintOff = 0,
        bankOff = 0,
        paintSum = 0,
        bankSum = 0;
      for (const [x, z] of points) {
        const fine = edgeCover(chunk(0, x, z), x, z, style);
        const coarse = edgeCover(chunk(level, x, z), x, z, style);
        const paint = Math.abs(coarse[0] - fine[0]),
          bank = Math.abs(coarse[1] - fine[1]);
        if (paint > 0.5) paintOff++;
        if (bank > 0.5) bankOff++;
        paintSum += paint;
        bankSum += bank;
      }
      const n = points.length;
      expect(n).toBeGreaterThan(40000);
      const limit = limits[level]!;
      expect(paintOff / n).toBeLessThan(limit.paint);
      expect(bankOff / n).toBeLessThan(limit.bank);
      expect(paintSum / n).toBeLessThan(limit.mean);
      expect(bankSum / n).toBeLessThan(limit.mean);
    });
  }

  it('runs the edge of a clay bank smooth along the track at 1 m', () => {
    // Where the bank's cover crosses a half, every 1 m along each side of the Paddock Road
    // (the stretch the owner saw it on, in Over the Cape) and the CREB Track there, here the
    // knoll loop and the west bank track: how far that moves out or in
    // from one metre to the next: 0.16 m before v1.74, 0.11 m since.
    const jumps: number[] = [];
    for (const track of world.features.tracks.filter((tr) =>
      ['knoll-loop', 'west-bank'].includes(tr.def.id),
    )) {
      const { xs, zs, count } = track.poly;
      const hw = track.def.width / 2;
      for (const side of [-1, 1]) {
        let last: number | null = null;
        for (let k = 1; k < count - 1; k++) {
          const dx = xs[k + 1] - xs[k - 1],
            dz = zs[k + 1] - zs[k - 1];
          const length = Math.hypot(dx, dz);
          let edge: number | null = null;
          for (let o = hw; o <= hw + 4; o += 0.1) {
            const x = xs[k] - (dz / length) * o * side,
              z = zs[k] + (dx / length) * o * side;
            if (edgeCover(chunk(0, x, z), x, z, style)[1] < 0.5) {
              edge = o > hw ? o : null;
              break;
            }
          }
          if (edge !== null && last !== null) jumps.push(Math.abs(edge - last));
          last = edge;
        }
      }
    }
    expect(jumps.length).toBeGreaterThan(500);
    const mean = jumps.reduce((a, b) => a + b, 0) / jumps.length;
    expect(mean).toBeLessThan(0.13);
  });
});
