import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeZ } from './bodyShapes';
import { cleanGeometry } from './bodyRefinement';
const steel = new THREE.Color('#93988F');
export function buildVehicleWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#232624');
  const rim = new THREE.Color('#424947');
  const rimR = 0.216;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.47],
    [r * 0.7, -w * 0.54],
    [r * 0.9, -w * 0.5],
    [r * 0.965, -w * 0.4],
    [r * 0.965, w * 0.4],
    [r * 0.9, w * 0.5],
    [r * 0.7, w * 0.54],
    [rimR - 0.01, w * 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Two rows of big staggered blocks that wrap onto the shoulders.
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.25, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.15, 0);
      b.box(w * 0.28, 0.036, 0.075, tyre);
      b.pop();
    }
  }
  for (let i = 0; i < blocks; i++) {
    const a = ((i + 0.25) * Math.PI * 2) / blocks;
    b.slot = M.Rubber;
    b.tag = Z.Trim;
    b.push()
      .translate(0, Math.cos(a) * r * 0.965, Math.sin(a) * r * 0.965)
      .rotate(a, i % 2 ? 0.07 : -0.07, 0);
    b.box(w * 0.3, 0.034, 0.07, tyre);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.74, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, the dished centre with round vents, the hub and six wheel nuts.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.013, rim, M.Paint, 'x');
    const circle = (cx: number, cy: number, r: number, n: number) =>
      Array.from(
        { length: n },
        (_, i) =>
          new THREE.Vector2(
            cx + r * Math.cos((i * Math.PI * 2) / n),
            cy + r * Math.sin((i * Math.PI * 2) / n),
          ),
      );
    const disc = new THREE.Shape(circle(0, 0, rimR - 0.01, 32));
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        p = (r: number, t: number) => new THREE.Vector2(Math.cos(a + t) * r, Math.sin(a + t) * r);
      const hole = [p(0.122, 0.245), p(0.197, 0.145), p(0.197, 0.902), p(0.122, 0.802)];
      disc.holes.push(new THREE.Path(hole.reverse()));
    }
    disc.holes.push(new THREE.Path(circle(0, 0, 0.051, 12).reverse()));
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.01, 0.01, rim, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 - 0.013), 0, 0)
      .rotate(0, 0, Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 24, 1, true), rim);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.135, 0.03, 16), rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.008), Math.cos(a) * 0.0698, Math.sin(a) * 0.0698)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.0125, 0.015, 0.02, 6), steel);
      b.pop();
    }
    // Six-stud drive flange and hub cap.
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.022), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.05, 0.058, 0.05, 12), steel.clone().multiplyScalar(0.9));
    b.pop();
  }
  // The bead ring; its 24 bolts a side were 1,150 triangles a wheel and never showed.
  for (const side of [-1, 1])
    b.ring(side * (w * 0.5 + 0.009), 0, 0, 0.215, 0.012, steel, M.Metal, 'x', Z.Trim);
  return cleanGeometry(b.build());
}
