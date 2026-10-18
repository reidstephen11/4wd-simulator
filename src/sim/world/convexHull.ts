/**
 * Incremental 3D convex hull. Returns outward-wound triangles over the hull's own
 * vertices, so a mesh drawn from it matches Rapier's convexHull() of the same points.
 */
export function convexHull(points: ArrayLike<number>): { vertices: Float32Array; indices: Uint32Array } {
  const n = points.length / 3;
  const px = (i: number) => points[i * 3],
    py = (i: number) => points[i * 3 + 1],
    pz = (i: number) => points[i * 3 + 2];
  let scale = 0;
  for (let i = 0; i < points.length; i++) scale = Math.max(scale, Math.abs(points[i]));
  const eps = 1e-7 * Math.max(1, scale);

  interface Face {
    a: number;
    b: number;
    c: number;
    nx: number;
    ny: number;
    nz: number;
    d: number;
    alive: boolean;
  }
  const faces: Face[] = [];
  const makeFace = (a: number, b: number, c: number): Face => {
    const ux = px(b) - px(a),
      uy = py(b) - py(a),
      uz = pz(b) - pz(a);
    const vx = px(c) - px(a),
      vy = py(c) - py(a),
      vz = pz(c) - pz(a);
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    return { a, b, c, nx, ny, nz, d: nx * px(a) + ny * py(a) + nz * pz(a), alive: true };
  };
  const dist = (f: Face, i: number) => f.nx * px(i) + f.ny * py(i) + f.nz * pz(i) - f.d;

  // Initial tetrahedron from extreme, non-degenerate points.
  let i0 = 0;
  for (let i = 1; i < n; i++) if (px(i) < px(i0)) i0 = i;
  let i1 = -1,
    best = eps;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(px(i) - px(i0), py(i) - py(i0), pz(i) - pz(i0));
    if (d > best) [best, i1] = [d, i];
  }
  let i2 = -1;
  best = eps;
  for (let i = 0; i < n && i1 >= 0; i++) {
    const ux = px(i1) - px(i0),
      uy = py(i1) - py(i0),
      uz = pz(i1) - pz(i0);
    const vx = px(i) - px(i0),
      vy = py(i) - py(i0),
      vz = pz(i) - pz(i0);
    const d = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (d > best) [best, i2] = [d, i];
  }
  if (i2 < 0) throw new Error('convexHull: points are collinear');
  const base = makeFace(i0, i1, i2);
  let i3 = -1;
  best = eps;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(dist(base, i));
    if (d > best) [best, i3] = [d, i];
  }
  if (i3 < 0) throw new Error('convexHull: points are coplanar');
  if (dist(base, i3) > 0)
    faces.push(makeFace(i0, i2, i1), makeFace(i0, i1, i3), makeFace(i1, i2, i3), makeFace(i2, i0, i3));
  else faces.push(base, makeFace(i0, i3, i1), makeFace(i1, i3, i2), makeFace(i2, i3, i0));

  const used = new Set([i0, i1, i2, i3]);
  for (let p = 0; p < n; p++) {
    if (used.has(p)) continue;
    const visible = faces.filter((f) => f.alive && dist(f, p) > eps);
    if (visible.length === 0) continue;
    // Horizon: directed edges of visible faces whose reverse edge is not on a visible face.
    const edges = new Map<string, [number, number]>();
    for (const f of visible) {
      f.alive = false;
      for (const [u, v] of [
        [f.a, f.b],
        [f.b, f.c],
        [f.c, f.a],
      ]) {
        const rev = `${v},${u}`;
        if (edges.has(rev)) edges.delete(rev);
        else edges.set(`${u},${v}`, [u, v]);
      }
    }
    for (const [u, v] of edges.values()) faces.push(makeFace(u, v, p));
  }

  const remap = new Map<number, number>();
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const f of faces) {
    if (!f.alive) continue;
    for (const i of [f.a, f.b, f.c]) {
      if (!remap.has(i)) {
        remap.set(i, vertices.length / 3);
        vertices.push(px(i), py(i), pz(i));
      }
      indices.push(remap.get(i)!);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
