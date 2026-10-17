/**
 * Polyline helpers: Catmull-Rom smoothing of authored control points into a dense
 * polyline with arc lengths, plus per-point attribute interpolation.
 */
export interface DensePolyline {
  xs: Float64Array;
  zs: Float64Array;
  /** Arc length at each point. */
  s: Float64Array;
  /** Index (fractional) into the authored control points at each dense point. */
  u: Float64Array;
  length: number;
  count: number;
}

/** Sample a centripetal-ish uniform Catmull-Rom spline through the points every ~`step` metres. */
export function densify(points: ReadonlyArray<readonly [number, number]>, step: number): DensePolyline {
  const n = points.length;
  const outX: number[] = [];
  const outZ: number[] = [];
  const outU: number[] = [];
  if (n === 1) {
    outX.push(points[0][0]);
    outZ.push(points[0][1]);
    outU.push(0);
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(segLen / step));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      outX.push(x);
      outZ.push(z);
      outU.push(i + t);
    }
  }
  if (n > 1) {
    outX.push(points[n - 1][0]);
    outZ.push(points[n - 1][1]);
    outU.push(n - 1);
  }
  const count = outX.length;
  const xs = Float64Array.from(outX);
  const zs = Float64Array.from(outZ);
  const u = Float64Array.from(outU);
  const s = new Float64Array(count);
  for (let i = 1; i < count; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  return { xs, zs, s, u, length: s[count - 1], count };
}

/** Linearly interpolate a per-control-point attribute at fractional control index u. */
export function attrAt(values: ArrayLike<number>, u: number): number {
  const i = Math.floor(u);
  if (i <= 0 && u <= 0) return values[0];
  if (i >= values.length - 1) return values[values.length - 1];
  const f = u - i;
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** Find the dense index range [i, i+1] containing arc length s and return the fractional position. */
export function locate(poly: DensePolyline, s: number): { i: number; f: number } {
  const arr = poly.s;
  if (s <= 0) return { i: 0, f: 0 };
  if (s >= poly.length) return { i: Math.max(0, poly.count - 2), f: 1 };
  let lo = 0;
  let hi = poly.count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = arr[hi] - arr[lo];
  return { i: lo, f: span > 0 ? (s - arr[lo]) / span : 0 };
}

/** Point and unit direction at arc length s. */
export function pointAt(
  poly: DensePolyline,
  s: number,
): { x: number; z: number; dx: number; dz: number; u: number } {
  const { i, f } = locate(poly, s);
  const j = Math.min(poly.count - 1, i + 1);
  const x = poly.xs[i] + (poly.xs[j] - poly.xs[i]) * f;
  const z = poly.zs[i] + (poly.zs[j] - poly.zs[i]) * f;
  let dx = poly.xs[j] - poly.xs[i];
  let dz = poly.zs[j] - poly.zs[i];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const u = poly.u[i] + (poly.u[j] - poly.u[i]) * f;
  return { x, z, dx, dz, u };
}

/** Distance from (px, pz) to segment a→b; returns distance and t in [0,1]. */
export function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number; side: number } {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t - px;
  const cz = az + vz * t - pz;
  return { d: Math.sqrt(cx * cx + cz * cz), t, side: vx * wz - vz * wx };
}
