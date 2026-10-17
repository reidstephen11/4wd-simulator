import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

const trim = new THREE.Color('#343D37'),
  steel = new THREE.Color('#959B94');
const black = new THREE.Color('#232926'),
  canvas = new THREE.Color('#77735A');
const red = new THREE.Color('#B84A32');

function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing < 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.36, 0.12, 0.015, black, M.Rubber, Z.Trim, 0.009);
  b.block(0, 0, 0.01, 0.33, 0.095, 0.008, pal('vehicleRoof'), M.Paint, Z.Trim, 0.005);
  // Small raised HC-40 characters, drawn as strokes rather than a downloaded decal.
  const line = (ax: number, ay: number, bx: number, by: number) =>
    b.rod({ x: ax, y: ay, z: 0.017 }, { x: bx, y: by, z: 0.017 }, 0.003, black, M.Rubber);
  for (const x0 of [-0.12, -0.08]) line(x0, -0.028, x0, 0.028);
  line(-0.12, 0, -0.08, 0);
  line(-0.05, -0.028, -0.05, 0.028);
  line(-0.05, -0.028, -0.015, -0.028);
  line(-0.05, 0.028, -0.015, 0.028);
  line(0.01, 0, 0.03, 0);
  line(0.06, 0.028, 0.045, 0);
  line(0.045, 0, 0.085, 0);
  line(0.08, -0.028, 0.08, 0.028);
  for (const x0 of [0.11, 0.145]) line(x0, -0.028, x0, 0.028);
  line(0.11, -0.028, 0.145, -0.028);
  line(0.11, 0.028, 0.145, 0.028);
  for (const bx of [-0.145, 0.145]) b.block(bx, 0.033, 0.02, 0.008, 0.008, 0.004, steel, M.Metal, Z.Trim);
  b.pop();
}

function recovery(b: VehicleBuilder, tuning: VehicleTuning): void {
  b.block(0, 0.22, -1.98, 1.84, 0.16, 0.19, trim, M.Metal, Z.Front, 0.018);
  b.block(0, 0.21, 1.94, 1.79, 0.15, 0.17, trim, M.Metal, Z.Rear, 0.014);
  for (const side of [-1, 1])
    for (const z of [-2.075, 2.04]) {
      b.block(side * 0.6, 0.23, z, 0.09, 0.13, 0.04, steel, M.Metal, Z.Trim);
      b.ring(side * 0.6, 0.18, z + Math.sign(z) * 0.035, 0.047, 0.012, red, M.Paint);
      b.rod(
        { x: side * 0.6 - 0.055, y: 0.21, z: z + Math.sign(z) * 0.035 },
        { x: side * 0.6 + 0.055, y: 0.21, z: z + Math.sign(z) * 0.035 },
        0.012,
        steel,
      );
    }
  // Winch drum with cable coils, motor, clutch and a roller fairlead at the actual cable exit.
  b.block(0, 0.33, -1.98, 0.61, 0.08, 0.25, black, M.Rubber, Z.Front);
  b.rod({ x: -0.18, y: 0.4, z: -1.98 }, { x: 0.18, y: 0.4, z: -1.98 }, 0.085, trim);
  for (let i = 0; i < 15; i++)
    b.ring(-0.16 + i * 0.023, 0.4, -1.98, 0.084, 0.006, steel, M.Metal, 'x', Z.Front);
  for (const x of [-0.2, 0.2]) b.block(x, 0.4, -1.98, 0.035, 0.21, 0.21, black, M.Rubber, Z.Front, 0.015);
  b.rod({ x: -0.4, y: 0.4, z: -1.98 }, { x: -0.22, y: 0.4, z: -1.98 }, 0.065, trim);
  b.block(0, 0.52, -1.98, 0.22, 0.07, 0.16, black, M.Rubber, Z.Front, 0.014);
  const mount = tuning.winchMount;
  for (const y of [mount.y - 0.045, mount.y + 0.045])
    b.rod(
      { x: -0.16, y, z: mount.z - 0.015 },
      { x: 0.16, y, z: mount.z - 0.015 },
      0.018,
      steel,
      M.Metal,
      Z.Front,
    );
  for (const x of [-0.17, 0.17])
    b.rod(
      { x, y: mount.y - 0.04, z: mount.z - 0.018 },
      { x, y: mount.y + 0.04, z: mount.z - 0.018 },
      0.018,
      steel,
      M.Metal,
      Z.Front,
    );
  b.ring(0, mount.y - 0.025, mount.z - 0.04, 0.026, 0.008, red, M.Paint, 'z', Z.Front);
  // A low tubular brush bar protects the grille without covering the headlamps.
  for (const side of [-1, 1]) {
    b.rod({ x: side * 0.38, y: 0.29, z: -2.09 }, { x: side * 0.38, y: 0.81, z: -2.09 }, 0.027, trim);
    b.rod({ x: side * 0.38, y: 0.78, z: -2.09 }, { x: side * 0.82, y: 0.73, z: -2.055 }, 0.024, trim);
    b.rod({ x: side * 0.82, y: 0.73, z: -2.055 }, { x: side * 0.85, y: 0.3, z: -2.055 }, 0.024, trim);
  }
  b.rod({ x: -0.38, y: 0.81, z: -2.09 }, { x: 0.38, y: 0.81, z: -2.09 }, 0.027, trim);
  plate(b, 0, 0.22, -2.09, -1);
  plate(b, -0.46, 0.235, 2.045, 1);
  // Chassis, crossmembers, transmission pan and exhaust visible from side and underneath.
  for (const x of [-0.47, 0.47]) b.block(x, 0.02, 0.06, 0.1, 0.16, 3.18, trim, M.Metal, Z.Trim);
  for (const z of [-1.42, -0.45, 0.44, 1.5]) b.block(0, 0.02, z, 1.04, 0.09, 0.09, trim, M.Metal, Z.Trim);
  b.block(0, 0.015, -0.23, 0.38, 0.15, 0.65, steel.clone().multiplyScalar(0.5), M.Metal, Z.Trim, 0.025);
  b.rod({ x: 0.31, y: -0.04, z: -0.66 }, { x: 0.4, y: -0.03, z: 1.13 }, 0.025, steel);
  b.rod({ x: 0.4, y: -0.03, z: 1.13 }, { x: 0.64, y: -0.06, z: 1.74 }, 0.025, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.37, -0.02, 0.56)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
}

function roofGear(b: VehicleBuilder): void {
  // Feet, basket deck, perimeter rails, uprights and tie-down rings.
  for (const x of [-0.68, 0.68]) {
    for (const z of [-0.29, 0.66, 1.52]) b.block(x, 1.71, z, 0.08, 0.12, 0.1, trim, M.Metal, Z.Roof);
    b.rod({ x, y: 1.77, z: -0.4 }, { x, y: 1.77, z: 1.62 }, 0.022, trim, M.Metal, Z.Roof);
    b.rod({ x, y: 1.94, z: -0.4 }, { x, y: 1.94, z: 1.62 }, 0.018, trim, M.Metal, Z.Roof);
    for (const z of [-0.4, 0.1, 0.62, 1.12, 1.62])
      b.rod({ x, y: 1.77, z }, { x, y: 1.94, z }, 0.012, trim, M.Metal, Z.Roof);
  }
  for (const z of [-0.4, 1.62]) {
    b.rod({ x: -0.68, y: 1.77, z }, { x: 0.68, y: 1.77, z }, 0.022, trim, M.Metal, Z.Roof);
    b.rod({ x: -0.68, y: 1.94, z }, { x: 0.68, y: 1.94, z }, 0.018, trim, M.Metal, Z.Roof);
  }
  for (let i = 0; i < 10; i++) b.block(0, 1.77, -0.3 + i * 0.2, 1.35, 0.025, 0.028, trim, M.Metal, Z.Roof);
  // Strapped canvas luggage and a small latched toolbox leave room for both recovery planks.
  b.block(0.4, 1.91, 1.01, 0.38, 0.25, 0.71, canvas, M.Fabric, Z.Roof, 0.045);
  for (const z of [0.79, 1.23]) {
    b.block(0.4, 2.042, z, 0.39, 0.018, 0.04, black, M.Rubber, Z.Roof);
    for (const x of [0.2, 0.6]) b.block(x, 1.91, z, 0.012, 0.25, 0.04, black, M.Rubber, Z.Roof);
    b.block(0.607, 1.93, z, 0.015, 0.055, 0.045, steel, M.Metal, Z.Roof);
  }
  b.block(0.4, 1.87, 0.12, 0.38, 0.17, 0.57, trim, M.Metal, Z.Roof, 0.015);
  b.block(0.4, 1.963, 0.12, 0.39, 0.022, 0.59, trim, M.Metal, Z.Roof, 0.008);
  for (const z of [-0.05, 0.29]) b.block(0.6, 1.9, z, 0.012, 0.07, 0.04, steel, M.Metal, Z.Roof);
  b.rod({ x: 0.35, y: 1.977, z: 0.12 }, { x: 0.45, y: 1.977, z: 0.12 }, 0.008, steel, M.Metal, Z.Roof);
}

export function addVehicleEquipment(
  b: VehicleBuilder,
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
): void {
  recovery(b, tuning);
  roofGear(b);
  // Rear swing-away spare carrier and matching full-size wheel, with its rim facing back.
  b.rod({ x: 0.7, y: 0.53, z: 1.92 }, { x: 0.2, y: 0.53, z: 2.02 }, 0.025, trim);
  b.rod({ x: 0.7, y: 0.53, z: 1.92 }, { x: 0.7, y: 0.97, z: 1.92 }, 0.025, trim);
  b.rod({ x: 0.7, y: 0.97, z: 1.92 }, { x: 0.2, y: 0.84, z: 2.02 }, 0.025, trim);
  b.tag = Z.Rear;
  b.push()
    .translate(0.2, 0.86, 2.015)
    .rotate(0, -Math.PI / 2, 0);
  b.geometry(wheel.clone(), black);
  b.pop();
  // Pressed-steel jerry can with X ribs, handle, cap and a retaining strap.
  const olive = new THREE.Color('#667258');
  b.block(-0.43, 0.73, 1.96, 0.25, 0.43, 0.19, olive, M.Paint, Z.Rear, 0.02);
  b.block(-0.43, 0.52, 1.96, 0.29, 0.045, 0.23, trim, M.Metal, Z.Rear);
  for (const side of [-1, 1])
    b.rod(
      { x: -0.43 - 0.09, y: 0.56 + (side > 0 ? 0 : 0.3), z: 2.06 },
      { x: -0.43 + 0.09, y: 0.56 + (side > 0 ? 0.3 : 0), z: 2.06 },
      0.009,
      olive,
      M.Paint,
      Z.Rear,
    );
  b.block(-0.43, 0.71, 2.072, 0.035, 0.37, 0.017, black, M.Rubber, Z.Rear);
  for (const x of [-0.49, -0.4])
    b.rod({ x, y: 0.94, z: 1.96 }, { x, y: 1.01, z: 1.96 }, 0.012, olive, M.Paint, Z.Rear);
  b.rod({ x: -0.49, y: 1.01, z: 1.96 }, { x: -0.4, y: 1.01, z: 1.96 }, 0.012, olive, M.Paint, Z.Rear);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(-0.35, 0.95, 1.96);
  b.geometry(new THREE.CylinderGeometry(0.025, 0.025, 0.018, 12), steel);
  b.pop();
  // Flexible whip aerial on the front wing (not an intake/snorkel).
  b.block(-0.78, 0.82, -0.77, 0.06, 0.06, 0.06, black, M.Rubber, Z.Front);
  b.rod({ x: -0.78, y: 0.85, z: -0.77 }, { x: -0.8, y: 1.65, z: -0.73 }, 0.005, trim);
}

export function buildRackPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = pal('barkOchre');
  const x = index === 0 ? -0.46 : -0.1;
  b.block(x, 1.82, 0.59, 0.3, 0.055, 2.4, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.12 + i * 0.075,
      1.85,
      0.59,
      0.004,
      0.003,
      2.34,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const z of [-0.2, 1.4]) {
    b.block(x, 1.856, z, 0.305, 0.015, 0.045, black, M.Rubber, Z.Roof);
    b.block(x + 0.13, 1.865, z, 0.035, 0.012, 0.055, steel, M.Metal, Z.Roof);
  }
  return b.build();
}
