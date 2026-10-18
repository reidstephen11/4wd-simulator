import { convexHull } from './convexHull';
import { mulberry32 } from './rng';

export interface StoneMesh {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * A weathered granite boulder: a faceted, seeded ellipsoid with a flattened crown.
 * The origin is the ellipsoid centre; `ry` is the vertical half height.
 */
export function boulderPoints(rx: number, ry: number, rz: number, seed: number, crown = 0.82): number[] {
  const rand = mulberry32(seed);
  const pts: number[] = [];
  const rings = 5,
    segments = 9;
  pts.push(0, ry * crown, 0, 0, -ry, 0);
  for (let r = 1; r < rings; r++) {
    const lat = -Math.PI / 2 + (Math.PI * r) / rings;
    const twist = rand() * Math.PI;
    for (let s = 0; s < segments; s++) {
      const lon = twist + (2 * Math.PI * (s + (rand() - 0.5) * 0.5)) / segments;
      const k = 0.86 + rand() * 0.2;
      const y = Math.sin(lat) * ry * k;
      pts.push(
        Math.cos(lat) * Math.cos(lon) * rx * k,
        Math.min(y, ry * crown),
        Math.cos(lat) * Math.sin(lon) * rz * k,
      );
    }
  }
  return pts;
}

/**
 * A granite whaleback sitting on the ground: a top profile along z ([z, centre height,
 * optional cross-slope in degrees (+ raises +x), optional ground offset]) across a half
 * width, with rounded shoulders and a buried base. The ground offset lifts the whole
 * station so a long ridge follows sloping ground. The hull fills any hollow in the profile, so a profile
 * that steepens after its crest is drawn and collided as the straight chord.
 */
export function ridgePoints(
  halfWidth: number,
  profile: ReadonlyArray<readonly [number, number, number?, number?]>,
  buried: number,
  seed: number,
  crossSlopeDeg = 0,
  roughness = 0.03,
): number[] {
  const rand = mulberry32(seed);
  const shoulder = Math.min(0.35, halfWidth * 0.3);
  const pts: number[] = [];
  for (const [z, h, slopeDeg, ground = 0] of profile) {
    for (const x of [-halfWidth, halfWidth]) pts.push(x, ground - buried, z);
    const t = Math.tan(((slopeDeg ?? crossSlopeDeg) * Math.PI) / 180);
    for (const [x, drop] of [
      [-halfWidth, shoulder * 0.8],
      [-halfWidth + shoulder, 0],
      [-halfWidth * 0.35, 0],
      [halfWidth * 0.35, 0],
      [halfWidth - shoulder, 0],
      [halfWidth, shoulder * 0.8],
    ]) {
      const y = h + x * t - drop + (h > 0.02 ? (rand() - 0.5) * roughness : 0);
      if (y > 0.02) pts.push(x, ground + y, z + (rand() - 0.5) * 0.08);
    }
  }
  return pts;
}

/** Rotate points in place: roll about z, then pitch about x (+ raises -z), then yaw about y. */
export function orientPoints(pts: number[], yaw: number, pitch: number, roll: number): number[] {
  const [cy, sy, cp, sp, cr, sr] = [
    Math.cos(yaw),
    Math.sin(yaw),
    Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(roll),
    Math.sin(roll),
  ];
  for (let i = 0; i < pts.length; i += 3) {
    let x = pts[i],
      y = pts[i + 1],
      z = pts[i + 2];
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    pts[i] = x;
    pts[i + 1] = y;
    pts[i + 2] = z;
  }
  return pts;
}

export function stoneMesh(points: number[]): StoneMesh {
  return convexHull(points);
}

/** A low-poly granite slab with clipped corners and a rounded approach to its top. */
export function rockShape(hx: number, hy: number, hz: number, bevel: number) {
  const cut = Math.min(hx, hz) * 0.3;
  const inset = Math.min(bevel, hx * 0.3, hz * 0.3, hy * 0.8);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [x, y, z] of [
    [hx, -hy, hz],
    [hx, hy - inset, hz],
    [hx - inset, hy, hz - inset],
  ]) {
    const c = Math.min(cut, x * 0.5, z * 0.5);
    for (const [px, pz] of [
      [-x + c, -z],
      [x - c, -z],
      [x, -z + c],
      [x, z - c],
      [x - c, z],
      [-x + c, z],
      [-x, z - c],
      [-x, -z + c],
    ])
      vertices.push(px, y, pz);
  }
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const a = ring * 8,
        b = a + 8;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  for (let i = 1; i < 7; i++) indices.push(0, i, i + 1, 16, 16 + i + 1, 16 + i);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
