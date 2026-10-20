import * as THREE from 'three';
import { vehicles } from '../data/vehicles';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';

/**
 * The GQ Patrol's cab: a padded dash with the instrument binnacle in front of the
 * right-hand driver, two cloth bucket seats with a console between them carrying the
 * gear and transfer levers, a rear bench and the cargo floor behind it, door trims and
 * a pale headlining. The handbrake handle under the dash moves: see vehicleInstruments.ts.
 */
export function addPatrolInterior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = vehicles.patrol.cabin;
  const dash = new THREE.Color('#34383A'),
    dark = new THREE.Color('#25292B'),
    cloth = new THREE.Color('#6B6658'),
    clothDark = new THREE.Color('#4E4A40'),
    lining = new THREE.Color('#B9B4A6'),
    metal = new THREE.Color('#8C9090');
  // Firewall, floor carpet, the dash with its top pad and the instrument binnacle.
  b.block(0, 0.42, -0.79, 1.66, 0.5, 0.03, dark, M.Rubber, Z.Trim);
  b.block(0, 0.19, -0.2, 1.62, 0.03, 1.2, dark, M.Fabric, Z.Trim);
  b.block(0, 0.68, -0.66, 1.66, 0.2, 0.26, dash, M.Rubber, Z.Trim, 0.03);
  b.block(0, 0.8, -0.68, 1.62, 0.06, 0.3, dark, M.Rubber, Z.Trim, 0.025);
  b.block(0.42, 0.85, -0.565, 0.46, 0.2, 0.18, dark, M.Rubber, Z.Trim, 0.03);
  b.block(0.42, 0.955, -0.55, 0.48, 0.03, 0.22, dark, M.Rubber, Z.Trim, 0.012);
  addDialFaces(b, cabin, redlineRpm);
  // Heater and radio panel in the middle, glovebox and vents on the passenger side.
  b.block(0, 0.66, -0.525, 0.36, 0.18, 0.02, dark, M.Rubber, Z.Trim, 0.01);
  b.block(0, 0.7, -0.512, 0.24, 0.05, 0.01, new THREE.Color('#151718'), M.Rubber, Z.Trim);
  for (const x of [-0.1, 0, 0.1]) b.block(x, 0.62, -0.512, 0.05, 0.014, 0.01, metal, M.Metal, Z.Trim);
  b.block(-0.42, 0.66, -0.528, 0.5, 0.16, 0.012, dash.clone().multiplyScalar(1.15), M.Rubber, Z.Trim, 0.01);
  for (const x of [-0.72, -0.2, 0.18, 0.72])
    b.block(x, 0.78, -0.53, 0.12, 0.05, 0.012, new THREE.Color('#151718'), M.Rubber, Z.Trim, 0.008);
  b.block(0.05, 1.18, -0.6, 0.22, 0.06, 0.02, dark, M.Rubber, Z.Trim, 0.01);
  addSteeringColumn(b, cabin);
  // Clutch, brake and accelerator.
  for (const [x, w] of [
    [0.3, 0.07],
    [0.42, 0.08],
    [0.56, 0.05],
  ]) {
    b.rod({ x, y: 0.58, z: -0.7 }, { x, y: 0.3, z: -0.58 }, 0.01, metal);
    b.block(x, 0.29, -0.57, w, 0.09, 0.015, dark, M.Rubber, Z.Trim);
  }
  // Two bucket seats.
  for (const x of [-0.42, 0.42]) {
    b.block(x, 0.36, -0.08, 0.42, 0.16, 0.42, dark, M.Metal, Z.Trim, 0.02);
    b.block(x, 0.48, -0.1, 0.5, 0.11, 0.5, cloth, M.Fabric, Z.Trim, 0.045);
    b.push().translate(x, 0.82, 0.2).rotate(-0.2, 0, 0);
    b.block(0, 0, 0, 0.5, 0.62, 0.12, cloth, M.Fabric, Z.Trim, 0.045);
    b.block(0, 0.4, 0.01, 0.3, 0.16, 0.1, cloth, M.Fabric, Z.Trim, 0.04);
    for (const dx of [-0.12, 0.12]) b.block(dx, 0, -0.062, 0.012, 0.5, 0.006, clothDark, M.Fabric, Z.Trim);
    b.pop();
  }
  // Centre console with the five-speed lever, the transfer lever and their boots.
  b.block(0, 0.3, -0.2, 0.26, 0.2, 0.62, dark, M.Rubber, Z.Trim, 0.03);
  for (const [x, top, z, knob] of [
    [0.06, 0.72, -0.3, dark],
    [-0.06, 0.62, -0.24, new THREE.Color('#3E4244')],
  ] as const) {
    b.block(x, 0.41, z + 0.06, 0.08, 0.03, 0.09, dark, M.Rubber, Z.Trim, 0.02);
    b.rod({ x, y: 0.4, z: z + 0.06 }, { x, y: top, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, top, z);
    b.geometry(new THREE.SphereGeometry(0.026, 12, 8), knob);
    b.pop();
  }
  // Rear bench and backrest, and the cargo floor behind with a fridge and a toolbox.
  b.block(0, 0.42, 0.78, 1.5, 0.12, 0.5, cloth, M.Fabric, Z.Trim, 0.045);
  b.block(0, 0.3, 0.78, 1.4, 0.16, 0.44, dark, M.Metal, Z.Trim);
  b.push().translate(0, 0.76, 1.05).rotate(-0.15, 0, 0);
  b.block(0, 0, 0, 1.5, 0.6, 0.12, cloth, M.Fabric, Z.Trim, 0.045);
  b.pop();
  b.block(0, 0.22, 1.85, 1.6, 0.03, 1.15, dark, M.Fabric, Z.Trim);
  b.block(-0.35, 0.44, 1.8, 0.62, 0.42, 0.42, new THREE.Color('#4C5155'), M.Paint, Z.Trim, 0.03);
  b.block(0.4, 0.38, 1.9, 0.5, 0.3, 0.35, new THREE.Color('#7A1F1C'), M.Paint, Z.Trim, 0.02);
  // Door trims with pulls and window winders, and the headlining.
  for (const side of [-1, 1]) {
    b.block(side * 0.81, 0.5, -0.24, 0.02, 0.48, 1.02, dash, M.Rubber, Z.Trim, 0.01);
    b.block(side * 0.81, 0.5, 0.68, 0.02, 0.48, 0.72, dash, M.Rubber, Z.Trim, 0.01);
    b.block(side * 0.79, 0.62, -0.3, 0.04, 0.035, 0.24, dark, M.Rubber, Z.Trim, 0.01);
    b.rod({ x: side * 0.8, y: 0.5, z: 0.1 }, { x: side * 0.76, y: 0.5, z: 0.1 }, 0.008, metal);
  }
  b.block(0, 1.215, 0.98, 1.62, 0.012, 2.9, lining, M.Fabric, Z.Trim);
  for (const x of [-0.46, 0.38]) b.block(x, 1.19, -0.44, 0.34, 0.012, 0.16, lining, M.Fabric, Z.Trim, 0.004);
}
