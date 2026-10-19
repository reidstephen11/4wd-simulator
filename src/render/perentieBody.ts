import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addPerentieInterior } from './perentieInterior';
import { perentieColors } from './perentiePaint';

/**
 * Land Rover 110 "Perentie" General Service soft top in Australian Army green, after the
 * one Les Hiddins drove in the first Bush Tucker Man series (registration 48-001). Flat
 * panels and flat-topped wings, a black slatted grille between the headlamp panels, a
 * heavy bull bar, vent flaps under an upright windscreen, a canvas tilt over the cab
 * and rear tub, a galvanised chassis and the Perentie's spare wheel slung under the
 * rear floor. Ground is about 0.52 m below the origin when parked.
 */
const { paint, canvas, bar, galv } = perentieColors;
const black = new THREE.Color('#1F2320'),
  rubber = new THREE.Color('#252926'),
  steel = new THREE.Color('#9A9E97');
const red = new THREE.Color('#AE3029'),
  amber = new THREE.Color('#E39B37'),
  lens = new THREE.Color('#E3E4CD');
const glass = new THREE.Color('#A9BDB6'),
  white = new THREE.Color('#E8E6DC');

/** Body sides, wheel openings and the main heights (vehicle frame). */
const SIDE = 0.845;
const WAIST = 0.78;
const SILL = 0.07;
const ARCH = { radius: 0.51, cy: -0.05 };
const FRONT_FACE = -2.02;
const SCUTTLE = -0.8;
const B_PILLAR = 0.21;
const TAIL = 2.3;
const ROOF = 1.51;
const SCREEN_TOP = 1.36;

/**
 * A side panel from `start` to `end` with a round wheel opening cut around `axle`; the
 * panel is a skin with a visible return edge, so a wheel well can be looked into.
 */
function archPanel(
  b: VehicleBuilder,
  side: number,
  start: number,
  end: number,
  axle: number,
  top: number,
  zone: number,
  wellX: number,
): void {
  const outer = side * SIDE,
    inner = side * (SIDE - 0.05);
  const steps = 30;
  const low = (z: number) =>
    Math.max(SILL, Math.sqrt(Math.max(0, ARCH.radius ** 2 - (z - axle) ** 2)) + ARCH.cy);
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
    if (side < 0) b.quad(a, bb, c, d, paint);
    else b.quad(d, c, bb, a, paint);
    const ai = { ...a, x: inner },
      bi = { ...bb, x: inner },
      ci = { ...c, x: inner },
      di = { ...d, x: inner };
    if (side > 0) b.quad(ai, bi, ci, di, paint);
    else b.quad(di, ci, bi, ai, paint);
    if (side > 0) b.quad(a, ai, bi, bb, paint);
    else b.quad(bb, bi, ai, a, paint);
    if (side > 0) b.quad(d, c, ci, di, paint);
    else b.quad(di, ci, c, d, paint);
  }
  // Flat black wheel-arch flare standing proud of the opening.
  b.slot = M.Rubber;
  b.tag = zone;
  b.push()
    .translate(side * (SIDE + 0.012), ARCH.cy, axle)
    .rotate(0, Math.PI / 2, 0)
    .scale(1, 1, 0.55);
  b.geometry(new THREE.TorusGeometry(ARCH.radius + 0.03, 0.045, 4, 36, Math.PI), black);
  b.pop();
  // Inner wheel box, so the opening shows a dark well rather than the far side; the front
  // ones sit further in, clear of the wheels at full lock.
  b.block(side * wellX, ARCH.cy + 0.2, axle, 0.03, 0.62, ARCH.radius * 2, black, M.Rubber, Z.Trim);
  b.block(
    (side * (wellX + SIDE)) / 2,
    ARCH.cy + ARCH.radius + 0.015,
    axle,
    SIDE - wellX,
    0.03,
    ARCH.radius * 1.6,
    black,
    M.Rubber,
    Z.Trim,
  );
}

/** Five-segment stroke digits for the Army number plates. */
const GLYPHS: Record<string, number[][]> = {
  '0': [
    [0, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [0, 1, 0, 0],
  ],
  '1': [
    [0.55, 0, 0.55, 1],
    [0.2, 0.75, 0.55, 1],
  ],
  '4': [
    [0.75, 0, 0.75, 1],
    [0.75, 1, 0, 0.35],
    [0, 0.35, 1, 0.35],
  ],
  '8': [
    [0, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0.5, 1, 0.5],
  ],
  '-': [[0.15, 0.5, 0.85, 0.5]],
};

/** Black plate with white "48-001" (the plate faces -z before `facing` turns it). */
function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: 1 | -1): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing > 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.34, 0.11, 0.012, black, M.Rubber, Z.Trim, 0.006);
  const text = '48-001';
  const w = 0.03,
    h = 0.055,
    pitch = 0.047;
  for (let i = 0; i < text.length; i++) {
    const x0 = (i - (text.length - 1) / 2) * pitch;
    for (const [ax, ay, bx, by] of GLYPHS[text[i]])
      b.rod(
        { x: -(x0 + (ax - 0.5) * w), y: (ay - 0.5) * h, z: -0.009 },
        { x: -(x0 + (bx - 0.5) * w), y: (by - 0.5) * h, z: -0.009 },
        0.0032,
        white,
        M.Lamp,
        Z.Trim,
      );
  }
  b.pop();
}

function frontEnd(b: VehicleBuilder): void {
  const F = FRONT_FACE;
  // Bonnet between flat-topped wings, with its front lip, hinges and catches.
  b.block(0, 0.6, -1.41, 1.16, 0.05, 1.2, paint, M.Paint, Z.Front, 0.02);
  b.block(0, 0.575, F + 0.03, 1.16, 0.05, 0.05, paint, M.Paint, Z.Front, 0.012);
  for (const side of [-1, 1]) {
    b.block(side * 0.33, 0.632, -0.86, 0.12, 0.016, 0.06, steel, M.Metal, Z.Front);
    b.block(side * 0.5, 0.6, F + 0.005, 0.05, 0.05, 0.02, black, M.Rubber, Z.Front);
    // Wing top, the outer wing around the wheel and the inner wing beside the engine.
    b.block(side * 0.727, 0.59, -1.41, 0.24, 0.04, 1.22, paint, M.Paint, Z.Front, 0.012);
    archPanel(b, side, F, SCUTTLE, -1.397, 0.585, Z.Front, 0.45);
    // Headlamp panel: round lamp in a black bezel, side lamp and indicator beneath.
    b.block(side * 0.63, 0.33, F + 0.02, 0.42, 0.52, 0.04, paint, M.Paint, Z.Front, 0.01);
    b.slot = M.Rubber;
    b.tag = Z.Front;
    b.push()
      .translate(side * 0.625, 0.39, F - 0.005)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 28), black);
    b.pop();
    b.ring(side * 0.625, 0.39, F - 0.022, 0.093, 0.012, steel, M.Metal, 'z', Z.Front);
    b.slot = M.Lamp;
    b.push()
      .translate(side * 0.625, 0.39, F - 0.022)
      .scale(1, 1, 0.3);
    b.geometry(new THREE.SphereGeometry(0.088, 24, 12), lens);
    b.pop();
    b.block(side * 0.625, 0.18, F - 0.005, 0.2, 0.075, 0.03, black, M.Rubber, Z.Front, 0.008);
    b.block(side * 0.675, 0.18, F - 0.024, 0.085, 0.052, 0.012, amber, M.Amber, Z.Front, 0.005);
    b.block(side * 0.575, 0.18, F - 0.024, 0.085, 0.052, 0.012, lens, M.Lamp, Z.Front, 0.005);
    // Air intake grille on the left wing; the right wing is plain.
    if (side < 0) {
      b.block(-SIDE - 0.004, 0.45, -1.02, 0.012, 0.13, 0.26, black, M.Rubber, Z.Front, 0.006);
      for (let i = 0; i < 5; i++)
        b.block(-SIDE - 0.011, 0.4 + i * 0.024, -1.02, 0.006, 0.006, 0.23, rubber, M.Rubber, Z.Front);
    }
  }
  // Black slatted grille with a plain oval badge.
  b.block(0, 0.33, F + 0.005, 0.84, 0.46, 0.03, black, M.Rubber, Z.Front, 0.01);
  for (let i = 0; i < 10; i++)
    b.block(0, 0.135 + i * 0.044, F - 0.016, 0.8, 0.018, 0.016, rubber, M.Rubber, Z.Front, 0.004);
  for (const x of [-0.2, 0, 0.2]) b.block(x, 0.33, F - 0.02, 0.016, 0.44, 0.012, rubber, M.Rubber, Z.Front);
  b.push()
    .translate(0, 0.5, F - 0.03)
    .rotate(Math.PI / 2, 0, 0)
    .scale(1.7, 1, 1);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.geometry(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 20), steel.clone().multiplyScalar(0.7));
  b.pop();
  // Sump, steering box and the front crossmember below the grille.
  b.block(0, -0.04, -1.62, 0.36, 0.16, 0.5, black, M.Metal, Z.Trim, 0.02);
  b.block(0.36, 0.02, -1.86, 0.14, 0.16, 0.16, black, M.Metal, Z.Trim, 0.02);
}

function windscreen(b: VehicleBuilder): void {
  // Scuttle with its two vent flaps, then the upright frame and its wipers.
  b.block(0, 0.7, SCUTTLE, 1.7, 0.16, 0.1, paint, M.Paint, Z.Front, 0.012);
  for (const x of [-0.38, 0.38]) {
    b.block(x, 0.7, SCUTTLE - 0.058, 0.44, 0.1, 0.02, paint, M.Paint, Z.Front, 0.008);
    b.block(x, 0.752, SCUTTLE - 0.062, 0.44, 0.008, 0.016, black, M.Rubber, Z.Front);
  }
  const lean = Math.atan2(0.07, SCREEN_TOP - WAIST);
  b.push()
    .translate(0, WAIST, SCUTTLE + 0.01)
    .rotate(lean, 0, 0);
  const h = SCREEN_TOP - WAIST;
  b.block(0, 0.03, 0, 1.66, 0.06, 0.07, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h - 0.03, 0, 1.66, 0.07, 0.08, paint, M.Paint, Z.Front, 0.01);
  for (const x of [-0.8, 0.8]) b.block(x, h / 2, 0, 0.07, h, 0.07, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h / 2 + 0.005, 0, 1.53, h - 0.11, 0.012, glass, M.Glass, Z.Glass);
  for (const y of [0.065, h - 0.07]) b.block(0, y, -0.012, 1.54, 0.012, 0.01, rubber, M.Rubber, Z.Front);
  for (const x of [0.5, -0.18]) {
    b.rod({ x, y: 0.07, z: -0.03 }, { x: x - 0.42, y: 0.1, z: -0.03 }, 0.007, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.07, z: -0.034 }, { x: x - 0.38, y: 0.1, z: -0.034 }, 0.004, black, M.Rubber, Z.Front);
  }
  // Fold-down screen clamps either side.
  for (const x of [-0.79, 0.79]) b.block(x, 0.1, -0.05, 0.05, 0.05, 0.05, steel, M.Metal, Z.Front);
  b.pop();
}

function doors(b: VehicleBuilder): void {
  const front = SCUTTLE + 0.03,
    back = B_PILLAR;
  const mid = (front + back) / 2,
    len = back - front;
  for (const side of [-1, 1]) {
    // Steel lower door with external hinges, push-button handle and a sill below.
    b.block(
      side * (SIDE - 0.01),
      (SILL + WAIST) / 2,
      mid,
      0.04,
      WAIST - SILL,
      len,
      paint,
      M.Paint,
      Z.Sides,
      0.01,
    );
    for (const z of [front - 0.004, back + 0.004])
      b.block(
        side * (SIDE + 0.008),
        (SILL + WAIST) / 2,
        z,
        0.008,
        WAIST - SILL,
        0.008,
        black,
        M.Rubber,
        Z.Sides,
      );
    for (const y of [0.24, 0.62]) {
      b.block(side * (SIDE + 0.016), y, front + 0.04, 0.03, 0.08, 0.11, paint, M.Paint, Z.Sides, 0.006);
      b.rod(
        { x: side * (SIDE + 0.03), y: y - 0.05, z: front + 0.0 },
        { x: side * (SIDE + 0.03), y: y + 0.05, z: front + 0.0 },
        0.011,
        steel,
        M.Metal,
        Z.Sides,
      );
    }
    b.block(side * (SIDE + 0.016), 0.68, back - 0.1, 0.022, 0.045, 0.13, rubber, M.Rubber, Z.Sides, 0.006);
    b.block(side * (SIDE + 0.03), 0.68, back - 0.06, 0.012, 0.022, 0.028, steel, M.Metal, Z.Sides, 0.004);
    b.block(side * (SIDE - 0.025), 0.02, mid, 0.05, 0.1, len + 0.12, paint, M.Paint, Z.Sides, 0.008);
    // Canvas door top: a frame round a clear window (the glass hides in the driver's view).
    const x = side * (SIDE - 0.02);
    const y0 = WAIST - 0.01,
      y1 = SCREEN_TOP + 0.05;
    const z0 = front + 0.01,
      z1 = back - 0.01;
    const wy0 = 0.93,
      wy1 = 1.29,
      wz0 = front + 0.17,
      wz1 = back - 0.1;
    const frame = (ya: number, yb: number, za: number, zb: number) =>
      b.block(x, (ya + yb) / 2, (za + zb) / 2, 0.024, yb - ya, zb - za, canvas, M.Fabric, Z.Sides, 0.008);
    frame(y0, wy0, z0, z1);
    frame(wy1, y1, z0, z1);
    frame(wy0, wy1, z0, wz0);
    frame(wy0, wy1, wz1, z1);
    b.block(
      x + side * 0.01,
      (wy0 + wy1) / 2,
      (wz0 + wz1) / 2,
      0.006,
      wy1 - wy0,
      wz1 - wz0,
      glass,
      M.Glass,
      Z.Glass,
    );
    // Door mirror on a two-piece arm from the front hinge.
    b.rod(
      { x: side * SIDE, y: 0.74, z: front + 0.05 },
      { x: side * 1.0, y: 0.98, z: front + 0.02 },
      0.011,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.rod(
      { x: side * SIDE, y: 0.6, z: front + 0.05 },
      { x: side * 0.97, y: 0.9, z: front + 0.03 },
      0.008,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(side * 1.02, 1.04, front + 0.02, 0.05, 0.17, 0.13, black, M.Rubber, Z.Trim, 0.015);
    b.block(side * 1.02, 1.04, front + 0.088, 0.04, 0.14, 0.006, steel, M.Metal, Z.Trim, 0.01);
  }
}

function rearBody(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    archPanel(b, side, B_PILLAR + 0.01, TAIL, 1.397, WAIST, Z.Rear, 0.56);
    // Capping rail and the rope cleats the tilt is lashed to.
    b.block(
      side * (SIDE - 0.02),
      WAIST + 0.012,
      (B_PILLAR + TAIL) / 2,
      0.06,
      0.025,
      TAIL - B_PILLAR,
      paint,
      M.Paint,
      Z.Sides,
      0.008,
    );
    for (let z = B_PILLAR + 0.16; z < TAIL - 0.05; z += 0.32) {
      b.block(side * (SIDE + 0.012), 0.66, z, 0.016, 0.03, 0.05, steel, M.Metal, Z.Sides);
      b.rod(
        { x: side * (SIDE + 0.02), y: 0.67, z: z - 0.02 },
        { x: side * (SIDE + 0.03), y: 0.71, z },
        0.006,
        steel,
        M.Metal,
        Z.Sides,
      );
    }
    // Rear corner panels beside the tailgate, with Army-pattern lamp clusters low down.
    b.block(side * 0.79, (SILL + WAIST) / 2, TAIL, 0.11, WAIST - SILL, 0.05, paint, M.Paint, Z.Rear, 0.01);
    b.block(side * 0.76, 0.2, TAIL + 0.035, 0.13, 0.18, 0.04, black, M.Rubber, Z.Rear, 0.01);
    b.block(side * 0.76, 0.24, TAIL + 0.058, 0.1, 0.06, 0.012, red, M.Red, Z.Rear, 0.005);
    b.block(side * 0.76, 0.17, TAIL + 0.058, 0.1, 0.05, 0.012, amber, M.Amber, Z.Rear, 0.005);
    b.ring(side * 0.76, 0.36, TAIL + 0.03, 0.03, 0.01, red, M.Red, 'z', Z.Rear);
    // Jerry can in its holder behind each rear wheel.
    jerryCan(b, side * (SIDE + 0.1), 0.41, 2.08);
  }
  // Fuel filler on the right, behind the door.
  b.slot = M.Metal;
  b.tag = Z.Sides;
  b.push()
    .translate(SIDE + 0.008, 0.6, 0.5)
    .rotate(0, 0, Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 18), black);
  b.pop();
  // Drop-down tailgate on two bottom hinges, held by chains, with pressed ribs.
  b.block(0, 0.44, TAIL + 0.005, 1.46, 0.62, 0.05, paint, M.Paint, Z.Rear, 0.01);
  for (const y of [0.3, 0.58]) b.block(0, y, TAIL + 0.034, 1.3, 0.04, 0.012, paint, M.Paint, Z.Rear, 0.006);
  for (const x of [-0.5, 0.5]) {
    b.rod(
      { x, y: 0.14, z: TAIL + 0.04 },
      { x: x + 0.12, y: 0.14, z: TAIL + 0.04 },
      0.014,
      steel,
      M.Metal,
      Z.Rear,
    );
    b.rod(
      { x: x * 1.4, y: 0.74, z: TAIL + 0.03 },
      { x: x * 1.5, y: 0.77, z: TAIL - 0.04 },
      0.006,
      steel,
      M.Metal,
      Z.Rear,
    );
  }
  plate(b, -0.38, 0.22, TAIL + 0.04, 1);
  // Load floor between the wheel boxes, full width ahead of and behind them, and
  // inward-facing bench seats, seen from the cab under the tilt.
  b.block(0, 0.2, (B_PILLAR + TAIL) / 2, 1.12, 0.03, TAIL - B_PILLAR, black, M.Rubber, Z.Trim);
  const archFront = 1.397 - ARCH.radius,
    archBack = 1.397 + ARCH.radius;
  for (const side of [-1, 1])
    for (const [z0, z1] of [
      [B_PILLAR, archFront],
      [archBack, TAIL],
    ])
      b.block(side * 0.68, 0.2, (z0 + z1) / 2, 0.24, 0.03, z1 - z0, black, M.Rubber, Z.Trim);
  // The benches run along the tops of the wheel boxes.
  const bench = paint.clone().multiplyScalar(0.75);
  for (const side of [-1, 1]) b.block(side * 0.68, 0.54, 1.35, 0.3, 0.05, 1.8, bench, M.Paint, Z.Trim, 0.01);
  // A rolled swag and a tucker box.
  b.slot = M.Fabric;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.1, 0.33, 2.0)
    .rotate(0, 0, Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(0.13, 0.13, 0.95, 16), canvas.clone().multiplyScalar(0.85));
  b.pop();
  b.block(0.25, 0.36, 1.45, 0.5, 0.3, 0.36, new THREE.Color('#6A4A30'), M.Fabric, Z.Trim, 0.01);
}

/** Pressed-steel jerry can in a holder, standing against the body side. */
function jerryCan(b: VehicleBuilder, x: number, y: number, z: number): void {
  const can = new THREE.Color('#5B6640');
  const s = Math.sign(x);
  b.block(x, y, z, 0.165, 0.47, 0.34, can, M.Paint, Z.Rear, 0.02);
  for (const k of [-1, 1])
    b.rod(
      { x: x + s * 0.085, y: y - 0.18, z: z - 0.12 * k },
      { x: x + s * 0.085, y: y + 0.18, z: z + 0.12 * k },
      0.008,
      can,
      M.Paint,
      Z.Rear,
    );
  b.block(x, y + 0.26, z - 0.08, 0.03, 0.05, 0.12, can, M.Paint, Z.Rear, 0.01);
  b.block(x, y + 0.255, z + 0.1, 0.06, 0.04, 0.06, can, M.Paint, Z.Rear, 0.01);
  b.block(x - s * 0.06, y - 0.25, z, 0.25, 0.03, 0.38, bar, M.Metal, Z.Rear);
  b.block(x + s * 0.09, y + 0.05, z, 0.012, 0.04, 0.4, black, M.Rubber, Z.Rear);
}

function tilt(b: VehicleBuilder): void {
  const z0 = SCUTTLE + 0.07;
  // Roof over cab and tub, the tub sides and back, with darker straps at the hoops.
  b.block(
    0,
    ROOF - 0.07,
    (z0 + TAIL) / 2 + 0.005,
    1.7,
    0.14,
    TAIL - z0 + 0.03,
    canvas,
    M.Fabric,
    Z.Roof,
    0.06,
  );
  const sideH = ROOF - 0.12 - 0.69;
  for (const side of [-1, 1]) {
    b.block(
      side * (SIDE + 0.006),
      0.69 + sideH / 2,
      (B_PILLAR + TAIL) / 2,
      0.03,
      sideH,
      TAIL - B_PILLAR,
      canvas,
      M.Fabric,
      Z.Sides,
      0.01,
    );
    b.rod(
      { x: side * (SIDE + 0.024), y: 0.71, z: B_PILLAR + 0.04 },
      { x: side * (SIDE + 0.024), y: 0.71, z: TAIL - 0.04 },
      0.006,
      rubber,
      M.Rubber,
      Z.Sides,
    );
  }
  b.block(0, 0.69 + sideH / 2, TAIL + 0.01, 1.7, sideH, 0.03, canvas, M.Fabric, Z.Rear, 0.01);
  const strap = canvas.clone().multiplyScalar(0.72);
  for (const z of [B_PILLAR + 0.02, 0.95, 1.62, TAIL - 0.02]) {
    b.block(0, ROOF + 0.002, z, 1.62, 0.006, 0.05, strap, M.Fabric, Z.Roof);
    for (const side of [-1, 1])
      b.block(
        side * (SIDE + 0.023),
        0.69 + sideH / 2 + 0.03,
        z,
        0.006,
        sideH - 0.06,
        0.05,
        strap,
        M.Fabric,
        Z.Sides,
      );
  }
  // Rear curtain: the flap seam and its buckled straps.
  b.block(0, 1.3, TAIL + 0.028, 1.6, 0.012, 0.006, strap, M.Fabric, Z.Rear);
  for (const x of [-0.45, 0.45]) b.block(x, 1.0, TAIL + 0.03, 0.05, 0.6, 0.006, strap, M.Fabric, Z.Rear);
  // The canvas wraps over the windscreen's top rail.
  b.block(0, SCREEN_TOP + 0.02, SCUTTLE + 0.1, 1.68, 0.06, 0.12, canvas, M.Fabric, Z.Roof, 0.025);
}

function chassisAndRecovery(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  // Galvanised ladder frame, crossmembers, outriggers and the rear crossmember.
  for (const x of [-0.43, 0.43]) b.block(x, 0.03, 0.08, 0.1, 0.18, 4.04, galv, M.Paint, Z.Trim);
  for (const z of [-1.96, -0.62, 0.62]) b.block(0, 0.02, z, 0.86, 0.1, 0.1, galv, M.Paint, Z.Trim);
  b.block(0, 0.02, 2.36, 1.48, 0.14, 0.1, galv, M.Paint, Z.Trim);
  // Gearbox and transfer case, propshafts, fuel tank and the exhaust out the back.
  b.block(0.08, -0.02, -0.28, 0.4, 0.2, 0.6, black, M.Metal, Z.Trim, 0.03);
  b.rod(
    { x: 0.08, y: -0.08, z: -0.6 },
    { x: 0.1, y: -0.12, z: -1.27 },
    0.032,
    steel.clone().multiplyScalar(0.6),
  );
  b.rod(
    { x: 0.08, y: -0.08, z: 0.05 },
    { x: 0.05, y: -0.12, z: 1.27 },
    0.032,
    steel.clone().multiplyScalar(0.6),
  );
  b.block(0.64, 0.06, 0.15, 0.22, 0.24, 0.72, black, M.Metal, Z.Trim, 0.03);
  b.rod({ x: -0.3, y: -0.06, z: -0.75 }, { x: -0.3, y: -0.08, z: 1.0 }, 0.028, steel);
  b.rod({ x: -0.3, y: -0.08, z: 1.0 }, { x: -0.6, y: -0.06, z: 2.25 }, 0.028, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.3, -0.07, 0.2)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.085, 0.085, 0.5, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
  // The Perentie's spare wheel, slung flat in a cradle under the rear floor.
  b.tag = Z.Rear;
  b.push()
    .translate(0, 0.03, 1.94)
    .rotate(0, 0, Math.PI / 2);
  b.geometry(wheel.clone(), black);
  b.pop();
  for (const x of [-0.2, 0.2]) b.block(x, -0.09, 1.94, 0.05, 0.03, 0.84, galv, M.Paint, Z.Trim);
  // Pintle hook and trailer socket for the No. 5 trailer, and the rear plate.
  b.block(0, -0.02, 2.43, 0.14, 0.12, 0.08, black, M.Metal, Z.Rear, 0.01);
  b.ring(0, -0.04, 2.5, 0.045, 0.014, black, M.Metal, 'y', Z.Rear);
  b.slot = M.Rubber;
  b.push()
    .translate(0.3, 0.02, 2.42)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), black);
  b.pop();

  // Channel front bumper with towing eyes, and the Army bull bar in front of it.
  b.block(0, 0.06, -2.1, 1.72, 0.17, 0.1, bar, M.Metal, Z.Front, 0.01);
  for (const side of [-1, 1]) b.ring(side * 0.55, -0.04, -2.13, 0.04, 0.012, bar, M.Metal, 'x', Z.Front);
  const bz = -2.2;
  b.block(0, 0.12, bz + 0.02, 1.62, 0.16, 0.05, bar, M.Metal, Z.Front, 0.01);
  for (const x of [-0.82, -0.43, -0.12, 0.12, 0.43, 0.82])
    b.rod({ x, y: 0.2, z: bz }, { x, y: 0.66, z: bz + 0.04 }, 0.026, bar, M.Metal, Z.Front);
  b.rod(
    { x: -0.84, y: 0.66, z: bz + 0.04 },
    { x: 0.84, y: 0.66, z: bz + 0.04 },
    0.028,
    bar,
    M.Metal,
    Z.Front,
  );
  for (const side of [-1, 1]) {
    // Lamp guard bars and the wing braces back to the body corners.
    for (const y of [0.36, 0.5])
      b.rod(
        { x: side * 0.43, y, z: bz + 0.025 },
        { x: side * 0.82, y, z: bz + 0.025 },
        0.016,
        bar,
        M.Metal,
        Z.Front,
      );
    b.rod(
      { x: side * 0.84, y: 0.62, z: bz + 0.04 },
      { x: side * 0.88, y: 0.3, z: FRONT_FACE + 0.05 },
      0.024,
      bar,
      M.Metal,
      Z.Front,
    );
    b.rod(
      { x: side * 0.84, y: 0.22, z: bz + 0.02 },
      { x: side * 0.88, y: 0.3, z: FRONT_FACE + 0.05 },
      0.024,
      bar,
      M.Metal,
      Z.Front,
    );
  }
  plate(b, -0.5, 0.12, bz - 0.01, -1);
  // Winch drum tucked behind the bar, with a roller fairlead at the cable exit.
  b.rod({ x: -0.2, y: 0.14, z: -2.16 }, { x: 0.2, y: 0.14, z: -2.16 }, 0.065, black, M.Metal, Z.Front);
  const mount = tuning.winchMount;
  for (const y of [mount.y - 0.035, mount.y + 0.035])
    b.rod({ x: -0.12, y, z: mount.z }, { x: 0.12, y, z: mount.z }, 0.014, steel, M.Metal, Z.Front);
  for (const x of [-0.13, 0.13])
    b.rod(
      { x, y: mount.y - 0.04, z: mount.z },
      { x, y: mount.y + 0.04, z: mount.z },
      0.014,
      steel,
      M.Metal,
      Z.Front,
    );
  // HF radio whip on the rear corner of the tub.
  b.block(0.8, WAIST + 0.06, 2.22, 0.07, 0.08, 0.07, black, M.Rubber, Z.Rear, 0.01);
  b.rod({ x: 0.8, y: WAIST + 0.1, z: 2.22 }, { x: 0.82, y: 2.45, z: 2.3 }, 0.005, black, M.Rubber, Z.Roof);
}

export function buildPerentieBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontEnd(b);
  windscreen(b);
  doors(b);
  rearBody(b);
  tilt(b);
  chassisAndRecovery(b, tuning, wheel);
  addPerentieInterior(b, tuning.engine.redlineRpm);
  return b.build();
}

/** 7.50R16 bar-and-block tread on a tall sidewall, a green steel wheel and five studs. */
export function buildPerentieWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#232624');
  const rimR = 0.205;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.47],
    [r * 0.7, -w * 0.52],
    [r * 0.9, -w * 0.48],
    [r * 0.965, -w * 0.38],
    [r * 0.965, w * 0.38],
    [r * 0.9, w * 0.48],
    [r * 0.7, w * 0.52],
    [rimR - 0.01, w * 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Staggered shoulder lugs and centre blocks, deep like a military cross-country tyre.
  const lugs = 26;
  for (let i = 0; i < lugs; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.26, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.18, 0);
      b.box(w * 0.42, 0.04, 0.05, tyre);
      b.pop();
    }
    const angle = ((i + 0.25) / lugs) * Math.PI * 2;
    b.push()
      .translate(0, Math.cos(angle) * r * 0.97, Math.sin(angle) * r * 0.97)
      .rotate(angle, 0, 0);
    b.box(w * 0.18, 0.04, 0.035, tyre);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.72, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, a dished centre in Army green with cooling slots, drive flange and studs.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.014, paint, M.Paint, 'x');
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 40),
      paint.clone().multiplyScalar(0.9),
    );
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.135, 0.03, 32), paint);
    b.pop();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.block(
        side * (w * 0.5 - 0.018),
        Math.cos(a) * 0.16,
        Math.sin(a) * 0.16,
        0.012,
        0.035,
        0.035,
        black,
        M.Rubber,
        Z.Trim,
        0.012,
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.008), Math.cos(a) * 0.083, Math.sin(a) * 0.083)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.014, 0.017, 0.022, 6), steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.048, 0.055, 0.05, 20), galv.clone().multiplyScalar(0.8));
    b.pop();
  }
  return b.build();
}

/** A recovery board strapped to the tilt roof over the hoops (index 0 on the left). */
export function buildPerentiePlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const x = index === 0 ? -0.36 : 0.36,
    y = ROOF + 0.035,
    z = 0.85;
  const L = plankTuning.length,
    W = plankTuning.width;
  b.block(x, y, z, W, 0.05, L, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.12 + i * 0.08,
      y + 0.026,
      z,
      0.004,
      0.003,
      L - 0.06,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const dz of [-0.75, 0.75]) {
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(x + (s * (W + 0.02)) / 2, y - 0.01, z + dz, 0.012, 0.07, 0.045, black, M.Rubber, Z.Roof);
  }
  return b.build();
}
