import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { perentieColors } from './perentiePaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The Perentie's cab: three seats on the steel seat box, a plain steel dash with the
 * instrument binnacle in front of the right-hand driver, a big four-spoke wheel, the
 * gear and transfer levers on the tunnel (the handbrake lever moves: see
 * vehicleInstruments.ts), and the tilt hoops behind.
 */
export function addPerentieInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.perentie.cabin;
  const { paint, galv } = perentieColors;
  const dark = new THREE.Color('#2C302B'),
    seat = new THREE.Color('#33372F'),
    metal = new THREE.Color('#8A8E86'),
    inner = paint.clone().multiplyScalar(0.8);
  // Floor mats, the footwell bulkhead, the dash rail and the binnacle.
  b.block(0, 0.15, -0.28, 1.6, 0.03, 0.98, dark, M.Rubber, Z.Trim);
  b.block(0, 0.4, -0.77, 1.62, 0.48, 0.03, inner, M.Paint, Z.Trim);
  b.block(0, 0.735, -0.7, 1.62, 0.07, 0.16, dark, M.Rubber, Z.Trim, 0.012);
  b.block(0.42, 0.86, -0.56, 0.44, 0.2, 0.18, dark, M.Rubber, Z.Trim, 0.025);
  addDialFaces(b, cabin, redlineRpm);
  // Switch panel and heater slides in the middle, a parcel shelf on the passenger side.
  b.block(0, 0.67, -0.67, 0.38, 0.12, 0.1, dark, M.Rubber, Z.Trim, 0.01);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) {
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.push()
      .translate(x, 0.69, -0.615)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), metal);
    b.pop();
  }
  b.block(-0.42, 0.69, -0.68, 0.62, 0.025, 0.2, dark, M.Rubber, Z.Trim);
  b.block(0.05, 1.29, -0.72, 0.2, 0.06, 0.02, dark, M.Rubber, Z.Trim, 0.01);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle pedals.
  for (const [x, w] of [
    [0.3, 0.07],
    [0.42, 0.08],
    [0.56, 0.05],
  ]) {
    b.rod({ x, y: 0.6, z: -0.7 }, { x, y: 0.3, z: -0.56 }, 0.01, metal);
    b.block(x, 0.29, -0.55, w, 0.09, 0.015, dark, M.Rubber, Z.Trim);
  }
  // Seat box, three seats and their backrests against the tilt's front hoop.
  b.block(0, 0.31, 0.02, 1.6, 0.3, 0.38, inner, M.Paint, Z.Trim, 0.01);
  for (const x of [-0.42, 0, 0.42]) {
    const w = x === 0 ? 0.34 : 0.44;
    b.block(x, 0.51, 0.0, w, 0.1, 0.4, seat, M.Fabric, Z.Trim, 0.035);
    b.block(x, x === 0 ? 0.76 : 0.86, 0.2, w, x === 0 ? 0.4 : 0.6, 0.1, seat, M.Fabric, Z.Trim, 0.035);
    for (const dx of [-w / 4, w / 4]) b.block(x + dx, 0.562, 0.0, 0.01, 0.006, 0.34, dark, M.Fabric, Z.Trim);
  }
  // Main gear lever and transfer lever.
  for (const [x, top, z, knob] of [
    [0.13, 0.74, -0.33, dark],
    [0.03, 0.64, -0.36, new THREE.Color('#9E3B2C')],
  ] as const) {
    b.rod({ x, y: 0.3, z: -0.46 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), knob);
    b.pop();
  }
  b.block(0.12, 0.27, -0.42, 0.24, 0.24, 0.3, dark, M.Rubber, Z.Trim, 0.04);
  // The handbrake lever moves, so it is one of the instruments; this is its gaiter.
  b.block(0.22, 0.47, -0.08, 0.07, 0.04, 0.09, dark, M.Rubber, Z.Trim, 0.015);
  // Door pulls on the painted inner door skins.
  for (const side of [-1, 1])
    b.block(side * 0.81, 0.62, -0.1, 0.02, 0.04, 0.22, dark, M.Rubber, Z.Trim, 0.01);
  // Tilt hoops: posts down to the capping rails and a bow under the canvas.
  for (const z of [0.23, 0.95, 1.62, 2.26]) {
    for (const side of [-1, 1])
      b.rod({ x: side * 0.8, y: 0.79, z }, { x: side * 0.8, y: 1.38, z }, 0.016, galv, M.Paint, Z.Trim);
    b.rod({ x: -0.8, y: 1.4, z }, { x: 0.8, y: 1.4, z }, 0.016, galv, M.Paint, Z.Trim);
  }
}
