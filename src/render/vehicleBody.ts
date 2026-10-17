import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addVehicleInterior } from './vehicleInterior';
import { addVehicleEquipment } from './vehicleEquipment';

const steel = new THREE.Color('#93988F'),
  rubber = new THREE.Color('#252B28');
const red = new THREE.Color('#AE3029'),
  amber = new THREE.Color('#EDA53E');
const glass = new THREE.Color('#9CB9B5');

/** The panels around the wheel opening, rather than a solid box through the tyres. */
function quarter(
  b: VehicleBuilder,
  side: number,
  start: number,
  end: number,
  axle: number,
  top: number,
  zone: number,
): void {
  const outer = side * 0.81,
    inner = side * 0.74;
  const steps = 28,
    radius = 0.54;
  const body = pal('vehicleBody');
  const low = (z: number) =>
    Math.max(0.12, Math.sqrt(Math.max(0, radius * radius - (z - axle) ** 2)) + 0.025);
  b.slot = M.Paint;
  b.tag = zone;
  for (let i = 0; i < steps; i++) {
    const za = start + ((end - start) * i) / steps,
      zb = start + ((end - start) * (i + 1)) / steps;
    const ya = low(za),
      yb = low(zb);
    const a = { x: outer, y: ya, z: za },
      c = { x: outer, y: top, z: zb };
    const bb = { x: outer, y: yb, z: zb },
      d = { x: outer, y: top, z: za };
    if (side < 0) b.quad(a, bb, c, d, body);
    else b.quad(d, c, bb, a, body);
    const ai = { ...a, x: inner },
      bi = { ...bb, x: inner },
      ci = { ...c, x: inner },
      di = { ...d, x: inner };
    if (side > 0) b.quad(ai, bi, ci, di, body);
    else b.quad(di, ci, bi, ai, body);
    if (side > 0) b.quad(a, ai, bi, bb, body);
    else b.quad(bb, bi, ai, a, body);
    // The top edge is a visible folded lip, including when looking into a wheel well.
    if (side > 0) b.quad(d, c, ci, di, body);
    else b.quad(di, ci, c, d, body);
  }
  b.slot = M.Rubber;
  b.tag = zone;
  b.push()
    .translate(side * 0.827, 0.025, axle)
    .rotate(0, Math.PI / 2, 0);
  b.geometry(new THREE.TorusGeometry(radius + 0.012, 0.022, 5, 32, Math.PI), rubber);
  b.pop();
  // A painted lip stands proud of the recessed black wheel opening.
  b.slot = M.Paint;
  b.push()
    .translate(side * 0.847, 0.025, axle)
    .rotate(0, Math.PI / 2, 0);
  b.geometry(new THREE.TorusGeometry(radius + 0.045, 0.022, 5, 32, Math.PI), body);
  b.pop();
}

function windscreen(b: VehicleBuilder): void {
  const cream = pal('vehicleRoof');
  b.push().translate(0, 1.205, -0.585).rotate(0.19, 0, 0);
  for (const y of [-0.29, 0.29]) b.block(0, y, 0, 1.52, 0.065, 0.062, cream, M.Paint, Z.Front, 0.012);
  for (const x of [-0.73, 0.73]) b.block(x, 0, 0, 0.065, 0.58, 0.062, cream, M.Paint, Z.Front, 0.012);
  for (const x of [-0.36, 0.36]) {
    b.block(x, 0, -0.005, 0.675, 0.505, 0.012, glass, M.Glass, Z.Glass, 0.012);
    b.block(x, 0.255, -0.018, 0.69, 0.013, 0.012, rubber, M.Rubber, Z.Front);
    b.block(x, -0.255, -0.018, 0.69, 0.013, 0.012, rubber, M.Rubber, Z.Front);
  }
  b.block(0, 0, -0.013, 0.025, 0.53, 0.025, cream, M.Paint, Z.Front);
  for (const x of [-0.38, 0.38]) {
    b.rod({ x, y: -0.26, z: -0.05 }, { x: x + 0.1, y: -0.01, z: -0.05 }, 0.008, rubber, M.Rubber, Z.Front);
    b.rod(
      { x: x - 0.05, y: -0.01, z: -0.052 },
      { x: x + 0.27, y: -0.01, z: -0.052 },
      0.009,
      rubber,
      M.Rubber,
      Z.Front,
    );
  }
  b.pop();
}

function front(b: VehicleBuilder): void {
  const body = pal('vehicleBody'),
    cream = pal('vehicleRoof');
  // Narrow, rounded bonnet above wide separate wings: the characteristic 40 Series nose.
  b.block(0, 0.85, -1.235, 1.25, 0.15, 1.2, body, M.Paint, Z.Front, 0.045);
  b.block(0, 0.65, -1.23, 1.16, 0.3, 1.18, body, M.Paint, Z.Front);
  b.block(0, 0.76, -0.6, 1.52, 0.23, 0.23, body, M.Paint, Z.Front, 0.025);
  for (const side of [-1, 1]) {
    b.block(side * 0.735, 0.76, -1.225, 0.28, 0.075, 1.23, body, M.Paint, Z.Front, 0.018);
    b.block(side * 0.627, 0.84, -1.18, 0.012, 0.015, 1.08, rubber, M.Rubber, Z.Front);
    // Bonnet hinge, catch, ventilation slots and wing-top indicator.
    b.block(side * 0.46, 0.939, -0.73, 0.09, 0.018, 0.13, steel, M.Metal, Z.Front);
    b.block(side * 0.635, 0.7, -1.48, 0.028, 0.105, 0.04, rubber, M.Rubber, Z.Front);
    b.rod(
      { x: side * 0.65, y: 0.69, z: -1.48 },
      { x: side * 0.65, y: 0.78, z: -1.48 },
      0.008,
      steel,
      M.Metal,
      Z.Front,
    );
    for (let i = 0; i < 7; i++)
      b.block(side * 0.59, 0.93, -0.92 - i * 0.065, 0.055, 0.008, 0.022, rubber, M.Rubber, Z.Front);
    b.block(side * 0.75, 0.81, -1.61, 0.14, 0.07, 0.13, rubber, M.Rubber, Z.Front, 0.012);
    b.block(side * 0.75, 0.847, -1.62, 0.11, 0.022, 0.1, amber, M.Amber, Z.Front, 0.01);
  }
  // Cream radiator surround, inset grille, fine horizontal slats and round lamps.
  b.block(0, 0.58, -1.85, 1.46, 0.49, 0.1, cream, M.Paint, Z.Front, 0.065);
  b.block(0, 0.59, -1.906, 0.73, 0.31, 0.016, rubber, M.Rubber, Z.Front, 0.028);
  for (let i = 0; i < 7; i++)
    b.block(
      0,
      0.46 + i * 0.043,
      -1.92,
      0.68,
      0.016,
      0.015,
      steel.clone().multiplyScalar(0.55),
      M.Metal,
      Z.Front,
    );
  b.block(0, 0.6, -1.934, 0.15, 0.08, 0.008, cream, M.Paint, Z.Front, 0.008);
  // A small generic twin-bar badge keeps the handmade model free of copied artwork.
  for (const x of [-0.032, 0.032]) b.block(x, 0.6, -1.94, 0.014, 0.05, 0.006, rubber, M.Rubber, Z.Front);
  for (const x of [-0.535, 0.535]) {
    b.slot = M.Rubber;
    b.tag = Z.Front;
    b.push()
      .translate(x, 0.605, -1.925)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.155, 0.155, 0.025, 32), rubber);
    b.pop();
    b.ring(x, 0.605, -1.948, 0.136, 0.015, steel, M.Metal, 'z', Z.Front);
    b.slot = M.Lamp;
    b.push().translate(x, 0.605, -1.948).scale(1, 1, 0.23);
    b.geometry(new THREE.SphereGeometry(0.123, 24, 12), new THREE.Color('#E3E4CD'));
    b.pop();
    for (let i = -3; i <= 3; i++) {
      const width = Math.sqrt(0.116 ** 2 - (i * 0.027) ** 2) * 2;
      b.block(x, 0.605 + i * 0.027, -1.978, width, 0.004, 0.003, cream, M.Lamp, Z.Front);
    }
  }
}

function sidesAndRear(b: VehicleBuilder): void {
  const body = pal('vehicleBody'),
    cream = pal('vehicleRoof');
  b.block(0, 0.13, 0.1, 1.16, 0.12, 3.36, rubber, M.Rubber, Z.Trim);
  for (const side of [-1, 1]) {
    quarter(b, side, -1.83, -0.6, -1.15, 0.745, Z.Front);
    quarter(b, side, 0.51, 1.82, 1.15, 0.8, Z.Rear);
    b.block(side * 0.79, 0.47, -0.045, 0.07, 0.68, 1.08, body, M.Paint, Z.Sides, 0.014);
    // Recessed door perimeter, exposed hinges, pull handle and lock barrel.
    for (const z of [-0.57, 0.485])
      b.block(side * 0.831, 0.475, z, 0.008, 0.6, 0.011, rubber, M.Rubber, Z.Sides);
    b.block(side * 0.831, 0.18, -0.045, 0.008, 0.012, 1.04, rubber, M.Rubber, Z.Sides);
    b.block(side * 0.835, 0.76, 0.31, 0.018, 0.075, 0.2, rubber, M.Rubber, Z.Sides, 0.008);
    b.rod(
      { x: side * 0.858, y: 0.772, z: 0.24 },
      { x: side * 0.858, y: 0.772, z: 0.38 },
      0.013,
      steel,
      M.Metal,
      Z.Sides,
    );
    b.slot = M.Metal;
    b.tag = Z.Sides;
    b.push()
      .translate(side * 0.85, 0.71, 0.35)
      .rotate(0, 0, Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 12), steel);
    b.pop();
    for (const y of [0.34, 0.67]) {
      b.block(side * 0.837, y, -0.54, 0.026, 0.065, 0.13, body, M.Paint, Z.Sides, 0.006);
      b.rod(
        { x: side * 0.86, y: y - 0.04, z: -0.56 },
        { x: side * 0.86, y: y + 0.04, z: -0.56 },
        0.013,
        steel,
        M.Metal,
        Z.Sides,
      );
      for (const z of [-0.5, -0.57]) b.block(side * 0.854, y, z, 0.01, 0.012, 0.012, steel, M.Metal, Z.Sides);
    }
    // Continuous painted waist closes the body below the removable hardtop.
    b.block(side * 0.79, 0.855, 0.61, 0.075, 0.13, 2.43, body, M.Paint, Z.Sides, 0.006);
    // Cream window surround, quarter-light divider, sliding rear window and rain gutter.
    for (const y of [0.91, 1.49])
      b.block(side * 0.775, y, 0.61, 0.065, 0.08, 2.43, cream, M.Paint, Z.Sides, 0.012);
    for (const z of [-0.55, 0.51, 1.78])
      b.block(side * 0.775, 1.2, z, 0.065, 0.57, 0.07, cream, M.Paint, Z.Sides, 0.01);
    b.block(side * 0.79, 1.205, 0.085, 0.012, 0.49, 0.75, glass, M.Glass, Z.Glass, 0.014);
    b.block(side * 0.79, 1.205, -0.405, 0.012, 0.49, 0.17, glass, M.Glass, Z.Glass, 0.01);
    b.block(side * 0.798, 1.205, -0.302, 0.015, 0.51, 0.018, rubber, M.Rubber, Z.Sides);
    b.block(side * 0.785, 1.205, 1.145, 0.012, 0.45, 1.11, glass, M.Glass, Z.Glass, 0.025);
    b.block(side * 0.795, 1.205, 1.16, 0.02, 0.45, 0.018, rubber, M.Rubber, Z.Sides);
    b.block(side * 0.82, 1.54, 0.62, 0.025, 0.02, 2.46, steel, M.Metal, Z.Roof);
    // Ribbed running board and two braced mirror arms.
    b.block(side * 0.865, 0.08, -0.03, 0.18, 0.055, 0.95, rubber, M.Rubber, Z.Trim);
    for (let i = 0; i < 7; i++)
      b.block(side * 0.865, 0.111, -0.41 + i * 0.125, 0.17, 0.008, 0.015, steel, M.Metal, Z.Trim);
    b.rod(
      { x: side * 0.82, y: 0.93, z: -0.52 },
      { x: side * 1.0, y: 1.15, z: -0.61 },
      0.013,
      steel,
      M.Metal,
      Z.Sides,
    );
    b.rod(
      { x: side * 0.82, y: 1.07, z: -0.5 },
      { x: side * 1.0, y: 1.15, z: -0.61 },
      0.009,
      steel,
      M.Metal,
      Z.Sides,
    );
    b.block(side * 1.015, 1.23, -0.61, 0.05, 0.21, 0.14, rubber, M.Rubber, Z.Trim, 0.02);
    b.block(side * 1.046, 1.23, -0.602, 0.008, 0.17, 0.105, steel, M.Metal, Z.Trim, 0.012);
    // Rear hardtop corners and a split tail door with framed glass.
    b.block(side * 0.385, 0.48, 1.805, 0.75, 0.64, 0.055, body, M.Paint, Z.Rear, 0.012);
    b.block(side * 0.385, 0.895, 1.805, 0.75, 0.18, 0.06, cream, M.Paint, Z.Rear);
    b.block(side * 0.385, 1.49, 1.805, 0.75, 0.06, 0.065, cream, M.Paint, Z.Rear);
    for (const x of [side * 0.745, side * 0.025])
      b.block(x, 1.21, 1.805, 0.045, 0.53, 0.065, cream, M.Paint, Z.Rear);
    b.block(side * 0.385, 1.215, 1.807, 0.655, 0.455, 0.013, glass, M.Glass, Z.Glass, 0.025);
    for (const y of [0.38, 0.74, 1.39])
      b.block(side * 0.72, y, 1.852, 0.12, 0.045, 0.03, steel, M.Metal, Z.Rear, 0.005);
    b.block(side * 0.66, 0.4, 1.858, 0.18, 0.32, 0.06, rubber, M.Rubber, Z.Rear, 0.015);
    b.block(side * 0.66, 0.47, 1.896, 0.13, 0.07, 0.022, amber, M.Amber, Z.Rear, 0.007);
    b.block(side * 0.66, 0.38, 1.896, 0.13, 0.1, 0.022, red, M.Red, Z.Rear, 0.007);
    b.block(side * 0.66, 0.29, 1.896, 0.13, 0.04, 0.022, cream, M.Lamp, Z.Rear, 0.005);
    for (let i = 0; i < 4; i++)
      b.block(
        side * 0.66,
        0.345 + i * 0.023,
        1.91,
        0.125,
        0.003,
        0.003,
        red.clone().multiplyScalar(0.5),
        M.Red,
        Z.Rear,
      );
    b.block(side * 0.81, 0.05, 1.53, 0.13, 0.27, 0.025, rubber, M.Rubber, Z.Trim);
  }
  b.block(0, 1.605, 0.625, 1.64, 0.18, 2.5, cream, M.Paint, Z.Roof, 0.065);
  for (const x of [-0.53, -0.27, 0.27, 0.53])
    b.block(x, 1.697, 0.61, 0.024, 0.008, 2.22, cream, M.Paint, Z.Roof);
  b.block(0, 0.82, 1.846, 0.014, 1.29, 0.012, rubber, M.Rubber, Z.Rear);
  b.block(-0.08, 0.83, 1.872, 0.09, 0.025, 0.035, steel, M.Metal, Z.Rear);
  windscreen(b);
}

export function buildVehicleBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  front(b);
  sidesAndRear(b);
  addVehicleInterior(b);
  addVehicleEquipment(b, tuning, wheel);
  return b.build();
}
