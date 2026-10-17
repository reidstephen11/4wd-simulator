import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { BodyZone, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** Rounded all-terrain carcass, separated tread rows, rim recess, vents, valve and six studs. */
export function buildVehicleWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#242725'),
    steel = new THREE.Color('#91958F');
  const rim = pal('vehicleRoof').clone().multiplyScalar(0.85),
    dark = new THREE.Color('#303632');
  b.slot = M.Rubber;
  b.tag = BodyZone.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [0.2, -w * 0.5],
    [r * 0.72, -w * 0.53],
    [r * 0.92, -w * 0.45],
    [r * 0.98, -w * 0.27],
    [r * 0.98, w * 0.27],
    [r * 0.92, w * 0.45],
    [r * 0.72, w * 0.53],
    [0.2, w * 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  for (let i = 0; i < 36; i++)
    for (const row of [-1, 0, 1]) {
      const angle = ((i + (row === 0 ? 0 : 0.45)) / 36) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(row * w * 0.32, Math.cos(angle) * r * 0.98, Math.sin(angle) * r * 0.98)
        .rotate(angle, row * 0.24, 0);
      b.box(w * 0.29, 0.036, 0.044, tyre);
      b.pop();
    }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.51, 0, 0, r * 0.77, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 - 0.018), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.205, 0.205, 0.025, 40), dark);
    b.pop();
    b.ring(side * (w * 0.5 + 0.004), 0, 0, 0.205, 0.016, rim, M.Metal, 'x');
    b.push()
      .translate(side * (w * 0.5 - 0.002), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.158, 0.177, 0.025, 40), rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const y = Math.cos(angle),
        z = Math.sin(angle);
      b.slot = M.Rubber;
      b.push()
        .translate(side * (w * 0.5 + 0.014), y * 0.145, z * 0.145)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.021, 0.021, 0.008, 10), dark);
      b.pop();
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.027), y * 0.093, z * 0.093)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.015, 0.018, 0.024, 6), steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.058, 0.065, 0.06, 24), dark);
    b.pop();
    b.block(side * (w * 0.5 + 0.057), 0, 0, 0.013, 0.033, 0.064, steel, M.Metal, BodyZone.Trim);
    b.rod(
      { x: side * w * 0.54, y: 0.18, z: 0.05 },
      { x: side * w * 0.6, y: 0.18, z: 0.05 },
      0.006,
      dark,
      M.Rubber,
    );
  }
  return b.build();
}
