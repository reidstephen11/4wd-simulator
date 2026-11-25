import type { CreekInfo } from './features';

/** Grid cell size (m) for finding the creek segments near a point. */
const CELL = 16;
/** Past the channel's half width the current dies away over this far (the wet bank). */
const EDGE = 1.5;
/** At the channel's edge the water runs at this share of its mid-channel speed. */
const EDGE_SPEED = 0.5;
const KEY_OFFSET = 4096;

/**
 * The current of every creek and river: water runs along each creek from its first point
 * to its last, fastest mid-channel and slowing towards the banks. The physics pushes the
 * vehicle with it and the water surface is drawn moving with it.
 */
export class WaterCurrent {
  /** Per grid cell, the creek segments that reach it, as [creek, segment] pairs. */
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly creeks: readonly CreekInfo[]) {
    creeks.forEach((c, ci) => {
      if (!c.flow.some((f) => f > 0)) return;
      const { xs, zs } = c.poly;
      for (let k = 0; k + 1 < c.poly.count; k++) {
        const r = Math.max(c.halfWidth[k], c.halfWidth[k + 1]) + EDGE;
        const x0 = Math.floor((Math.min(xs[k], xs[k + 1]) - r) / CELL);
        const x1 = Math.floor((Math.max(xs[k], xs[k + 1]) + r) / CELL);
        const z0 = Math.floor((Math.min(zs[k], zs[k + 1]) - r) / CELL);
        const z1 = Math.floor((Math.max(zs[k], zs[k + 1]) + r) / CELL);
        for (let cz = z0; cz <= z1; cz++)
          for (let cx = x0; cx <= x1; cx++) {
            const key = cellKey(cx, cz);
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push(ci, k);
          }
      }
    });
  }

  /** Velocity of the water (m/s, horizontal) at a point; zero away from running water. */
  at(x: number, z: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
    out.x = 0;
    out.z = 0;
    const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return out;
    let best = Infinity;
    let bc = -1;
    let bk = 0;
    let bt = 0;
    for (let n = 0; n < list.length; n += 2) {
      const { xs, zs } = this.creeks[list[n]].poly;
      const k = list[n + 1];
      const vx = xs[k + 1] - xs[k];
      const vz = zs[k + 1] - zs[k];
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - xs[k]) * vx + (z - zs[k]) * vz) / len2));
      const dx = xs[k] + vx * t - x;
      const dz = zs[k] + vz * t - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        bc = list[n];
        bk = k;
        bt = t;
      }
    }
    const c = this.creeks[bc];
    const hw = c.halfWidth[bk] + (c.halfWidth[bk + 1] - c.halfWidth[bk]) * bt;
    const d = Math.sqrt(best);
    if (d >= hw + EDGE) return out;
    const q = Math.min(1, d / hw);
    let speed = (c.flow[bk] + (c.flow[bk + 1] - c.flow[bk]) * bt) * (1 - (1 - EDGE_SPEED) * q * q);
    if (d > hw) speed *= 1 - (d - hw) / EDGE;
    const vx = c.poly.xs[bk + 1] - c.poly.xs[bk];
    const vz = c.poly.zs[bk + 1] - c.poly.zs[bk];
    const len = Math.hypot(vx, vz) || 1;
    out.x = (vx / len) * speed;
    out.z = (vz / len) * speed;
    return out;
  }
}

function cellKey(cx: number, cz: number): number {
  return (cz + KEY_OFFSET) * 2 * KEY_OFFSET + cx + KEY_OFFSET;
}
