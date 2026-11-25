import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { VehicleBuilder, BodyZone as Z, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeZ } from './bodyShapes';
import { cleanGeometry } from './bodyRefinement';
const paint = new THREE.Color('#C7973F'),
  steel = new THREE.Color('#989C96'),
  galv = steel;
export function buildCamelWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#232624');
  const rimR = 0.205;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.47],
    [r * 0.7, -w * 0.52],
    [r * 0.9, -w * 0.48],
    [r * 0.965, -w * 0.38],
    [r * 0.965, w * 0.38],
    [r * 0.9, w * 0.48],
    [r * 0.7, w * 0.52],
    [rimR - 0.01, w * 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Staggered shoulder lugs and centre blocks, deep like a military cross-country tyre.
  const lugs = 16;
  for (let i = 0; i < lugs; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.26, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.18, 0);
      b.box(w * 0.42, 0.04, 0.065, tyre);
      b.pop();
    }
    const angle = ((i + 0.25) / lugs) * Math.PI * 2;
    b.push()
      .translate(0, Math.cos(angle) * r * 0.97, Math.sin(angle) * r * 0.97)
      .rotate(angle, 0, 0);
    b.box(w * 0.18, 0.04, 0.045, tyre);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.72, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, a dished centre in Army sandglow with cooling slots, drive flange and studs.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.014, paint, M.Paint, 'x');
    const disc = new THREE.Shape();
    disc.absarc(0, 0, rimR - 0.01, 0, Math.PI * 2, false);
    for (let i = 0; i < 5; i++) {
      const a = ((i + 0.5) * Math.PI * 2) / 5;
      const h = new THREE.Path();
      h.absellipse(Math.cos(a) * 0.163, Math.sin(a) * 0.163, 0.024, 0.018, 0, Math.PI * 2, true, a);
      disc.holes.push(h);
    }
    const centre = new THREE.Path();
    centre.absarc(0, 0, 0.048, 0, Math.PI * 2, true);
    disc.holes.push(centre);
    b.push()
      .translate(side * (w * 0.5 - 0.028), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.009, 0.009, paint, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.135, 0.03, 16), paint);
    b.pop();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.008), Math.cos(a) * 0.083, Math.sin(a) * 0.083)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.014, 0.017, 0.022, 6), steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.048, 0.055, 0.05, 12), galv.clone().multiplyScalar(0.8));
    b.pop();
  }
  return cleanGeometry(b.build());
}
