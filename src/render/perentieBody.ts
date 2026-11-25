import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addPerentieInterior } from './perentieInterior';
import { perentieColors } from './perentiePaint';
import { cleanGeometry, continuousTube } from './bodyRefinement';
import {
  addCanvasTilt,
  addTiltRack,
  TILT_HALF as CAB,
  addCanvasHoops,
  TILT_BOARD_Y,
  TILT_BOARD_Z,
  TILT_RACK_Z,
} from './perentieCanvas';
import { mirrorHead, stalk } from './mirrors';
import { armyPlate, jerryCan } from './bodyKit';
import { extrudeX, extrudeZ, sideShape, rounded, type Vtx } from './bodyShapes';
import { mountSpare, spareSidewall } from './spares';

/**
 * Land Rover 110 "Perentie" General Service soft top in Australian Army green, with an
 * Army registration plate (48-001). Flat panels and flat-topped wings, a black slatted
 * grille between the headlamp panels, a heavy bull bar, vent flaps under an upright
 * windscreen, a canvas tilt over the cab and rear tub, a galvanised chassis and the
 * Perentie's spare wheel slung under the rear floor, a second spare on the bonnet, and a
 * pick, shovel and axe in brackets across the tailgate. Ground is
 * about 0.52 m below the origin when parked.
 * Photographs and dimensions: reference/vehicles/land-rover-110-perentie/SOURCES.md.
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
const SIDE = 0.895;
const WAIST = 0.78;
const SILL = 0.07;
const ARCH = { radius: 0.51, cy: -0.05 };
/**
 * The wheel openings (v1.92): flat-topped, with radiused corners and sides that splay out to the
 * sill, under a black eyebrow (side-right-county-1990.jpg, rear-34-right-county-1990.jpg). They
 * were half circles 0.51 m in radius under a thick lip. `top` is the flat's height: 18 cm over
 * the tyre, because a crossed axle lifts a wheel 16 cm. `flat` and `foot` are the opening's
 * half-widths at the top and at the sill. The front one is narrower: the grille's face is only
 * 0.50 m ahead of the axle, and the wing has to reach the sill ahead of the wheel.
 */
interface Opening {
  top: number;
  flat: number;
  foot: number;
  corner: number;
}
const FRONT_OPENING: Opening = { top: 0.46, flat: 0.4, foot: 0.45, corner: 0.12 };
const REAR_OPENING: Opening = { top: 0.46, flat: 0.43, foot: 0.52, corner: 0.12 };
/** Height of the opening's edge `d` metres along the truck from the axle. */
function openingAt(o: Opening, d: number): number {
  const { top, flat, foot, corner } = o;
  d = Math.abs(d);
  if (d >= foot) return SILL;
  if (d <= flat - corner) return top;
  if (d <= flat) return top - corner + Math.sqrt(corner * corner - (d - (flat - corner)) ** 2);
  return top - corner - ((d - flat) * (top - corner - SILL)) / (foot - flat);
}
/**
 * The grille's face. v1.91: 0.50 m ahead of the front axle, as sheet A of drawing-variants.png
 * measures it (35 px at 14.55 mm a pixel); at -2.02 the nose was 0.12 m too long.
 */
const FRONT_FACE = -1.9;
/** Headlamp centres: inboard, with the side lamp and indicator stacked outboard of each. */
const LAMP_X = 0.58;
const SMALL_LAMP_X = 0.775;
const SCUTTLE = -0.8;
const B_PILLAR = 0.21;
const TAIL = 2.3;
/** Half the tailgate's width: 1.06 m between the corner panels (it was drawn 1.46 m). */
const GATE = 0.53;
const SCREEN_TOP = 1.36;
/** The bonnet: flush with the wing tops at its edges and crowned a little in the middle. */
const BONNET = { half: 0.58, low: 0.56, edge: 0.61, crown: 0.645 };
/** Top of the front wings, where the aerial stands. */
const AERIAL_Y = BONNET.edge;
const crownAt = (x: number) => BONNET.crown - (BONNET.crown - BONNET.edge) * (x / BONNET.half) ** 2;

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
  o: Opening,
): void {
  const outer = side * SIDE,
    inner = side * (SIDE - 0.05);
  const steps = 72;
  const low = (z: number) => openingAt(o, z - axle);
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
  // The eyebrow: a moulding along the flat and down both corners to the sill, painted with the
  // body (the photographs' are camouflaged with it), a shade darker so its edge reads.
  const edge = (grow: number) =>
    Array.from({ length: 49 }, (_, i) => {
      const d = -o.foot + (2 * o.foot * i) / 48;
      const k = 1 + grow / o.foot;
      return [axle + d * k, Math.max(SILL, openingAt(o, d) + grow)] as Vtx;
    });
  extrudeX(
    b,
    sideShape([...edge(0.05), ...edge(-0.004).reverse()]),
    side > 0 ? SIDE - 0.006 : -SIDE - 0.028,
    side > 0 ? SIDE + 0.028 : -SIDE + 0.006,
    paint.clone().multiplyScalar(0.86),
    M.Paint,
    zone,
    0.006,
  );
  // Inner wheel box, so the opening shows a dark well rather than the far side or the cab:
  // an inner wall, a roof and a wall across each end. The front ones sit further in, clear
  // of the wheels at full lock.
  const boxH = o.top + 0.035 - SILL;
  b.block(side * wellX, SILL + boxH / 2, axle, 0.03, boxH, o.foot * 2, black, M.Rubber, Z.Trim);
  const span = SIDE - wellX - 0.025;
  b.block(
    (side * (wellX + SIDE - 0.025)) / 2,
    o.top + 0.02,
    axle,
    span,
    0.03,
    o.foot * 2,
    black,
    M.Rubber,
    Z.Trim,
  );
  for (const end of [-1, 1])
    b.block(
      (side * (wellX + SIDE - 0.025)) / 2,
      SILL + boxH / 2,
      axle + end * (o.foot + 0.005),
      span,
      boxH,
      0.02,
      black,
      M.Rubber,
      Z.Trim,
    );
}

function frontEnd(b: VehicleBuilder): void {
  const F = FRONT_FACE;
  // Bonnet between flat-topped wings: crowned across, its front and back edges rolled
  // round, with hinges at the back and catches on the front.
  const { half, low, edge } = BONNET;
  const outline: Vtx[] = [
    [-half, low],
    [half, low],
    [half, edge, 0.015],
  ];
  for (let i = 1; i < 8; i++) {
    const x = half - (2 * half * i) / 8;
    outline.push([x, crownAt(x)]);
  }
  outline.push([-half, edge, 0.015]);
  extrudeZ(b, new THREE.Shape(rounded(outline)), F + 0.005, SCUTTLE - 0.01, paint, M.Paint, Z.Front, 0.025);
  for (const side of [-1, 1]) {
    b.block(side * 0.33, crownAt(0.33) + 0.004, -0.86, 0.12, 0.016, 0.06, steel, M.Metal, Z.Front);
    b.block(side * 0.5, 0.59, F - 0.002, 0.05, 0.05, 0.02, black, M.Rubber, Z.Front);
    // Wing top, the outer wing around the wheel and the inner wing beside the engine.
    b.block(
      side * ((BONNET.half + SIDE) / 2),
      0.59,
      (F + SCUTTLE) / 2,
      SIDE - BONNET.half + 0.01,
      0.04,
      SCUTTLE - F,
      paint,
      M.Paint,
      Z.Front,
      0.012,
    );
    archPanel(b, side, F, SCUTTLE, -1.397, 0.585, Z.Front, 0.39, FRONT_OPENING);
    // Headlamp panel: round lamp in a black bezel, side lamp and indicator beneath, and
    // the convoy lamp above it.
    b.block(side * 0.655, 0.33, F + 0.02, 0.47, 0.52, 0.04, paint, M.Paint, Z.Front, 0.01);
    b.slot = M.Rubber;
    b.tag = Z.Front;
    b.push()
      .translate(side * LAMP_X, 0.39, F - 0.005)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 28), black);
    b.pop();
    b.ring(side * LAMP_X, 0.39, F - 0.022, 0.093, 0.012, steel, M.Metal, 'z', Z.Front);
    b.slot = M.Metal;
    b.push()
      .translate(side * LAMP_X, 0.39, F - 0.025)
      .scale(1, 1, 0.22);
    b.geometry(new THREE.SphereGeometry(0.088, 20, 8), steel);
    b.pop();
    b.slot = M.Headlamp;
    b.push()
      .translate(side * LAMP_X, 0.39, F - 0.036)
      .scale(1, 1, 0.12);
    b.geometry(new THREE.SphereGeometry(0.079, 20, 8), lens.clone().multiplyScalar(0.78));
    b.pop();
    // Fine vertical flute ribs on the convex sealed-beam cover.
    for (const dx of [-0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06]) {
      const h = Math.sqrt(0.079 ** 2 - dx ** 2);
      b.rod(
        { x: side * LAMP_X + dx, y: 0.39 - h, z: F - 0.047 },
        { x: side * LAMP_X + dx, y: 0.39 + h, z: F - 0.047 },
        0.0012,
        glass,
        M.Glass,
        Z.Front,
      );
    }
    // Army convoy lamp above the headlamp: a small hooded box with a narrow slit lens.
    b.block(side * LAMP_X, 0.548, F - 0.018, 0.1, 0.05, 0.05, black, M.Rubber, Z.Front, 0.008);
    b.block(side * LAMP_X, 0.578, F - 0.03, 0.11, 0.008, 0.07, black, M.Rubber, Z.Front, 0.003);
    b.block(side * LAMP_X, 0.545, F - 0.044, 0.06, 0.012, 0.004, lens, M.Rubber, Z.Front);
    // Side lamp over indicator, stacked outboard of the headlamp (front.jpg). They were side
    // by side under it.
    for (const [ly, col, slot] of [
      [0.455, lens, M.Headlamp],
      [0.335, amber, M.Amber],
    ] as const) {
      const offset = SMALL_LAMP_X;
      b.slot = M.Rubber;
      b.tag = Z.Front;
      b.push()
        .translate(side * offset, ly, F - 0.012)
        .rotate(Math.PI / 2, 0, 0);
      b.geometry(new THREE.CylinderGeometry(0.041, 0.041, 0.027, 24), black);
      b.pop();
      b.ring(side * offset, ly, F - 0.029, 0.034, 0.004, steel, M.Metal, 'z', Z.Front);
      b.slot = slot;
      b.push()
        .translate(side * offset, ly, F - 0.031)
        .scale(1, 1, 0.32);
      b.geometry(new THREE.SphereGeometry(0.032, 12, 6), col);
      b.pop();
    }
    // The engine's air intake: a grille let into the top of the right wing, towards the scuttle
    // (side-right-county-1990.jpg). It was a louvred panel on the left wing's side.
    if (side > 0) {
      const ix = (BONNET.half + SIDE) / 2;
      b.block(ix, 0.611, -1.08, 0.2, 0.006, 0.34, black, M.Rubber, Z.Front, 0.002);
      for (let i = 0; i < 6; i++)
        b.block(ix, 0.616, -1.22 + i * 0.056, 0.18, 0.005, 0.012, rubber, M.Rubber, Z.Front);
    }
    // Amber repeater on each wing's side.
    b.block(side * (SIDE + 0.005), 0.535, -1.25, 0.012, 0.028, 0.06, amber, M.Amber, Z.Front, 0.004);
  }
  // The Perentie's grille: a body-colour panel of seven chunky louvres (front.jpg), with a
  // small two-line oval identity badge above. It was a black panel of fourteen fine slats.
  const shade = paint.clone().multiplyScalar(0.5);
  b.block(0, 0.33, F + 0.008, 0.84, 0.46, 0.028, shade, M.Paint, Z.Front, 0.009);
  for (let i = 0; i < 7; i++)
    b.block(0, 0.15 + i * 0.058, F - 0.014, 0.8, 0.034, 0.03, paint, M.Paint, Z.Front, 0.006);
  const oval = new THREE.Shape();
  oval.absellipse(0, 0, 0.078, 0.038, 0, Math.PI * 2, false, 0);
  b.push().translate(0, 0.496, F - 0.025);
  extrudeZ(b, oval, -0.007, 0, steel, M.Metal, Z.Front, 0.001);
  const inner = new THREE.Shape();
  inner.absellipse(0, 0, 0.072, 0.032, 0, Math.PI * 2, false, 0);
  extrudeZ(b, inner, -0.009, -0.007, paint.clone().multiplyScalar(0.55), M.Paint, Z.Front, 0);
  const glyph: Record<string, number[][]> = {
    L: [
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ],
    A: [
      [0, 0, 0.5, 1],
      [0.5, 1, 1, 0],
      [0.2, 0.4, 0.8, 0.4],
    ],
    N: [
      [0, 0, 0, 1],
      [0, 1, 1, 0],
      [1, 0, 1, 1],
    ],
    D: [
      [0, 0, 0, 1],
      [0, 1, 0.7, 1],
      [0.7, 1, 1, 0.7],
      [1, 0.7, 1, 0.3],
      [1, 0.3, 0.7, 0],
      [0.7, 0, 0, 0],
    ],
    R: [
      [0, 0, 0, 1],
      [0, 1, 1, 1],
      [1, 1, 1, 0.5],
      [1, 0.5, 0, 0.5],
      [0.4, 0.5, 1, 0],
    ],
    O: [
      [0, 0, 0, 1],
      [0, 1, 1, 1],
      [1, 1, 1, 0],
      [1, 0, 0, 0],
    ],
    V: [
      [0, 1, 0.5, 0],
      [0.5, 0, 1, 1],
    ],
    E: [
      [0, 0, 0, 1],
      [0, 1, 1, 1],
      [0, 0.5, 0.8, 0.5],
      [0, 0, 1, 0],
    ],
  };
  ['LAND', 'ROVER'].forEach((word, row) =>
    [...word].forEach((ch, i) => {
      const start = ((word.length - 1) * 0.012) / 2 - i * 0.012;
      for (const [x0, y0, x1, y1] of glyph[ch])
        b.rod(
          {
            x: start - (x0 - 0.5) * 0.008,
            y: 0.006 - row * 0.019 + y0 * 0.012,
            z: -0.01,
          },
          {
            x: start - (x1 - 0.5) * 0.008,
            y: 0.006 - row * 0.019 + y1 * 0.012,
            z: -0.01,
          },
          0.00085,
          white,
          M.Metal,
          Z.Front,
        );
    }),
  );
  b.pop();
  // Sump, steering box and the front crossmember below the grille.
  b.block(0, -0.04, -1.62, 0.36, 0.16, 0.5, black, M.Metal, Z.Trim, 0.02);
  b.block(0.36, 0.02, FRONT_FACE + 0.16, 0.14, 0.16, 0.16, black, M.Metal, Z.Trim, 0.02);
}

function windscreen(b: VehicleBuilder): void {
  // Scuttle with its two vent flaps, then the upright frame and its wipers.
  b.block(0, 0.7, SCUTTLE, 1.8, 0.16, 0.1, paint, M.Paint, Z.Front, 0.012);
  for (const x of [-0.38, 0.38]) {
    b.block(x, 0.7, SCUTTLE - 0.058, 0.44, 0.1, 0.02, paint, M.Paint, Z.Front, 0.008);
    b.block(x, 0.752, SCUTTLE - 0.062, 0.44, 0.008, 0.016, black, M.Rubber, Z.Front);
  }
  // It leans back 10 cm in its 58 cm (10 degrees); at 7 cm it stood too upright.
  const lean = Math.atan2(0.1, SCREEN_TOP - WAIST);
  b.push()
    .translate(0, WAIST, SCUTTLE + 0.01)
    .rotate(lean, 0, 0);
  const h = SCREEN_TOP - WAIST;
  // As wide as the door tops, so the pillars and the doors' front edges are flush.
  const w = 2 * CAB;
  b.block(0, 0.03, 0, w, 0.06, 0.07, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h - 0.03, 0, w, 0.07, 0.08, paint, M.Paint, Z.Front, 0.01);
  for (const x of [-(CAB - 0.035), CAB - 0.035])
    b.block(x, h / 2, 0, 0.07, h, 0.07, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h / 2 + 0.005, 0, w - 0.13, h - 0.11, 0.012, glass, M.Glass, Z.Glass);
  for (const y of [0.065, h - 0.07]) b.block(0, y, -0.012, w - 0.12, 0.012, 0.01, rubber, M.Rubber, Z.Front);
  for (const x of [0.5, -0.18]) {
    b.rod({ x, y: 0.07, z: -0.03 }, { x: x - 0.42, y: 0.1, z: -0.03 }, 0.007, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.07, z: -0.034 }, { x: x - 0.38, y: 0.1, z: -0.034 }, 0.004, black, M.Rubber, Z.Front);
  }
  // Fold-down screen clamps either side.
  // Small painted brackets on the lower rail; as 5 cm steel cubes over the glass they read as loose.
  for (const x of [-(CAB - 0.13), CAB - 0.13])
    b.block(x, 0.03, -0.042, 0.06, 0.04, 0.02, paint, M.Paint, Z.Front, 0.004);
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
    // The waist shelf: the door's top, from the cab's side out to the body's.
    b.block(
      (side * (CAB + SIDE)) / 2,
      WAIST - 0.004,
      mid,
      SIDE - CAB + 0.04,
      0.03,
      len,
      paint,
      M.Paint,
      Z.Sides,
      0.006,
    );
    const x = side * (CAB - 0.012);
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
    // Door mirror: an arm bolted to the upper hinge, cranked out and up, and a square black
    // head on a ball joint.
    b.block(side * (SIDE + 0.012), 0.74, front + 0.04, 0.025, 0.07, 0.08, black, M.Metal, Z.Sides, 0.008);
    stalk(
      b,
      [
        { x: side * (SIDE + 0.02), y: 0.74, z: front + 0.04 },
        { x: side * (SIDE + 0.11), y: 0.76, z: front + 0.02 },
        { x: side * (SIDE + 0.15), y: 0.96, z: front },
      ],
      0.012,
      black,
    );
    mirrorHead(b, side, { x: side * (SIDE + 0.17), y: 1.04, z: front + 0.03 }, 0.17, 0.15, 0.06, black);
  }
}

function rearBody(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    archPanel(b, side, B_PILLAR + 0.01, TAIL, 1.397, WAIST, Z.Rear, 0.56, REAR_OPENING);
    // The waist shelf along the tub (the cab and tilt are narrower than the body since v1.93),
    // which the tilt's bows, the rack's feet and the roll bar's braces stand on, and the rope
    // cleats the tilt is lashed to.
    b.block(
      (side * (CAB - 0.09 + SIDE + 0.01)) / 2,
      WAIST + 0.012,
      (B_PILLAR + TAIL) / 2,
      SIDE + 0.01 - (CAB - 0.09),
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
    // From the tailgate's edge to the body side: 0.11 m panels at 0.79 left a 5 cm slit open
    // at each corner (v1.90).
    b.block(
      (side * (GATE + SIDE)) / 2,
      (SILL + WAIST) / 2,
      TAIL,
      SIDE - GATE,
      WAIST - SILL,
      0.05,
      paint,
      M.Paint,
      Z.Rear,
      0.01,
    );
    b.block(side * 0.76, 0.2, TAIL + 0.035, 0.13, 0.18, 0.04, black, M.Rubber, Z.Rear, 0.01);
    b.block(side * 0.76, 0.24, TAIL + 0.058, 0.1, 0.06, 0.012, red, M.Red, Z.Rear, 0.005);
    b.block(side * 0.76, 0.17, TAIL + 0.058, 0.1, 0.05, 0.012, amber, M.Amber, Z.Rear, 0.005);
    // Reflector on the end of the rear crossmember, clear of the can's tray and stays.
    b.ring(side * 0.66, 0.02, 2.415, 0.03, 0.01, red, M.Red, 'z', Z.Rear);
    // Jerry can in a holder on the corner panel, above the lamps, its broad side to the panel.
    canOnRear(b, side);
    // Stowage locker let into the body side behind the rear wheel: a door with round ends, proud
    // of the panel, hinged along its bottom edge with a catch at the top (front-34-county.jpg).
    extrudeX(
      b,
      sideShape([
        [1.95, 0.27, 0.11],
        [2.27, 0.27, 0.11],
        [2.27, 0.53, 0.11],
        [1.95, 0.53, 0.11],
      ]),
      side > 0 ? SIDE - 0.004 : -SIDE - 0.009,
      side > 0 ? SIDE + 0.009 : -SIDE + 0.004,
      paint.clone().multiplyScalar(0.92),
      M.Paint,
      Z.Sides,
      0.003,
    );
    b.block(
      side * (SIDE + 0.011),
      0.278,
      2.11,
      0.008,
      0.012,
      0.18,
      paint.clone().multiplyScalar(0.75),
      M.Paint,
      Z.Sides,
    );
    b.block(side * (SIDE + 0.011), 0.5, 2.11, 0.008, 0.022, 0.03, steel, M.Metal, Z.Sides);
    // Mud flap behind the rear wheel, hung from a strip bolted under the body side.
    b.block(side * 0.765, 0.058, 1.955, 0.26, 0.024, 0.022, black, M.Metal, Z.Trim);
    b.block(side * 0.765, -0.11, 1.955, 0.26, 0.32, 0.012, rubber, M.Rubber, Z.Trim, 0.004);
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
  b.block(0, 0.44, TAIL + 0.005, 2 * GATE, 0.62, 0.05, paint, M.Paint, Z.Rear, 0.01);
  // The sill under the gate, down to the rear crossmember: a 4 cm slot was open there.
  b.block(0, 0.1, TAIL - 0.005, 2 * GATE, 0.07, 0.04, paint, M.Paint, Z.Rear);
  for (const y of [0.3, 0.58])
    b.block(0, y, TAIL + 0.034, 2 * GATE - 0.12, 0.04, 0.012, paint, M.Paint, Z.Rear, 0.006);
  for (const side of [-1, 1]) {
    // Bottom hinge, and the chain from the gate's top corner to the corner panel.
    b.rod(
      { x: side * 0.3, y: 0.14, z: TAIL + 0.04 },
      { x: side * 0.42, y: 0.14, z: TAIL + 0.04 },
      0.014,
      steel,
      M.Metal,
      Z.Rear,
    );
    b.rod(
      { x: side * (GATE - 0.03), y: 0.73, z: TAIL + 0.03 },
      { x: side * (GATE + 0.04), y: 0.77, z: TAIL - 0.02 },
      0.006,
      steel,
      M.Metal,
      Z.Rear,
    );
  }
  armyPlate(b, -0.3, 0.22, TAIL + 0.04, 1);
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
  // Bench legs land on the load floor ahead of and behind the wheel boxes.
  for (const side of [-1, 1]) {
    for (const z of [0.55, 2.15]) b.block(side * 0.68, 0.355, z, 0.025, 0.31, 0.04, paint, M.Paint, Z.Trim);
    b.block(side * 0.68, 0.503, 1.35, 0.08, 0.03, 0.55, paint, M.Paint, Z.Trim);
  }
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

/**
 * The Army's pioneer tools across the tailgate, the bonnet being taken by the second spare:
 * a shovel along the top, a pick below it and an axe at the bottom, each held clear of the
 * paint by two clamps.
 */
function tailgateTools(b: VehicleBuilder): void {
  const wood = new THREE.Color('#8A6A44'),
    head = new THREE.Color('#41463F');
  const z = TAIL + 0.075;
  const clamp = (x: number, y: number) =>
    b.block(x, y, TAIL + 0.055, 0.035, 0.07, 0.05, black, M.Metal, Z.Rear, 0.006);
  // Shovel: blade on the right, socket, handle and D grip towards the left.
  let y = 0.63;
  b.block(0.35, y, z, 0.27, 0.2, 0.012, head, M.Metal, Z.Rear, 0.004);
  b.rod({ x: 0.22, y, z }, { x: 0.11, y, z }, 0.02, head, M.Metal, Z.Rear);
  b.rod({ x: 0.11, y, z }, { x: -0.37, y, z }, 0.016, wood, M.Fabric, Z.Rear);
  b.ring(-0.415, y, z, 0.045, 0.01, black, M.Metal, 'z', Z.Rear);
  clamp(0.35, y);
  clamp(-0.2, y);
  // Pick: helve across the middle with the head upright at its left end.
  y = 0.44;
  b.rod({ x: -0.45, y, z }, { x: 0.42, y, z }, 0.019, wood, M.Fabric, Z.Rear);
  b.rod({ x: -0.45, y: 0.3, z }, { x: -0.45, y: 0.58, z }, 0.016, head, M.Metal, Z.Rear);
  b.block(-0.45, y, z, 0.06, 0.07, 0.05, head, M.Metal, Z.Rear, 0.01);
  clamp(-0.3, y);
  clamp(0.25, y);
  // Axe: helve along the bottom, its head at the right end with the blade turned down.
  y = 0.3;
  b.rod({ x: -0.19, y, z }, { x: 0.43, y, z }, 0.017, wood, M.Fabric, Z.Rear);
  b.block(0.45, y - 0.03, z, 0.06, 0.16, 0.03, head, M.Metal, Z.Rear, 0.006);
  b.block(0.45, y - 0.12, z, 0.11, 0.03, 0.012, head, M.Metal, Z.Rear, 0.004);
  clamp(-0.09, y);
  clamp(0.31, y);
}

/** The second spare lying flat on a mounting plate on the bonnet, held by a centre clamp. */
function bonnetSpare(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const z = (FRONT_FACE + SCUTTLE) / 2 - 0.01,
    base = crownAt(0) + 0.04,
    // The tyre's sidewall rests on the plate, 4 mm clear.
    hubY = base + spareSidewall(wheel) + 0.004,
    top = hubY + tuning.wheelWidth / 2;
  // 0.66 m square, out to where the sidewall is widest, so the tyre is seen to rest on it
  // (on the 0.36 m plate it looked held up by a plinth under its middle).
  b.block(0, crownAt(0) + 0.02, z, 0.66, 0.04, 0.66, black, M.Metal, Z.Front, 0.01);
  b.tag = Z.Front;
  mountSpare(b, wheel, { x: 0, y: hubY, z }, 'up', black);
  b.rod({ x: 0, y: base, z }, { x: 0, y: top + 0.05, z }, 0.014, steel, M.Metal, Z.Front);
  b.block(0, top + 0.012, z, 0.26, 0.02, 0.06, black, M.Metal, Z.Front, 0.006);
  b.rod({ x: -0.07, y: top + 0.05, z }, { x: 0.07, y: top + 0.05, z }, 0.01, steel, M.Metal, Z.Front);
}

/**
 * Pressed-steel jerry can on a rear corner panel, above the lamps, its broad side flat against
 * the panel. It stands in a tray held by two flat bars bolted to the panel behind it, with a
 * stay under each side of the tray and a strap round it. Until v1.90 a can hung outside each
 * body side, which made the truck 2.2 m wide.
 */
function canOnRear(b: VehicleBuilder, side: number): void {
  const x = (side * (GATE + SIDE)) / 2,
    y = 0.565,
    skin = TAIL + 0.025,
    z = skin + 0.02 + 0.0825;
  b.block(x, y - 0.25, skin + 0.105, 0.36, 0.03, 0.21, bar, M.Metal, Z.Rear, 0.004);
  for (const dx of [-0.15, 0.15]) {
    b.block(x + dx, y - 0.01, skin + 0.01, 0.035, 0.5, 0.02, bar, M.Metal, Z.Rear);
    b.rod(
      { x: x + dx, y: y - 0.265, z: skin + 0.2 },
      { x: x + dx, y: y - 0.39, z: skin + 0.005 },
      0.009,
      bar,
    );
  }
  b.push()
    .translate(x, y, z)
    .rotate(0, -Math.PI / 2, 0);
  jerryCan(b, 0, 0, 0, { colour: new THREE.Color('#5B6640'), zone: Z.Rear, width: 0.165, ribX: 0.085 });
  b.pop();
  b.block(x, y + 0.05, z + 0.088, 0.352, 0.04, 0.012, black, M.Rubber, Z.Rear);
  for (const dx of [-0.172, 0.172])
    b.block(x + dx, y + 0.05, skin + 0.105, 0.012, 0.04, 0.21, black, M.Rubber, Z.Rear);
}

function tilt(b: VehicleBuilder): void {
  addCanvasTilt(b);
}

/**
 * The roll bar behind the cab (rear-34-right-county-1990.jpg, front-34-county.jpg): a hoop of
 * tube standing on the load floor just behind the seats, inside the canvas bows, with a brace
 * from each top corner back and down to the tub's capping rail. Painted with the body.
 */
function rollBar(b: VehicleBuilder): void {
  const z = B_PILLAR + 0.12,
    x = 0.66,
    top = 1.37;
  const tube = (pts: [number, number, number][], r: number) =>
    continuousTube(
      b,
      pts.map((p) => new THREE.Vector3(...p)),
      r,
      paint,
      Z.Trim,
      M.Paint,
    );
  tube(
    [
      [-x, 0.215, z],
      [-x, top, z],
      [x, top, z],
      [x, 0.215, z],
    ],
    0.03,
  );
  for (const side of [-1, 1]) {
    b.block(side * x, 0.225, z, 0.11, 0.02, 0.11, paint, M.Paint, Z.Trim, 0.004);
    tube(
      [
        [side * x, top - 0.06, z],
        [side * 0.76, WAIST + 0.03, 1.45],
      ],
      0.024,
    );
    b.block(side * 0.76, WAIST + 0.03, 1.45, 0.07, 0.03, 0.1, paint, M.Paint, Z.Trim, 0.004);
  }
}

function chassisAndRecovery(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  // Galvanised ladder frame, crossmembers, outriggers and the rear crossmember.
  for (const side of [-1, 1]) {
    b.block(
      side * 0.355,
      0.03,
      (FRONT_FACE + 0.06 - 1.06) / 2,
      0.1,
      0.18,
      -1.06 - FRONT_FACE - 0.06,
      galv,
      M.Paint,
      Z.Trim,
    );
    b.rod(
      { x: side * 0.355, y: 0.03, z: -1.08 },
      { x: side * 0.43, y: 0.03, z: -0.86 },
      0.05,
      galv,
      M.Paint,
      Z.Trim,
    );
    b.block(side * 0.43, 0.03, 0.22, 0.1, 0.18, 2.16, galv, M.Paint, Z.Trim);
    b.rod(
      { x: side * 0.43, y: 0.03, z: 1.28 },
      { x: side * 0.495, y: 0.03, z: 1.72 },
      0.05,
      galv,
      M.Paint,
      Z.Trim,
    );
    b.block(side * 0.495, 0.03, 2.01, 0.1, 0.18, 0.6, galv, M.Paint, Z.Trim);
  }
  for (const z of [FRONT_FACE + 0.06, -0.62, 0.62])
    b.block(0, 0.02, z, 0.86, 0.1, 0.1, galv, M.Paint, Z.Trim);
  // The rear crossmember is painted with the body (front-34-left-county.jpg); it was bare galvanised.
  b.block(0, 0.02, 2.36, 1.48, 0.14, 0.1, paint, M.Paint, Z.Rear);
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
  b.rod({ x: -0.3, y: -0.08, z: 1.0 }, { x: -0.62, y: -0.09, z: 2.4 }, 0.028, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.3, -0.07, 0.2)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.085, 0.085, 0.5, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
  // The Perentie's own spare wheel, slung flat in a cradle under the rear floor.
  b.tag = Z.Rear;
  // v1.90: it hangs 0.2 m lower and 80 mm further back. Tucked up between the rails it could
  // not be seen from any side, and its front edge was inside the differential. Its tread now
  // passes just under the rear crossmember and shows below it from behind, as the real one does.
  const spare = { x: 0, y: -0.17, z: 1.93 };
  mountSpare(b, wheel, spare, 'down', black);
  const under = spare.y - spareSidewall(wheel) - 0.02;
  for (const x of [-0.2, 0.2]) b.block(x, under, spare.z, 0.05, 0.03, 0.84, galv, M.Paint, Z.Trim);
  for (const z of [spare.z - 0.42, spare.z + 0.3]) {
    b.block(0, under - 0.005, z, 1.04, 0.04, 0.035, galv, M.Paint, Z.Trim);
    // Hangers from the chassis rails down to the cradle.
    for (const x of [-0.495, 0.495])
      b.rod({ x, y: -0.06, z }, { x, y: under - 0.005, z }, 0.012, galv, M.Paint, Z.Trim);
  }
  // Pintle hook and trailer socket for the No. 5 trailer, and the rear plate.
  b.block(0, -0.02, 2.43, 0.14, 0.12, 0.08, black, M.Metal, Z.Rear, 0.01);
  b.ring(0, -0.04, 2.5, 0.045, 0.014, black, M.Metal, 'y', Z.Rear);
  b.slot = M.Rubber;
  b.push()
    .translate(0.3, 0.02, 2.42)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), black);
  b.pop();

  // The Army brushguard: a heavy beam that serves as the bumper, with towing eyes under it,
  // and one tube loop over the grille and headlamps. Painted with the body, as both trucks in
  // the photographs are (it was black).
  const face = FRONT_FACE - 0.2;
  const pan = new THREE.Shape();
  pan.moveTo(-0.78, -face);
  pan.lineTo(0.78, -face);
  pan.lineTo(0.97, -face - 0.1);
  pan.lineTo(0.93, -face - 0.22);
  pan.lineTo(0.76, -face - 0.12);
  pan.lineTo(-0.76, -face - 0.12);
  pan.lineTo(-0.93, -face - 0.22);
  pan.lineTo(-0.97, -face - 0.1);
  pan.closePath();
  const beam = new THREE.ExtrudeGeometry(pan, {
    depth: 0.146,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
    steps: 1,
  });
  beam.rotateX(-Math.PI / 2);
  beam.translate(0, -0.013, 0);
  b.slot = M.Paint;
  b.tag = Z.Front;
  b.geometry(beam, paint);
  const beamTop = 0.145,
    zb = face + 0.05,
    zAt = (y: number) => zb + ((y - beamTop) * 0.06) / (0.67 - beamTop);
  const tube = (pts: number[][]) =>
    continuousTube(
      b,
      pts.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
      0.03,
      paint,
      Z.Front,
      M.Paint,
    );
  // One loop of tube, standing on the beam near its ends and running across above the lamps
  // and the grille, with a flat centre post and a cross rail under the lamps
  // (side-right-county-1990.jpg, rear-34-left-county.jpg). It was three hoops.
  const out = 0.82,
    topY = 0.62;
  tube([
    [-out, beamTop - 0.012, zb],
    [-out, topY, zAt(topY)],
    [out, topY, zAt(topY)],
    [out, beamTop - 0.012, zb],
  ]);
  const railY = 0.265;
  b.rod(
    { x: -out, y: railY, z: zAt(railY) },
    { x: out, y: railY, z: zAt(railY) },
    0.022,
    paint,
    M.Paint,
    Z.Front,
  );
  b.block(
    0,
    (beamTop + topY) / 2,
    zAt((beamTop + topY) / 2),
    0.09,
    topY - beamTop,
    0.02,
    paint,
    M.Paint,
    Z.Front,
    0.004,
  );
  for (const side of [-1, 1]) {
    b.block(side * out, beamTop, zb, 0.09, 0.025, 0.09, paint, M.Paint, Z.Front, 0.005);
    b.rod(
      { x: side * 0.36, y: 0.055, z: face + 0.1 },
      { x: side * 0.36, y: 0.015, z: FRONT_FACE + 0.11 },
      0.028,
      paint,
      M.Paint,
      Z.Trim,
    );
  }
  for (const side of [-1, 1])
    b.ring(side * 0.55, -0.06, face + 0.06, 0.04, 0.012, bar, M.Metal, 'x', Z.Front);
  armyPlate(b, -0.55, 0.06, face - 0.01, -1);
  // Winch drum tucked behind the bar, with a roller fairlead at the cable exit.
  // The drum stands on the beam in two cheek plates, behind the guard's rail and in line with
  // the fairlead in the beam's face. Half sunk into the beam and all black, it read as a hole.
  const drum = { y: 0.205, z: face + 0.125 };
  b.rod(
    { x: -0.19, y: drum.y, z: drum.z },
    { x: 0.19, y: drum.y, z: drum.z },
    0.052,
    steel,
    M.Metal,
    Z.Front,
  );
  for (let i = 0; i < 12; i++)
    b.ring(-0.165 + i * 0.03, drum.y, drum.z, 0.052, 0.005, black, M.Metal, 'x', Z.Front);
  for (const x of [-0.21, 0.21]) b.block(x, 0.2, drum.z, 0.03, 0.14, 0.13, black, M.Metal, Z.Front, 0.008);
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
  // HF radio whip on the left front wing, ahead of the windscreen and clear of the tilt. On the
  // tub's rear corner it passed up through the canvas roof (v1.90).
  b.block(-0.76, AERIAL_Y + 0.03, -1.0, 0.07, 0.06, 0.07, black, M.Rubber, Z.Front, 0.01);
  b.rod(
    { x: -0.76, y: AERIAL_Y + 0.06, z: -1.0 },
    { x: -0.78, y: 2.3, z: -0.95 },
    0.005,
    black,
    M.Rubber,
    Z.Front,
  );
}

export function buildPerentieBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontEnd(b);
  bonnetSpare(b, tuning, wheel);
  tailgateTools(b);
  windscreen(b);
  doors(b);
  rearBody(b);
  tilt(b);
  rollBar(b);
  chassisAndRecovery(b, tuning, wheel);
  addPerentieInterior(b, tuning.engine.redlineRpm);
  addCanvasHoops(b);
  addTiltRack(b);
  const g = b.build();
  return cleanGeometry(g);
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
  const lugs = 16;
  for (let i = 0; i < lugs; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / lugs) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.26, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.18, 0);
      b.box(w * 0.42, 0.04, 0.065, tyre);
      b.pop();
    }
    const angle = ((i + 0.25) / lugs) * Math.PI * 2;
    b.push()
      .translate(0, Math.cos(angle) * r * 0.97, Math.sin(angle) * r * 0.97)
      .rotate(angle, 0, 0);
    b.box(w * 0.18, 0.04, 0.045, tyre);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.72, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, a dished centre in Army green, drive flange and studs.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.014, paint, M.Paint, 'x');
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 24),
      paint.clone().multiplyScalar(0.9),
    );
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.135, 0.03, 16), paint);
    b.pop();
    // A plain disc dished in two steps, with no holes (front-34-county.jpg, the 1988 truck's
    // rear wheel). Eight square holes were drawn round it until v2.04.
    b.push()
      .translate(side * (w * 0.5 - 0.014), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.162, 0.178, 0.016, 24), paint.clone().multiplyScalar(0.95));
    b.pop();
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
    b.geometry(new THREE.CylinderGeometry(0.048, 0.055, 0.05, 12), galv.clone().multiplyScalar(0.8));
    b.pop();
  }
  return cleanGeometry(b.build());
}

/** Recovery board resting on the two external support bows, with closed straps. */
export function buildPerentiePlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder(),
    wood = new THREE.Color('#A9824F'),
    x = index === 0 ? -0.36 : 0.36,
    y = TILT_BOARD_Y,
    z = TILT_BOARD_Z,
    L = plankTuning.length,
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
  for (const zz of TILT_RACK_Z) {
    b.block(x, y + 0.03, zz, W + 0.02, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const side of [-1, 1])
      b.block(x + (side * (W + 0.02)) / 2, y - 0.018, zz, 0.012, 0.1, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, y - 0.06, zz, W + 0.03, 0.012, 0.045, black, M.Rubber, Z.Roof);
  }
  return cleanGeometry(b.build());
}
