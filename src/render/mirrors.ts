import * as THREE from 'three';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** Fallback glazing when reflections are disabled or the camera is outside the cab. */
export const mirrorGlass = new THREE.Color('#B4C2C6');

type P = { x: number; y: number; z: number };

/**
 * A rectangular mirror head centred at p: a housing rounded at its edges with the glass on
 * its back face, turned so its outer edge sits a little further back and the glass looks
 * in towards the driver.
 */
export function mirrorHead(
  b: VehicleBuilder,
  side: number,
  p: P,
  w: number,
  h: number,
  d: number,
  housing: THREE.Color,
  toe = 0.15,
): void {
  b.push()
    .translate(p.x, p.y, p.z)
    .rotate(0, -side * toe, 0);
  b.block(0, 0, 0, w, h, d, housing, M.Rubber, Z.Trim, Math.min(0.03, d * 0.4));
  b.block(0, 0, d / 2 + 0.002, w - 0.025, h - 0.025, 0.004, mirrorGlass, M.Mirror, Z.Trim, 0.015);
  b.pop();
}

/** A round head centred at p: a domed shell facing forwards, a rim, and the glass facing back. */
export function roundHead(
  b: VehicleBuilder,
  side: number,
  p: P,
  r: number,
  shell: THREE.Color,
  toe = 0.15,
): void {
  b.push()
    .translate(p.x, p.y, p.z)
    .rotate(0, -side * toe, 0);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .scale(1, 1, 0.5)
    .rotate(-Math.PI / 2, 0, 0);
  b.geometry(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  b.pop();
  b.ring(0, 0, 0, r, 0.007, shell, M.Metal, 'z', Z.Trim);
  b.push()
    .translate(0, 0, 0.003)
    .rotate(Math.PI / 2, 0, 0);
  b.slot = M.Mirror;
  b.geometry(new THREE.CylinderGeometry(r - 0.006, r - 0.006, 0.004, 24), mirrorGlass);
  b.pop();
  b.pop();
}

/** A stalk or arm along the points, with a ball at each bend and at its end. */
export function stalk(b: VehicleBuilder, pts: P[], r: number, color: THREE.Color): void {
  for (let i = 0; i + 1 < pts.length; i++) b.rod(pts[i], pts[i + 1], r, color, M.Metal, Z.Sides);
  b.slot = M.Metal;
  b.tag = Z.Sides;
  for (const q of pts.slice(1)) {
    b.push().translate(q.x, q.y, q.z);
    b.geometry(new THREE.SphereGeometry(r * 1.4, 10, 6), color);
    b.pop();
  }
}
