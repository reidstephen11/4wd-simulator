/**
 * Batches many small static shapes (tree trunks, rocks, logs, props) into a few
 * triangle-mesh colliders. Rapier's per-step cost grows with the number of separate
 * colliders; a handful of trimeshes keeps it near zero.
 */
export interface TriBatch {
  vertices: number[];
  indices: number[];
}

type V3 = [number, number, number];

export class StaticMeshBatcher {
  readonly batches = new Map<string, TriBatch>();

  constructor(private readonly cellSize: number) {}

  private batch(x: number, z: number, group: string): TriBatch {
    const key = `${group}:${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = { vertices: [], indices: [] }));
    return b;
  }

  private add(b: TriBatch, verts: V3[], tris: number[]): void {
    const base = b.vertices.length / 3;
    for (const v of verts) b.vertices.push(v[0], v[1], v[2]);
    for (const t of tris) b.indices.push(base + t);
  }

  /** Box with yaw about +y. */
  box(group: string, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const verts: V3[] = [];
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        for (const sx of [-1, 1]) {
          const lx = sx * hx;
          const lz = sz * hz;
          verts.push([cx + lx * c + lz * s, cy + sy * hy, cz - lx * s + lz * c]);
        }
    // Vertex index = (sy+1)/2*4 + (sz+1)/2*2 + (sx+1)/2
    const tris = [
      0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7,
      3,
    ];
    this.add(this.batch(cx, cz, group), verts, tris);
  }

  /** Capped prism between two points (trunks, logs, posts). */
  prism(group: string, a: V3, b: V3, radius: number, sides = 6): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const ax: V3 = [dx / len, dy / len, dz / len];
    // Two vectors perpendicular to the axis.
    const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u: V3 = [
      ax[1] * ref[2] - ax[2] * ref[1],
      ax[2] * ref[0] - ax[0] * ref[2],
      ax[0] * ref[1] - ax[1] * ref[0],
    ];
    const ul = Math.hypot(u[0], u[1], u[2]);
    u[0] /= ul;
    u[1] /= ul;
    u[2] /= ul;
    const w: V3 = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
    const verts: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const ox = (Math.cos(ang) * u[0] + Math.sin(ang) * w[0]) * radius;
      const oy = (Math.cos(ang) * u[1] + Math.sin(ang) * w[1]) * radius;
      const oz = (Math.cos(ang) * u[2] + Math.sin(ang) * w[2]) * radius;
      verts.push([a[0] + ox, a[1] + oy, a[2] + oz], [b[0] + ox, b[1] + oy, b[2] + oz]);
    }
    verts.push(a, b);
    const ca = sides * 2;
    const cb = sides * 2 + 1;
    const tris: number[] = [];
    for (let i = 0; i < sides; i++) {
      const i0 = i * 2;
      const i1 = ((i + 1) % sides) * 2;
      tris.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1, ca, i1, i0, cb, i0 + 1, i1 + 1);
    }
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[2] + b[2]) / 2;
    this.add(this.batch(mx, mz, group), verts, tris);
  }

  /** Icosahedron (rocks), squashed vertically. */
  ico(group: string, cx: number, cy: number, cz: number, radius: number, squash = 1): void {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw: V3[] = [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ];
    const n = Math.hypot(1, t);
    const verts = raw.map(
      ([x, y, z]) => [cx + (x / n) * radius, cy + (y / n) * radius * squash, cz + (z / n) * radius] as V3,
    );
    const tris = [
      0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9,
      4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ];
    this.add(this.batch(cx, cz, group), verts, tris);
  }
}
