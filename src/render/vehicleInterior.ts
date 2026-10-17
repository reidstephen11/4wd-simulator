import * as THREE from 'three';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** A real cabin behind the glass: seats, instruments, RHD steering and floor levers. */
export function addVehicleInterior(b: VehicleBuilder): void {
  const dark = new THREE.Color('#343B37'),
    seat = new THREE.Color('#615F4C');
  const metal = new THREE.Color('#858A83'),
    ivory = new THREE.Color('#D9D6BF');
  b.block(0, 0.265, 0.47, 1.16, 0.06, 2.5, dark, M.Rubber, Z.Trim);
  for (const x of [-0.38, 0.38]) {
    b.block(x, 0.47, 0.21, 0.52, 0.15, 0.58, seat, M.Fabric, Z.Trim, 0.055);
    b.push().rotate(-0.12, 0, 0);
    b.block(x, 0.78, 0.44, 0.52, 0.59, 0.13, seat, M.Fabric, Z.Trim, 0.045);
    b.pop();
    for (const dx of [-0.12, 0.12]) b.block(x + dx, 0.55, 0.19, 0.015, 0.009, 0.45, dark, M.Fabric, Z.Trim);
    for (const dx of [-0.15, 0.15]) b.block(x + dx, 0.35, 0.19, 0.025, 0.17, 0.46, metal, M.Metal, Z.Trim);
    b.block(x + Math.sign(x) * 0.24, 0.57, 0.22, 0.035, 0.13, 0.045, dark, M.Rubber, Z.Trim);
    b.block(
      x + Math.sign(x) * 0.24,
      0.64,
      0.22,
      0.036,
      0.025,
      0.047,
      new THREE.Color('#A84030'),
      M.Red,
      Z.Trim,
    );
  }
  b.block(0, 0.83, -0.47, 1.4, 0.27, 0.22, dark, M.Rubber, Z.Trim, 0.018);
  b.block(0.36, 0.87, -0.343, 0.43, 0.19, 0.02, metal, M.Metal, Z.Trim, 0.014);
  for (const [x, radius] of [
    [0.36, 0.068],
    [0.215, 0.039],
    [0.5, 0.039],
  ]) {
    b.slot = M.Rubber;
    b.tag = Z.Trim;
    b.push()
      .translate(x, 0.88, -0.322)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(radius, radius, 0.008, 20), dark);
    b.pop();
    b.ring(x, 0.88, -0.317, radius, 0.004, metal);
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 1.65 - 0.8;
      b.rod(
        { x: x + Math.sin(angle) * radius * 0.73, y: 0.88 + Math.cos(angle) * radius * 0.73, z: -0.311 },
        { x: x + Math.sin(angle) * radius * 0.88, y: 0.88 + Math.cos(angle) * radius * 0.88, z: -0.311 },
        0.0015,
        ivory,
      );
    }
    b.rod(
      { x, y: 0.88, z: -0.309 },
      { x: x - radius * 0.4, y: 0.88 + radius * 0.3, z: -0.309 },
      0.002,
      ivory,
    );
  }
  for (const x of [-0.5, -0.4, -0.3, 0.03]) {
    b.slot = M.Rubber;
    b.push()
      .translate(x, 0.81, -0.335)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), dark);
    b.pop();
  }
  b.block(-0.34, 0.91, -0.342, 0.38, 0.08, 0.012, ivory.clone().multiplyScalar(0.5), M.Paint, Z.Trim);
  b.block(-0.34, 0.91, -0.331, 0.12, 0.012, 0.012, metal, M.Metal, Z.Trim);
  b.rod({ x: 0.38, y: 0.72, z: -0.46 }, { x: 0.38, y: 0.98, z: -0.12 }, 0.024, dark, M.Rubber);
  b.push().translate(0.38, 0.98, -0.12).rotate(0.7, 0, 0);
  b.ring(0, 0, 0, 0.165, 0.012, dark, M.Rubber);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.rod({ x: 0, y: 0, z: 0 }, { x: Math.cos(a) * 0.15, y: Math.sin(a) * 0.15, z: 0 }, 0.008, metal);
  }
  b.block(0, 0, 0, 0.07, 0.07, 0.025, dark, M.Rubber, Z.Trim, 0.015);
  b.pop();
  b.block(0, 0.36, -0.01, 0.31, 0.16, 0.83, dark, M.Rubber, Z.Trim, 0.025);
  for (const [x, h, z] of [
    [0.02, 0.68, 0.04],
    [-0.12, 0.57, 0.19],
  ]) {
    b.rod({ x, y: 0.42, z: z + 0.07 }, { x, y: h, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, h, z);
    b.geometry(new THREE.SphereGeometry(0.028, 12, 8), dark);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.block(side * 0.57, 0.65, 1.23, 0.32, 0.12, 0.86, seat, M.Fabric, Z.Trim, 0.025);
    b.block(side * 0.7, 0.66, 1.23, 0.08, 0.32, 0.86, seat, M.Fabric, Z.Trim, 0.025);
    b.block(side * 0.748, 0.66, -0.01, 0.012, 0.43, 0.9, dark, M.Fabric, Z.Trim);
    b.block(side * 0.73, 0.71, 0.15, 0.05, 0.035, 0.19, dark, M.Rubber, Z.Trim);
    b.rod({ x: side * 0.72, y: 0.61, z: -0.21 }, { x: side * 0.69, y: 0.61, z: -0.15 }, 0.009, metal);
  }
}
