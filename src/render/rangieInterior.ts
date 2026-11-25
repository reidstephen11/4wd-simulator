import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { rangieColors as C } from './rangiePaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The early two-door's cabin: tan vinyl buckets in front and a split bench behind, a flat
 * black fascia with the square instrument binnacle in front of the right-hand driver, pendant
 * pedals, the tall gear lever and the transfer lever on the tunnel beside the transmission
 * handbrake, tan door trims, a headlining, and the load floor behind the bench.
 */
export function addRangieInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.rangie.cabin;
  const mat = new THREE.Color('#2A2623'),
    dash = new THREE.Color('#26282A'),
    metal = new THREE.Color('#8A8E86'),
    lining = new THREE.Color('#D8D2BE');
  const floor = 0.1;
  // Floor, the transmission tunnel and the toe board.
  b.block(0, floor, 0.1, 1.66, 0.03, 1.4, mat, M.Rubber, Z.Trim);
  // The load floor narrows between the rear wheelhouses rather than passing through the tyres.
  // Its wide part starts behind the wheelhouses (at z 1.8 its front edge showed as a tan line in
  // each rear opening). A step closes it to the cab floor, and a dark pan lies under it, so the
  // underside is not the carpet's colour (both there before v2.16).
  b.block(0, floor + 0.05, 1.325, 1.0, 0.03, 1.05, C.trim, M.Fabric, Z.Trim);
  b.block(0, floor + 0.05, 2.025, 1.66, 0.03, 0.35, C.trim, M.Fabric, Z.Trim);
  b.block(0, floor + 0.025, 0.8, 1.04, 0.05, 0.02, mat, M.Rubber, Z.Trim);
  b.block(0, floor + 0.028, 1.325, 1.0, 0.01, 1.05, mat, M.Rubber, Z.Trim);
  b.block(0, floor + 0.028, 2.025, 1.66, 0.01, 0.35, mat, M.Rubber, Z.Trim);
  b.block(0.02, floor + 0.08, -0.3, 0.3, 0.15, 0.62, mat, M.Rubber, Z.Trim, 0.04);
  b.block(0, floor + 0.08, -0.6, 1.64, 0.16, 0.06, mat, M.Rubber, Z.Trim, 0.02);
  // Dash: a steel lower panel, the padded top under the screen, and the binnacle with the two
  // big dials in front of the driver.
  b.block(0, 0.5, -0.5, 1.64, 0.2, 0.14, dash, M.Paint, Z.Trim, 0.02);
  // The padded top and the steel panel stay behind the leaning glass and between the A-pillars
  // (until v2.16 the pad stood 11 cm forward of the glass and 1.66 m wide, so its orange top
  // crossed the screen from outside and its ends stuck out past the pillars).
  b.block(0, 0.885, -0.43, 1.5, 0.05, 0.1, C.vinyl, M.Rubber, Z.Trim, 0.02);
  b.block(0, 0.72, -0.48, 1.5, 0.24, 0.06, dash, M.Paint, Z.Trim, 0.012);
  b.block(0.41, 0.74, -0.435, 0.5, 0.28, 0.06, mat, M.Rubber, Z.Trim, 0.015);
  b.block(0.41, 0.885, -0.42, 0.52, 0.03, 0.1, mat, M.Rubber, Z.Trim, 0.012);
  addDialFaces(b, cabin, redlineRpm);
  // Glovebox, radio and heater slides on the passenger side and in the middle.
  b.block(-0.46, 0.72, -0.448, 0.42, 0.14, 0.012, dash, M.Rubber, Z.Trim, 0.008);
  b.block(-0.46, 0.765, -0.44, 0.06, 0.014, 0.01, C.chrome, M.Metal, Z.Trim, 0.004);
  b.block(0.0, 0.75, -0.448, 0.19, 0.05, 0.012, mat, M.Rubber, Z.Trim, 0.006);
  b.block(0.0, 0.75, -0.44, 0.11, 0.018, 0.006, C.chrome, M.Metal, Z.Trim);
  b.block(0.0, 0.66, -0.448, 0.22, 0.05, 0.012, dash, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.07, 0.0, 0.07]) b.block(x, 0.665, -0.44, 0.012, 0.02, 0.012, metal, M.Metal, Z.Trim);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle.
  for (const [x, w] of [
    [0.25, 0.07],
    [0.39, 0.08],
    [0.53, 0.05],
  ]) {
    b.rod({ x, y: 0.55, z: -0.54 }, { x, y: floor + 0.16, z: -0.48 }, 0.009, metal);
    b.block(x, floor + 0.15, -0.47, w, 0.08, 0.015, mat, M.Rubber, Z.Trim);
  }
  // Two vinyl bucket seats on their frames, with headrests.
  for (const x of [-0.4, 0.4]) {
    b.block(x, floor + 0.12, 0.12, 0.46, 0.18, 0.42, mat, M.Rubber, Z.Trim, 0.02);
    b.block(x, floor + 0.27, 0.11, 0.52, 0.12, 0.52, C.vinyl, M.Fabric, Z.Trim, 0.045);
    b.push().translate(x, 0, 0.41).rotate(-0.18, 0, 0);
    b.block(0, floor + 0.58, 0, 0.5, 0.54, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.block(0, floor + 0.93, 0.0, 0.26, 0.16, 0.1, C.vinyl, M.Fabric, Z.Trim, 0.04);
    b.pop();
    for (const dx of [-0.1, 0, 0.1])
      b.block(x + dx, floor + 0.332, 0.11, 0.012, 0.006, 0.44, mat, M.Fabric, Z.Trim);
  }
  // The tall gear lever, the transfer lever beside it and the handbrake on the tunnel.
  for (const [x, top, z] of [
    [0.04, 0.62, -0.26],
    [-0.08, 0.5, -0.3],
  ]) {
    b.rod({ x, y: floor + 0.16, z: z - 0.14 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), mat);
    b.pop();
  }
  b.block(0, floor + 0.17, -0.4, 0.26, 0.04, 0.16, mat, M.Rubber, Z.Trim, 0.03);
  // The rear bench across the car ahead of the wheel boxes.
  b.block(0, floor + 0.135, 1.1, 1.0, 0.21, 0.42, mat, M.Rubber, Z.Trim, 0.02);
  // The cushion and back sit between the rear wheelhouses (inner faces 0.52 m out). Until v2.16
  // they were 1.44 m wide, and their tan ends showed inside the rear wheel openings.
  b.block(0, floor + 0.3, 1.09, 1.02, 0.12, 0.5, C.vinyl, M.Fabric, Z.Trim, 0.045);
  b.push().translate(0, 0, 1.37).rotate(-0.14, 0, 0);
  b.block(0, floor + 0.56, 0, 1.02, 0.5, 0.12, C.vinyl, M.Fabric, Z.Trim, 0.04);
  b.pop();
  for (const side of [-1, 1]) {
    // Long door trims with an armrest, a pull and a window winder; the quarter trims behind.
    const x = side * 0.825;
    b.block(x, 0.45, 0.0, 0.02, 0.5, 1.1, C.trim, M.Fabric, Z.Trim, 0.01);
    b.block(x - side * 0.03, 0.56, 0.0, 0.05, 0.035, 0.3, C.vinyl, M.Rubber, Z.Trim, 0.012);
    b.rod({ x: x - side * 0.014, y: 0.6, z: -0.42 }, { x: x - side * 0.05, y: 0.6, z: -0.42 }, 0.007, metal);
    b.rod({ x: x - side * 0.05, y: 0.6, z: -0.42 }, { x: x - side * 0.05, y: 0.53, z: -0.38 }, 0.006, metal);
    b.block(x - side * 0.016, 0.66, 0.44, 0.012, 0.025, 0.08, C.chrome, M.Metal, Z.Trim, 0.005);
    b.block(x, 0.585, 1.1, 0.02, 0.23, 1.0, C.trim, M.Fabric, Z.Trim, 0.01);
    // Trim along the load space behind the bench, over the wheel box. It starts above the
    // wheelhouse's top (0.465 m); from 0.37 its corner showed tan in the top of the rear opening.
    b.block(side * 0.81, 0.6, 1.85, 0.02, 0.26, 0.7, C.trim, M.Fabric, Z.Trim, 0.01);
  }
  // Sun visors, the mirror and the headlining under the roof.
  for (const x of [-0.4, 0.4]) b.block(x, 1.17, -0.2, 0.36, 0.012, 0.13, C.vinyl, M.Fabric, Z.Trim, 0.005);
  b.block(0, 1.14, -0.22, 0.2, 0.05, 0.015, mat, M.Rubber, Z.Trim, 0.012);
  b.block(0, 1.14, -0.2115, 0.18, 0.035, 0.002, C.chrome, M.Mirror, Z.Trim);
  b.block(0, 1.19, 1.0, 1.54, 0.008, 2.4, lining, M.Fabric, Z.Trim);
}
