import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeX, extrudeZ, inset, rounded, roundHeadlamp, sideShape, type Vtx } from './bodyShapes';
import { cleanGeometry, subdivideSurface } from './bodyRefinement';
import { mirrorHead, stalk } from './mirrors';
import { rangieColors as C } from './rangiePaint';
import { addRangieGear } from './rangieGear';
import { addRangieInterior } from './rangieInterior';
export { buildRangiePlank, buildRangieWheel } from './rangieGear';

// The early-1980s two-door Range Rover. Axes as in the game: x across, y up from the body
// origin 0.12 m above the parked hubs (the ground is 0.495 m below it on 205 R16 tyres), z
// backwards, so the nose is at -z. Heights and lengths below were read off the side and
// three-quarter photographs, scaled by the 2.54 m wheelbase and the 0.75 m tyre, and checked
// against the published 4,470 × 1,780 × 1,780 mm.
// Photographs and dimensions: reference/vehicles/range-rover-two-door/SOURCES.md.
export const AXLE = 1.27;
/** Face of the grille panel between the lamps; the bonnet lip stands 10 mm ahead of it. */
export const NOSE = -2.03;
/** The lower tailgate's face. */
export const TAIL = 2.27;
/** Half the 1.78 m width, over the wheel-arch lips. */
export const HW = 0.89;
/** Half-width of the sides between the waist crease and the sills. */
const WS = 0.86;
/** The waist crease: the bonnet's shut line along the wings, the tops of the lamps. */
export const WAIST = 0.515;
/** Top of the doors, where the glass starts. */
export const BELT = 0.775;
/** Top of the side glass, under the roof's black rails. */
export const ROOF_EDGE = 1.205;
/** Top of the roof down its middle (1.78 m off the ground). */
export const ROOF = 1.285;
const DOOR_LOW = 0.105;
const SILL = 0.045;
/** Where the sides start to tuck under towards the sills. */
const LC = 0.2;
export const FRONT_DOOR = -0.6;
/** Rear corners, nearly square in plan. */
const RC = 0.07;
/** Side skins run this far round into the rear corners so their ends stay hidden. */
const REAR = TAIL - RC + 0.012;
const TUCK = 0.12;

/** Half-width of a leaning band of the body side: a + b·y + c·z. */
type Lean = readonly [number, number, number];
const K_U = (0.85 - WS) / (BELT - WAIST);
const K_G = (0.8 - 0.85) / (ROOF_EDGE - BELT);
const LEAN_M: Lean = [WS, 0, 0];
const LEAN_U: Lean = [WS - K_U * WAIST, K_U, 0];
const LEAN_G: Lean = [0.85 - K_G * BELT, K_G, 0];
const LEAN_L: Lean = [WS - TUCK * LC, TUCK, 0];
const half = (l: Lean, y: number) => l[0] + l[1] * y;

/** Half-width of the body side at a height. */
export function wAt(y: number): number {
  if (y >= BELT) return half(LEAN_G, y);
  if (y >= WAIST) return half(LEAN_U, y);
  if (y >= LC) return WS;
  return half(LEAN_L, y);
}

// The wheel openings: flat-topped with round corners, their legs splaying out to the sills,
// and a pressed lip 30 mm proud round each.
const FRONT_OPENING: Vtx[] = [
  [-1.86, 0.09],
  [-1.63, 0.39, 0.14],
  [-0.94, 0.39, 0.14],
  [-0.71, 0.09],
];
const FRONT_FLARE: Vtx[] = [
  [-1.91, 0.09],
  [-1.66, 0.425, 0.16],
  [-0.91, 0.425, 0.16],
  [-0.66, 0.09],
];
const REAR_OPENING: Vtx[] = [
  [0.69, 0.09],
  [0.92, 0.39, 0.14],
  [1.61, 0.39, 0.14],
  [1.84, 0.09],
];
const REAR_FLARE: Vtx[] = [
  [0.64, 0.09],
  [0.89, 0.425, 0.16],
  [1.64, 0.425, 0.16],
  [1.89, 0.09],
];
/** Where a straight leg (from point i to j) of an arch outline crosses height y. */
const legAt = (chain: Vtx[], i: number, j: number, y: number) => {
  const [z0, y0] = chain[i],
    [z1, y1] = chain[j];
  return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0);
};
const FRONT_LC = legAt(FRONT_FLARE, 2, 3, LC);
const FRONT_LOW = legAt(FRONT_FLARE, 2, 3, DOOR_LOW);
const REAR_LC = legAt(REAR_FLARE, 0, 1, LC);
const REAR_LOW = legAt(REAR_FLARE, 0, 1, DOOR_LOW);
const REAR_RLC = legAt(REAR_FLARE, 2, 3, LC);
const REAR_RLOW = legAt(REAR_FLARE, 2, 3, DOOR_LOW);

// The two side windows (z, y): the long door glass up the raked A-pillar, and the fixed
// quarter glass behind the thin B-pillar, ending at the broad black D-pillar.
const A_LOW = { z: FRONT_DOOR, y: BELT };
const A_TOP = { z: -0.29, y: ROOF_EDGE };
const DOOR_WINDOW: Vtx[] = [
  [-0.555, BELT + 0.018, 0.012],
  [-0.255, ROOF_EDGE - 0.02, 0.03],
  [0.545, ROOF_EDGE - 0.02, 0.03],
  [0.545, BELT + 0.018, 0.012],
];
const QUARTER_WINDOW: Vtx[] = [
  [0.625, BELT + 0.018, 0.012],
  [0.625, ROOF_EDGE - 0.02, 0.03],
  [1.97, ROOF_EDGE - 0.02, 0.03],
  [1.97, BELT + 0.018, 0.012],
];
/** Shut line between the door and the quarter panel. */
const B_SHUT = 0.585;

/** Move each vertex across to a leaning band (side skins are extruded upright first). */
function lean(g: THREE.BufferGeometry, side: number, l: Lean, ref: number): THREE.BufferGeometry {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) + side * (half(l, p.getY(i)) - ref));
    const nx = n.getX(i);
    v.set(nx, n.getY(i) - side * l[1] * nx, n.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** A thin side skin in a side-view outline, its outer face on the leaning band `l`. */
function skin(
  b: VehicleBuilder,
  side: number,
  outline: Vtx[],
  holes: Vtx[][],
  l: Lean,
  zone: number,
  color = C.paint,
  slot: number = M.Paint,
  t = 0.035,
  bevel = 0.008,
): void {
  const ref = l[0] + l[1] * 0.6;
  extrudeX(
    b,
    sideShape(outline, holes),
    side > 0 ? ref - t : -ref,
    side > 0 ? ref : -ref + t,
    color,
    slot,
    zone,
    bevel,
    [],
    3,
    0.8,
    (g) => lean(g, side, l, ref),
  );
}

/** Side glass a little inside the skin, in an outline grown so its edge hides in the frame. */
function sideGlass(b: VehicleBuilder, side: number, verts: Vtx[], l: Lean): void {
  const g = new THREE.ShapeGeometry(
    new THREE.Shape(rounded(inset(verts, -0.012)).map((p) => new THREE.Vector2(-side * p.x, p.y))),
  );
  g.rotateY((side * Math.PI) / 2);
  lean(g, side, l, 0.014);
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.geometry(g, C.glass);
}

/**
 * A dark shut line laid on the body side through the points (z, y), split where the side
 * changes its lean so it never sinks into the panel or stands off it.
 */
function seam(b: VehicleBuilder, side: number, pts: [number, number][], r = 0.003): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [z0, y0] = pts[i],
      [z1, y1] = pts[i + 1];
    const cuts = [LC, WAIST, BELT]
      .filter((y) => (y - y0) * (y - y1) < 0)
      .map((y) => (y - y0) / (y1 - y0))
      .sort((a, c) => a - c);
    const ts = [0, ...cuts, 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const at = (t: number) => {
        const z = z0 + (z1 - z0) * t,
          y = y0 + (y1 - y0) * t;
        return { x: side * (wAt(y) + 0.0008), y, z };
      };
      b.rod(at(ts[k]), at(ts[k + 1]), r, C.rubber, M.Rubber, Z.Sides);
    }
  }
}

/** A rod along the body side (a crease or a rubber strip), standing proud by `proud`. */
function ridge(
  b: VehicleBuilder,
  side: number,
  z0: number,
  y0: number,
  z1: number,
  y1: number,
  r: number,
  color: THREE.Color,
  slot: number = M.Paint,
  proud = 0.004,
): void {
  b.rod(
    { x: side * (wAt(y0 + 0.001) - r + proud), y: y0, z: z0 },
    { x: side * (wAt(y1 + 0.001) - r + proud), y: y1, z: z1 },
    r,
    color,
    slot as typeof b.slot,
    Z.Sides,
  );
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

/** The bonnet's flat top along the middle, from the lip over the grille back to the scuttle. */
const SCUTTLE = -0.66;
const BONNET: [number, number][] = [
  [NOSE + 0.025, 0.548],
  [-1.5, 0.56],
  [-1.0, 0.578],
  [SCUTTLE, 0.6],
];
function bonnetAt(z: number): number {
  for (let i = 0; i + 1 < BONNET.length; i++) {
    const [z0, y0] = BONNET[i],
      [z1, y1] = BONNET[i + 1];
    if (z <= z1) return y0 + ((y1 - y0) * (Math.max(z, z0) - z0)) / (z1 - z0);
  }
  return BONNET[BONNET.length - 1][1];
}
/** The castellated rails along both edges of the bonnet. */
const RAIL_IN = 0.79;
const RAIL_OUT = 0.853;
const RAIL_UP = 0.034;

function frontClip(b: VehicleBuilder): void {
  // Below the waist crease: the front wings and the panel under the grille, one upright block
  // round the engine, cut through by the front wheel openings and tucked under at the sills.
  extrudeX(
    b,
    sideShape([
      [NOSE + 0.035, 0.14],
      [NOSE + 0.035, WAIST],
      [FRONT_DOOR, WAIST],
      [FRONT_DOOR, DOOR_LOW],
      [FRONT_OPENING[3][0], DOOR_LOW],
      FRONT_OPENING[2],
      FRONT_OPENING[1],
      [FRONT_OPENING[0][0], DOOR_LOW],
      [NOSE + 0.1, DOOR_LOW],
    ]),
    -WS,
    WS,
    C.paint,
    M.Paint,
    Z.Front,
    0.03,
    [[-AXLE, -0.12]],
    3,
    1,
    (g) => {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const x = p.getX(i) - WS + 0.03;
        p.setX(i, x - Math.sign(x) * TUCK * Math.max(0, LC - y) + WS - 0.03);
      }
      return toCreasedNormals(g, Math.PI / 5);
    },
  );
  // The clamshell bonnet above the crease: a shallow slab from its lip over the grille back to
  // the scuttle, with the wing tops as its sides.
  const bevel = 0.025;
  extrudeX(
    b,
    sideShape([
      [NOSE - 0.01, WAIST - 0.004],
      [NOSE - 0.01, 0.53, 0.006],
      [NOSE + 0.01, 0.546, 0.02],
      ...BONNET.slice(1, -1).map(([z, y]): Vtx => [z, y, 0.1]),
      [SCUTTLE, 0.6],
      [SCUTTLE, WAIST - 0.004],
    ]),
    -WS + 0.002,
    WS - 0.002,
    C.paint,
    M.Paint,
    Z.Front,
    bevel,
    [],
    3,
    0.6,
    (g) => {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const s = half(LEAN_U, Math.max(WAIST, p.getY(i))) / WS;
        p.setX(i, (p.getX(i) - WS + 0.002 + bevel) * s + WS - 0.002 - bevel);
      }
      return toCreasedNormals(g, Math.PI / 5);
    },
  );
  // The castellations: a raised rail along each edge of the bonnet.
  for (const side of [-1, 1]) {
    const top: Vtx[] = [];
    for (let z = NOSE + 0.03; z < SCUTTLE - 0.02; z += 0.25) top.push([z, bonnetAt(z) + RAIL_UP, 0.012]);
    top.push([SCUTTLE - 0.02, bonnetAt(SCUTTLE) + RAIL_UP, 0.012]);
    extrudeX(
      b,
      sideShape([
        ...top,
        [SCUTTLE - 0.02, bonnetAt(SCUTTLE) - 0.015],
        [NOSE + 0.03, bonnetAt(NOSE + 0.03) - 0.015],
      ]),
      side > 0 ? RAIL_IN : -RAIL_OUT,
      side > 0 ? RAIL_OUT : -RAIL_IN,
      C.paint,
      M.Paint,
      Z.Front,
      0.012,
      [],
      3,
      0.8,
    );
  }
  // The bonnet's shut line along the waist crease on each wing, and across the scuttle.
  for (const side of [-1, 1]) {
    b.rod(
      { x: side * (WS + 0.0008), y: WAIST, z: NOSE + 0.03 },
      { x: side * (WS + 0.0008), y: WAIST, z: FRONT_DOOR - 0.004 },
      0.003,
      C.rubber,
      M.Rubber,
      Z.Front,
    );
  }
  b.rod(
    { x: -0.78, y: bonnetAt(SCUTTLE) + 0.0015, z: SCUTTLE },
    { x: 0.78, y: bonnetAt(SCUTTLE) + 0.0015, z: SCUTTLE },
    0.0028,
    C.rubber,
    M.Rubber,
    Z.Front,
  );
  // Scuttle panel between the bonnet and the screen, with the fresh-air grille and the
  // bonnet's own intake grille to the right of centre.
  b.block(0, 0.612, -0.655, 1.66, 0.035, 0.05, C.paint, M.Paint, Z.Front, 0.01);
  b.block(0.1, 0.626, -0.655, 0.9, 0.006, 0.03, C.grille, M.Rubber, Z.Front);
  for (let i = 0; i < 18; i++)
    b.block(-0.33 + i * 0.05, 0.629, -0.655, 0.006, 0.004, 0.03, C.paint, M.Paint, Z.Front);
  b.block(0.28, bonnetAt(-0.95) + 0.012, -0.95, 0.42, 0.02, 0.1, C.paint, M.Paint, Z.Front, 0.008);
  b.block(0.28, bonnetAt(-0.95) + 0.023, -0.92, 0.34, 0.004, 0.04, C.grille, M.Rubber, Z.Front);

  // The black grille panel across the nose, holding the lamps, indicators and the slats.
  b.block(0, 0.31, NOSE + 0.02, 1.6, 0.34, 0.04, C.pillar, M.Rubber, Z.Front, 0.006);
  // Vertical slats between the lamps, in front of a dark recess.
  b.block(0, 0.315, NOSE + 0.006, 0.84, 0.3, 0.012, C.well, M.Rubber, Z.Front);
  for (let i = 0; i < 15; i++)
    b.block(-0.385 + i * 0.055, 0.315, NOSE - 0.008, 0.022, 0.3, 0.018, C.grille, M.Rubber, Z.Front, 0.004);
  for (const side of [-1, 1]) {
    const x = side * 0.56;
    // The round 7-inch lamps in their black square surrounds.
    b.block(x, 0.335, NOSE - 0.004, 0.26, 0.27, 0.01, C.pillar, M.Rubber, Z.Front, 0.006);
    roundHeadlamp(b, x, 0.335, NOSE + 0.004, 0.092, C.lamp, C.pillar, C.rubber);
    // Amber indicator over a clear park lamp outboard of each lamp.
    const ix = side * 0.725;
    b.block(ix, 0.355, NOSE - 0.01, 0.15, 0.22, 0.012, C.rubber, M.Rubber, Z.Front, 0.004);
    b.block(ix, 0.405, NOSE - 0.016, 0.138, 0.11, 0.012, C.amber, M.Amber, Z.Front, 0.004);
    b.block(ix, 0.29, NOSE - 0.016, 0.138, 0.08, 0.012, C.lamp, M.Headlamp, Z.Front, 0.004);
  }
  // The valance under the grille panel, and the black bumper blade with its wrapped ends.
  b.block(0, 0.12, NOSE + 0.03, 1.66, 0.06, 0.06, C.paint, M.Paint, Z.Front, 0.012);
  b.block(0, 0.08, NOSE - 0.06, 1.74, 0.1, 0.07, C.pillar, M.Rubber, Z.Front, 0.012);
  for (const side of [-1, 1])
    b.block(side * 0.865, 0.08, NOSE + 0.04, 0.05, 0.1, 0.22, C.pillar, M.Rubber, Z.Front, 0.012);
  // RANGE ROVER spaced across the bonnet's front face.
  lettering(
    b,
    'RANGE ROVER',
    0.022,
    0.42,
    (u, v, w, h) => b.block(u, 0.512 + v, NOSE - 0.013, w, h, 0.004, C.argent, M.Metal, Z.Front),
    true,
  );
}

/**
 * Stroke letters: boxes on a 10 × 10 grid as "u0 v0 u1 v1", with u along the reading direction
 * and v up. A letter is as wide as its widest box.
 */
const STROKES: Record<string, string> = {
  R: '0 0 2 10, 2 8 10 10, 8 5 10 8, 2 4 10 6, 7 0 9 4',
  A: '0 0 2 8, 8 0 10 8, 0 8 10 10, 2 4 8 6',
  N: '0 0 2 10, 8 0 10 10, 2 8 8 10',
  G: '0 0 10 2, 0 8 10 10, 0 2 2 8, 8 0 10 5, 5 4 10 6',
  E: '0 0 2 10, 2 8 10 10, 2 4 8 6, 2 0 10 2',
  O: '0 0 10 2, 0 8 10 10, 0 2 2 8, 8 2 10 8',
  V: '0 3 2 10, 8 3 10 10, 2 1 4 4, 6 1 8 4, 4 0 6 2',
};
const strokes = (c: string) => STROKES[c].split(', ').map((box) => box.split(' ').map((n) => +n / 10));
const strokeWidth = (c: string) => Math.max(...strokes(c).map((box) => box[2]));

/**
 * Spaced capitals of height h centred on u = 0, reading from -x to +x as seen from ahead of a
 * face seen from behind; from ahead the car's +x is the reader's left, so pass `mirror`. `draw` places each stroke
 * box by its centre (u, v) and size.
 */
function lettering(
  b: VehicleBuilder,
  words: string,
  h: number,
  gap: number,
  draw: (u: number, v: number, w: number, hh: number) => void,
  mirror = false,
): void {
  const space = 1.0;
  let length = 0;
  for (const [i, c] of [...words].entries())
    length += (c === ' ' ? space : strokeWidth(c)) + (i > 0 && c !== ' ' && words[i - 1] !== ' ' ? gap : 0);
  const unit = h;
  let u = -(length * unit) / 2;
  for (const [i, c] of [...words].entries()) {
    if (c === ' ') {
      u += space * unit;
      continue;
    }
    if (i > 0 && words[i - 1] !== ' ') u += gap * unit;
    for (const [a0, v0, a1, v1] of strokes(c)) {
      const uc = u + ((a0 + a1) / 2) * unit;
      draw((mirror ? -1 : 1) * uc, ((v0 + v1) / 2) * h, (a1 - a0) * unit, (v1 - v0) * h);
    }
    u += strokeWidth(c) * unit;
  }
  void b;
}

function windscreen(b: VehicleBuilder): void {
  // A flat screen leaning back about 30 degrees in a black rubber surround, between black
  // A-pillars, with the wipers parked along its foot.
  const base = new THREE.Vector3(0, 0.625, -0.645),
    top = new THREE.Vector3(0, 1.2, -0.305);
  const v = top.clone().sub(base);
  const height = v.length();
  v.normalize();
  const u = new THREE.Vector3(1, 0, 0),
    w = new THREE.Vector3().crossVectors(u, v);
  const m = new THREE.Matrix4().makeBasis(u, v, w).setPosition(base);
  const pane: Vtx[] = [
    [-0.79, 0, 0.03],
    [0.79, 0, 0.03],
    [-0.76 + 1.52, height, 0.04],
    [-0.76, height, 0.04],
  ];
  b.push(m);
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.geometry(new THREE.ShapeGeometry(new THREE.Shape(rounded(pane))), C.glass);
  const surround = new THREE.Shape(rounded(inset(pane, -0.02)));
  surround.holes.push(new THREE.Path(rounded(inset(pane, 0.012))));
  extrudeZ(b, surround, -0.008, 0.008, C.rubber, M.Rubber, Z.Front, 0.003);
  for (const [x0, x1] of [
    [-0.7, -0.2],
    [-0.1, 0.4],
  ]) {
    b.rod({ x: x0, y: 0.05, z: -0.02 }, { x: x1, y: 0.06, z: -0.02 }, 0.006, C.rubber, M.Rubber, Z.Front);
    b.rod({ x: x0 + 0.03, y: 0.04, z: -0.028 }, { x: x1 - 0.06, y: 0.052, z: -0.028 }, 0.004, C.bar);
  }
  b.pop();
  for (const x of [-0.7, -0.1]) b.block(x, 0.64, -0.63, 0.03, 0.03, 0.03, C.rubber, M.Rubber, Z.Front, 0.008);
  // Black A-pillars, flush with the glasshouse, from the scuttle up to the roof.
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(side * (wAt(A_LOW.y + 0.01) - 0.03), A_LOW.y + 0.005, A_LOW.z + 0.02);
    const c = new THREE.Vector3(side * (wAt(A_TOP.y - 0.01) - 0.03), A_TOP.y - 0.005, A_TOP.z + 0.02);
    beam(b, a, c, 0.062, 0.05, new THREE.Vector3(0, 0.5, -0.86), C.pillar, M.Rubber, Z.Front, 0.016);
  }
}

function sides(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    // The side between the waist crease and the tuck, cut round the rear wheel; the lower door
    // and quarter tucked in under it; the upper doors and quarter up to the belt; and the black
    // glasshouse leaning in to the roof.
    skin(
      b,
      side,
      [
        [FRONT_DOOR, LC],
        [REAR_LC, LC],
        ...REAR_FLARE.slice(1, 3),
        [REAR_RLC, LC],
        [REAR, LC],
        [REAR, WAIST],
        [FRONT_DOOR, WAIST],
      ],
      [],
      LEAN_M,
      Z.Sides,
    );
    skin(
      b,
      side,
      [
        [FRONT_LC, LC],
        [REAR_LC, LC],
        [REAR_LOW, DOOR_LOW],
        [FRONT_LOW, DOOR_LOW],
      ],
      [],
      LEAN_L,
      Z.Sides,
    );
    skin(
      b,
      side,
      [
        [REAR_RLC, LC],
        [REAR, LC],
        [REAR, DOOR_LOW],
        [REAR_RLOW, DOOR_LOW],
      ],
      [],
      LEAN_L,
      Z.Rear,
    );
    skin(
      b,
      side,
      [
        [FRONT_DOOR, WAIST],
        [REAR, WAIST],
        [REAR, BELT],
        [FRONT_DOOR, BELT],
      ],
      [],
      LEAN_U,
      Z.Sides,
    );
    skin(
      b,
      side,
      [
        [A_LOW.z, A_LOW.y],
        [REAR, BELT],
        [REAR, ROOF_EDGE],
        [A_TOP.z, A_TOP.y],
      ],
      [DOOR_WINDOW, QUARTER_WINDOW],
      LEAN_G,
      Z.Sides,
      C.pillar,
      M.Rubber,
    );
    for (const w of [DOOR_WINDOW, QUARTER_WINDOW]) {
      sideGlass(b, side, w, LEAN_G);
      skin(
        b,
        side,
        inset(w, -0.012),
        [w],
        [LEAN_G[0] + 0.0015, LEAN_G[1], LEAN_G[2]],
        Z.Sides,
        C.rubber,
        M.Rubber,
        0.006,
        0.002,
      );
    }
    // The door glass's divider, where its drop glass meets the fixed rear pane.
    b.rod(
      { x: side * (wAt(0.8) - 0.006), y: 0.8, z: 0.23 },
      { x: side * (wAt(1.18) - 0.006), y: 1.18, z: 0.23 },
      0.008,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );
    // The vent grille on the D-pillar.
    const vx = side * (wAt(0.98) + 0.001);
    b.block(vx, 0.98, 2.09, 0.008, 0.1, 0.08, C.grille, M.Rubber, Z.Rear, 0.004);
    for (let i = 0; i < 5; i++)
      b.block(vx + side * 0.004, 0.945 + i * 0.018, 2.09, 0.006, 0.005, 0.07, C.pillar, M.Rubber, Z.Rear);

    // Pressed lips round both wheel openings, a little proud of the side.
    for (const [outer, opening] of [
      [FRONT_FLARE, FRONT_OPENING],
      [REAR_FLARE, REAR_OPENING],
    ]) {
      const x0 = side > 0 ? WS - 0.03 : -HW,
        x1 = side > 0 ? HW : -WS + 0.03;
      extrudeX(
        b,
        sideShape([...outer, ...[...opening].reverse()]),
        x0,
        x1,
        C.paint,
        M.Paint,
        outer === FRONT_FLARE ? Z.Front : Z.Sides,
        0.012,
        [],
        3,
        0.8,
        (g) => {
          const p = g.getAttribute('position');
          for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) - side * TUCK * Math.max(0, LC - p.getY(i)));
          return toCreasedNormals(g, Math.PI / 5);
        },
      );
    }

    // The waist crease along the doors and quarter, stopping short of the shut lines, and the
    // black rubbing strip along the sill.
    for (const [z0, z1] of [
      [FRONT_DOOR + 0.004, B_SHUT - 0.004],
      [B_SHUT + 0.004, REAR - 0.012],
    ])
      ridge(b, side, z0, WAIST, z1, WAIST, 0.009, C.paint);
    ridge(
      b,
      side,
      FRONT_LOW + 0.04,
      DOOR_LOW + 0.03,
      REAR_LOW - 0.04,
      DOOR_LOW + 0.03,
      0.012,
      C.pillar,
      M.Rubber,
      0.006,
    );
    // Rubber seals under the glass.
    for (const [z0, z1] of [
      [-0.55, 0.54],
      [0.63, 1.96],
    ])
      ridge(b, side, z0, BELT + 0.006, z1, BELT + 0.006, 0.008, C.rubber, M.Rubber, 0.003);

    // Shut lines: the door, the quarter panel's front edge, and the fuel flap on the right.
    seam(b, side, [
      [FRONT_DOOR, DOOR_LOW + 0.004],
      [FRONT_DOOR, BELT - 0.004],
    ]);
    seam(b, side, [
      [B_SHUT, DOOR_LOW + 0.004],
      [B_SHUT, BELT - 0.004],
    ]);
    if (side > 0)
      seam(b, side, [
        [1.3, 0.56],
        [1.44, 0.56],
        [1.44, 0.7],
        [1.3, 0.7],
        [1.3, 0.56],
      ]);

    // The push-button door handle on its chrome plate just above the crease, and the lock.
    b.block(side * (WS + 0.004), 0.575, 0.44, 0.008, 0.04, 0.17, C.chrome, M.Metal, Z.Sides, 0.004);
    b.block(side * (WS + 0.012), 0.58, 0.49, 0.012, 0.02, 0.04, C.rubber, M.Rubber, Z.Sides, 0.004);
    b.ring(side * (WS + 0.002), 0.575, 0.28, 0.01, 0.003, C.chrome, M.Metal, 'y', Z.Sides);
    // The small RANGE ROVER badge on each front wing above the crease.
    b.block(side * (wAt(0.6) + 0.003), 0.6, -0.9, 0.006, 0.028, 0.15, C.argent, M.Metal, Z.Front, 0.003);
    // Vertical black trim strip on the quarter panel, behind the door.
    b.block(side * (WS + 0.004), 0.33, 0.66, 0.008, 0.3, 0.025, C.pillar, M.Rubber, Z.Sides, 0.004);

    // Door-mounted mirror on a short arm.
    const mx = wAt(0.72);
    b.block(side * (mx + 0.008), 0.72, -0.48, 0.018, 0.06, 0.08, C.rubber, M.Rubber, Z.Sides, 0.008);
    stalk(
      b,
      [
        { x: side * (mx + 0.015), y: 0.74, z: -0.47 },
        { x: side * (mx + 0.08), y: 0.78, z: -0.45 },
        { x: side * (mx + 0.11), y: 0.82, z: -0.43 },
      ],
      0.009,
      C.rubber,
    );
    mirrorHead(b, side, { x: side * (mx + 0.135), y: 0.87, z: -0.42 }, 0.14, 0.17, 0.04, C.rubber);

    // Painted sills under the doors, between the arches.
    b.block(
      side * 0.815,
      (SILL + DOOR_LOW + 0.01) / 2,
      (FRONT_LOW + REAR_LOW) / 2 + 0.03,
      0.04,
      DOOR_LOW + 0.01 - SILL,
      REAR_LOW - FRONT_LOW - 0.06,
      C.paint,
      M.Paint,
      Z.Sides,
      0.015,
    );
    // Inner wheelhouses, dark where they face the wheels. The rear one's top is 4 cm above the
    // flare's opening (it was 5 mm below it), so no light or tan trim shows through the top of
    // the opening.
    b.block(side * 0.42, 0.12, -AXLE, 0.02, 0.5, 1.0, C.well, M.Rubber, Z.Trim);
    // The rear wheelhouse's inner wall, 0.52 to 0.54 m out, clear of the coil spring and the tyre:
    // until v2.16 the rear opening went straight through the wheelhouse into the cabin, so the
    // rear seat and the floor showed tan through the top of the opening.
    b.block(side * 0.53, 0.28, AXLE, 0.02, 0.37, 1.15, C.well, M.Rubber, Z.Trim);
    extrudeX(
      b,
      // Its bottom ends at the flare's feet (0.09): at 0.03 and 0.05 they hung below the body as
      // dark wedges at each end of the opening (there before v2.16).
      sideShape([[0.7, 0.465], [1.84, 0.465], ...[...REAR_OPENING].reverse().slice(0, -1), [0.7, 0.09]]),
      side > 0 ? 0.52 : -0.83,
      side > 0 ? 0.83 : -0.52,
      C.well,
      M.Rubber,
      Z.Trim,
      0.01,
      [[AXLE, -0.12]],
    );
    // Mud flaps behind each wheel.
    for (const [z, top] of [
      [-0.74, 0.06],
      [1.86, 0.06],
    ])
      b.block(side * 0.74, top - 0.17, z, 0.22, 0.34, 0.01, C.rubber, M.Rubber, Z.Trim, 0.004);
  }
}

/** Part of an upright cylinder round a rear corner, leaning in with its band of the side. */
function rearCorner(
  b: VehicleBuilder,
  side: number,
  y0: number,
  y1: number,
  l: Lean,
  r: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  from = 0,
  to = 1,
  inside = false,
): void {
  const z = TAIL - RC;
  const w0 = half(l, y0),
    w1 = half(l, y1);
  const g = new THREE.CylinderGeometry(
    r,
    r,
    y1 - y0,
    12,
    1,
    true,
    side > 0 ? (from * Math.PI) / 2 : -(to * Math.PI) / 2,
    ((to - from) * Math.PI) / 2,
  );
  g.translate(0, (y1 - y0) / 2, 0);
  // An inside face: each triangle turned round, and its normal, so it faces into the body.
  let geometry: THREE.BufferGeometry = g;
  if (inside) {
    geometry = g.toNonIndexed();
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i += 3)
      for (const a of [p, n]) {
        const x = a.getX(i + 1),
          y = a.getY(i + 1),
          zz = a.getZ(i + 1);
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, x, y, zz);
      }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  const k = (w1 - w0) / (y1 - y0);
  const m = new THREE.Matrix4().set(1, side * k, 0, side * (w0 - RC), 0, 1, 0, y0, 0, 0, 1, z, 0, 0, 0, 1);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push(m);
  b.geometry(geometry, color);
  b.pop();
}

/** Half-width of the tailgate opening: the corner pillars with the lamps stay 150 mm wide. */
const GATE_X = 0.65;
/** Bottom of the lower tailgate; the black valance runs under it. */
const GATE_LOW = 0.17;

function rear(b: VehicleBuilder): void {
  // Rear corners, band by band, and the flat rear face: the lower tailgate between the lamp
  // pillars, and the upper tailgate's glass between the black D-pillars.
  const bands: [number, number, Lean, THREE.Color, number][] = [
    [DOOR_LOW, LC, LEAN_L, C.paint, M.Paint],
    [LC, WAIST, LEAN_M, C.paint, M.Paint],
    [WAIST, BELT, LEAN_U, C.paint, M.Paint],
    [BELT, ROOF_EDGE, LEAN_G, C.pillar, M.Rubber],
  ];
  for (const side of [-1, 1])
    for (const [y0, y1, l, color, slot] of bands) {
      rearCorner(b, side, y0, y1, l, RC, color, slot, Z.Rear);
      // The corner's inside face: the curved panel shows only from outside, so the sky showed
      // through each rear corner from inside (there before v2.16).
      const inner = y0 >= BELT ? C.pillar : C.trim;
      rearCorner(b, side, y0, y1, l, RC - 0.012, inner, M.Rubber, Z.Trim, 0, 1, true);
    }
  const edge = (y: number) => wAt(y + 0.0001) - RC + 0.012;
  const lower: Vtx[] = [
    [edge(DOOR_LOW), DOOR_LOW],
    [edge(WAIST), WAIST],
    [edge(BELT), BELT],
    [-edge(BELT), BELT],
    [-edge(WAIST), WAIST],
    [-edge(DOOR_LOW), DOOR_LOW],
  ];
  extrudeZ(b, new THREE.Shape(rounded(lower)), TAIL - 0.035, TAIL, C.paint, M.Paint, Z.Rear, 0.008);
  // The black upper band with the rear glass in it.
  const upper = new THREE.Shape(
    rounded([
      [edge(BELT), BELT],
      [edge(ROOF_EDGE), ROOF_EDGE],
      [-edge(ROOF_EDGE), ROOF_EDGE],
      [-edge(BELT), BELT],
    ]),
  );
  const glass: Vtx[] = [
    [-0.7, BELT + 0.03, 0.04],
    [0.7, BELT + 0.03, 0.04],
    [0.68, ROOF_EDGE - 0.025, 0.04],
    [-0.68, ROOF_EDGE - 0.025, 0.04],
  ];
  upper.holes.push(new THREE.Path(rounded(glass)));
  extrudeZ(b, upper, TAIL - 0.06, TAIL - 0.025, C.pillar, M.Rubber, Z.Rear, 0.006);
  {
    const g = new THREE.ShapeGeometry(new THREE.Shape(rounded(inset(glass, -0.012))));
    b.slot = M.Glass;
    b.tag = Z.Glass;
    b.push().translate(0, 0, TAIL - 0.04);
    b.geometry(g, C.glass);
    b.pop();
    const seal = new THREE.Shape(rounded(inset(glass, -0.014)));
    seal.holes.push(new THREE.Path(rounded(glass)));
    extrudeZ(b, seal, TAIL - 0.03, TAIL - 0.024, C.rubber, M.Rubber, Z.Rear, 0.001);
    // The upper tailgate's hinge rail under the roof, and its wiper.
    b.block(0, ROOF_EDGE - 0.006, TAIL - 0.02, 1.5, 0.02, 0.03, C.pillar, M.Rubber, Z.Rear, 0.006);
    b.rod(
      { x: -0.12, y: ROOF_EDGE - 0.05, z: TAIL - 0.02 },
      { x: 0.3, y: 0.86, z: TAIL - 0.02 },
      0.006,
      C.rubber,
      M.Rubber,
      Z.Rear,
    );
  }
  // Shut lines round the lower tailgate.
  const line = (x0: number, y0: number, x1: number, y1: number) =>
    b.rod(
      { x: x0, y: y0, z: TAIL + 0.0008 },
      { x: x1, y: y1, z: TAIL + 0.0008 },
      0.003,
      C.rubber,
      M.Rubber,
      Z.Rear,
    );
  for (const side of [-1, 1]) line(side * GATE_X, GATE_LOW, side * GATE_X, BELT - 0.004);
  line(-GATE_X, GATE_LOW, GATE_X, GATE_LOW);
  line(-GATE_X, BELT - 0.004, GATE_X, BELT - 0.004);
  // The black valance under the tailgate, and the bumper blade with its wrapped ends.
  b.block(
    0,
    (GATE_LOW + DOOR_LOW) / 2 + 0.002,
    TAIL + 0.004,
    2 * GATE_X + 0.2,
    GATE_LOW - DOOR_LOW,
    0.012,
    C.pillar,
    M.Rubber,
    Z.Rear,
  );
  b.block(0, 0.075, TAIL + 0.05, 1.74, 0.1, 0.07, C.pillar, M.Rubber, Z.Rear, 0.012);
  for (const side of [-1, 1])
    b.block(side * 0.865, 0.075, TAIL - 0.05, 0.05, 0.1, 0.22, C.pillar, M.Rubber, Z.Rear, 0.012);
  for (const side of [-1, 1]) {
    // Tall tail lamps on the corner pillars: amber over clear over red, in a black frame.
    const lx = side * (GATE_X + 0.085);
    b.block(lx, 0.4, TAIL + 0.002, 0.13, 0.46, 0.012, C.rubber, M.Rubber, Z.Rear, 0.004);
    for (const [y0, y1, color, slot] of [
      [0.5, 0.625, C.amber, M.Amber],
      [0.4, 0.5, C.lamp, M.Lamp],
      [0.175, 0.4, C.red, M.Red],
    ] as const)
      b.block(lx, (y0 + y1) / 2, TAIL + 0.008, 0.118, y1 - y0 - 0.006, 0.01, color, slot, Z.Rear, 0.003);
  }
  // RANGE ROVER across the tailgate, the plate under it, and the tailgate's catch handle.
  lettering(b, 'RANGE ROVER', 0.028, 0.42, (u, v, w, h) =>
    b.block(u, 0.665 + v, TAIL + 0.002, w, h, 0.004, C.argent, M.Metal, Z.Rear),
  );
  b.block(0, 0.44, TAIL + 0.004, 0.372, 0.134, 0.008, new THREE.Color('#E8C935'), M.Paint, Z.Rear, 0.006);
  for (let i = 0; i < 6; i++)
    b.block(-0.14 + i * 0.056, 0.44, TAIL + 0.009, 0.03, 0.062, 0.004, C.rubber, M.Rubber, Z.Rear);
  b.block(0, 0.58, TAIL + 0.008, 0.12, 0.03, 0.014, C.chrome, M.Metal, Z.Rear, 0.006);
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

function roof(b: VehicleBuilder): void {
  // The flat roof, crowned 40 mm down the middle, from over the screen to the lip over the
  // rear glass, sitting on the black glasshouse so it looks to float.
  const y0 = 1.2,
    y1 = ROOF - 0.04,
    bevel = 0.025;
  const w = wAt(ROOF_EDGE) + 0.012;
  const raw = new THREE.ExtrudeGeometry(plan(-0.33, TAIL + 0.01, w, 0.1, RC + 0.012), {
    depth: y1 - y0 - 2 * bevel,
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
      t = THREE.MathUtils.clamp((pos.getY(i) + bevel) / (y1 - y0), 0, 1);
    pos.setY(i, pos.getY(i) + t * 0.04 * Math.max(0, 1 - (x / w) ** 2));
    n.set(norm.getX(i) + ((t * 0.08 * x) / (w * w)) * norm.getY(i), norm.getY(i), norm.getZ(i)).normalize();
    norm.setXYZ(i, n.x, n.y, n.z);
  }
  b.slot = M.Paint;
  b.tag = Z.Roof;
  b.push().translate(0, y0 + bevel, 0);
  b.geometry(g, C.paint);
  b.pop();
  // Black rails along both sides of the roof, over the glasshouse.
  for (const side of [-1, 1]) {
    const x = side * (w + 0.004);
    b.block(
      x,
      1.212,
      (A_TOP.z + TAIL - RC) / 2,
      0.02,
      0.028,
      TAIL - RC - A_TOP.z,
      C.pillar,
      M.Rubber,
      Z.Roof,
      0.006,
    );
  }
}

/** The two-door Range Rover with its bull bar, gutter rack, second spare and cabin. */
export function buildRangieBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontClip(b);
  windscreen(b);
  sides(b);
  rear(b);
  roof(b);
  addRangieInterior(b, tuning.engine.redlineRpm);
  addRangieGear(b, tuning, wheel);
  // Split the bonnet's broad top so dents and dirt have points to work with.
  return cleanGeometry(
    subdivideSurface(b.build(), (c, n) => n.y > 0.9 && c.z < SCUTTLE && c.y > 0.5 && c.y < 0.62, 1),
  );
}
