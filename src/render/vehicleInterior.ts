import * as THREE from 'three';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import {
  DIAL_START,
  DIAL_SWEEP,
  DIAL_Y,
  DIAL_Z,
  dashDials,
  dialPoint,
  steeringWheel,
} from './vehicleInstruments';

/** A real cabin behind the glass: seats, instruments, RHD steering and floor levers. */
export function addVehicleInterior(b: VehicleBuilder, redlineRpm: number): void {
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
  const red = new THREE.Color('#B8432F');
  for (const [key, dial] of Object.entries(dashDials)) {
    const { x, radius } = dial;
    b.slot = M.Rubber;
    b.tag = Z.Trim;
    b.push()
      .translate(x, DIAL_Y, DIAL_Z)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(radius, radius, 0.008, 24), dark);
    b.pop();
    b.ring(x, DIAL_Y, DIAL_Z + 0.005, radius, 0.004, metal);
    // Major and minor graduations; the tachometer is red from the redline.
    for (let value = 0; value <= dial.max + 1e-6; value += dial.minor) {
      const angle = DIAL_START + (DIAL_SWEEP * value) / dial.max;
      const major = Math.abs(value / dial.major - Math.round(value / dial.major)) < 1e-6;
      const hot = key === 'rpm' && value >= redlineRpm;
      const low = key === 'oil' && value === 0;
      b.rod(
        dialPoint(x, radius * (major ? 0.68 : 0.78), angle, DIAL_Z + 0.011),
        dialPoint(x, radius * 0.88, angle, DIAL_Z + 0.011),
        major ? 0.0019 : 0.0011,
        hot || low ? red : ivory,
      );
    }
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
  // The column; the wheel itself turns with the steering (vehicleInstruments.ts).
  const { centre, columnBase } = steeringWheel;
  const top = new THREE.Vector3(centre.x, centre.y, centre.z).lerp(
    new THREE.Vector3(columnBase.x, columnBase.y, columnBase.z),
    0.06,
  );
  b.rod(columnBase, top, 0.024, dark, M.Rubber);
  b.rod(columnBase, new THREE.Vector3().lerpVectors(columnBase, top, 0.45), 0.042, dark, M.Rubber);
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
