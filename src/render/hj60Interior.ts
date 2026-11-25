import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { hj60Colors as C } from './hj60Paint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The Standard's cabin: grey vinyl buckets in front and a bench behind, rubber mats, a
 * padded dash with the instrument hood in front of the right-hand driver, pendant pedals,
 * the five-speed and transfer levers on the tunnel, vinyl door trims, a headlining, and the
 * load floor behind the bench between the rear wheel boxes.
 */
export function addHj60Interior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.hj60.cabin;
  const mat = new THREE.Color('#1F2120'),
    dash = new THREE.Color('#3A3B39'),
    metal = new THREE.Color('#8A8E86'),
    lining = new THREE.Color('#BDB8A8');
  const floor = 0.1;
  // Floor mats, the transmission tunnel and the toe board.
  b.block(0, floor, 0.17, 1.66, 0.03, 1.5, mat, M.Rubber, Z.Trim);
  b.block(0, floor, 1.44, 1.06, 0.03, 1.06, mat, M.Rubber, Z.Trim);
  b.block(0, floor, 2.22, 1.66, 0.03, 0.56, mat, M.Rubber, Z.Trim);
  b.block(0.02, floor + 0.08, -0.32, 0.3, 0.15, 0.62, mat, M.Rubber, Z.Trim, 0.04);
  b.block(0, floor + 0.08, -0.62, 1.64, 0.16, 0.06, mat, M.Rubber, Z.Trim, 0.02);
  // Dash: a steel lower panel, a padded top under the screen and the instrument hood.
  b.block(0, 0.68, -0.52, 1.64, 0.22, 0.14, dash, M.Paint, Z.Trim, 0.02);
  // The pad ends behind the binnacle; its old lip crossed the dial faces from the seat.
  b.block(0, 0.79, -0.56, 1.66, 0.05, 0.12, C.vinyl, M.Rubber, Z.Trim, 0.022);
  b.block(0.47, 0.75, -0.445, 0.56, 0.22, 0.06, mat, M.Rubber, Z.Trim, 0.015);
  b.block(0.47, 0.865, -0.425, 0.58, 0.035, 0.12, C.vinyl, M.Rubber, Z.Trim, 0.015);
  addDialFaces(b, cabin, redlineRpm);
  // Glovebox, radio and heater slides on the passenger side and in the middle.
  b.block(-0.46, 0.7, -0.448, 0.42, 0.14, 0.012, C.trim, M.Rubber, Z.Trim, 0.008);
  b.block(-0.46, 0.745, -0.44, 0.06, 0.014, 0.01, C.chrome, M.Metal, Z.Trim, 0.004);
  b.block(0.0, 0.73, -0.448, 0.19, 0.05, 0.012, mat, M.Rubber, Z.Trim, 0.006);
  b.block(0.0, 0.73, -0.44, 0.11, 0.018, 0.006, C.chrome, M.Metal, Z.Trim);
  b.block(0.0, 0.65, -0.448, 0.22, 0.05, 0.012, dash, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.07, 0.0, 0.07]) b.block(x, 0.655, -0.44, 0.012, 0.02, 0.012, metal, M.Metal, Z.Trim);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle.
  for (const [x, w] of [
    [0.27, 0.07],
    [0.41, 0.08],
    [0.55, 0.05],
  ]) {
    b.rod({ x, y: 0.6, z: -0.56 }, { x, y: floor + 0.16, z: -0.5 }, 0.009, metal);
    b.block(x, floor + 0.15, -0.49, w, 0.08, 0.015, mat, M.Rubber, Z.Trim);
  }
  // Two vinyl bucket seats on their frames, with headrests.
  for (const x of [-0.42, 0.42]) {
    b.block(x, floor + 0.14, 0.13, 0.46, 0.2, 0.42, mat, M.Rubber, Z.Trim, 0.02);
    b.block(x, floor + 0.3, 0.12, 0.52, 0.12, 0.52, C.vinyl, M.Fabric, Z.Trim, 0.045);
    b.push().translate(x, 0, 0.42).rotate(-0.16, 0, 0);
    b.block(0, floor + 0.62, 0, 0.5, 0.56, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.block(0, floor + 0.98, 0.0, 0.28, 0.16, 0.1, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.pop();
    for (const dx of [-0.1, 0, 0.1])
      b.block(x + dx, floor + 0.362, 0.12, 0.012, 0.006, 0.44, mat, M.Fabric, Z.Trim);
  }
  // Five-speed lever and the transfer lever beside it.
  for (const [x, top, z] of [
    [0.05, 0.62, -0.3],
    [-0.07, 0.52, -0.33],
  ]) {
    b.rod({ x, y: floor + 0.16, z: z - 0.14 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), mat);
    b.pop();
  }
  b.block(0, floor + 0.17, -0.43, 0.26, 0.04, 0.16, mat, M.Rubber, Z.Trim, 0.03);
  // The rear bench across the car ahead of the wheel boxes.
  b.block(0, floor + 0.14, 1.12, 1.36, 0.2, 0.42, mat, M.Rubber, Z.Trim, 0.02);
  b.block(0, floor + 0.3, 1.11, 1.44, 0.12, 0.5, C.vinyl, M.Fabric, Z.Trim, 0.045);
  b.push().translate(0, 0, 1.4).rotate(-0.14, 0, 0);
  b.block(0, floor + 0.6, 0, 1.44, 0.52, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
  b.pop();
  for (const side of [-1, 1]) {
    // Door trims with an armrest, a pull and a window winder; the painted steel above them.
    for (const [z0, z1] of [
      [-0.56, 0.41],
      [0.47, 1.3],
    ]) {
      const z = (z0 + z1) / 2,
        x = side * 0.825;
      b.block(x, 0.47, z, 0.02, 0.48, z1 - z0 - 0.04, C.trim, M.Fabric, Z.Trim, 0.01);
      b.block(x - side * 0.03, 0.55, z + 0.05, 0.05, 0.035, 0.26, C.vinyl, M.Rubber, Z.Trim, 0.012);
      b.rod(
        { x: x - side * 0.014, y: 0.6, z: z0 + 0.12 },
        { x: x - side * 0.05, y: 0.6, z: z0 + 0.12 },
        0.007,
        metal,
      );
      b.rod(
        { x: x - side * 0.05, y: 0.6, z: z0 + 0.12 },
        { x: x - side * 0.05, y: 0.53, z: z0 + 0.16 },
        0.006,
        metal,
      );
      b.block(x - side * 0.016, 0.66, z1 - 0.12, 0.012, 0.025, 0.08, C.chrome, M.Metal, Z.Trim, 0.005);
    }
    // Trim along the load space behind the bench, over the wheel box.
    b.block(side * 0.81, 0.6, 1.9, 0.02, 0.36, 1.1, C.trim, M.Fabric, Z.Trim, 0.01);
  }
  // Sun visors, the mirror and the headlining under the roof.
  for (const x of [-0.42, 0.42]) b.block(x, 1.2, -0.06, 0.36, 0.012, 0.13, C.vinyl, M.Fabric, Z.Trim, 0.005);
  b.block(0, 1.17, -0.08, 0.2, 0.05, 0.015, mat, M.Rubber, Z.Trim, 0.012);
  b.block(0, 1.17, -0.0715, 0.18, 0.035, 0.002, C.chrome, M.Mirror, Z.Trim);
  b.block(0, 1.226, 1.17, 1.56, 0.008, 2.66, lining, M.Fabric, Z.Trim);
}
