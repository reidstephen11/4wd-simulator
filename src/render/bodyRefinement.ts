import * as THREE from 'three';
import { type VehicleBuilder, VehicleMaterial as M, BodyZone as Z } from './vehicleGeometry';
import { sweptTube } from './sweptTube';

/** Subdivide selected triangles while retaining colours, material IDs and smooth normals. */
export function subdivideSurface(
  source: THREE.BufferGeometry,
  select: (centre: THREE.Vector3, normal: THREE.Vector3) => boolean,
  levels = 2,
): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const attributes = Object.entries(g.attributes);
  const output: Record<string, number[]> = Object.fromEntries(attributes.map(([name]) => [name, []]));
  type Vertex = Record<string, number[]>;
  const read = (i: number): Vertex =>
    Object.fromEntries(
      attributes.map(([name, a]) => [
        name,
        Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k)),
      ]),
    );
  const midpoint = (a: Vertex, b: Vertex): Vertex =>
    Object.fromEntries(attributes.map(([name]) => [name, a[name].map((x, k) => (x + b[name][k]) / 2)]));
  const emit = (a: Vertex, b: Vertex, c: Vertex, depth: number): void => {
    if (depth) {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      emit(a, ab, ca, depth - 1);
      emit(ab, b, bc, depth - 1);
      emit(ca, bc, c, depth - 1);
      emit(ab, bc, ca, depth - 1);
      return;
    }
    for (const vertex of [a, b, c]) for (const [name] of attributes) output[name].push(...vertex[name]);
  };
  for (let i = 0; i < g.attributes.position.count; i += 3) {
    const a = read(i),
      b = read(i + 1),
      c = read(i + 2),
      centre = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (const p of [a, b, c]) {
      centre.add(new THREE.Vector3(...(p.position as [number, number, number])));
      normal.add(new THREE.Vector3(...(p.normal as [number, number, number])));
    }
    emit(a, b, c, select(centre.multiplyScalar(1 / 3), normal.normalize()) ? levels : 0);
  }
  const result = new THREE.BufferGeometry();
  for (const [name, a] of attributes)
    result.setAttribute(name, new THREE.Float32BufferAttribute(output[name], a.itemSize));
  if (g !== source) g.dispose();
  source.dispose();
  return result;
}

/**
 * How far a bend in a swept tube reaches back along each straight: at least `min` (or
 * `perRadius` tube radii), and no more than `share` of the shorter straight.
 */
export interface TubeBend {
  min: number;
  perRadius: number;
  share: number;
}

/** Tight bends, as on the Patrol's and Perentie's bull bars and racks. */
export const TIGHT_BEND: TubeBend = { min: 0.085, perRadius: 0, share: 0.35 };
/** Wider bends that grow with the tube, as on the Unimog and the Troop Carrier's bull bar. */
export const ROUND_BEND: TubeBend = { min: 0.085, perRadius: 2.4, share: 0.45 };

/**
 * One smoothly swept tube per bent member, rather than separate cylinders and joint balls.
 * Each straight is one ring of quads and each bend five, so a bull bar member costs a few
 * hundred triangles where a uniformly sampled tube cost 1,728 however short it was. Thin
 * tubes get six sides, bar tubes ten.
 */
export function continuousTube(
  b: VehicleBuilder,
  points: THREE.Vector3[],
  radius: number,
  color: THREE.Color,
  zone: number = Z.Front,
  slot: typeof b.slot = M.Metal,
  bend: TubeBend = TIGHT_BEND,
): void {
  const samples: THREE.Vector3[] = [points[0].clone()];
  let previous = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i],
      next = points[i + 1],
      distance = Math.min(
        Math.max(bend.min, radius * bend.perRadius),
        previous.distanceTo(corner) * bend.share,
        next.distanceTo(corner) * bend.share,
      );
    const start = corner.clone().add(previous.clone().sub(corner).normalize().multiplyScalar(distance));
    const end = corner.clone().add(next.clone().sub(corner).normalize().multiplyScalar(distance));
    const arc = new THREE.QuadraticBezierCurve3(start, corner, end);
    // Segments in proportion to the turn: a right angle gets five, a hoop's gentle steps one.
    const turn = previous.clone().sub(corner).angleTo(next.clone().sub(corner));
    const segments = THREE.MathUtils.clamp(Math.ceil((Math.PI - turn) / (Math.PI / 10)), 1, BEND_SEGMENTS);
    for (let k = 0; k <= segments; k++) samples.push(arc.getPoint(k / segments));
    previous = end;
  }
  samples.push(points[points.length - 1].clone());
  b.slot = slot;
  b.tag = zone;
  b.geometry(sweptTube(samples, radius, radius < 0.012 ? 6 : radius < 0.025 ? 8 : 10), color);
}

const BEND_SEGMENTS = 5;

/** Remove collapsed primitive faces without discarding smooth normals or semantic attributes. */
export function cleanGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position'),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const kept: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-20) kept.push(i, i + 1, i + 2);
  }
  const result = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const data = new Float32Array(kept.length * attr.itemSize);
    kept.forEach((old, j) => {
      for (let k = 0; k < attr.itemSize; k++) data[j * attr.itemSize + k] = attr.getComponent(old, k);
    });
    result.setAttribute(name, new THREE.BufferAttribute(data, attr.itemSize));
  }
  result.userData = {
    ...g.userData,
    removedDegenerateTriangles: (p.count - kept.length) / 3,
  };
  g.dispose();
  result.computeBoundingBox();
  return result;
}
