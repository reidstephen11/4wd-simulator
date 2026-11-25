import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { vehicles } from '../data/vehicles';
import { VehicleBuilder, BodyZone as Z, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeX, extrudeZ, sideShape, rounded, type Vtx } from './bodyShapes';
import { ROUND_BEND, cleanGeometry, continuousTube } from './bodyRefinement';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';
import { mirrorHead } from './mirrors';
import { letter, camel } from './camelMarkings';
import { GLYPHS, strokeText } from './bodyKit';
import { mountSpare } from './spares';

/**
 * The 1986 Camel Trophy Land Rover Ninety, as the Australian event ran it: a left-hand-drive
 * County station wagon in Sandglow yellow on a 2.36 m wheelbase, with flat wing tops, black
 * front lamp panels, a slatted grille, Alpine roof windows, a front and bulkhead cage, a
 * raised intake into the front of the left wing, a deep basket rack with four work lamps, jerry
 * cans and sand ladders, a tall Warn 8274 winch behind a hawse fairlead, and spares on the
 * bonnet and the rear door.
 * Sources: reference/vehicles/camel-trophy/SOURCES.md. Since the November 2026 review the body's stations along
 * the car, its widths and its heights are measured from sheet B (the Land Rover 90 hardtop) of
 * reference/vehicles/land-rover-110-perentie/drawing-variants.png.
 *
 * The body is drawn in its own frame and then moved `BODY_SHIFT` back, because until that review it
 * sat 0.12 m too far forward on its wheels. So every z in this file is 0.12 m ahead of where
 * the part ends up in the vehicle frame (x right, y up, z back, axles at ±1.18 m); the axles
 * are `FRONT_AXLE` and `REAR_AXLE` here. Only `instruments()` is drawn in the vehicle frame,
 * from the cabin layout in src/data/vehicles.ts.
 */
export const BODY_SHIFT = 0.12;
const FRONT_AXLE = -1.18 - BODY_SHIFT,
  REAR_AXLE = 1.18 - BODY_SHIFT;
/** Half-widths: the body below the waist, and the cab above it, which steps in 7 cm a side. */
const SIDE = 0.835,
  UP = 0.765;
/** Stations: grille face, door pillar, back of the front door, tail. */
const F = -1.805,
  SCUTTLE = -0.65,
  BPOST = 0.31,
  TAIL = 1.7;
/** Heights: sill, waist, the top of the doors and windscreen (where the roof sits), rack deck. */
const SILL = 0.12,
  WAIST = 0.78,
  TOP = 1.36,
  DECK = 1.64;
/** The windscreen leans back: its head is this far behind its foot (18 degrees). */
const SCREEN_FOOT = 0.866,
  RAKE = 0.16;
const LEAN = Math.atan2(RAKE, TOP - SCREEN_FOOT),
  SLOPE = RAKE / (TOP - SCREEN_FOOT);
/** Front edge of the roof, over the windscreen's head. */
const ROOF_F = SCUTTLE + 0.012 + RAKE - 0.03;
/** The roof: its flat top is 1.2 m wide and its sides chamfer down to the gutters. */
const ROOF_HALF = 0.6,
  ROOF_EDGE = 1.515,
  ROOF_BAND = 1.4;
/** The rack: half-width of its rails, and its front and rear ends. */
const RACK_X = 0.72,
  RACK_F = ROOF_F + 0.05,
  RACK_R = TAIL - 0.13;
/** The cage's hoops: A along the windscreen pillars, B behind the front doors. */
const HOOP_A = { foot: SCUTTLE - 0.05, waist: SCUTTLE + 0.01, top: SCUTTLE + 0.18 },
  HOOP_B = BPOST + 0.09,
  HOOP_Y = 1.575;
/**
 * The raised intake's riser, outboard of the left A hoop, and its head. It leans a little
 * less than the hoop's leg and stands 8 to 11 cm ahead of it, so the head's cap (0.093 m in
 * radius) clears the hoop's leg and corner by 2.3 cm; leaning 0.44 it ran into the corner (v2.18).
 */
const RISER_X = -0.915,
  RISER_SLOPE = 0.26,
  riserZ = (y: number) => SCUTTLE - 0.07 + (y - 1.0) * RISER_SLOPE;
const paint = new THREE.Color('#C7973F'),
  black = new THREE.Color('#242824'),
  rubber = new THREE.Color('#222522');
const steel = new THREE.Color('#A0A59D'),
  dark = new THREE.Color('#343832'),
  glass = new THREE.Color('#9FAF9E');
const amber = new THREE.Color('#D78C2C'),
  red = new THREE.Color('#AA3025'),
  lens = new THREE.Color('#E6E0C7');
const blue = new THREE.Color('#263C62'),
  yellow = new THREE.Color('#E9B846');
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tube = (b: VehicleBuilder, pts: number[][], r: number, c = black, zone: number = Z.Trim) =>
  continuousTube(
    b,
    pts.map((p) => v(p[0], p[1], p[2])),
    r,
    c,
    zone,
    M.Metal,
    ROUND_BEND,
  );
function rect(x0: number, y0: number, x1: number, y1: number, r = 0.01): THREE.Shape {
  return new THREE.Shape(
    rounded([
      [x0, y0, r],
      [x1, y0, r],
      [x1, y1, r],
      [x0, y1, r],
    ]),
  );
}
function disk(
  b: VehicleBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  depth: number,
  c: THREE.Color,
  slot: typeof b.slot,
  zone: number = Z.Front,
) {
  b.slot = slot;
  b.tag = zone;
  b.push()
    .translate(x, y, z)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r, r, depth, 20), c);
  b.pop();
}
function roundLamp(
  b: VehicleBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  c: THREE.Color,
  slot: typeof b.slot,
  zone: number,
) {
  disk(b, x, y, z, r + 0.009, 0.023, black, M.Rubber, zone);
  b.ring(x, y, z - 0.014, r, 0.006, steel, M.Metal, 'z', zone);
  b.slot = slot;
  b.tag = zone;
  b.push()
    .translate(x, y, z - 0.018)
    .scale(1, 1, 0.22);
  b.geometry(new THREE.SphereGeometry(r - 0.007, 20, 8), c);
  b.pop();
  for (const dx of [-0.55, -0.25, 0.05, 0.35, 0.65]) {
    const px = dx * r,
      hh = Math.sqrt((r - 0.009) ** 2 - px * px);
    b.block(x + px, y, z - 0.028, 0.0018, hh * 1.8, 0.002, c, slot, zone);
  }
}
/**
 * The wheel openings (November 2026 review): flat-topped, with radiused corners and sides that splay out to
 * the sill, under a black eyebrow, as on sheet B of the drawing and on the Perentie's
 * photographs. They were half circles 0.5 m in radius under a thick lip. The figures are the
 * Perentie's (src/render/perentieBody.ts), which has the same wings and tyres: `top` is 17 cm
 * over the tyre because a crossed axle lifts a wheel 16 cm; `flat` and `foot` are the
 * opening's half-widths at the top and at the sill.
 */
interface Opening {
  top: number;
  flat: number;
  foot: number;
  corner: number;
}
const FRONT_OPENING: Opening = { top: 0.46, flat: 0.4, foot: 0.45, corner: 0.12 };
const REAR_OPENING: Opening = { top: 0.46, flat: 0.43, foot: 0.52, corner: 0.12 };
/** The opening's edge as (z, y) points from its front foot to its rear foot, `grow` outside it. */
function openingEdge(o: Opening, axle: number, grow: number): Vtx[] {
  const { top, flat, foot, corner } = o;
  const k = 1 + grow / foot;
  const half: Vtx[] = [[foot * k, SILL]];
  for (let i = 0; i <= 5; i++) {
    const a = (i * Math.PI) / 10;
    half.push([(flat - corner + corner * Math.cos(a)) * k, top - corner + corner * Math.sin(a) + grow]);
  }
  const front = half.map(([d, y]) => [axle - d, y] as Vtx);
  const rear = half.map(([d, y]) => [axle + d, y] as Vtx).reverse();
  return [...front, ...rear];
}
/**
 * A lower body side from z0 to z1 with its wheel opening, the eyebrow round the opening, and a
 * dark wheel box behind it (inner wall, roof and a wall across each end) so that the opening
 * shows neither the cabin nor the far side. `inner` is the box's inner wall. At the rear the
 * load floor is lower than the box's roof and the coil spring and damper stand under it, so
 * below `floor` the box reaches in to `innerLow`, past the spring to the chassis rail.
 */
function archPanel(
  b: VehicleBuilder,
  side: number,
  z0: number,
  z1: number,
  axle: number,
  top: number,
  inner: number,
  zone: number,
  o: Opening,
  innerLow = inner,
  floor = SILL,
) {
  const path: Vtx[] = [[z0, SILL], ...openingEdge(o, axle, 0), [z1, SILL], [z1, top], [z0, top]];
  extrudeX(
    b,
    sideShape(path),
    side > 0 ? SIDE - 0.032 : -SIDE,
    side > 0 ? SIDE : -SIDE + 0.032,
    paint,
    M.Paint,
    zone,
    0.009,
    [[axle, 0.1]],
  );
  extrudeX(
    b,
    sideShape([...openingEdge(o, axle, 0.06), ...openingEdge(o, axle, -0.004).reverse()]),
    side > 0 ? SIDE - 0.014 : -SIDE - 0.055,
    side > 0 ? SIDE + 0.055 : -SIDE + 0.014,
    black,
    M.Rubber,
    zone,
    0.006,
  );
  // A dark liner on the skin's inner face round the opening: the skin's rounded inner edge is
  // body colour and showed from below as a thin line all round the well.
  extrudeX(
    b,
    sideShape([...openingEdge(o, axle, 0.012), ...openingEdge(o, axle, -0.006).reverse()]),
    side > 0 ? SIDE - 0.05 : -SIDE + 0.012,
    side > 0 ? SIDE - 0.012 : -SIDE + 0.05,
    dark,
    M.Rubber,
    Z.Trim,
    0,
  );
  const boxTop = o.top + 0.035,
    length = o.foot * 2 + 0.03;
  b.block(
    (side * (inner + SIDE - 0.02)) / 2,
    o.top + 0.02,
    axle,
    SIDE - 0.02 - inner,
    0.03,
    length,
    dark,
    M.Rubber,
    Z.Trim,
  );
  for (const [x, y0, y1] of [
    [innerLow, SILL, Math.max(floor, SILL)],
    [inner, Math.max(floor, SILL), boxTop],
  ]) {
    if (y1 - y0 < 0.01) continue;
    const span = SIDE - 0.02 - x,
      cx = (side * (x + SIDE - 0.02)) / 2;
    b.block(side * x, (y0 + y1) / 2, axle, 0.03, y1 - y0, length, dark, M.Rubber, Z.Trim);
    for (const end of [-1, 1])
      b.block(cx, (y0 + y1) / 2, axle + end * (o.foot + 0.005), span, y1 - y0, 0.02, dark, M.Rubber, Z.Trim);
  }
}
function front(b: VehicleBuilder) {
  const mid = (F + SCUTTLE) / 2;
  for (const side of [-1, 1]) {
    archPanel(b, side, F, SCUTTLE + 0.03, FRONT_AXLE, 0.695, 0.355, Z.Front, FRONT_OPENING);
    b.block(side * 0.715, 0.707, mid, 0.24, 0.034, SCUTTLE - F, paint, M.Paint, Z.Front, 0.012);
    b.block(
      side * 0.626,
      (SILL + 0.694) / 2,
      F + 0.015,
      0.415,
      0.694 - SILL,
      0.037,
      paint,
      M.Paint,
      Z.Front,
      0.009,
    );
    // Civilian Ninety headlamp panels: no Perentie convoy lights.
    b.block(side * 0.626, 0.405, F - 0.012, 0.39, 0.54, 0.023, black, M.Rubber, Z.Front, 0.01);
    roundLamp(b, side * 0.626, 0.467, F - 0.035, 0.095, lens, M.Headlamp, Z.Front);
    roundLamp(b, side * 0.737, 0.218, F - 0.017, 0.032, amber, M.Amber, Z.Front);
    roundLamp(b, side * 0.522, 0.218, F - 0.017, 0.03, lens, M.Headlamp, Z.Front);
    // The seal under the bonnet's edge, a catch at the front and a hinge at the back.
    b.block(side * 0.575, 0.676, mid, 0.014, 0.014, SCUTTLE - F - 0.06, black, M.Rubber, Z.Front, 0.004);
    b.block(side * 0.577, 0.686, F + 0.065, 0.022, 0.055, 0.044, steel, M.Metal, Z.Front, 0.006);
    b.block(side * 0.577, 0.703, SCUTTLE - 0.14, 0.07, 0.016, 0.09, steel, M.Metal, Z.Front, 0.003);
    // Side repeaters.
    b.block(side * (SIDE + 0.006), 0.62, SCUTTLE - 0.14, 0.018, 0.038, 0.075, amber, M.Amber, Z.Front, 0.008);
  }
  // Separate rolled bonnet over the flat-topped wings, with a mild transverse crown.
  const bonnet: Vtx[] = [
    [-0.58, 0.675],
    [0.58, 0.675],
    [0.58, 0.705, 0.016],
  ];
  for (let i = 1; i <= 24; i++) {
    const x = 0.58 - (1.16 * i) / 24;
    bonnet.push([x, 0.705 + 0.038 * (1 - (x / 0.58) ** 2)]);
  }
  extrudeZ(b, new THREE.Shape(rounded(bonnet)), F + 0.018, SCUTTLE - 0.028, paint, M.Paint, Z.Front, 0.012);
  b.block(0, 0.43, mid - 0.01, 0.54, 0.49, 0.95, black, M.Rubber, Z.Trim, 0.015);
  // Period black moulded grille, with fine horizontal slats and an oval badge.
  const grille = rect(-0.405, 0.195, 0.405, 0.689, 0.018),
    hole = rect(-0.365, 0.24, 0.365, 0.645, 0.012);
  grille.holes.push(new THREE.Path(hole.getPoints(12).reverse()));
  extrudeZ(b, grille, F - 0.027, F + 0.006, black, M.Rubber, Z.Front, 0.002);
  b.block(0, 0.445, F + 0.014, 0.735, 0.407, 0.025, dark, M.Rubber, Z.Front);
  for (let i = 0; i < 11; i++)
    b.block(0, 0.251 + i * 0.037, F - 0.016, 0.73, 0.014, 0.022, black, M.Rubber, Z.Front, 0.004);
  for (const x of [-0.28, -0.14, 0, 0.14, 0.28])
    b.block(x, 0.44, F - 0.008, 0.008, 0.38, 0.022, black, M.Rubber, Z.Front);
  b.slot = M.Paint;
  b.tag = Z.Front;
  b.push()
    .translate(-0.23, 0.6, F - 0.035)
    .scale(1, 0.44, 1);
  b.geometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.009, 32).rotateX(Math.PI / 2),
    new THREE.Color('#3E5136'),
  );
  b.pop();
  b.push()
    .translate(-0.23, 0.6, F - 0.044)
    .rotate(0, Math.PI, 0);
  letter(b, 'LAND ROVER', 0.013, 0.12, 0.15);
  b.pop();
}
function cabinShell(b: VehicleBuilder) {
  // The bulkhead: as wide as the wings up to the waist, as wide as the cab above it.
  b.block(0, 0.74, SCUTTLE, 2 * SIDE, 0.09, 0.1, paint, M.Paint, Z.Front, 0.009);
  b.block(0, 0.825, SCUTTLE, 2 * UP, 0.1, 0.1, paint, M.Paint, Z.Front, 0.009);
  for (const x of [-0.37, 0.37]) {
    b.block(x, 0.789, SCUTTLE - 0.058, 0.52, 0.105, 0.017, paint, M.Paint, Z.Front, 0.005);
    b.block(x, 0.843, SCUTTLE - 0.063, 0.515, 0.008, 0.012, black, M.Rubber, Z.Front);
    for (const xx of [x - 0.18, x + 0.18])
      b.block(xx, 0.846, SCUTTLE - 0.058, 0.04, 0.016, 0.018, steel, M.Metal, Z.Front, 0.003);
  }
  // A raked one-piece windscreen with two low wipers. Its frame's top edge is at TOP; the top
  // rail is 4 cm deep, so the glass ends 8 cm above the driver's eye.
  const full = (TOP - SCREEN_FOOT) / Math.cos(LEAN);
  b.push()
    .translate(0, SCREEN_FOOT, SCUTTLE + 0.012)
    .rotate(LEAN, 0, 0);
  b.block(0, 0, 0, 2 * UP, 0.055, 0.06, paint, M.Paint, Z.Front, 0.008);
  b.block(0, full - 0.02, 0, 2 * UP, 0.04, 0.06, paint, M.Paint, Z.Front, 0.008);
  for (const x of [-UP + 0.0275, UP - 0.0275])
    b.block(x, full / 2 - 0.01375, 0, 0.055, full + 0.0275, 0.06, paint, M.Paint, Z.Front, 0.008);
  b.block(0, (full - 0.01) / 2, 0, 2 * UP - 0.1, full - 0.05, 0.013, glass, M.Glass, Z.Glass);
  for (const x of [-0.46, 0.16]) {
    b.rod(v(x, 0.025, -0.036), v(x + 0.36, 0.052, -0.036), 0.006, black, M.Rubber, Z.Front);
    b.block(x, 0.015, -0.037, 0.026, 0.026, 0.018, black, M.Rubber, Z.Front, 0.004);
  }
  b.pop();
  const z0 = SCUTTLE + 0.035,
    z1 = BPOST - 0.014,
    zm = (z0 + z1) / 2;
  /** The door top's rails, and its front upright, which leans with the windscreen. */
  const low = 0.805,
    high = TOP - 0.0275,
    lean = (high - low) * SLOPE;
  for (const side of [-1, 1]) {
    const x = side * SIDE,
      xu = side * (UP - 0.008);
    b.block(x, (SILL + WAIST) / 2, zm, 0.032, WAIST - SILL, z1 - z0, paint, M.Paint, Z.Sides, 0.009);
    for (const z of [z0 - 0.01, z1 + 0.01])
      b.block(
        side * (SIDE + 0.005),
        (SILL + WAIST) / 2,
        z,
        0.007,
        WAIST - SILL,
        0.008,
        black,
        M.Rubber,
        Z.Sides,
      );
    for (const yy of [0.3, 0.65]) {
      b.block(side * (SIDE + 0.013), yy, z0 + 0.045, 0.024, 0.065, 0.105, paint, M.Paint, Z.Sides, 0.006);
      b.rod(
        v(side * (SIDE + 0.028), yy - 0.038, z0 + 0.005),
        v(side * (SIDE + 0.028), yy + 0.038, z0 + 0.005),
        0.009,
        steel,
        M.Metal,
        Z.Sides,
      );
    }
    b.block(side * (SIDE + 0.015), 0.694, z1 - 0.11, 0.025, 0.05, 0.14, black, M.Rubber, Z.Sides, 0.006);
    // Full metal door top: rails, a leaning front upright, a quarterlight and the wind-up pane.
    for (const [yy, za] of [
      [low, z0],
      [high, z0 + 0.02 + lean],
    ])
      b.block(xu, yy, (za + z1) / 2, 0.038, 0.045, z1 - za, paint, M.Paint, Z.Sides, 0.006);
    b.block(
      xu,
      (low + high) / 2,
      z1 - 0.012,
      0.038,
      high - low + 0.045,
      0.05,
      paint,
      M.Paint,
      Z.Sides,
      0.006,
    );
    b.push()
      .translate(xu, low, z0 + 0.02)
      .rotate(LEAN, 0, 0);
    const post = (high - low) / Math.cos(LEAN);
    b.block(0, post / 2, 0, 0.038, post + 0.03, 0.055, paint, M.Paint, Z.Sides, 0.006);
    b.pop();
    const pane: Vtx[] = [
      [z0 + 0.03, low + 0.015],
      [z1 - 0.03, low + 0.015],
      [z1 - 0.03, high - 0.015],
      [z0 + 0.03 + (high - low - 0.03) * SLOPE, high - 0.015],
    ];
    extrudeX(
      b,
      sideShape(pane),
      side > 0 ? UP - 0.025 : -UP + 0.013,
      side > 0 ? UP - 0.013 : -UP + 0.025,
      glass,
      M.Glass,
      Z.Glass,
      0,
    );
    b.block(
      side * (UP - 0.006),
      (low + high) / 2,
      z0 + 0.3,
      0.016,
      high - low,
      0.018,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.rod(v(side * 0.802, 0.63, zm + 0.06), v(side * 0.802, 0.68, zm), 0.008, steel, M.Metal, Z.Trim);
    b.block(side * 0.79, 0.68, zm, 0.025, 0.025, 0.025, black, M.Rubber, Z.Trim, 0.005);
    // Larger Britax-style truck mirror on a cranked arm.
    b.block(side * 0.852, 0.74, z0 + 0.065, 0.03, 0.07, 0.07, black, M.Metal, Z.Trim, 0.006);
    tube(
      b,
      [
        [side * 0.86, 0.75, z0 + 0.065],
        [side * 0.955, 0.84, z0 + 0.04],
        [side * 0.97, 1.09, z0 + 0.1],
      ],
      0.012,
    );
    mirrorHead(b, side, v(side * 0.985, 1.15, z0 + 0.1), 0.15, 0.235, 0.055, black);
  }
}
function rearBody(b: VehicleBuilder) {
  const up = (WAIST + 0.017 + TOP) / 2,
    upH = TOP - WAIST - 0.017;
  for (const side of [-1, 1]) {
    archPanel(b, side, BPOST, TAIL, REAR_AXLE, WAIST, 0.54, Z.Rear, REAR_OPENING, 0.37, 0.44);
    // The waist: a ledge from the cab's side out to the body's, from the door pillar to the tail.
    b.block(
      (side * (UP + SIDE - 0.008)) / 2,
      WAIST + 0.004,
      (SCUTTLE + TAIL + 0.062) / 2,
      SIDE - UP + 0.032,
      0.03,
      TAIL + 0.027 - (SCUTTLE + 0.035),
      paint,
      M.Paint,
      Z.Sides,
      0.006,
    );
    // Station wagon side window, wide enough for the forward-facing rear seat.
    const x = side * (UP - 0.008),
      z0 = BPOST + 0.03,
      z1 = TAIL - 0.29,
      low = 0.824,
      high = TOP - 0.03;
    for (const yy of [low, high])
      b.block(x, yy, (z0 + z1) / 2, 0.035, 0.055, z1 - z0, paint, M.Paint, Z.Sides, 0.006);
    for (const z of [z0 + 0.025, z1 - 0.022])
      b.block(x, (low + high) / 2, z, 0.035, high - low + 0.055, 0.05, paint, M.Paint, Z.Sides, 0.005);
    b.block(
      x - side * 0.014,
      (low + high) / 2,
      (z0 + z1) / 2,
      0.01,
      high - low - 0.045,
      z1 - z0 - 0.09,
      glass,
      M.Glass,
      Z.Glass,
    );
    b.block(
      x + side * 0.012,
      (low + high) / 2,
      0.98,
      0.016,
      high - low - 0.045,
      0.018,
      black,
      M.Rubber,
      Z.Sides,
    );
    // The pillar behind the front door, and the panel behind the side window.
    b.block(x, up, BPOST + 0.012, 0.037, upH, 0.06, paint, M.Paint, Z.Sides, 0.005);
    b.block(x, up, (z1 + TAIL) / 2, 0.039, upH, TAIL - z1 + 0.025, paint, M.Paint, Z.Rear, 0.008);
    for (let z = BPOST + 0.09; z < TAIL - 0.03; z += 0.2)
      b.block(side * (SIDE + 0.012), 0.74, z, 0.005, 0.006, 0.006, steel, M.Metal, Z.Sides, 0.002);
    // Close the rear corner up to the waist, behind all three lamps.
    b.block(
      side * 0.69,
      (SILL + WAIST) / 2,
      TAIL + 0.005,
      0.29,
      WAIST - SILL,
      0.045,
      paint,
      M.Paint,
      Z.Rear,
      0.005,
    );
    // The corner above the waist, beside the rear door.
    b.block(
      side * ((0.525 + UP) / 2),
      up,
      TAIL - 0.012,
      UP - 0.525,
      upH,
      0.04,
      paint,
      M.Paint,
      Z.Rear,
      0.006,
    );
  }
  // Single side-hinged rear station-wagon door with a window.
  const low = 0.81,
    high = TOP - 0.03;
  b.block(
    0,
    (SILL + WAIST) / 2 + 0.005,
    TAIL - 0.012,
    1.05,
    WAIST - SILL + 0.01,
    0.036,
    paint,
    M.Paint,
    Z.Rear,
    0.008,
  );
  for (const x of [-0.505, 0.505])
    b.block(x, (SILL + high) / 2, TAIL + 0.012, 0.008, high - SILL, 0.008, black, M.Rubber, Z.Rear);
  for (const yy of [low, high])
    b.block(0, yy, TAIL - 0.007, 1.04, 0.055, 0.04, paint, M.Paint, Z.Rear, 0.005);
  for (const x of [-0.494, 0.494])
    b.block(
      x,
      (low + high) / 2,
      TAIL - 0.007,
      0.058,
      high - low + 0.055,
      0.04,
      paint,
      M.Paint,
      Z.Rear,
      0.005,
    );
  b.block(0, (low + high) / 2, TAIL - 0.014, 0.9, high - low - 0.04, 0.012, glass, M.Glass, Z.Glass);
  b.block(-0.43, 0.72, TAIL + 0.024, 0.12, 0.055, 0.025, black, M.Rubber, Z.Rear, 0.004);
  for (const y of [0.38, 1.15]) {
    b.block(0.532, y, TAIL + 0.028, 0.1, 0.06, 0.036, paint, M.Paint, Z.Rear, 0.004);
    b.rod(
      v(0.565, y - 0.044, TAIL + 0.047),
      v(0.565, y + 0.044, TAIL + 0.047),
      0.011,
      steel,
      M.Metal,
      Z.Rear,
    );
  }
  for (const side of [-1, 1]) {
    // Rear lamps face +z: rotate local round lamps with their bodies.
    b.push()
      .translate(side * 0.686, 0, TAIL + 0.024)
      .rotate(0, Math.PI, 0);
    roundLamp(b, 0, 0.59, 0, 0.033, amber, M.Amber, Z.Rear);
    roundLamp(b, 0, 0.47, 0, 0.036, red, M.Red, Z.Rear);
    roundLamp(b, 0, 0.26, 0, 0.039, red, M.Red, Z.Rear);
    b.pop();
    // Simple lamp guards, their four corners bent back onto the corner panel.
    for (const xx of [side * 0.625, side * 0.746]) {
      b.rod(v(xx, 0.19, TAIL + 0.072), v(xx, 0.66, TAIL + 0.072), 0.005, black, M.Metal, Z.Rear);
      for (const y of [0.19, 0.66])
        b.rod(v(xx, y, TAIL + 0.072), v(xx, y, TAIL + 0.027), 0.005, black, M.Metal, Z.Rear);
    }
    for (const y of [0.19, 0.35, 0.66])
      b.rod(
        v(side * 0.625, y, TAIL + 0.072),
        v(side * 0.746, y, TAIL + 0.072),
        0.005,
        black,
        M.Metal,
        Z.Rear,
      );
  }
  b.block(0, 0.1, TAIL + 0.06, 1.49, 0.155, 0.11, black, M.Metal, Z.Rear, 0.008);
  b.block(0, 0.02, TAIL + 0.14, 0.11, 0.13, 0.13, steel, M.Metal, Z.Rear, 0.008);
  b.rod(v(-0.065, 0.025, TAIL + 0.18), v(0.065, 0.025, TAIL + 0.18), 0.018, black, M.Metal, Z.Rear);
  plate(b, -0.29, 0.16, TAIL + 0.123, 1);
  // The shovel above the rear door is clamped to the roof's rear face.
  const tool = TOP + 0.06;
  for (const x of [-0.42, 0.42])
    b.block(x, tool - 0.005, TAIL + 0.03, 0.055, 0.055, 0.05, black, M.Rubber, Z.Rear, 0.004);
  b.rod(
    v(-0.55, tool, TAIL + 0.055),
    v(0.45, tool, TAIL + 0.055),
    0.015,
    new THREE.Color('#8F7149'),
    M.Fabric,
    Z.Rear,
  );
  b.block(0.45, tool, TAIL + 0.055, 0.22, 0.035, 0.1, steel, M.Metal, Z.Rear, 0.008);
}
function roof(b: VehicleBuilder) {
  // Thin central cap and separately pierced roof shoulders leave real Alpine apertures. The
  // roof stands 0.17 m above the doors: a band over the gutter, a chamfer, and the flat top.
  const crown = (x: number) => ROOF_EDGE + 0.015 * (1 - (x / ROOF_HALF) ** 2);
  const top: Vtx[] = Array.from({ length: 33 }, (_, i) => {
    const x = -ROOF_HALF + (2 * ROOF_HALF * i) / 32;
    return [x, crown(x)] as Vtx;
  });
  const lower = top.map(([x, y]) => [x, y - 0.022] as Vtx).reverse();
  const back = TAIL + 0.007,
    mid = (ROOF_F + back) / 2,
    length = back - ROOF_F;
  extrudeZ(b, new THREE.Shape(rounded([...top, ...lower])), ROOF_F, back, paint, M.Paint, Z.Roof, 0.004);
  const section: Vtx[] = [
    [-UP, TOP - 0.005],
    [UP, TOP - 0.005],
    [UP, ROOF_BAND, 0.012],
    [ROOF_HALF, ROOF_EDGE, 0.04],
    ...top.slice().reverse().slice(1),
    [-UP, ROOF_BAND, 0.012],
  ];
  for (const zz of [ROOF_F, TAIL - 0.018])
    extrudeZ(b, new THREE.Shape(rounded(section)), zz, zz + 0.025, paint, M.Paint, Z.Roof, 0.004);
  const run = UP - ROOF_HALF,
    rise = ROOF_EDGE - ROOF_BAND,
    half = Math.hypot(run, rise) / 2;
  for (const side of [-1, 1]) {
    b.block(
      side * (UP - 0.014),
      (TOP + ROOF_BAND) / 2 - 0.01,
      mid,
      0.028,
      ROOF_BAND - TOP + 0.03,
      length,
      paint,
      M.Paint,
      Z.Roof,
    );
    b.block(side * (UP + 0.01), TOP + 0.008, mid, 0.022, 0.022, length, paint, M.Paint, Z.Roof, 0.006);
    b.push()
      .translate((side * (UP + ROOF_HALF)) / 2, (ROOF_EDGE + ROOF_BAND) / 2, 0)
      .rotate(0, 0, -side * Math.atan2(rise, run));
    const shell = rect(-half, -back, half, -ROOF_F, 0.005);
    const opening = rect(-0.058, -1.18, 0.058, -0.56, 0.025);
    shell.holes.push(new THREE.Path(opening.getPoints(20).reverse()));
    const panel = new THREE.ExtrudeGeometry(shell, {
      depth: 0.014,
      bevelEnabled: false,
      curveSegments: 16,
    });
    panel.rotateX(-Math.PI / 2);
    panel.translate(0, -0.014, 0);
    b.slot = M.Paint;
    b.tag = Z.Roof;
    b.geometry(panel, paint);
    const seal = rect(-0.065, -1.192, 0.065, -0.548, 0.03),
      hole = rect(-0.051, -1.176, 0.051, -0.564, 0.023);
    seal.holes.push(new THREE.Path(hole.getPoints(20).reverse()));
    const gasket = new THREE.ExtrudeGeometry(seal, {
      depth: 0.006,
      bevelEnabled: false,
      curveSegments: 16,
    });
    gasket.rotateX(-Math.PI / 2);
    b.slot = M.Rubber;
    b.tag = Z.Roof;
    b.geometry(gasket, black);
    const pane = new THREE.ExtrudeGeometry(rect(-0.053, -1.178, 0.053, -0.562, 0.024), {
      depth: 0.003,
      bevelEnabled: false,
      curveSegments: 16,
    });
    pane.rotateX(-Math.PI / 2);
    pane.translate(0, 0.003, 0);
    b.slot = M.Glass;
    b.tag = Z.Glass;
    b.geometry(pane, glass);
    b.pop();
  }
  for (const x of [-0.4, 0, 0.4])
    b.block(x, crown(x) + 0.006, mid, 0.025, 0.014, length - 0.12, paint, M.Paint, Z.Roof, 0.005);
}
function chassis(b: VehicleBuilder) {
  // Kicked-up rails pass above the coil springs; the middle rails remain under the cab.
  const f = FRONT_AXLE,
    r = REAR_AXLE;
  for (const side of [-1, 1]) {
    for (const [x, points] of [
      [
        0.3,
        [
          [f - 0.4, 0.02],
          [f - 0.3, 0.255],
          [f + 0.26, 0.255],
          [f + 0.54, -0.085],
          [f + 0.54, 0.085],
          [f + 0.26, 0.425],
          [f - 0.3, 0.425],
          [f - 0.4, 0.19],
        ],
      ],
      [
        0.43,
        [
          [f + 0.64, -0.085],
          [r - 0.53, -0.085],
          [r - 0.26, 0.255],
          [r + 0.25, 0.255],
          [r + 0.52, -0.045],
          [TAIL + 0.06, -0.045],
          [TAIL + 0.06, 0.125],
          [r + 0.52, 0.125],
          [r + 0.25, 0.425],
          [r - 0.26, 0.425],
          [r - 0.53, 0.085],
          [f + 0.64, 0.085],
        ],
      ],
    ] as [number, number[][]][]) {
      const outline = points.map((p) => [p[0], p[1], 0.025] as Vtx);
      extrudeX(b, sideShape(outline), side * x - 0.045, side * x + 0.045, black, M.Metal, Z.Trim, 0.004);
    }
    b.rod(v(side * 0.3, 0, f + 0.54), v(side * 0.43, 0, f + 0.64), 0.045, black, M.Metal, Z.Trim);
  }
  for (const z of [f - 0.37, -0.52, 0.48, TAIL + 0.04])
    b.block(0, z < -1 ? 0.15 : 0, z, z < -1 ? 0.6 : 0.86, 0.085, 0.08, black, M.Metal, Z.Trim);
  // Cab floor, the raised load floor between the wheel boxes, and the lip under the rear door.
  for (const [z0, z1, w] of [
    [SCUTTLE - 0.05, 0.52, 1.6],
    [0.52, r + 0.54, 1.05],
    [r + 0.53, TAIL - 0.035, 1.6],
  ])
    b.block(0, z0 > 0 ? 0.46 : 0.15, (z0 + z1) / 2, w, 0.04, z1 - z0, black, M.Rubber, Z.Trim);
  b.block(0, -0.025, -0.18, 0.35, 0.18, 0.61, black, M.Metal, Z.Trim, 0.025);
  b.rod(v(0.08, -0.06, -0.5), v(0.08, -0.12, f + 0.05), 0.026, steel, M.Metal, Z.Trim);
  b.rod(v(0.08, -0.06, 0.13), v(0.08, -0.12, r - 0.02), 0.026, steel, M.Metal, Z.Trim);
  b.block(0.6, 0.04, 0.2, 0.25, 0.19, 0.6, black, M.Metal, Z.Trim, 0.015);
  exhaust(b);
  const guard = new THREE.Shape(
    rounded([
      [-0.38, 0.02],
      [0.38, 0.02],
      [0.38, 0.18],
      [-0.38, 0.18],
    ]),
  );
  b.push()
    .translate(0, 0.03, f - 0.37)
    .rotate(-0.6, 0, 0);
  extrudeZ(b, guard, -0.025, 0, steel, M.Metal, Z.Trim, 0);
  b.pop();
}
/**
 * The exhaust (November 2026 review): out of the back of the engine on the left, down under the cab's
 * crossmembers, a silencer between them, up over the rear axle under the load floor (0.3 m
 * over the axle tube at rest, 0.15 m at full bump), down again and out under the rear
 * crossmember, pointing back. It ran straight at the axle's height, through the top of the axle
 * tube, and began in mid-air under the cab.
 */
function exhaust(b: VehicleBuilder) {
  const x = -0.25,
    r = REAR_AXLE;
  tube(
    b,
    [
      [-0.2, 0.3, SCUTTLE - 0.25],
      [-0.22, 0.28, SCUTTLE - 0.13],
      [-0.23, -0.085, SCUTTLE - 0.03],
      [x, -0.085, -0.4],
      [x, -0.085, r - 0.51],
      [x, 0.24, r - 0.23],
      [x, 0.24, r + 0.21],
      [x, -0.09, r + 0.44],
      [x, -0.09, TAIL + 0.15],
    ],
    0.022,
    steel,
  );
  // A tip with a closed end face on the tailpipe.
  b.rod(v(x, -0.09, TAIL + 0.1), v(x, -0.09, TAIL + 0.156), 0.026, steel, M.Metal, Z.Trim);
  // The silencer is tucked up beside the chassis rail, its underside level with the transfer case.
  b.rod(v(x, -0.05, -0.26), v(x, -0.05, 0.16), 0.06, steel, M.Metal, Z.Trim);
  // Rubber hangers: silencer to cab floor, the run over the axle to the load floor, and a
  // bracket from the rear crossmember.
  b.rod(v(x, 0, -0.05), v(x, 0.13, -0.05), 0.008, black, M.Rubber, Z.Trim);
  b.rod(v(x, 0.26, r), v(x, 0.44, r), 0.008, black, M.Rubber, Z.Trim);
  b.block(x, -0.055, TAIL + 0.04, 0.03, 0.03, 0.03, black, M.Metal, Z.Trim);
}
function plate(b: VehicleBuilder, x: number, y: number, z: number, side: number) {
  b.push()
    .translate(x, y, z)
    .rotate(0, side < 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.27, 0.105, 0.015, black, M.Rubber, Z.Trim, 0.006);
  b.block(0, 0, 0.01, 0.25, 0.086, 0.008, side > 0 ? yellow : lens, M.Paint, Z.Trim, 0.004);
  strokeText(b, 'CT-86', {
    x: -0.102,
    y: -0.027,
    z: 0.018,
    dir: 1,
    w: 0.029,
    h: 0.054,
    pitch: 0.041,
    radius: 0.0025,
    colour: black,
    slot: M.Rubber,
    zone: Z.Trim,
    glyphs: { ...GLYPHS, '-': [[0.2, 0.5, 0.8, 0.5]] },
  });
  b.pop();
}
function bullbar(b: VehicleBuilder) {
  const front = -2.245,
    back = -2.075,
    zc = (front + back) / 2;
  b.block(0, 0.155, zc, 1.78, 0.125, back - front, black, M.Metal, Z.Front, 0.009);
  for (const x of [-0.3, 0.3]) b.block(x, 0.105, -2.01, 0.075, 0.16, 0.4, black, M.Metal, Z.Trim, 0.005);
  tube(
    b,
    [
      [-0.37, 0.21, zc],
      [-0.37, 0.82, -2.09],
      [0.37, 0.82, -2.09],
      [0.37, 0.21, zc],
    ],
    0.027,
    black,
    Z.Front,
  );
  const joinY = 0.66,
    joinZ = zc + ((-2.09 - zc) * (joinY - 0.21)) / (0.82 - 0.21);
  for (const side of [-1, 1]) {
    tube(
      b,
      [
        [side * 0.89, 0.21, zc],
        [side * 0.89, 0.63, -2.09],
        [side * 0.75, 0.68, joinZ],
        [side * 0.37, joinY, joinZ],
      ],
      0.025,
      black,
      Z.Front,
    );
    for (const x of [side * 0.37, side * 0.89])
      b.block(x, 0.219, zc, 0.068, 0.035, 0.09, black, M.Metal, Z.Front, 0.004);
    b.block(side * 0.63, 0.18, front - 0.026, 0.08, 0.09, 0.09, steel, M.Metal, Z.Front, 0.01);
    b.rod(
      v(side * 0.675, 0.18, front - 0.065),
      v(side * 0.585, 0.18, front - 0.065),
      0.014,
      black,
      M.Metal,
      Z.Front,
    );
  }
  // The Warn 8274 the event's cars carried stands upright on the bumper, as the real one does:
  // a cradle, the drum with its rope between two flanges, the tall gear case on the car's left
  // with the motor on top, and the brake housing on the right.
  b.block(0, 0.26, -2.13, 0.58, 0.08, 0.25, black, M.Metal, Z.Front, 0.008);
  b.rod(v(-0.185, 0.365, -2.14), v(0.18, 0.365, -2.14), 0.07, steel, M.Metal, Z.Front);
  for (const x of [-0.16, 0.165])
    b.rod(v(x, 0.365, -2.14), v(x + 0.012, 0.365, -2.14), 0.088, dark, M.Metal, Z.Front);
  b.block(-0.245, 0.415, -2.14, 0.12, 0.3, 0.21, black, M.Metal, Z.Front, 0.012);
  b.block(-0.245, 0.6, -2.14, 0.105, 0.1, 0.16, dark, M.Metal, Z.Front, 0.008);
  b.block(0.205, 0.365, -2.14, 0.05, 0.19, 0.2, black, M.Metal, Z.Front, 0.007);
  // A hawse fairlead with an actual opening, bolted to the cradle's front face.
  const s = rect(-0.14, 0.25, 0.14, 0.35, 0.022),
    hole = rect(-0.102, 0.275, 0.102, 0.325, 0.02);
  s.holes.push(new THREE.Path(hole.getPoints(12).reverse()));
  extrudeZ(b, s, front - 0.04, front - 0.01, steel, M.Metal, Z.Front, 0.002);
  b.rod(v(0, 0.3, front - 0.02), v(0, 0.3, front - 0.06), 0.005, steel, M.Metal, Z.Front);
  b.ring(0, 0.275, front - 0.065, 0.019, 0.006, steel, M.Metal, 'z', Z.Front);
  b.block(0.39, 0.145, front - 0.018, 0.28, 0.12, 0.025, black, M.Metal, Z.Front, 0.004);
  plate(b, 0.39, 0.145, front - 0.035, -1);
}
function cageAndIntake(b: VehicleBuilder) {
  // Front/bulkhead cage and B hoop; no modern full rear-roof cage. Each leg stands on a foot
  // bolted to the body side clear of the door, steps in at the waist with the cab, and the A
  // hoop leans back with the windscreen pillar.
  const a = HOOP_A;
  for (const [foot, waist, top] of [
    [a.foot, a.waist, a.top],
    [HOOP_B, HOOP_B, HOOP_B],
  ])
    tube(
      b,
      [
        [-0.9, 0.19, foot],
        [-0.9, 0.8, foot],
        [-0.825, 1.0, waist],
        [-0.825, HOOP_Y, top],
        [0.825, HOOP_Y, top],
        [0.825, 1.0, waist],
        [0.9, 0.8, foot],
        [0.9, 0.19, foot],
      ],
      0.027,
    );
  /** Where the A hoop's leg is at height y, above the waist. */
  const legZ = (y: number) => a.waist + ((y - 1.0) / (HOOP_Y - 1.0)) * (a.top - a.waist);
  for (const side of [-1, 1]) {
    b.rod(v(side * 0.62, HOOP_Y, a.top), v(side * 0.62, HOOP_Y, HOOP_B), 0.027, black, M.Metal, Z.Trim);
    for (const z of [a.foot, HOOP_B])
      b.block(side * 0.87, 0.21, z, 0.1, 0.08, 0.12, black, M.Metal, Z.Trim, 0.006);
    // Swivel work lamp on each A post, with its arm landing on the actual cage tube.
    const z = legZ(1.25);
    b.rod(v(side * 0.825, 1.25, z), v(side * 0.775, 1.265, z - 0.075), 0.013, black, M.Metal, Z.Trim);
    roundLamp(b, side * 0.775, 1.3, z - 0.075, 0.055, lens, M.DrivingLamp, Z.Front);
  }
  // LR Parts raised intake: it enters the front of the left wing, lies along the wing top
  // under two straps, and climbs the windscreen pillar outboard of the cage to roof level.
  const px = -0.775,
    py = 0.768;
  // The box on the wing's front corner covers the tube's end.
  b.block(px + 0.01, 0.767, F + 0.125, 0.13, 0.12, 0.2, black, M.Rubber, Z.Front, 0.009);
  tube(
    b,
    [
      [px, py, F + 0.2],
      [px, py, SCUTTLE - 0.3],
      [RISER_X, 0.95, riserZ(0.95)],
      [RISER_X, 1.48, riserZ(1.48)],
    ],
    0.044,
    black,
    Z.Front,
  );
  for (const z of [F + 0.45, SCUTTLE - 0.36]) {
    b.ring(px, py, z, 0.047, 0.004, steel, M.Metal, 'z', Z.Front);
    b.block(px, 0.727, z, 0.135, 0.008, 0.03, steel, M.Metal, Z.Front);
  }
  for (const yy of [1.21, 1.38]) {
    const zz = riserZ(yy);
    b.rod(v(RISER_X, yy, zz), v(-0.825, yy, legZ(yy)), 0.009, steel, M.Metal, Z.Front);
    b.push().translate(RISER_X, yy, zz).rotate(Math.atan2(RISER_SLOPE, 1), 0, 0);
    b.ring(0, 0, 0, 0.048, 0.005, steel, M.Metal, 'y', Z.Front);
    b.pop();
  }
  const hz = riserZ(1.5);
  b.slot = M.Rubber;
  b.tag = Z.Front;
  b.push().translate(RISER_X, 1.51, hz);
  b.geometry(new THREE.CylinderGeometry(0.072, 0.063, 0.075, 24), black);
  b.pop();
  b.push().translate(RISER_X, 1.558, hz);
  b.geometry(new THREE.CylinderGeometry(0.093, 0.093, 0.025, 28), black);
  b.pop();
  for (let i = 0; i < 12; i++) {
    const ang = (i * Math.PI) / 6;
    b.block(
      RISER_X + Math.cos(ang) * 0.071,
      1.512,
      hz + Math.sin(ang) * 0.071,
      0.009,
      0.035,
      0.009,
      dark,
      M.Rubber,
      Z.Front,
    );
  }
  // Tool on the right wing top, held by two clamp blocks.
  for (const z of [-1.5, -1.04]) b.block(0.72, 0.742, z, 0.1, 0.045, 0.047, black, M.Rubber, Z.Front, 0.004);
  b.rod(v(0.72, 0.77, -1.69), v(0.72, 0.77, -0.86), 0.014, new THREE.Color('#8F7149'), M.Fabric, Z.Front);
  b.block(0.72, 0.77, -1.67, 0.14, 0.025, 0.18, steel, M.Metal, Z.Front, 0.01);
}
function plaque(b: VehicleBuilder, w: number, h: number) {
  const s = new THREE.Shape(
    rounded([
      [-w / 2, -h / 2, 0.025],
      [w / 2, -h / 2, 0.025],
      [w / 2, h / 2, 0.025],
      [-w / 2, h / 2, 0.025],
    ]),
  );
  extrudeZ(b, s, -0.008, 0, yellow, M.Paint, Z.Trim, 0);
  b.slot = M.Paint;
  b.tag = Z.Trim;
  b.push().translate(0, h * 0.04, 0.001);
  camel(b, w * 0.5, 1);
  b.pop();
  b.push().translate(0, -h * 0.12, 0.002);
  letter(b, 'CAMEL', h * 0.18, 0.15, 0.18);
  b.pop();
  b.push().translate(0, -h * 0.35, 0.002);
  letter(b, 'TROPHY', h * 0.115, 0.15, 0.28);
  b.pop();
  // Thin blue border, with rounded plate corners.
  for (const side of [-1, 1])
    b.block(side * (w / 2 - 0.012), 0, 0.003, 0.006, h - 0.035, 0.003, blue, M.Paint, Z.Trim);
  for (const yy of [-h / 2 + 0.012, h / 2 - 0.012])
    b.block(0, yy, 0.003, w - 0.035, 0.006, 0.003, blue, M.Paint, Z.Trim);
}
function markings(b: VehicleBuilder) {
  for (const side of [-1, 1]) {
    b.push()
      .translate(side * (SIDE + 0.02), 0.5, -0.15)
      .rotate(0, (side * Math.PI) / 2, 0);
    plaque(b, 0.46, 0.4);
    b.pop();
    b.push()
      .translate(side * (SIDE + 0.018), 0.69, 1.27)
      .rotate(0, (side * Math.PI) / 2, 0);
    b.slot = M.Paint;
    b.tag = Z.Sides;
    letter(b, 'AUSTRALIA', 0.04, 0.13, 0.22);
    b.pop();
  }
  b.push().translate(-0.645, 1.12, TAIL + 0.03);
  plaque(b, 0.2, 0.18);
  b.pop();
}
/** Height of the rack's top rail at z: it falls 0.15 m from front to rear. */
const rackTop = (z: number) => DECK + 0.33 - ((z - RACK_F) / (RACK_R - RACK_F)) * 0.15;
function roofRack(b: VehicleBuilder) {
  const length = RACK_R - RACK_F;
  for (const side of [-1, 1]) {
    const x = side * RACK_X;
    b.rod(v(x, DECK, RACK_F), v(x, DECK, RACK_R), 0.019, black, M.Metal, Z.Roof);
    b.rod(v(x, rackTop(RACK_F), RACK_F), v(x, rackTop(RACK_R), RACK_R), 0.017, black, M.Metal, Z.Roof);
    for (let i = 0; i <= 5; i++) {
      const z = RACK_F + (length * i) / 5;
      b.rod(v(x, DECK, z), v(x, rackTop(z), z), 0.011, black, M.Metal, Z.Roof);
    }
    // Four feet a side clamp the gutter, clear of the cage's hoops; a leg from each to the rail.
    // They stand between the window bars below, not over them.
    for (const z of [RACK_F + 0.28, 0.2, 0.8, RACK_R - 0.1]) {
      b.block(side * (UP + 0.015), TOP + 0.03, z, 0.05, 0.045, 0.095, black, M.Metal, Z.Roof, 0.005);
      b.block(side * (UP + 0.046), TOP + 0.01, z, 0.02, 0.05, 0.1, black, M.Metal, Z.Roof, 0.004);
      b.rod(v(side * (UP + 0.02), TOP + 0.045, z), v(x, DECK, z), 0.014, black, M.Metal, Z.Roof);
    }
  }
  for (const z of [RACK_F, RACK_R]) {
    b.rod(v(-RACK_X, DECK, z), v(RACK_X, DECK, z), 0.019, black, M.Metal, Z.Roof);
    b.rod(v(-RACK_X, rackTop(z), z), v(RACK_X, rackTop(z), z), 0.017, black, M.Metal, Z.Roof);
  }
  for (let i = 0; i < 10; i++)
    b.block(
      0,
      DECK,
      RACK_F + 0.06 + (i * (length - 0.12)) / 9,
      2 * RACK_X,
      0.024,
      0.028,
      black,
      M.Metal,
      Z.Roof,
    );
  // No rack decking. Upright jerry cans occupy the rear rack in individual cradles.
  for (const x of [0.17, 0.52]) jerryCan(b, x, DECK + 0.0425 + 0.215, RACK_R - 0.23);
  const canvas = new THREE.Color('#77704E');
  const bag = RACK_R - 0.8;
  b.block(-0.36, DECK + 0.155, bag, 0.54, 0.285, 0.67, canvas, M.Fabric, Z.Roof, 0.045);
  for (const z of [bag - 0.16, bag + 0.06]) {
    const strap = rect(-0.642, DECK - 0.026, -0.078, DECK + 0.31, 0.057),
      hole = rect(-0.63, DECK - 0.014, -0.09, DECK + 0.298, 0.045);
    strap.holes.push(new THREE.Path(hole.getPoints(20).reverse()));
    extrudeZ(b, strap, z - 0.02, z + 0.02, black, M.Rubber, Z.Roof, 0);
    b.block(-0.65, DECK + 0.13, z, 0.016, 0.055, 0.05, steel, M.Metal, Z.Roof, 0.003);
  }
  const box = RACK_F + 0.42;
  b.block(-0.32, DECK + 0.102, box, 0.61, 0.18, 0.44, black, M.Metal, Z.Roof, 0.012);
  b.block(-0.32, DECK + 0.198, box, 0.63, 0.018, 0.46, black, M.Metal, Z.Roof, 0.005);
  for (const x of [-0.55, -0.12])
    b.block(x, DECK + 0.175, box - 0.227, 0.045, 0.075, 0.022, steel, M.Metal, Z.Roof, 0.003);
  for (const x of [-0.39, -0.25])
    b.block(x, DECK + 0.221, box, 0.018, 0.028, 0.025, steel, M.Metal, Z.Roof, 0.003);
  b.rod(v(-0.39, DECK + 0.238, box), v(-0.25, DECK + 0.238, box), 0.007, steel, M.Metal, Z.Roof);
  for (const x of [-0.55, -0.12])
    b.block(x, DECK + 0.015, box + 0.04, 0.055, 0.035, 0.06, steel, M.Metal, Z.Roof, 0.003);
  // Four Litemate-style rectangular work lamps, mounted to the rack's front structure.
  for (const x of [-0.58, -0.26, 0.26, 0.58]) {
    b.block(x, DECK + 0.105, RACK_F, 0.04, 0.21, 0.05, black, M.Metal, Z.Roof, 0.004);
    b.block(x, DECK + 0.22, RACK_F - 0.025, 0.15, 0.135, 0.1, black, M.Rubber, Z.Roof, 0.016);
    b.block(x, DECK + 0.22, RACK_F - 0.08, 0.127, 0.107, 0.013, lens, M.DrivingLamp, Z.Roof, 0.01);
    for (let i = 0; i < 6; i++)
      b.block(
        x - 0.05 + i * 0.02,
        DECK + 0.22,
        RACK_F - 0.088,
        0.002,
        0.09,
        0.003,
        lens,
        M.DrivingLamp,
        Z.Roof,
      );
  }
  b.rod(v(-RACK_X, DECK + 0.1, RACK_F), v(RACK_X, DECK + 0.1, RACK_F), 0.014, black, M.Metal, Z.Roof);
  b.push()
    .translate(0, DECK + 0.215, RACK_F - 0.096)
    .rotate(0, Math.PI, 0);
  plaqueMount(b);
  b.pop();
}
function plaqueMount(b: VehicleBuilder) {
  b.block(0, 0, -0.015, 0.035, 0.3, 0.025, black, M.Metal, Z.Roof);
  // The bracket stops behind the plaque (its end lay in the plaque's face and flickered).
  b.block(0, -0.12, -0.0775, 0.045, 0.035, 0.125, black, M.Metal, Z.Roof, 0.004);
  plaque(b, 0.34, 0.29);
}
function jerryCan(b: VehicleBuilder, x: number, y: number, z: number) {
  const olive = new THREE.Color('#646B46');
  b.block(x, DECK + 0.025, z, 0.33, 0.035, 0.24, black, M.Metal, Z.Roof, 0.004);
  for (const xx of [x - 0.157, x + 0.157])
    b.block(xx, DECK + 0.115, z, 0.022, 0.2, 0.24, black, M.Metal, Z.Roof, 0.003);
  b.block(x, y, z, 0.29, 0.43, 0.19, olive, M.Paint, Z.Roof, 0.023);
  for (const dir of [-1, 1])
    b.rod(
      v(x - 0.1, y - dir * 0.15, z + 0.101),
      v(x + 0.1, y + dir * 0.15, z + 0.101),
      0.008,
      olive,
      M.Paint,
      Z.Roof,
    );
  for (const xx of [x - 0.08, x - 0.01, x + 0.06]) {
    b.rod(v(xx, y + 0.205, z - 0.025), v(xx, y + 0.27, z - 0.025), 0.009, olive, M.Paint, Z.Roof);
    b.rod(v(xx, y + 0.27, z - 0.025), v(xx, y + 0.27, z + 0.035), 0.009, olive, M.Paint, Z.Roof);
    b.rod(v(xx, y + 0.27, z + 0.035), v(xx, y + 0.205, z + 0.035), 0.009, olive, M.Paint, Z.Roof);
  }
  b.slot = M.Metal;
  b.tag = Z.Roof;
  b.push().translate(x + 0.1, y + 0.224, z + 0.035);
  b.geometry(new THREE.CylinderGeometry(0.023, 0.026, 0.018, 16), olive);
  b.pop();
  b.push().translate(x + 0.1, y + 0.239, z + 0.035);
  b.geometry(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 16), steel);
  b.pop();
  b.block(x, y, z + 0.109, 0.035, 0.42, 0.012, black, M.Rubber, Z.Roof);
  b.block(x, y, z - 0.108, 0.035, 0.42, 0.012, black, M.Rubber, Z.Roof);
  for (const yy of [y - 0.22, y + 0.219]) b.block(x, yy, z, 0.035, 0.014, 0.23, black, M.Rubber, Z.Roof);
  b.block(x, y + 0.01, z + 0.12, 0.055, 0.06, 0.013, steel, M.Metal, Z.Roof, 0.003);
}
function spares(b: VehicleBuilder, t: VehicleTuning, w: THREE.BufferGeometry) {
  const rear = { x: 0.12, y: 0.78, z: TAIL + 0.255 };
  b.block(rear.x, rear.y, TAIL + 0.04, 0.27, 0.25, 0.06, black, M.Metal, Z.Rear, 0.006);
  b.rod(v(rear.x, rear.y, TAIL + 0.04), v(rear.x, rear.y, rear.z - 0.09), 0.043, black, M.Metal, Z.Rear);
  mountSpare(b, w, { x: rear.x, y: rear.y, z: rear.z }, 'back', rubber);
  const cy = 0.743 + t.wheelWidth / 2 + 0.075,
    z = -1.27;
  // The mounting block stays under the rim's centre: at 0.34 m square its corners were in the tyre.
  b.block(0, 0.785, z, 0.28, 0.09, 0.28, black, M.Metal, Z.Front, 0.008);
  mountSpare(b, w, { x: 0, y: cy, z }, 'up', rubber);
  const top = cy + t.wheelWidth / 2 + 0.045;
  b.rod(v(0, 0.8, z), v(0, top + 0.04, z), 0.014, steel, M.Metal, Z.Front);
  b.block(0, top, z, 0.22, 0.018, 0.055, black, M.Metal, Z.Front, 0.004);
  b.rod(v(-0.06, top + 0.025, z), v(0.06, top + 0.025, z), 0.009, steel, M.Metal, Z.Front);
}
function interior(b: VehicleBuilder) {
  const seat = new THREE.Color('#6D6045');
  b.block(0, 0.36, 0.02, 1.56, 0.25, 0.39, paint, M.Paint, Z.Trim, 0.008);
  b.block(0, 0.27, -0.27, 0.31, 0.2, 0.62, black, M.Rubber, Z.Trim, 0.025);
  // The bulkhead under the dash reaches the floor, so the footwells are closed at the front.
  b.block(0, (0.15 + WAIST) / 2, SCUTTLE + 0.025, 1.57, WAIST - 0.15, 0.04, paint, M.Paint, Z.Trim);
  // The dash's padded top stands between the windscreen pillars, behind the glass.
  b.block(0, 0.8, SCUTTLE + 0.1, 2 * UP - 0.06, 0.065, 0.2, black, M.Rubber, Z.Trim, 0.01);
  for (const x of [-0.42, 0.42]) {
    b.block(x, 0.54, 0.015, 0.46, 0.12, 0.48, seat, M.Fabric, Z.Trim, 0.035);
    b.block(x, 0.89, 0.23, 0.46, 0.62, 0.11, seat, M.Fabric, Z.Trim, 0.035);
    for (const dx of [-0.115, 0.115])
      b.block(x + dx, 0.603, 0.01, 0.009, 0.005, 0.41, dark, M.Fabric, Z.Trim);
    for (const z of [-0.12, 0.15]) b.block(x, 0.474, z, 0.4, 0.03, 0.035, black, M.Metal, Z.Trim);
  }
  for (const [x, z, yy] of [
    [-0.11, -0.21, 0.75],
    [-0.02, -0.29, 0.65],
  ]) {
    b.rod(v(x, 0.37, z - 0.12), v(x, yy, z), 0.009, steel, M.Metal, Z.Trim);
    b.slot = M.Rubber;
    b.tag = Z.Trim;
    b.push().translate(x, yy, z);
    b.geometry(new THREE.SphereGeometry(0.025, 12, 8), black);
    b.pop();
  }
  // The step from the cab floor up to the load floor.
  b.block(0, 0.305, 0.51, 1.05, 0.31, 0.035, paint, M.Paint, Z.Trim);
  // Its back, under the load floor, is dark like the rest of the underside.
  b.block(0, 0.295, 0.534, 1.05, 0.29, 0.012, black, M.Rubber, Z.Trim);
  // One forward-facing rear passenger seat, dog guard and the wheel boxes' inside faces.
  b.block(-0.3, 0.64, 1.11, 0.44, 0.12, 0.48, seat, M.Fabric, Z.Trim, 0.025);
  b.block(-0.3, 0.95, 1.35, 0.44, 0.58, 0.11, seat, M.Fabric, Z.Trim, 0.025);
  for (const z of [0.96, 1.26])
    for (const x of [-0.48, -0.12]) b.block(x, 0.54, z, 0.025, 0.1, 0.025, steel, M.Metal, Z.Trim);
  for (const z of [0.96, 1.26]) b.block(-0.3, 0.48, z, 0.38, 0.025, 0.05, steel, M.Metal, Z.Trim);
  const o = REAR_OPENING;
  for (const side of [-1, 1]) {
    // Each rear wheel box seen from inside: a top, an inner side and two ends, in body colour,
    // just outside the dark box the wheel opening shows.
    b.block(side * 0.672, 0.52, REAR_AXLE, 0.3, 0.04, 2 * o.foot + 0.07, paint, M.Paint, Z.Trim, 0.006);
    // The side's foot stops above the dark wall's underside, which is what the wheel well shows.
    b.block(side * 0.531, 0.4975, REAR_AXLE, 0.018, 0.085, 2 * o.foot + 0.07, paint, M.Paint, Z.Trim);
    for (const end of [-1, 1])
      b.block(
        side * 0.672,
        0.49,
        REAR_AXLE + end * (o.foot + 0.026),
        0.3,
        0.1,
        0.018,
        paint,
        M.Paint,
        Z.Trim,
      );
  }
  for (const x of [-0.72, 0.72])
    b.rod(v(x, 0.15, 0.46), v(x, TOP - 0.03, 0.46), 0.012, black, M.Metal, Z.Trim);
  for (let i = 0; i < 10; i++)
    b.rod(v(-0.7 + i * 0.156, 0.81, 0.46), v(-0.7 + i * 0.156, 1.3, 0.46), 0.004, black, M.Metal, Z.Trim);
  for (const y of [0.81, 1.055, 1.3])
    b.rod(v(-0.72, y, 0.46), v(0.72, y, 0.46), 0.006, black, M.Metal, Z.Trim);
}
/** The binnacle, dials and steering column, in the vehicle frame (src/data/vehicles.ts). */
function instruments(b: VehicleBuilder, t: VehicleTuning) {
  const cabin = vehicles.camel.cabin;
  // The binnacle stands just ahead of the dial faces, so they show from the seat.
  b.block(cabin.dials.speed.x, 0.875, cabin.dialZ - 0.093, 0.44, 0.2, 0.18, black, M.Rubber, Z.Trim, 0.015);
  addDialFaces(b, cabin, t.engine.redlineRpm);
  addSteeringColumn(b, cabin);
}
/**
 * Coil seats on the axles and the radius-arm brackets that hold them to the chassis. The shared
 * suspension (src/render/vehicleSuspension.ts) hangs each damper from two braces whose feet are
 * 0.47 m out and 0.07 m up, where a straight chassis rail would be. This chassis kicks up over
 * the axles, and its front rails are 0.3 m out, so each pair of feet gets a drop plate from the
 * rail (November 2026 review); at the front an outrigger carries it. The plates stop short of the coil.
 */
function springSeats(b: VehicleBuilder) {
  for (const z of [FRONT_AXLE, REAR_AXLE])
    for (const side of [-1, 1]) {
      const x = side * 0.403,
        rail = side * (z < 0 ? 0.3 : 0.43),
        dz = z < 0 ? 0.16 : -0.16;
      b.block(x, 0.26, z, 0.22, 0.025, 0.22, black, M.Metal, Z.Trim, 0.005);
      for (const zz of [z - 0.075, z + 0.075])
        b.rod(v(rail, 0.34, zz), v(x, 0.25, zz), 0.018, steel, M.Metal, Z.Trim);
      b.rod(
        v(rail, 0.34, z + dz),
        v(side * (z < 0 ? 0.423 : 0.303), 0.32, z + dz),
        0.018,
        steel,
        M.Metal,
        Z.Trim,
      );
      b.block(
        side * (z < 0 ? 0.423 : 0.303),
        0.32,
        z + dz,
        0.075,
        0.04,
        0.075,
        black,
        M.Metal,
        Z.Trim,
        0.006,
      );
      const near = z + Math.sign(dz) * 0.095,
        far = z + Math.sign(dz) * 0.27;
      b.block(side * 0.47, 0.165, (near + far) / 2, 0.02, 0.21, Math.abs(far - near), black, M.Metal, Z.Trim);
      if (z < 0)
        b.block(
          side * 0.41,
          0.26,
          (near + far) / 2,
          0.15,
          0.025,
          Math.abs(far - near),
          black,
          M.Metal,
          Z.Trim,
        );
    }
}
export function buildCamelBody(t: VehicleTuning, w: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  b.push().translate(0, 0, BODY_SHIFT);
  front(b);
  cabinShell(b);
  rearBody(b);
  chassis(b);
  interior(b);
  springSeats(b);
  roof(b);
  b.push().translate(0, 0, 0.17);
  bullbar(b);
  b.pop();
  cageAndIntake(b);
  markings(b);
  roofRack(b);
  spares(b, t, w);
  b.pop();
  instruments(b, t);
  return cleanGeometry(b.build());
}
/**
 * Actual perforated metal sand ladders along the two sides of the rack: a plate with its 32
 * square holes punched straight through (no bevel and square corners, since a bevel round
 * every hole cost 16,000 triangles a ladder). Each hangs on two of the rack's side posts.
 */
export function buildCamelPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder(),
    side = index === 0 ? -1 : 1;
  b.push().translate(0, 0, BODY_SHIFT);
  const z0 = RACK_F + 0.08,
    z1 = RACK_R - 0.03,
    low = DECK + 0.08,
    high = DECK + 0.32,
    step = (RACK_R - RACK_F) / 5;
  const outline: Vtx[] = [
    [z0, low, 0.025],
    [z1, low, 0.025],
    [z1, high, 0.025],
    [z0, high, 0.025],
  ];
  const holes: Vtx[][] = [];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 16; i++) {
      const z = z0 + 0.06 + (i * (z1 - z0 - 0.12)) / 15,
        y = low + 0.045 + row * 0.1;
      holes.push([
        [z - 0.037, y - 0.024],
        [z + 0.037, y - 0.024],
        [z + 0.037, y + 0.024],
        [z - 0.037, y + 0.024],
      ]);
    }
  extrudeX(
    b,
    sideShape(outline, holes),
    side > 0 ? RACK_X + 0.027 : -RACK_X - 0.046,
    side > 0 ? RACK_X + 0.046 : -RACK_X - 0.027,
    steel,
    M.Metal,
    Z.Roof,
    0,
  );
  for (const y of [low + 0.007, high - 0.007])
    b.block(
      side * (RACK_X + 0.049),
      y,
      (z0 + z1) / 2,
      0.015,
      0.015,
      z1 - z0 - 0.04,
      steel,
      M.Metal,
      Z.Roof,
      0.005,
    );
  for (const z of [RACK_F + step, RACK_F + 4 * step]) {
    b.rod(
      v(side * RACK_X, low + 0.06, z),
      v(side * (RACK_X + 0.06), low + 0.06, z),
      0.009,
      black,
      M.Metal,
      Z.Roof,
    );
    b.block(side * (RACK_X + 0.064), low + 0.1, z, 0.022, 0.13, 0.045, black, M.Metal, Z.Roof, 0.003);
    b.block(side * (RACK_X + 0.076), low + 0.1, z, 0.015, 0.045, 0.065, steel, M.Metal, Z.Roof, 0.004);
  }
  b.pop();
  return cleanGeometry(b.build());
}
