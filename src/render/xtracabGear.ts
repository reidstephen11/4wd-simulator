import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { ROUND_BEND, continuousTube } from './bodyRefinement';
import { numberPlate } from './bodyKit';
import { xtracabColors } from './xtracabPaint';
import { BED, F, HOOP, TUBE, XTRACAB_DRIVING_LAMPS } from './xtracabLayout';

/**
 * The film truck's barwork, as its restorer lists it and photographs of replicas show it
 * (reference/vehicles/hilux-sr5-xtracab-1985/SOURCES.md): black double-tube bumpers front and
 * rear, a hoop over the grille with two rectangular lamps, and a double-hoop roll bar in the
 * bed with four round lamps on top, every lamp under a yellow cover. The covers are drawn in
 * the driving-lamp material, so they glow with high beam. Added for the game: a winch between
 * the frame horns, a tow tongue under the rear bar and the number plates.
 */
const { bar, cover } = xtracabColors;
const black = new THREE.Color('#1B1D1E'),
  steel = new THREE.Color('#8F938D'),
  plateInk = new THREE.Color('#1F3D6B');
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tube = (b: VehicleBuilder, points: THREE.Vector3[], zone: number, r = TUBE.r) =>
  continuousTube(b, points, r, bar, zone, M.Metal, ROUND_BEND);
/** A rounded cap on a tube's open end. */
function cap(b: VehicleBuilder, p: THREE.Vector3, zone: number, r = TUBE.r): void {
  b.slot = M.Metal;
  b.tag = zone;
  b.push().translate(p.x, p.y, p.z).scale(1, 1, 0.5);
  b.geometry(new THREE.SphereGeometry(r, 10, 6), bar);
  b.pop();
}

/** Two tubes across the car that wrap round its corners, one above the other. */
function tubePair(b: VehicleBuilder, z: number, end: number, zone: number, high: number, low: number): void {
  const half = 0.86;
  for (const y of [high, low]) {
    tube(b, [V(-half, y, end), V(-half, y, z), V(half, y, z), V(half, y, end)], zone);
    for (const side of [-1, 1]) cap(b, V(side * half, y, end), zone);
  }
  // A plate welded between the tubes near each end, and one each side of the middle.
  for (const x of [-0.74, -0.33, 0.33, 0.74])
    b.block(x, (high + low) / 2, z, 0.014, high - low - 0.03, 0.03, bar, M.Metal, zone);
}

/** A rectangular lamp facing forward under its yellow cover, on a stem from the tube below it. */
function squareLamp(b: VehicleBuilder, p: { x: number; y: number; z: number }): void {
  b.block(p.x, p.y, p.z + 0.045, 0.165, 0.11, 0.075, black, M.Rubber, Z.Front, 0.02);
  b.block(p.x, p.y, p.z + 0.004, 0.172, 0.117, 0.012, cover, M.DrivingLamp, Z.Front, 0.005);
  b.rod(
    V(p.x, TUBE.high + TUBE.r - 0.005, p.z + 0.05),
    V(p.x, p.y - 0.05, p.z + 0.05),
    0.011,
    bar,
    M.Metal,
    Z.Front,
  );
}

/** A round lamp facing forward under its yellow cover, on a stem from the roll bar under it. */
function roundLamp(b: VehicleBuilder, p: { x: number; y: number; z: number }): void {
  const r = 0.082;
  b.slot = M.Rubber;
  b.tag = Z.Roof;
  b.push()
    .translate(p.x, p.y, p.z + 0.05)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r, r * 0.6, 0.09, 20), black);
  b.pop();
  b.slot = M.DrivingLamp;
  b.push()
    .translate(p.x, p.y, p.z)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.014, 24), cover);
  b.pop();
  b.rod(
    V(p.x, HOOP.top + HOOP.r - 0.005, HOOP.z),
    V(p.x, p.y - r * 0.8, p.z + 0.06),
    0.011,
    bar,
    M.Metal,
    Z.Roof,
  );
}

export function frontBar(b: VehicleBuilder): void {
  const z = TUBE.front;
  tubePair(b, z, F + 0.1, Z.Front, TUBE.high, TUBE.low);
  // The hoop over the grille stands on the upper tube and leans back a little at its top.
  tube(
    b,
    [V(-0.33, TUBE.high, z), V(-0.275, 0.605, z + 0.03), V(0.275, 0.605, z + 0.03), V(0.33, TUBE.high, z)],
    Z.Front,
  );
  // Brackets back to the frame horns each side of the winch.
  for (const x of [-0.32, 0.32])
    b.block(x, 0.19, (z + F + 0.2) / 2, 0.016, 0.13, F + 0.2 - z, bar, M.Metal, Z.Trim);
  for (const p of XTRACAB_DRIVING_LAMPS.slice(4)) squareLamp(b, p);
  // The front plate hangs from the lower tube.
  const py = TUBE.low - TUBE.r - 0.068;
  b.block(0, TUBE.low - TUBE.r - 0.004, z - 0.02, 0.2, 0.012, 0.03, bar, M.Metal, Z.Front);
  numberPlate(b, 0, py, z - 0.03, -1, 'RN-066', plateInk);
}

/** A compact winch on a plate between the frame horns, its fairlead between the two tubes. */
export function winch(b: VehicleBuilder, tuning: VehicleTuning): void {
  const m = tuning.winchMount;
  const zc = F - 0.075;
  b.block(0, m.y - 0.065, zc, 0.64, 0.014, 0.13, bar, M.Metal, Z.Trim);
  b.rod(V(-0.13, m.y, zc), V(0.13, m.y, zc), 0.05, black, M.Metal, Z.Front);
  for (let i = 0; i < 9; i++) b.ring(-0.104 + i * 0.026, m.y, zc, 0.05, 0.005, steel, M.Metal, 'x', Z.Front);
  b.rod(V(0.14, m.y, zc), V(0.3, m.y, zc), 0.045, black, M.Metal, Z.Front);
  for (const x of [-0.14, 0.14]) b.block(x, m.y, zc, 0.02, 0.12, 0.12, black, M.Rubber, Z.Front, 0.008);
  // Roller fairlead on a plate welded between the tubes.
  const face = TUBE.front;
  b.block(0, m.y, face, 0.3, TUBE.high - TUBE.low - 2 * TUBE.r + 0.02, 0.014, bar, M.Metal, Z.Front);
  for (const y of [m.y - 0.03, m.y + 0.03])
    b.rod(V(-0.1, y, face - 0.02), V(0.1, y, face - 0.02), 0.012, steel, M.Metal, Z.Front);
  for (const x of [-0.11, 0.11])
    b.rod(V(x, m.y - 0.04, face - 0.02), V(x, m.y + 0.04, face - 0.02), 0.012, steel, M.Metal, Z.Front);
}

export function rearBar(b: VehicleBuilder): void {
  const z = TUBE.rear,
    high = 0.215,
    low = 0.06;
  tubePair(b, z, BED.back - 0.1, Z.Rear, high, low);
  // Brackets forward to the frame's rear crossmember.
  for (const x of [-0.42, 0.42]) b.block(x, 0.1, (z + 2.44) / 2, 0.016, 0.15, z - 2.44, bar, M.Metal, Z.Trim);
  // The rear plate on a backing plate between the tubes.
  b.block(0, (high + low) / 2, z + 0.005, 0.4, high - low - 2 * TUBE.r + 0.02, 0.012, bar, M.Metal, Z.Rear);
  numberPlate(b, 0, (high + low) / 2, z + 0.02, 1, 'RN-066', plateInk);
}

/** The tow tongue under the rear bar, bolted to the rear crossmember, with its ball. */
export function towTongue(b: VehicleBuilder, tuning: VehicleTuning): void {
  const t = tuning.towPoint;
  const end = t.z + 0.15;
  b.block(t.x, t.y + 0.012, (2.44 + end) / 2, 0.07, 0.04, end - 2.44, bar, M.Metal, Z.Rear, 0.006);
  b.rod(V(t.x, t.y + 0.03, t.z + 0.13), V(t.x, t.y + 0.08, t.z + 0.13), 0.012, steel, M.Metal, Z.Rear);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.1, t.z + 0.13);
  b.geometry(new THREE.SphereGeometry(0.025, 12, 8), steel);
  b.pop();
}

/**
 * The roll bar: an upright hoop behind the cab, a second hoop leaning against it from feet
 * further back, a brace each side from the second hoop down onto the wheel housing, and the
 * four round lamps on stems along the top.
 */
export function rollBar(b: VehicleBuilder): void {
  const { z, top, half, r } = HOOP;
  const floor = BED.floor + 0.012;
  const hoop = (z0: number, z1: number, t: number) =>
    tube(
      b,
      [V(-half, floor, z0), V(-half + 0.02, t, z1), V(half - 0.02, t, z1), V(half, floor, z0)],
      Z.Roof,
      r,
    );
  hoop(z, z, top);
  hoop(z + 0.2, z + 2 * r, top);
  for (const side of [-1, 1]) {
    for (const fz of [z, z + 0.2])
      b.block(side * half, floor + 0.006, fz, 0.12, 0.012, 0.11, bar, M.Metal, Z.Trim, 0.003);
    // The brace leaves the second hoop below its bend and lands on the wheel housing's top.
    const from = V(side * (half - 0.004), 1.0, z + 0.2 - (0.2 - 2 * r) * ((1.0 - floor) / (top - floor))),
      to = V(side * (half - 0.004), 0.533, 1.5);
    b.rod(from, to, r * 0.8, bar, M.Metal, Z.Roof);
    b.block(side * (half - 0.004), 0.533, 1.52, 0.1, 0.012, 0.12, bar, M.Metal, Z.Trim, 0.003);
  }
  for (const p of XTRACAB_DRIVING_LAMPS.slice(0, 4)) roundLamp(b, p);
}
