import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { mqColors as C } from './mqPaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The hardtop's cabin: two vinyl buckets, a small bench behind them, rubber mats, a flat
 * painted dash with the hooded cluster in front of the right-hand driver, pendant pedals,
 * the four-speed and transfer levers on the tunnel, vinyl door trims, a headlining, and
 * the load floor behind the bench between the wheel boxes.
 */
export function addMqInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.mq.cabin;
  const mat = new THREE.Color('#1F2120'),
    dash = new THREE.Color('#3A3B39'),
    metal = new THREE.Color('#8A8E86'),
    lining = new THREE.Color('#BDB8A8');
  const floor = 0.1;
  // Floor mats, the transmission tunnel and the toe board.
  b.block(0, floor, 0.1, 1.54, 0.03, 1.3, mat, M.Rubber, Z.Trim);
  b.block(0, floor, 1.2, 0.96, 0.03, 0.9, mat, M.Rubber, Z.Trim);
  b.block(0, floor, 1.85, 1.54, 0.03, 0.4, mat, M.Rubber, Z.Trim);
  b.block(0.02, floor + 0.08, -0.3, 0.3, 0.15, 0.6, mat, M.Rubber, Z.Trim, 0.04);
  b.block(0, floor + 0.08, -0.66, 1.54, 0.16, 0.06, mat, M.Rubber, Z.Trim, 0.02);
  // Dash: a painted steel panel under the screen with a padded top and the instrument hood. Both
  // stay behind the leaning glass and between the A-pillars (inner faces 0.73 m out), and ahead of
  // the dial faces (z -0.5). Until v2.15 the pad reached 8 cm forward of the glass and both stood
  // out past the pillars, so their ends showed outside above the wings.
  b.block(0, 0.72, -0.5525, 1.44, 0.2, 0.085, dash, M.Paint, Z.Trim, 0.02);
  b.block(0, 0.83, -0.565, 1.44, 0.04, 0.05, C.vinyl, M.Rubber, Z.Trim, 0.015);
  // The instrument hood stops 4 cm short of the right A-pillar (it ran into it).
  b.block(0.45, 0.78, -0.535, 0.46, 0.2, 0.06, mat, M.Rubber, Z.Trim, 0.015);
  b.block(0.45, 0.895, -0.515, 0.48, 0.03, 0.1, C.vinyl, M.Rubber, Z.Trim, 0.015);
  addDialFaces(b, cabin, redlineRpm);
  // Glovebox and the heater slides in the middle.
  b.block(-0.46, 0.73, -0.508, 0.4, 0.13, 0.012, C.trim, M.Rubber, Z.Trim, 0.008);
  b.block(-0.46, 0.775, -0.5, 0.06, 0.014, 0.01, C.chrome, M.Metal, Z.Trim, 0.004);
  b.block(0.0, 0.7, -0.508, 0.22, 0.05, 0.012, dash, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.07, 0.0, 0.07]) b.block(x, 0.705, -0.5, 0.012, 0.02, 0.012, metal, M.Metal, Z.Trim);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle.
  for (const [x, w] of [
    [0.27, 0.07],
    [0.41, 0.08],
    [0.55, 0.05],
  ]) {
    b.rod({ x, y: 0.62, z: -0.6 }, { x, y: floor + 0.16, z: -0.54 }, 0.009, metal);
    b.block(x, floor + 0.15, -0.53, w, 0.08, 0.015, mat, M.Rubber, Z.Trim);
  }
  // Two vinyl bucket seats on their frames, with headrests.
  for (const x of [-0.4, 0.4]) {
    b.block(x, floor + 0.14, 0.1, 0.46, 0.2, 0.42, mat, M.Rubber, Z.Trim, 0.02);
    b.block(x, floor + 0.3, 0.09, 0.5, 0.12, 0.5, C.vinyl, M.Fabric, Z.Trim, 0.045);
    b.seatBack(x, floor + 0.611, 0.3545, 0.16);
    b.block(0, 0, 0, 0.48, 0.56, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.block(0, 0.36, 0, 0.28, 0.16, 0.1, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.pop();
  }
  // Four-speed lever and the transfer lever beside it.
  for (const [x, top, z] of [
    [0.05, 0.64, -0.28],
    [-0.07, 0.54, -0.31],
  ]) {
    b.rod({ x, y: floor + 0.16, z: z - 0.14 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), mat);
    b.pop();
  }
  b.block(0, floor + 0.17, -0.41, 0.26, 0.04, 0.16, mat, M.Rubber, Z.Trim, 0.03);
  // The small bench behind the seats, ahead of the wheel boxes.
  b.block(0, floor + 0.14, 0.95, 0.96, 0.2, 0.36, mat, M.Rubber, Z.Trim, 0.02);
  b.block(0, floor + 0.3, 0.94, 1.28, 0.12, 0.42, C.vinyl, M.Fabric, Z.Trim, 0.045);
  b.seatBack(0, floor + 0.573, 1.152, 0.14);
  b.block(0, 0, 0, 1.28, 0.48, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
  b.pop();
  for (const side of [-1, 1]) {
    // Door trim with an armrest, a pull and a window winder.
    const x = side * 0.765;
    b.block(x, 0.33, -0.09, 0.02, 0.56, 1.0, C.trim, M.Fabric, Z.Trim, 0.01);
    b.block(x - side * 0.03, 0.5, -0.04, 0.05, 0.035, 0.26, C.vinyl, M.Rubber, Z.Trim, 0.012);
    b.rod(
      { x: x - side * 0.014, y: 0.56, z: -0.48 },
      { x: x - side * 0.05, y: 0.56, z: -0.48 },
      0.007,
      metal,
    );
    b.rod({ x: x - side * 0.05, y: 0.56, z: -0.48 }, { x: x - side * 0.05, y: 0.49, z: -0.44 }, 0.006, metal);
    b.block(x - side * 0.016, 0.6, 0.3, 0.012, 0.025, 0.08, C.chrome, M.Metal, Z.Trim, 0.005);
    // Trim along the load space behind the bench, over the wheel box.
    b.block(side * 0.755, 0.55, 1.6, 0.02, 0.4, 0.9, C.trim, M.Fabric, Z.Trim, 0.01);
    b.block(side * 0.49, floor + 0.18, 1.2, 0.04, 0.32, 0.9, C.trim, M.Fabric, Z.Trim, 0.02);
  }
  // Sun visors, the mirror and the headlining under the roof.
  for (const x of [-0.4, 0.4]) b.block(x, 1.19, -0.4, 0.36, 0.012, 0.13, C.vinyl, M.Fabric, Z.Trim, 0.005);
  b.block(0, 1.16, -0.42, 0.2, 0.05, 0.015, mat, M.Rubber, Z.Trim, 0.012);
  b.block(0, 1.16, -0.4115, 0.18, 0.035, 0.002, C.chrome, M.Mirror, Z.Trim);
  b.rod({ x: 0, y: 1.18, z: -0.42 }, { x: 0, y: 1.206, z: -0.42 }, 0.007, mat, M.Rubber, Z.Trim);
  b.block(0, 1.206, 0.78, 1.5, 0.008, 2.5, lining, M.Fabric, Z.Trim);
}
