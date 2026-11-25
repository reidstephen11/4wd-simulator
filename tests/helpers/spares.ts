import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import type { VehicleId } from '../../src/data/vehicle';
import { vehicles } from '../../src/data/vehicles';
import { WIDEN as PATROL_WIDEN } from '../../src/render/patrolBody';
import { type MountedSpare, takeMountedSpares, withoutSpareWheels } from '../../src/render/spares';
import { vehicleLooks } from '../../src/render/vehicleLooks';

/**
 * On the outer face a strap, a clamp bar or a cradle bar the tyre rests on may press into the
 * tyre's curved sidewall this far, as rubber gives under a load. The face it is mounted against
 * gets no such allowance.
 */
const BEAR = 0.01;

/** How far out past the wheel's outer face the clearance rays start. */
const OUT = 0.6;

/** The body's triangles near one spare, as a mesh to ray-cast (the whole body is slow). */
export function nearSpare(body: BufferGeometry, s: MountedSpare): Mesh {
  const reach = s.radius + 0.06,
    deep = s.halfWidth + OUT + 0.1;
  const half = new Vector3(reach, reach, reach);
  if (s.axle.x !== 0) half.x = deep;
  if (s.axle.y !== 0) half.y = deep;
  if (s.axle.z !== 0) half.z = deep;
  const region = new Box3(s.position.clone().sub(half), s.position.clone().add(half));
  const p = body.getAttribute('position'),
    kept: number[] = [],
    tri = new Box3(),
    a = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    tri.makeEmpty();
    for (let k = 0; k < 3; k++) tri.expandByPoint(a.fromBufferAttribute(p, i + k));
    if (tri.intersectsBox(region))
      for (let k = 0; k < 3; k++) kept.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(kept), 3));
  const mesh = new Mesh(g, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld();
  return mesh;
}

export const hitDistances = (mesh: Mesh, from: Vector3, dir: Vector3, far: number): number[] =>
  new Raycaster(from, dir, 0, far).intersectObject(mesh).map((h) => h.distance);

/** Two unit vectors across the wheel's face. */
export function across(axle: Vector3): [Vector3, Vector3] {
  const u = Math.abs(axle.y) > 0.5 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const w = new Vector3().crossVectors(axle, u).normalize();
  return [u.sub(axle.clone().multiplyScalar(u.dot(axle))).normalize(), w];
}

export interface Built {
  id: VehicleId;
  ground: number;
  spares: { spare: MountedSpare; withWheel: Mesh; shell: Mesh }[];
}

export function buildSpares(id: VehicleId): Built {
  const look = vehicleLooks[id];
  const t = vehicles[id].tuning;
  const wheel = look.wheel(t);
  takeMountedSpares();
  const body = look.body(t, wheel.clone());
  const spares = takeMountedSpares();
  const bare = withoutSpareWheels(() => look.body(t, wheel.clone()));
  takeMountedSpares();
  wheel.dispose();
  // The Patrol's body is stretched across after it is built; its spares go with it.
  if (id === 'patrol') for (const s of spares) s.position.x *= PATROL_WIDEN;
  // As the studio page sets it: the ground one wheel radius below the hubs at rest.
  const ground = t.wheels[0].y - (t.suspensionRestLength - 0.12) - t.wheelRadius;
  const built = {
    id,
    ground,
    spares: spares.map((spare) => ({
      spare,
      withWheel: nearSpare(body, spare),
      shell: nearSpare(bare, spare),
    })),
  };
  body.dispose();
  bare.dispose();
  return built;
}

/** Hits on the spare itself: in the body with it, not in the body without it. */
export function wheelHits(b: Built['spares'][number], from: Vector3, dir: Vector3, far: number): number[] {
  const shell = hitDistances(b.shell, from, dir, far);
  return hitDistances(b.withWheel, from, dir, far).filter((d) => !shell.some((e) => Math.abs(e - d) < 1e-5));
}

/** What lies on one line through the wheel parallel to its axle, at a point `across` the face. */
export interface SpareLine {
  /** The wheel's outer and inner surfaces on the line, as distances in from the outer face side. */
  outer: number;
  inner: number;
  /** The body's surfaces on the line from the same start. */
  body: number[];
  /** True when the body comes inside the wheel, or within `gap` of its inner surface. */
  fouled: boolean;
}

/**
 * Runs a line parallel to the axle through the wheel at (du, dw) across its face, from well
 * outside the outer face to well behind the inner one. The body fouls the wheel if any of its
 * surfaces lies between the wheel's outer surface (plus `BEAR`, inwards) and its inner surface plus
 * `gap`, or if an odd number of body surfaces lie outside the wheel (the wheel is then inside a
 * closed part, such as a bar running through it).
 */
export function spareLine(b: Built['spares'][number], du: number, dw: number, gap = 0.003): SpareLine | null {
  const { position: hub, axle, halfWidth: hw } = b.spare;
  const [u, w] = across(axle);
  const start = hub
    .clone()
    .addScaledVector(u, du)
    .addScaledVector(w, dw)
    .addScaledVector(axle, hw + OUT);
  const dir = axle.clone().negate();
  const far = 2 * (hw + OUT);
  // Only this spare's own surfaces: another spare may lie in line with it (a deck spare over
  // an under-tray one).
  const own = wheelHits(b, start, dir, far).filter((d) => Math.abs(d - hw - OUT) <= hw * 1.1);
  if (!own.length) return null;
  const outer = Math.min(...own),
    inner = Math.max(...own);
  const body = hitDistances(b.shell, start, dir, far);
  const outside = body.filter((d) => d < outer + BEAR).length;
  const fouled = outside % 2 === 1 || body.some((d) => d >= outer + BEAR && d < inner + gap);
  return { outer, inner, body, fouled };
}
