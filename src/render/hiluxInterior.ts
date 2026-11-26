import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { hiluxColors } from './hiluxPaint';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The Hilux's cab: a vinyl bench seat across the cab, a padded dash with the instrument
 * hood in front of the right-hand driver, a glovebox and radio, a two-spoke wheel, the
 * gear and transfer levers on the floor, pendant pedals, and painted door skins with
 * vinyl trims (the handbrake handle moves: see vehicleInstruments.ts).
 */
export function addHiluxInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.hilux.cabin;
  const { paint, vinyl, chrome } = hiluxColors;
  const dark = new THREE.Color('#252726'),
    mat = new THREE.Color('#1D1F1E'),
    metal = new THREE.Color('#8A8E86'),
    trim = new THREE.Color('#3A3936'),
    radio = new THREE.Color('#151716');
  // Floor mat, the transmission tunnel and the footwell bulkhead.
  b.block(0, 0.05, -0.3, 1.5, 0.03, 1.22, mat, M.Rubber, Z.Trim);
  b.block(0, 0.12, -0.45, 0.32, 0.12, 0.7, mat, M.Rubber, Z.Trim, 0.04);
  b.block(0, 0.385, -0.885, 1.52, 0.65, 0.03, paint.clone().multiplyScalar(0.6), M.Paint, Z.Trim);
  // Dash: the lower panel, a padded top under the screen, and the instrument hood.
  b.block(0, 0.58, -0.68, 1.5, 0.18, 0.26, dark, M.Rubber, Z.Trim, 0.02);
  b.block(0, 0.685, -0.7, 1.52, 0.06, 0.34, vinyl, M.Rubber, Z.Trim, 0.025);
  b.block(0.37, 0.69, -0.6, 0.42, 0.16, 0.12, dark, M.Rubber, Z.Trim, 0.02);
  b.block(0.37, 0.775, -0.57, 0.44, 0.03, 0.14, vinyl, M.Rubber, Z.Trim, 0.012);
  addDialFaces(b, cabin, redlineRpm);
  // Glovebox lid on the passenger side, the radio and heater slides in the middle.
  b.block(-0.42, 0.6, -0.548, 0.38, 0.13, 0.012, trim, M.Rubber, Z.Trim, 0.008);
  b.block(-0.42, 0.64, -0.54, 0.06, 0.016, 0.01, chrome, M.Metal, Z.Trim, 0.004);
  b.block(-0.02, 0.62, -0.548, 0.2, 0.05, 0.012, radio, M.Rubber, Z.Trim, 0.006);
  b.block(-0.02, 0.62, -0.54, 0.12, 0.02, 0.006, chrome, M.Metal, Z.Trim);
  for (const x of [-0.1, 0.06]) {
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.push()
      .translate(x, 0.62, -0.535)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 12), metal);
    b.pop();
  }
  b.block(-0.02, 0.53, -0.548, 0.24, 0.05, 0.012, trim, M.Rubber, Z.Trim, 0.006);
  for (const x of [-0.08, 0.0, 0.08])
    b.block(x - 0.02, 0.535, -0.54, 0.014, 0.022, 0.012, chrome, M.Metal, Z.Trim);
  addSteeringColumn(b, cabin);
  // Pendant clutch, brake and throttle pedals.
  for (const [x, w] of [
    [0.24, 0.07],
    [0.38, 0.08],
    [0.52, 0.05],
  ]) {
    b.rod({ x, y: 0.5, z: -0.78 }, { x, y: 0.2, z: -0.68 }, 0.009, metal);
    b.block(x, 0.19, -0.67, w, 0.08, 0.015, dark, M.Rubber, Z.Trim);
  }
  // Bench seat across the cab, with pleats and a low back against the rear wall.
  b.block(0, 0.24, 0.02, 1.44, 0.14, 0.5, vinyl, M.Fabric, Z.Trim, 0.045);
  b.block(0, 0.12, 0.05, 1.3, 0.12, 0.44, dark, M.Rubber, Z.Trim);
  // Its top is at the rear wall and its foot on the cushion; the pleats are on the face you sit against.
  b.seatBack(0, 0.624, 0.2235, 0.16);
  // 8 cm longer at the foot than before, down to the cushion: the wall showed under it.
  b.block(0, -0.04, 0, 1.44, 0.58, 0.11, vinyl, M.Fabric, Z.Trim, 0.04);
  for (let i = 0; i < 9; i++)
    b.block(-0.6 + i * 0.15, -0.02, -0.056, 0.012, 0.48, 0.006, dark, M.Fabric, Z.Trim);
  b.pop();
  for (let i = 0; i < 9; i++)
    b.block(-0.6 + i * 0.15, 0.312, 0.02, 0.012, 0.006, 0.44, dark, M.Fabric, Z.Trim);
  // Four-speed gear lever and the transfer lever beside it.
  for (const [x, top, z, knob] of [
    [0.05, 0.56, -0.36, dark],
    [-0.08, 0.44, -0.38, new THREE.Color('#9C3A2C')],
  ] as const) {
    b.rod({ x, y: 0.16, z: -0.5 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.025, 12, 8), knob);
    b.pop();
  }
  b.block(0.0, 0.19, -0.5, 0.24, 0.04, 0.16, mat, M.Rubber, Z.Trim, 0.03);
  // Door trims with a pull handle and a window winder; the painted inner skin above them.
  for (const side of [-1, 1]) {
    const x = side * 0.765;
    b.block(x, 0.32, -0.34, 0.02, 0.5, 1.02, trim, M.Fabric, Z.Trim, 0.01);
    // The painted inner skin runs up to the waist, 0.74 m up since v2.09.
    b.block(x, 0.655, -0.34, 0.025, 0.17, 1.08, paint, M.Paint, Z.Trim, 0.01);
    b.block(x - side * 0.02, 0.44, -0.16, 0.025, 0.04, 0.2, dark, M.Rubber, Z.Trim, 0.01);
    b.rod({ x: x - side * 0.015, y: 0.4, z: -0.5 }, { x: x - side * 0.05, y: 0.4, z: -0.5 }, 0.007, chrome);
    b.rod({ x: x - side * 0.05, y: 0.4, z: -0.5 }, { x: x - side * 0.05, y: 0.33, z: -0.46 }, 0.006, chrome);
  }
  // Sun visors under the front of the roof, and the headlining.
  for (const x of [-0.4, 0.4]) b.block(x, 1.16, -0.52, 0.36, 0.012, 0.11, trim, M.Fabric, Z.Trim, 0.005);
  b.block(0, 1.172, -0.125, 1.5, 0.008, 0.91, new THREE.Color('#BDB6A3'), M.Fabric, Z.Trim);
}
