import * as THREE from 'three';
import type { VehicleBuilder } from './vehicleGeometry';

/**
 * Which way a spare wheel's outer face points, in the vehicle frame (x right, y up, z back):
 * `'back'` on a rear door or carrier, `'front'` on a bonnet carrier standing up, `'up'` lying
 * flat on a rack, deck or bonnet, `'down'` slung under the floor, `'left'`/`'right'` standing
 * against a side. The body it is mounted against is on the opposite side.
 */
export type SpareFacing = 'back' | 'front' | 'up' | 'down' | 'left' | 'right';

/** One spare as it was placed, in the body's frame before any later whole-body stretch. */
export interface MountedSpare {
  /** The hub's centre. */
  position: THREE.Vector3;
  facing: SpareFacing;
  /** Unit vector the outer face points along (the wheel's axle). */
  axle: THREE.Vector3;
  /** Half the wheel's width along its axle, hub caps, nuts and knobs included. */
  halfWidth: number;
  /** The wheel's radius, tread blocks included. */
  radius: number;
}

const AXLES: Record<SpareFacing, [number, number, number]> = {
  back: [0, 0, 1],
  front: [0, 0, -1],
  up: [0, 1, 0],
  down: [0, -1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

/** The axle direction a facing names. */
export function spareAxle(facing: SpareFacing): THREE.Vector3 {
  return new THREE.Vector3(...AXLES[facing]);
}

const mounted: MountedSpare[] = [];

/**
 * Every spare mounted since the last call, then forgets them. Tests build a body and read
 * these to check each spare's axle, its clearance from the body and from the ground.
 */
export function takeMountedSpares(): MountedSpare[] {
  return mounted.splice(0);
}

let drawing = true;
/**
 * Runs `build` with every spare recorded but not drawn: the body as it would be without its
 * spare wheels, carriers and clamps still in place. For tests that ray-cast the body behind a
 * spare without hitting the spare.
 */
export function withoutSpareWheels<T>(build: () => T): T {
  drawing = false;
  try {
    return build();
  } finally {
    drawing = true;
  }
}

/**
 * Places a spare wheel: the only way a vehicle should. The body is given the wheel with its
 * outer face (nuts and hub cap) to +x and its inner side (the rim's barrel and the back of the
 * disc, from `wheelBack`) to −x; this turns it so the outer face points the way it `faces` (a
 * quarter turn about y for a door or carrier spare, about z for one lying flat, a half turn
 * about y for one facing left), draws it with the hub at (x, y, z) in the builder's current
 * frame, and records it for the tests (`tests/spares.test.ts`). Its inner side is against the
 * mount. `cover` draws a cover over the wheel, which counts as part of the spare.
 */
export function mountSpare(
  b: VehicleBuilder,
  wheel: THREE.BufferGeometry,
  position: THREE.Vector3Like,
  facing: SpareFacing,
  color: THREE.Color,
  options: { cover?: () => void } = {},
): void {
  const box = new THREE.Box3().setFromBufferAttribute(
    wheel.getAttribute('position') as THREE.BufferAttribute,
  );
  const halfWidth = Math.max(-box.min.x, box.max.x);
  const radius = Math.max(-box.min.y, box.max.y, -box.min.z, box.max.z);
  b.push().translate(position.x, position.y, position.z);
  // Each turn takes the wheel's +x (its outer face) to the facing's axle.
  if (facing === 'back') b.rotate(0, -Math.PI / 2, 0);
  else if (facing === 'front') b.rotate(0, Math.PI / 2, 0);
  else if (facing === 'up') b.rotate(0, 0, Math.PI / 2);
  else if (facing === 'down') b.rotate(0, 0, -Math.PI / 2);
  else if (facing === 'left') b.rotate(0, Math.PI, 0);
  const hub = new THREE.Vector3().applyMatrix4(b.matrix);
  if (drawing) b.geometry(wheel.clone(), color);
  b.pop();
  if (drawing) options.cover?.();
  mounted.push({ position: hub, facing, axle: spareAxle(facing), halfWidth, radius });
  // A game session rebuilds bodies and never reads these: keep only the latest few.
  if (mounted.length > 64) mounted.splice(0, mounted.length - 64);
}

/**
 * Half the thickness of a wheel's tyre outside the rim's centre: how far its sidewall bulges
 * from the hub's plane. A spare lying flat on a deck, a plate or a cradle rests on this, not on
 * its hub caps, so its hub goes this far (and a few millimetres more) above the surface.
 */
export function spareSidewall(wheel: THREE.BufferGeometry): number {
  const p = wheel.getAttribute('position');
  let radius = 0;
  for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getY(i), p.getZ(i)));
  let half = 0;
  for (let i = 0; i < p.count; i++)
    if (Math.hypot(p.getY(i), p.getZ(i)) >= radius * 0.5) half = Math.max(half, Math.abs(p.getX(i)));
  return half;
}
