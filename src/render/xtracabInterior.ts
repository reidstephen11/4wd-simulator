import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { xtracabColors as C } from './xtracabPaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The SR5 Xtracab's grey cabin, left-hand drive: two cloth bucket seats with head restraints,
 * a console between them, the carpeted shelf behind them in the extended cab, a squared dash
 * with the instrument hood in front of the driver on the left, square vents, the heater panel
 * and radio in the middle and the glovebox on the right, pendant pedals, and the gear and
 * transfer levers on the tunnel (the handbrake handle moves: see vehicleInstruments.ts).
 */
export function addXtracabInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.xtracab.cabin;
  const carpet = new THREE.Color('#4A4D50'),
    dark = new THREE.Color('#2A2C2E'),
    metal = new THREE.Color('#8A8E86'),
    lining = new THREE.Color('#B9BBB8');
  const floor = 0.105;
  const dx = cabin.steeringWheel.centre.x;
  // Carpet, the tunnel and the toe board.
  b.block(0, floor, -0.2, 1.54, 0.02, 1.42, carpet, M.Fabric, Z.Trim);
  b.block(0.0, floor + 0.07, -0.36, 0.3, 0.14, 0.86, carpet, M.Fabric, Z.Trim, 0.04);
  b.block(0, floor + 0.2, -0.86, 1.54, 0.4, 0.04, carpet, M.Fabric, Z.Trim);
  // Dash: the lower panel, the padded top under the screen and the hood over the dials.
  b.block(0, 0.57, -0.69, 1.54, 0.2, 0.2, C.dash, M.Rubber, Z.Trim, 0.02);
  b.block(0, 0.715, -0.79, 1.56, 0.06, 0.44, C.dash, M.Rubber, Z.Trim, 0.025);
  b.block(dx, 0.668, -0.615, 0.44, 0.17, 0.09, dark, M.Rubber, Z.Trim, 0.015);
  b.block(dx, 0.762, -0.6, 0.47, 0.03, 0.15, C.dash, M.Rubber, Z.Trim, 0.012);
  addDialFaces(b, cabin, redlineRpm);
  // Square vents at each end and two in the middle, the heater slides and the radio under
  // them, and the glovebox lid on the passenger's side.
  for (const x of [-0.7, -0.06, 0.07, 0.7]) {
    b.block(x, 0.675, -0.588, 0.1, 0.06, 0.012, dark, M.Rubber, Z.Trim, 0.006);
    for (const dy of [-0.014, 0, 0.014])
      b.block(x, 0.675 + dy, -0.581, 0.085, 0.004, 0.004, C.trim, M.Rubber, Z.Trim);
  }
  b.block(0.0, 0.6, -0.588, 0.24, 0.05, 0.012, dark, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.07, 0.0, 0.07]) b.block(x, 0.6, -0.58, 0.012, 0.022, 0.012, metal, M.Metal, Z.Trim);
  b.block(0.0, 0.535, -0.588, 0.2, 0.05, 0.012, dark, M.Rubber, Z.Trim, 0.006);
  b.block(0.0, 0.535, -0.58, 0.12, 0.018, 0.006, C.chrome, M.Metal, Z.Trim);
  b.block(0.4, 0.6, -0.588, 0.4, 0.13, 0.012, C.trim, M.Rubber, Z.Trim, 0.008);
  b.block(0.4, 0.645, -0.58, 0.05, 0.014, 0.01, dark, M.Rubber, Z.Trim, 0.004);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle in the left footwell.
  for (const [x, w] of [
    [dx - 0.15, 0.07],
    [dx - 0.02, 0.08],
    [dx + 0.11, 0.05],
  ]) {
    b.rod({ x, y: 0.5, z: -0.8 }, { x, y: floor + 0.12, z: -0.7 }, 0.009, metal);
    b.block(x, floor + 0.11, -0.69, w, 0.08, 0.015, dark, M.Rubber, Z.Trim);
  }
  // Two cloth buckets on their frames, each with a head restraint on two posts.
  for (const x of [-0.38, 0.38]) {
    b.block(x, floor + 0.1, 0.07, 0.44, 0.18, 0.44, dark, M.Rubber, Z.Trim, 0.02);
    b.block(x, floor + 0.245, 0.06, 0.5, 0.12, 0.5, C.cloth, M.Fabric, Z.Trim, 0.045);
    b.push().translate(x, 0, 0.33).rotate(-0.2, 0, 0);
    b.block(0, floor + 0.55, 0, 0.48, 0.52, 0.11, C.cloth, M.Fabric, Z.Trim, 0.04);
    for (const px of [-0.06, 0.06])
      b.rod({ x: px, y: floor + 0.8, z: 0 }, { x: px, y: floor + 0.86, z: 0 }, 0.007, metal, M.Metal, Z.Trim);
    b.block(0, floor + 0.93, 0.0, 0.26, 0.15, 0.1, C.cloth, M.Fabric, Z.Trim, 0.04);
    b.pop();
    for (const sx of [-0.09, 0, 0.09])
      b.block(x + sx, floor + 0.307, 0.06, 0.012, 0.006, 0.42, C.trim, M.Fabric, Z.Trim);
  }
  // Console between the seats, the five-speed's lever and the transfer lever beside it.
  b.block(0.0, floor + 0.19, 0.08, 0.18, 0.12, 0.44, C.trim, M.Rubber, Z.Trim, 0.02);
  for (const [x, top, z] of [
    [0.0, 0.53, -0.3],
    [0.1, 0.43, -0.26],
  ]) {
    b.rod({ x, y: floor + 0.14, z: z - 0.12 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), dark);
    b.pop();
  }
  b.block(0.04, floor + 0.15, -0.4, 0.26, 0.04, 0.2, dark, M.Rubber, Z.Trim, 0.03);
  // The handbrake handle moves, so it is one of the instruments; this is its guide.
  const hb = cabin.handbrake.base;
  b.block(hb.x, hb.y + 0.005, hb.z - 0.03, 0.05, 0.04, 0.06, dark, M.Rubber, Z.Trim, 0.01);
  // The carpeted shelf across the extended cab behind the seats, and the back wall's trim.
  b.block(0, floor + 0.16, 0.445, 1.5, 0.3, 0.1, carpet, M.Fabric, Z.Trim, 0.02);
  b.block(0, 0.55, 0.47, 1.5, 0.42, 0.02, C.trim, M.Fabric, Z.Trim);
  for (const side of [-1, 1]) {
    // Door trims with an armrest, a pull and a window winder; the quarter trims behind.
    const x = side * 0.765;
    b.block(x, 0.42, -0.36, 0.02, 0.56, 1.0, C.trim, M.Fabric, Z.Trim, 0.01);
    b.block(x - side * 0.03, 0.52, -0.22, 0.05, 0.035, 0.34, dark, M.Rubber, Z.Trim, 0.012);
    b.rod({ x: x - side * 0.014, y: 0.5, z: -0.6 }, { x: x - side * 0.05, y: 0.5, z: -0.6 }, 0.007, metal);
    b.rod({ x: x - side * 0.05, y: 0.5, z: -0.6 }, { x: x - side * 0.05, y: 0.44, z: -0.56 }, 0.006, metal);
    b.block(x, 0.42, 0.33, 0.02, 0.56, 0.3, C.trim, M.Fabric, Z.Trim, 0.01);
  }
  // Sun visors and the headlining under the roof.
  for (const x of [-0.38, 0.38]) b.block(x, 1.162, -0.3, 0.36, 0.012, 0.12, lining, M.Fabric, Z.Trim, 0.005);
  b.block(0, 1.176, 0.07, 1.5, 0.008, 0.86, lining, M.Fabric, Z.Trim);
}
