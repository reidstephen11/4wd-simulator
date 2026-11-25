import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeX, extrudeZ, inset, rounded, roundHeadlamp, sideShape, type Vtx } from './bodyShapes';
import { cleanGeometry, subdivideSurface } from './bodyRefinement';
import { mirrorHead, stalk } from './mirrors';
import { mqColors as C } from './mqPaint';
import { addMqGear } from './mqGear';
import { addMqInterior } from './mqInterior';
export { buildMqPlank, buildMqWheel } from './mqGear';

// The 1980–83 Australian MQ Patrol short-wheelbase hardtop. Axes as in the game: x across,
// y up from the body origin 0.12 m above the parked hubs (the ground is 0.52 m below it), z
// backwards, so the nose is at -z. Heights and lengths were read off the Spanish-built 1983
// hardtop (front and rear three-quarters), the Dutch 1986/87 hardtops (the same body behind
// the A-pillar) and the square-on 1985 long-wheelbase wagon, scaled by the 0.80 m tyres and
// the 2.35 m wheelbase, and checked against the published length, width and height.
// Photographs and dimensions: reference/vehicles/nissan-mq-patrol/SOURCES.md.
export const AXLE = 1.175;
/** Face of the grille panel and the headlamps. */
export const NOSE = -1.86;
export const TAIL = 2.08;
/** Half the 1.69 m width, over the wheel-arch lips. */
export const HW = 0.845;
/** Half-width of the flat body sides and the bonnet. */
export const WS = 0.8;
/** The belt line: top of the doors, the guards and the bonnet, all on one level. */
export const BELT = 0.61;
/** Top of the side glass, under the drip rails. */
export const ROOF_EDGE = 1.22;
/** The cab roof, and the hardtop's roof a little above it. */
export const ROOF = 1.335;
export const TOP_ROOF = 1.36;
/** Bottom edge of the body sides. */
const LOW = -0.02;
/** A-pillar base (the front door's shut line) and the B-pillar shut lines. */
export const FRONT_DOOR = -0.62;
const B_SHUT = 0.44;
const TOP_FRONT = 0.47;
/** Rear corners, round in plan. */
const RC = 0.05;
/** Side skins run this far round into the rear corners so their ends stay hidden. */
const REAR = TAIL - RC + 0.012;
/** Top of the wheel openings, and the corner radius of their squared shape. */
const ARCH_TOP = 0.36;
const ARCH_R = 0.3;

const archOpening = (z0: number, z1: number): Vtx[] => [
  [z0, LOW - 0.001],
  [z0, ARCH_TOP, ARCH_R],
  [z1, ARCH_TOP, ARCH_R],
  [z1, LOW - 0.001],
];
const FRONT_OPENING = archOpening(-1.645, -0.705);
const REAR_OPENING = archOpening(0.705, 1.645);
/** The pressed lip round each opening stands 45 mm wide and 18 mm proud of the side. */
const lip = (o: Vtx[]): Vtx[] => [
  [o[0][0] - 0.045, LOW - 0.001],
  [o[1][0] - 0.045, ARCH_TOP + 0.045, ARCH_R + 0.03],
  [o[2][0] + 0.045, ARCH_TOP + 0.045, ARCH_R + 0.03],
  [o[3][0] + 0.045, LOW - 0.001],
];

// The windows (z, y) and the A-pillar's line.
const A_LOW = { z: FRONT_DOOR, y: BELT };
const A_TOP = { z: -0.49, y: ROOF_EDGE };
const DOOR_WINDOW: Vtx[] = [
  [-0.555, 0.655, 0.012],
  [-0.445, 1.175, 0.03],
  [0.385, 1.175, 0.03],
  [0.385, 0.655, 0.012],
];
const SIDE_WINDOW: Vtx[] = [
  [0.56, 0.69, 0.02],
  [0.56, 1.175, 0.04],
  [1.96, 1.175, 0.04],
  [1.96, 0.69, 0.02],
];
const REAR_WINDOW: Vtx[] = [
  [-0.6, 0.72, 0.05],
  [0.6, 0.72, 0.05],
  [0.6, 1.165, 0.05],
  [-0.6, 1.165, 0.05],
];

/** A thin flat side skin in a side-view outline, its outer face at WS. */
function skin(
  b: VehicleBuilder,
  side: number,
  outline: Vtx[],
  holes: Vtx[][],
  zone: number,
  color = C.paint,
  slot: number = M.Paint,
  t = 0.035,
  bevel = 0.008,
  out = WS,
): void {
  extrudeX(
    b,
    sideShape(outline, holes),
    side > 0 ? out - t : -out,
    side > 0 ? out : -out + t,
    color,
    slot,
    zone,
    bevel,
    [],
    3,
    0.8,
  );
}

/** Side glass a little inside the skin, in an outline grown so its edge hides in the frame. */
function sideGlass(b: VehicleBuilder, side: number, verts: Vtx[]): void {
  const g = new THREE.ShapeGeometry(
    new THREE.Shape(rounded(inset(verts, -0.012)).map((p) => new THREE.Vector2(-side * p.x, p.y))),
  );
  g.rotateY((side * Math.PI) / 2);
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.push().translate(side * (WS - 0.014), 0, 0);
  b.geometry(g, C.glass);
  b.pop();
}

/** A dark shut line laid on the body side through the points (z, y). */
function seam(b: VehicleBuilder, side: number, pts: [number, number][], r = 0.003): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, y0] = pts[i],
      [z1, y1] = pts[i + 1];
    b.rod(
      { x: side * (WS + 0.0008), y: y0, z: z0 },
      { x: side * (WS + 0.0008), y: y1, z: z1 },
      r,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );
  }
}

/** A box placed along a line from a to b, its depth facing `out` (a beam or a pillar). */
function beam(
  b: VehicleBuilder,
  a: THREE.Vector3,
  c: THREE.Vector3,
  w: number,
  d: number,
  out: THREE.Vector3,
  color: THREE.Color,
  slot: number,
  zone: number,
  radius = 0.015,
): void {
  const y = c.clone().sub(a);
  const len = y.length();
  y.normalize();
  const z = out
    .clone()
    .sub(y.clone().multiplyScalar(out.dot(y)))
    .normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a.clone().add(c).multiplyScalar(0.5));
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push(m);
  b.geometry(new RoundedBoxGeometry(w, len, d, 2, Math.min(radius, w / 2, d / 2)), color);
  b.pop();
}

/** NISSAN in chrome block capitals: strokes on a 10 × 10 grid, u along the word and v up. */
const STROKES: Record<string, string> = {
  N: '0 0 2.5 10, 7.5 0 10 10, 2 7 4.5 10, 4 4 6 7.5, 5.5 1 8 5',
  I: '0 0 2.5 10',
  S: '0 7.5 10 10, 0 5 2.5 7.5, 0 4 10 6.5, 7.5 2.5 10 4, 0 0 10 2.5',
  A: '0 0 2.5 7, 7.5 0 10 7, 1 7 9 10, 2.5 3 7.5 5.5',
  P: '0 0 2.5 10, 2 7.5 9 10, 7 4.5 10 8, 2 3.5 9 6',
  T: '0 7.5 10 10, 3.75 0 6.25 7.5',
  R: '0 0 2.5 10, 2 7.5 9 10, 7 5 10 8, 2 3.5 9 6, 6 0 9 3.5',
  O: '0 0 10 2.5, 0 7.5 10 10, 0 2 2.5 8, 7.5 2 10 8',
  L: '0 0 2.5 10, 2 0 10 2.5',
};
const strokes = (c: string) => STROKES[c].split(', ').map((box) => box.split(' ').map((n) => +n / 10));
const strokeWidth = (c: string) => Math.max(...strokes(c).map((box) => box[2]));

/** A word in stroke capitals of height h, centred on (x, y) facing forwards (facing -1) at z. */
function wordAcross(
  b: VehicleBuilder,
  word: string,
  x: number,
  y: number,
  z: number,
  h: number,
  facing: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  depth = 0.008,
): void {
  const gap = 0.3;
  const total = [...word].reduce((s, c) => s + strokeWidth(c), 0) + gap * (word.length - 1);
  // Reads left to right from where it faces: a reader in front has +x on their left and
  // reads towards -x; a reader behind reads towards +x.
  let u = -total / 2;
  for (const c of word) {
    for (const [a0, v0, a1, v1] of strokes(c)) {
      const cx = x + facing * (u + (a0 + a1) / 2) * h;
      b.block(
        cx,
        y + ((v0 + v1) / 2 - 0.5) * h,
        z,
        (a1 - a0) * h,
        (v1 - v0) * h,
        depth,
        color,
        slot as typeof b.slot,
        zone,
      );
    }
    u += strokeWidth(c) + gap;
  }
}

/**
 * A word in stroke capitals of height h laid along a body side, from z0 reading towards z1.
 * A reader on the right side has the front on their right, so reads towards -z; on the left
 * side towards +z.
 */
function wordAlong(
  b: VehicleBuilder,
  side: number,
  word: string,
  z0: number,
  z1: number,
  y: number,
  h: number,
  color: THREE.Color,
): void {
  const gap = 0.3;
  const total = [...word].reduce((s, c) => s + strokeWidth(c), 0) + gap * (word.length - 1);
  const unit = (z1 - z0) / total;
  let u = 0;
  for (const c of word) {
    for (const [a0, v0, a1, v1] of strokes(c)) {
      const za = z0 + (u + a0) * unit,
        zb = z0 + (u + a1) * unit;
      b.block(
        side * (WS + 0.0025),
        y + ((v0 + v1) / 2 - 0.5) * h,
        (za + zb) / 2,
        0.002,
        (v1 - v0) * h,
        Math.abs(zb - za),
        color,
        M.Paint,
        Z.Sides,
      );
    }
    u += strokeWidth(c) + gap;
  }
}

function frontClip(b: VehicleBuilder): void {
  // The guards and the bonnet as one flat-topped block round the engine bay, cut by the front
  // wheel openings, with the panel under the grille running down to the valance.
  extrudeX(
    b,
    // The outline's front edge starts at the bottom edge (LOW). Until v2.15 it started 2 cm lower,
    // so the outline ran down to -0.04 and back up the same line, and the bevel drew that zero-width
    // spike as a sliver under the guard's front corner.
    sideShape([
      [NOSE + 0.02, 0.1],
      [NOSE + 0.02, BELT - 0.06, 0.04],
      [NOSE + 0.08, BELT, 0.06],
      [FRONT_DOOR - 0.03, BELT],
      [FRONT_DOOR - 0.03, LOW],
      ...[...FRONT_OPENING].reverse(),
      [NOSE + 0.02, LOW],
    ]),
    -WS,
    WS,
    C.paint,
    M.Paint,
    Z.Front,
    0.03,
    [[-AXLE, -0.12]],
    3,
    0.8,
  );
  // The bonnet's shut lines along the guards and its back edge, and the two long pressings
  // down its middle.
  for (const side of [-1, 1])
    b.rod(
      { x: side * 0.71, y: BELT + 0.0015, z: NOSE + 0.1 },
      { x: side * 0.71, y: BELT + 0.0015, z: -0.7 },
      0.0028,
      C.rubber,
      M.Rubber,
      Z.Front,
    );
  b.rod(
    { x: -0.71, y: BELT + 0.0015, z: -0.7 },
    { x: 0.71, y: BELT + 0.0015, z: -0.7 },
    0.0028,
    C.rubber,
    M.Rubber,
    Z.Front,
  );
  for (const x of [-0.19, 0.19])
    b.block(x, BELT + 0.004, -1.26, 0.09, 0.008, 1.0, C.paint, M.Paint, Z.Front, 0.004);
  // Cowl between the bonnet and the screen, with its ventilation slots.
  b.block(0, BELT + 0.015, -0.66, 1.6, 0.04, 0.06, C.paint, M.Paint, Z.Front, 0.012);
  for (let i = 0; i < 18; i++)
    b.block(-0.51 + i * 0.06, BELT + 0.036, -0.66, 0.035, 0.004, 0.03, C.grille, M.Rubber, Z.Front);

  // The black grille panel across the nose, holding the round lamps at its ends, the
  // horizontal bars and the NISSAN badge; the painted valance with its slots and the
  // indicators below it.
  b.block(0, 0.335, NOSE + 0.02, 1.58, 0.4, 0.04, C.grille, M.Rubber, Z.Front, 0.01);
  b.block(0, 0.335, NOSE + 0.045, 0.78, 0.3, 0.02, C.well, M.Rubber, Z.Front);
  for (let i = 0; i < 7; i++)
    b.block(0, 0.2 + i * 0.045, NOSE + 0.006, 0.78, 0.014, 0.03, C.grille, M.Rubber, Z.Front, 0.004);
  for (const x of [-0.27, 0.27])
    b.block(x, 0.335, NOSE + 0.008, 0.012, 0.3, 0.03, C.grille, M.Rubber, Z.Front);
  wordAcross(b, 'NISSAN', 0, 0.36, NOSE - 0.006, 0.062, -1, C.chrome, M.Metal, Z.Front);
  b.block(0, 0.36, NOSE - 0.001, 0.47, 0.085, 0.004, C.grille, M.Rubber, Z.Front, 0.004);
  for (const side of [-1, 1]) {
    roundHeadlamp(b, side * 0.6, 0.35, NOSE + 0.006, 0.089, C.lamp, C.chrome, C.rubber);
    // Indicators low in the valance, amber with a clear park lamp inboard.
    b.block(side * 0.63, 0.04, NOSE + 0.012, 0.15, 0.07, 0.02, C.rubber, M.Rubber, Z.Front, 0.005);
    b.block(side * 0.66, 0.04, NOSE - 0.002, 0.08, 0.055, 0.01, C.amber, M.Amber, Z.Front, 0.004);
    b.block(side * 0.585, 0.04, NOSE - 0.002, 0.05, 0.055, 0.01, C.lamp, M.Headlamp, Z.Front, 0.004);
    // Side repeater on the guard, and the LAND... no: the PATROL badge sits on the door.
    b.block(side * (WS + 0.004), 0.46, -1.62, 0.01, 0.03, 0.08, C.amber, M.Amber, Z.Front, 0.004);
  }
  for (const x of [-0.3, 0, 0.3])
    b.block(x, 0.05, NOSE + 0.012, 0.22, 0.045, 0.02, C.well, M.Rubber, Z.Front, 0.004);
  // The factory steel bumper is gone: the bull bar's pan (mqGear.ts) sits in its place.
}

function windscreen(b: VehicleBuilder): void {
  // A flat screen, nearly upright, in a black rubber surround between the A-pillars, with
  // the wipers parked along its foot.
  const base = new THREE.Vector3(0, 0.645, -0.64),
    top = new THREE.Vector3(0, 1.235, -0.5);
  const v = top.clone().sub(base);
  const height = v.length();
  v.normalize();
  const u = new THREE.Vector3(1, 0, 0),
    w = new THREE.Vector3().crossVectors(u, v);
  const m = new THREE.Matrix4().makeBasis(u, v, w).setPosition(base);
  const pane: Vtx[] = [
    [-0.74, 0, 0.03],
    [0.74, 0, 0.03],
    [0.72, height, 0.04],
    [-0.72, height, 0.04],
  ];
  b.push(m);
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.geometry(new THREE.ShapeGeometry(new THREE.Shape(rounded(pane))), C.glass);
  const surround = new THREE.Shape(rounded(inset(pane, -0.018)));
  surround.holes.push(new THREE.Path(rounded(inset(pane, 0.012))));
  extrudeZ(b, surround, -0.008, 0.008, C.rubber, M.Rubber, Z.Front, 0.003);
  for (const [x0, x1] of [
    [-0.62, -0.14],
    [-0.04, 0.44],
  ]) {
    b.rod({ x: x0, y: 0.05, z: -0.02 }, { x: x1, y: 0.06, z: -0.02 }, 0.006, C.rubber, M.Rubber, Z.Front);
    b.rod({ x: x0 + 0.03, y: 0.04, z: -0.028 }, { x: x1 - 0.06, y: 0.052, z: -0.028 }, 0.004, C.bar);
  }
  b.pop();
  for (const x of [-0.62, -0.04])
    b.block(x, 0.665, -0.63, 0.03, 0.03, 0.03, C.rubber, M.Rubber, Z.Front, 0.008);
  // A-pillars, flush with the sides, from the cowl up to the roof.
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(side * (WS - 0.034), A_LOW.y + 0.005, A_LOW.z + 0.03);
    const c = new THREE.Vector3(side * (WS - 0.034), A_TOP.y - 0.005, A_TOP.z + 0.03);
    beam(b, a, c, 0.068, 0.06, new THREE.Vector3(0, 0.23, -0.97), C.paint, M.Paint, Z.Front, 0.018);
  }
}

function sides(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    // The flat side below the belt, from the front door back round the rear wheel.
    skin(
      b,
      side,
      [[FRONT_DOOR, LOW], ...REAR_OPENING, [REAR, LOW], [REAR, BELT], [FRONT_DOOR, BELT]],
      [],
      Z.Sides,
    );
    // Above the belt the door frame and the hardtop's side, with the windows cut out.
    skin(
      b,
      side,
      [
        [A_LOW.z, A_LOW.y],
        [REAR, BELT],
        [REAR, ROOF_EDGE],
        [A_TOP.z, A_TOP.y],
      ],
      [DOOR_WINDOW, SIDE_WINDOW],
      Z.Sides,
    );
    for (const w of [DOOR_WINDOW, SIDE_WINDOW]) {
      sideGlass(b, side, w);
      skin(b, side, inset(w, -0.014), [w], Z.Sides, C.rubber, M.Rubber, 0.006, 0.002, WS + 0.0015);
    }
    // The door's quarter-vent divider and the hardtop window's sliding divider.
    b.rod(
      { x: side * (WS - 0.006), y: 0.66, z: -0.2 },
      { x: side * (WS - 0.006), y: 1.17, z: -0.2 },
      0.011,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );
    b.rod(
      { x: side * (WS - 0.006), y: 0.7, z: 1.26 },
      { x: side * (WS - 0.006), y: 1.17, z: 1.26 },
      0.009,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );
    // The hardtop's seam at the B-pillar: a raised strip where the top meets the body.
    b.block(
      side * (WS + 0.004),
      (BELT + ROOF_EDGE) / 2 + 0.02,
      TOP_FRONT,
      0.012,
      ROOF_EDGE - BELT - 0.02,
      0.05,
      C.paint,
      M.Paint,
      Z.Sides,
      0.004,
    );

    // Pressed lips round both wheel openings, standing proud of the side.
    for (const opening of [FRONT_OPENING, REAR_OPENING]) {
      const x0 = side > 0 ? WS - 0.02 : -HW,
        x1 = side > 0 ? HW : -WS + 0.02;
      extrudeX(
        b,
        sideShape([...lip(opening), ...[...opening].reverse()]),
        x0,
        x1,
        C.paint,
        M.Paint,
        opening === FRONT_OPENING ? Z.Front : Z.Sides,
        0.01,
        [],
        3,
        0.8,
        (g) => toCreasedNormals(g, Math.PI / 5),
      );
    }

    // Rubber sill seals under the door and hardtop glass, and the belt crease.
    b.rod(
      { x: side * (WS + 0.002), y: BELT + 0.0025, z: FRONT_DOOR + 0.01 },
      { x: side * (WS + 0.002), y: BELT + 0.0025, z: REAR - 0.02 },
      0.006,
      C.paint,
      M.Paint,
      Z.Sides,
    );
    for (const [z0, z1] of [
      [-0.54, 0.38],
      [0.57, 1.95],
    ])
      b.rod(
        { x: side * (WS + 0.002), y: BELT + 0.045, z: z0 },
        { x: side * (WS + 0.002), y: BELT + 0.045, z: z1 },
        0.007,
        C.rubber,
        M.Rubber,
        Z.Sides,
      );

    // Shut lines: the door all round, and the fuel flap on the left rear quarter.
    seam(b, side, [
      [FRONT_DOOR, LOW + 0.004],
      [FRONT_DOOR, BELT],
      [-0.6, BELT + 0.02],
      [A_TOP.z - 0.015, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [B_SHUT, LOW + 0.004],
      [B_SHUT, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [FRONT_DOOR, LOW + 0.004],
      [B_SHUT, LOW + 0.004],
    ]);
    if (side < 0)
      seam(b, side, [
        [1.78, 0.33],
        [1.95, 0.33],
        [1.95, 0.5],
        [1.78, 0.5],
        [1.78, 0.33],
      ]);

    // Chrome door handle in its dished recess, the lock below it, and the PATROL badge.
    b.block(side * (WS + 0.0005), 0.5, 0.3, 0.004, 0.045, 0.15, C.rubber, M.Rubber, Z.Sides, 0.002);
    b.block(side * (WS + 0.008), 0.504, 0.3, 0.014, 0.026, 0.13, C.chrome, M.Metal, Z.Sides, 0.007);
    b.ring(side * (WS + 0.002), 0.44, 0.33, 0.011, 0.003, C.chrome, M.Metal, 'y', Z.Sides);
    wordAlong(b, side, 'PATROL', side > 0 ? -0.22 : -0.5, side > 0 ? -0.5 : -0.22, 0.555, 0.03, C.chrome);

    // Door mirror on a stalk from the door's front edge.
    b.block(side * (WS + 0.008), 0.72, -0.5, 0.018, 0.05, 0.1, C.rubber, M.Rubber, Z.Sides, 0.008);
    stalk(
      b,
      [
        { x: side * (WS + 0.015), y: 0.73, z: -0.5 },
        { x: side * (WS + 0.08), y: 0.78, z: -0.46 },
        { x: side * (WS + 0.11), y: 0.82, z: -0.42 },
      ],
      0.009,
      C.rubber,
    );
    mirrorHead(b, side, { x: side * (WS + 0.135), y: 0.885, z: -0.4 }, 0.15, 0.2, 0.04, C.rubber);

    // Painted sills under the doors, between the arches; inner wheelhouses; mud flaps.
    b.block(side * 0.76, LOW - 0.035, 0.0, 0.06, 0.07, 1.28, C.paint, M.Paint, Z.Sides, 0.015);
    b.block(side * 0.4, 0.16, -AXLE, 0.02, 0.6, 0.94, C.well, M.Rubber, Z.Trim);
    extrudeX(
      b,
      sideShape([
        [0.69, 0.45],
        [1.67, 0.45],
        [1.67, LOW],
        // The inner wheelhouse has more bump clearance than the outer arch lip.
        ...[...REAR_OPENING]
          .reverse()
          .slice(0, -1)
          .map(([z, y, r]) => [z, y === ARCH_TOP ? 0.43 : y, r] as Vtx),
        [0.7, LOW],
      ]),
      side > 0 ? 0.5 : -0.78,
      side > 0 ? 0.78 : -0.5,
      C.trim,
      M.Paint,
      Z.Trim,
      0.01,
      [[AXLE, -0.12]],
    );
    for (const z of [-0.66, 1.7])
      b.block(side * 0.7, -0.13, z, 0.22, 0.3, 0.01, C.rubber, M.Rubber, Z.Trim, 0.004);
  }
}

/** Half-width of the rear door opening: the corner posts stay 80 mm wide. */
const DOOR_X = WS - RC - 0.08;

function rear(b: VehicleBuilder): void {
  // The flat rear face with its rounded corners and the rear door's window.
  const edge = WS - RC + 0.012;
  const face = new THREE.Shape(
    rounded([
      [-edge, LOW + 0.02, 0.03],
      [edge, LOW + 0.02, 0.03],
      [edge, ROOF_EDGE, 0.03],
      [-edge, ROOF_EDGE, 0.03],
    ]),
  );
  face.holes.push(new THREE.Path(rounded(REAR_WINDOW)));
  // A 20 mm bevel keeps the panel between TAIL - 0.05 and TAIL. At 30 mm the extrusion ran
  // 11 mm proud of TAIL, over the shut lines, and its caps lost the window hole: a painted
  // triangle across the right of the rear glass, seen from outside and from the cabin.
  extrudeZ(b, face, TAIL - 0.05, TAIL, C.paint, M.Paint, Z.Rear, 0.02);
  const g = new THREE.ShapeGeometry(new THREE.Shape(rounded(inset(REAR_WINDOW, -0.012))));
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.push().translate(0, 0, TAIL - 0.016);
  b.geometry(g, C.glass);
  b.pop();
  const seal = new THREE.Shape(rounded(inset(REAR_WINDOW, -0.014)));
  seal.holes.push(new THREE.Path(rounded(REAR_WINDOW)));
  extrudeZ(b, seal, TAIL - 0.004, TAIL + 0.0015, C.rubber, M.Rubber, Z.Rear, 0.001);
  // The door's shut line, hinged on the right.
  const lowY = 0.1,
    topY = ROOF_EDGE - 0.03;
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    b.rod(
      { x: x0, y: y0, z: TAIL + 0.0008 },
      { x: x1, y: y1, z: TAIL + 0.0008 },
      0.003,
      C.rubber,
      M.Rubber,
      Z.Rear,
    );
  line(-DOOR_X, lowY, DOOR_X, lowY);
  line(-DOOR_X, topY, DOOR_X, topY);
  line(-DOOR_X, lowY, -DOOR_X, topY);
  line(DOOR_X, lowY, DOOR_X, topY);
  for (const y of [0.3, 1.0]) {
    b.block(DOOR_X + 0.01, y, TAIL + 0.01, 0.03, 0.08, 0.02, C.paint, M.Paint, Z.Rear, 0.006);
    b.rod(
      { x: DOOR_X + 0.01, y: y - 0.04, z: TAIL + 0.022 },
      { x: DOOR_X + 0.01, y: y + 0.04, z: TAIL + 0.022 },
      0.009,
      C.steel,
    );
  }
  // Handle and lock on the left, clear of the spare, whose carrier swings off the bar before
  // the door opens; the NISSAN PATROL badge under
  // them, and the plate below that.
  b.block(-0.47, 0.66, TAIL + 0.012, 0.11, 0.03, 0.02, C.chrome, M.Metal, Z.Rear, 0.008);
  b.ring(-0.34, 0.66, TAIL + 0.003, 0.011, 0.003, C.chrome, M.Metal, 'z', Z.Rear);
  wordAcross(b, 'NISSAN', -0.48, 0.555, TAIL + 0.004, 0.026, 1, C.chrome, M.Metal, Z.Rear, 0.004);
  wordAcross(b, 'PATROL', -0.48, 0.505, TAIL + 0.004, 0.034, 1, C.chrome, M.Metal, Z.Rear, 0.004);
  // Upright tail lamps on the corners: amber, red, clear.
  for (const side of [-1, 1]) {
    const lx = side * 0.73;
    b.block(lx, 0.32, TAIL + 0.002, 0.11, 0.38, 0.012, C.rubber, M.Rubber, Z.Rear, 0.004);
    for (const [y0, y1, color, slot] of [
      [0.4, 0.5, C.amber, M.Amber],
      [0.24, 0.4, C.red, M.Red],
      [0.14, 0.24, C.lamp, M.Lamp],
    ] as const)
      b.block(lx, (y0 + y1) / 2, TAIL + 0.008, 0.1, y1 - y0 - 0.006, 0.01, color, slot, Z.Rear, 0.003);
  }
  // Number plate low on the left of the door.
  b.block(-0.47, 0.33, TAIL + 0.004, 0.372, 0.134, 0.008, new THREE.Color('#E8C935'), M.Paint, Z.Rear, 0.006);
  for (let i = 0; i < 6; i++)
    b.block(-0.61 + i * 0.056, 0.33, TAIL + 0.009, 0.03, 0.062, 0.004, C.rubber, M.Rubber, Z.Rear);
  // The steel rear bumper with its step tread, and the painted panel under the door.
  b.block(0, LOW + 0.015, TAIL - 0.02, 1.6, 0.07, 0.06, C.paint, M.Paint, Z.Rear, 0.012);
}

/** Plan outline (x, -z) with rounded corners, for the roof. */
function plan(front: number, back: number, w: number, rf: number, rr: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w + rf, -front);
  s.lineTo(w - rf, -front);
  s.quadraticCurveTo(w, -front, w, -front - rf);
  s.lineTo(w, -back + rr);
  s.absarc(w - rr, -back + rr, rr, 0, -Math.PI / 2, true);
  s.lineTo(-w + rr, -back);
  s.absarc(-w + rr, -back + rr, rr, -Math.PI / 2, -Math.PI, true);
  s.lineTo(-w, -front - rf);
  s.quadraticCurveTo(-w, -front, -w + rf, -front);
  return s;
}

/** A roof panel from `front` to `back`, its top at `top`, crowned a little down the middle. */
function roofPanel(
  b: VehicleBuilder,
  front: number,
  back: number,
  top: number,
  rf: number,
  rr: number,
  crown: number,
): void {
  const y0 = ROOF_EDGE - 0.01,
    bevel = 0.025;
  const w = WS + 0.004;
  const raw = new THREE.ExtrudeGeometry(plan(front, back, w, rf, rr), {
    depth: top - crown - y0 - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8,
    bevelSegments: 4,
    curveSegments: 8,
  });
  let g = toCreasedNormals(raw, Math.PI / 5);
  raw.dispose();
  g.rotateX(-Math.PI / 2);
  g = subdivideSurface(g, () => true, 1);
  const pos = g.getAttribute('position'),
    norm = g.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      t = THREE.MathUtils.clamp((pos.getY(i) + bevel) / (top - crown - y0), 0, 1);
    pos.setY(i, pos.getY(i) + t * crown * Math.max(0, 1 - (x / w) ** 2));
    n.set(
      norm.getX(i) + ((t * 2 * crown * x) / (w * w)) * norm.getY(i),
      norm.getY(i),
      norm.getZ(i),
    ).normalize();
    norm.setXYZ(i, n.x, n.y, n.z);
  }
  b.slot = M.Paint;
  b.tag = Z.Roof;
  b.push().translate(0, y0 + bevel, 0);
  b.geometry(g, C.paint);
  b.pop();
}

function roof(b: VehicleBuilder): void {
  // The cab roof over the screen and doors, and the hardtop's roof a little higher behind
  // the B-pillar, each with drip rails along its sides.
  roofPanel(b, A_TOP.z - 0.02, TOP_FRONT + 0.01, ROOF, 0.1, 0.02, 0.02);
  roofPanel(b, TOP_FRONT, TAIL + 0.004, TOP_ROOF, 0.03, RC + 0.006, 0.025);
  for (const side of [-1, 1]) {
    const x = side * (WS + 0.012);
    b.block(
      x,
      ROOF_EDGE + 0.004,
      (A_TOP.z + TOP_FRONT) / 2,
      0.016,
      0.024,
      TOP_FRONT - A_TOP.z,
      C.paint,
      M.Paint,
      Z.Roof,
      0.006,
    );
    b.block(
      x,
      ROOF_EDGE + 0.008,
      (TOP_FRONT + TAIL - RC - 0.03) / 2,
      0.016,
      0.03,
      TAIL - RC - 0.03 - TOP_FRONT,
      C.paint,
      M.Paint,
      Z.Roof,
      0.006,
    );
  }
  // The hardtop's front lip over the cab roof.
  b.block(0, ROOF + 0.008, TOP_FRONT + 0.02, 2 * WS - 0.02, 0.03, 0.05, C.paint, M.Paint, Z.Roof, 0.01);
}

// The white factory side stripe of the Australian MQ: a broad band low on the sides from the
// rear corner to the back of the front guard, with a pinstripe above it, broken round the
// rear wheel; the placement is mine, the band's height from the Spanish car's kit.
function stripes(b: VehicleBuilder): void {
  const band: Vtx = [0.4, 0.465],
    pin: Vtx = [0.485, 0.495];
  const pieces: [number, number][] = [
    [-1.6, -0.75],
    [-0.6, 0.42],
    [0.46, 0.66],
    [1.7, REAR - 0.03],
  ];
  for (const side of [-1, 1])
    for (const [z0, z1] of pieces)
      for (const [y0, y1] of [band, pin]) {
        // Cut into lengths of 15 cm or less so each follows the panel into a dent.
        const n = Math.max(1, Math.ceil((z1 - z0) / 0.15));
        for (let k = 0; k < n; k++) {
          const a = z0 + ((z1 - z0) * k) / n,
            c = z0 + ((z1 - z0) * (k + 1)) / n;
          b.block(
            side * (WS + 0.0015),
            (y0 + y1) / 2,
            (a + c) / 2,
            0.001,
            y1 - y0,
            c - a,
            C.stripe,
            M.Paint,
            Z.Sides,
          );
        }
      }
}

/** The MQ Patrol hardtop with its bull bar, gutter rack, spares and cabin. */
export function buildMqBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontClip(b);
  windscreen(b);
  sides(b);
  stripes(b);
  rear(b);
  roof(b);
  addMqInterior(b, tuning.engine.redlineRpm);
  addMqGear(b, tuning, wheel);
  // Split the bonnet's broad top so dents and dirt have points to work with.
  return cleanGeometry(
    subdivideSurface(b.build(), (c, n) => n.y > 0.9 && c.z < FRONT_DOOR && c.y > 0.5 && c.y < 0.65, 1),
  );
}
