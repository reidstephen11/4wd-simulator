import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeX, extrudeZ, inset, rounded, roundHeadlamp, sideShape, type Vtx } from './bodyShapes';
import { cleanGeometry, subdivideSurface } from './bodyRefinement';
import { mirrorHead, stalk } from './mirrors';
import { hj60Colors as C } from './hj60Paint';
import { addHj60Gear } from './hj60Gear';
import { addHj60Interior } from './hj60Interior';
export { buildHj60Plank, buildHj60Wheel } from './hj60Gear';

// The 1985–86 Australian HJ60 standard-roof wagon. Axes as in the game: x across, y up from
// the body origin 0.12 m above the parked hubs (the ground is 0.52 m below it), z backwards,
// so the nose is at -z. Every height and length below was measured off the side photograph
// side-left-j60-mod-roof-tent.jpg, scaled by the 2.73 m wheelbase with its 44 mm lift taken
// out, and checked against the front and rear photographs.
// Photographs and dimensions: reference/vehicles/landcruiser-60/SOURCES.md.
export const AXLE = 1.365;
const GRILLE_BAR = new THREE.Color('#44494B');
/** Face of the headlamp bezels and grille. */
export const NOSE = -2.02;
export const TAIL = 2.548;
/** Half the 1.80 m width, over the pressed wheel-arch flares. */
export const HW = 0.9;
/** Half-width of the sides between the shoulder and lower creases. */
const WS = 0.878;
/** Top of the doors, where the window glass starts. */
export const BELT = 0.764;
/** Top of the side glasshouse, under the drip rails. */
export const ROOF_EDGE = 1.245;
/** Top of the roof down its middle (1.83 m off the ground). */
export const ROOF = 1.312;
const DOOR_LOW = 0.044;
const SILL = -0.038;
const QUARTER_LOW = 0.116;
/** The lower crease along the doors, and higher up on the rear quarter. */
const LC = 0.235;
const LCQ = 0.293;
export const FRONT_DOOR = -0.597;
/** Rear corners, round in plan. */
const RC = 0.08;
/** Side skins run this far round into the rear corners so their ends stay hidden. */
const REAR = TAIL - RC + 0.012;
const TUCK = 0.105;
/** The shoulder crease through the door handles, rising a little towards the back. */
export const sh = (z: number) => 0.583 + 0.0075 * z;

/** Half-width of a leaning band of the body side: a + b·y + c·z. */
type Lean = readonly [number, number, number];
const K_U = (0.852 - WS) / (BELT - 0.583);
const K_G = (0.806 - 0.852) / (ROOF_EDGE - BELT);
const LEAN_M: Lean = [WS, 0, 0];
const LEAN_U: Lean = [WS - K_U * 0.583, K_U, -K_U * 0.0075];
const LEAN_G: Lean = [WS + K_U * (BELT - 0.583) - K_G * BELT, K_G, -K_U * 0.0075];
const LEAN_L: Lean = [WS - TUCK * LC, TUCK, 0];
const LEAN_LQ: Lean = [WS - TUCK * LCQ, TUCK, 0];
const half = (l: Lean, y: number, z: number) => l[0] + l[1] * y + l[2] * z;

/** Half-width of the body side at a height and a point along the car. */
export function wAt(y: number, z: number): number {
  if (y >= BELT) return half(LEAN_G, y, z);
  if (y >= sh(z)) return half(LEAN_U, y, z);
  const quarter = z > 1.75;
  if (y >= (quarter ? LCQ : LC)) return WS;
  return half(quarter ? LEAN_LQ : LEAN_L, y, z);
}

// The wheel openings: the pressed flare's outer edge and the opening inside it. Both arches
// sweep down to the sill in a long diagonal towards the doors.
const FRONT_FLARE: Vtx[] = [
  [-1.875, 0.15],
  [-1.78, 0.444, 0.07],
  [-1.45, 0.488, 0.2],
  [-1.141, 0.472, 0.1],
  [-0.734, 0.02],
];
const FRONT_OPENING: Vtx[] = [
  [-1.83, 0.12],
  [-1.725, 0.395, 0.06],
  [-1.45, 0.405, 0.2],
  [-1.175, 0.392, 0.08],
  [-0.83, 0.02],
];
const REAR_FLARE: Vtx[] = [
  [0.896, 0.02],
  [1.237, 0.466, 0.1],
  [1.47, 0.474, 0.2],
  [1.708, 0.461, 0.07],
  [1.986, 0.024],
];
const REAR_OPENING: Vtx[] = [
  [0.97, 0],
  [1.265, 0.379, 0.08],
  [1.47, 0.388, 0.2],
  [1.683, 0.379, 0.06],
  [1.918, 0.03],
];
/** Where a straight leg (from point i to j) of an arch outline crosses height y. */
const legAt = (chain: Vtx[], i: number, j: number, y: number) => {
  const [z0, y0] = chain[i],
    [z1, y1] = chain[j];
  return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0);
};
const FRONT_LC = legAt(FRONT_FLARE, 3, 4, LC);
const FRONT_LOW = legAt(FRONT_FLARE, 3, 4, DOOR_LOW);
const REAR_LC = legAt(REAR_FLARE, 0, 1, LC);
const REAR_LOW = legAt(REAR_FLARE, 0, 1, DOOR_LOW);
const REAR_LCQ = legAt(REAR_FLARE, 3, 4, LCQ);
const REAR_QLOW = legAt(REAR_FLARE, 3, 4, QUARTER_LOW);

// The three side windows (z, y), and the A-pillar's outer edge.
const FRONT_WINDOW: Vtx[] = [
  [-0.462, 0.782, 0.012],
  [-0.112, 1.208, 0.03],
  [0.385, 1.208, 0.04],
  [0.385, 0.782, 0.012],
];
const REAR_DOOR_WINDOW: Vtx[] = [
  [0.495, 0.782, 0.012],
  [0.495, 1.208, 0.04],
  [1.258, 1.208, 0.04],
  [1.258, 0.782, 0.012],
];
const QUARTER_WINDOW: Vtx[] = [
  [1.295, 0.8, 0.05],
  [1.295, 1.215, 0.06],
  [2.27, 1.215, 0.1],
  [2.27, 0.8, 0.06],
];
const A_LOW = { z: -0.585, y: BELT };
const A_TOP = { z: -0.17, y: ROOF_EDGE };
/** Shut lines between the doors, and the rear door's back edge. */
const B_SHUT = 0.44;
const REAR_SHUT = 1.319;

/** Move each vertex across to a leaning band (side skins are extruded upright first). */
function lean(g: THREE.BufferGeometry, side: number, l: Lean, ref: number): THREE.BufferGeometry {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) + side * (half(l, p.getY(i), p.getZ(i)) - ref));
    const nx = n.getX(i);
    v.set(nx, n.getY(i) - side * l[1] * nx, n.getZ(i) - side * l[2] * nx).normalize();
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
    const cuts = [LC, LCQ, sh((z0 + z1) / 2), BELT]
      .filter((y) => (y - y0) * (y - y1) < 0)
      .map((y) => (y - y0) / (y1 - y0))
      .sort((a, c) => a - c);
    const ts = [0, ...cuts, 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const at = (t: number) => {
        const z = z0 + (z1 - z0) * t,
          y = y0 + (y1 - y0) * t;
        return { x: side * (wAt(y, z) + 0.0008), y, z };
      };
      b.rod(at(ts[k]), at(ts[k + 1]), r, C.rubber, M.Rubber, Z.Sides);
    }
  }
}

/** A rod along the body side (a crease or a rubber seal), standing proud by `proud`. */
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
    { x: side * (wAt(y0 + 0.001, z0) - r + proud), y: y0, z: z0 },
    { x: side * (wAt(y1 + 0.001, z1) - r + proud), y: y1, z: z1 },
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

/** The bonnet's top line along the middle, from the rolled nose back to the cowl. */
const BONNET: [number, number][] = [
  [-1.85, 0.652],
  [-1.6, 0.695],
  [-1.292, 0.728],
  [-0.873, 0.768],
  [-0.62, 0.785],
  [FRONT_DOOR, 0.788],
];
function bonnetAt(z: number): number {
  for (let i = 0; i + 1 < BONNET.length; i++) {
    const [z0, y0] = BONNET[i],
      [z1, y1] = BONNET[i + 1];
    if (z <= z1) return y0 + ((y1 - y0) * (Math.max(z, z0) - z0)) / (z1 - z0);
  }
  return BONNET[BONNET.length - 1][1];
}

function frontClip(b: VehicleBuilder): void {
  // Below the shoulder crease: the front guards and the panel under the grille, as one upright
  // block round the engine, cut through by the front wheel openings.
  extrudeX(
    b,
    sideShape([
      [NOSE + 0.04, 0.16],
      [NOSE + 0.04, sh(NOSE + 0.04)],
      [FRONT_DOOR, sh(FRONT_DOOR)],
      [FRONT_DOOR, LC],
      [FRONT_LC, LC],
      ...FRONT_FLARE.slice(1, 4).reverse(),
      FRONT_FLARE[0],
    ]),
    -WS,
    WS,
    C.paint,
    M.Paint,
    Z.Front,
    0.02,
    [[-AXLE, -0.12]],
    3,
    1,
  );
  // Above it the guards lean in to their rounded tops, and the wide bonnet between them
  // slopes down to a rolled nose over the grille.
  const bevel = 0.03;
  extrudeX(
    b,
    sideShape([
      [NOSE + 0.03, sh(NOSE + 0.03)],
      [NOSE + 0.035, 0.585, 0.015],
      [NOSE + 0.075, 0.637, 0.05],
      ...BONNET.slice(0, -1).map(([z, y]): Vtx => [z, y, 0.08]),
      [FRONT_DOOR, 0.788],
      [FRONT_DOOR, sh(FRONT_DOOR)],
    ]),
    -WS,
    WS,
    C.paint,
    M.Paint,
    Z.Front,
    bevel,
    [],
    3,
    0.5,
    (g) => {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const s = half(LEAN_U, p.getY(i), p.getZ(i)) / WS;
        p.setX(i, (p.getX(i) - WS + bevel) * s + WS - bevel);
      }
      return toCreasedNormals(g, Math.PI / 5);
    },
  );
  // The bonnet's low raised middle, and its shut lines along the tops of the guards.
  const crown: Vtx[] = [];
  for (let z = -1.84; z <= -0.66; z += 0.2) crown.push([z, bonnetAt(z) + 0.011, 0.04]);
  crown.push([-0.64, bonnetAt(-0.64) + 0.011]);
  extrudeX(
    b,
    sideShape([...crown, [-0.64, bonnetAt(-0.64) - 0.02], [-1.84, bonnetAt(-1.84) - 0.02]]),
    -0.5,
    0.5,
    C.paint,
    M.Paint,
    Z.Front,
    0.012,
    [],
    3,
    0.8,
  );
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let z = -1.86; z <= FRONT_DOOR; z += 0.25) {
      const y = bonnetAt(z);
      pts.push(new THREE.Vector3((side * 0.8 * half(LEAN_U, y, z)) / WS, y + 0.0015, z));
    }
    for (let i = 0; i + 1 < pts.length; i++) b.rod(pts[i], pts[i + 1], 0.0028, C.rubber, M.Rubber, Z.Front);
  }
  // The bonnet's leading edge, rolled under above the grille.
  b.block(0, 0.545, NOSE + 0.045, 1.58, 0.06, 0.1, C.paint, M.Paint, Z.Front, 0.025);
  // Cowl in front of the screen, with its fresh-air grille.
  b.block(0, 0.778, -0.563, 1.62, 0.04, 0.07, C.paint, M.Paint, Z.Front, 0.012);
  b.block(0, 0.799, -0.56, 1.1, 0.006, 0.035, C.grille, M.Rubber, Z.Front);
  for (let i = 0; i < 22; i++)
    b.block(-0.52 + i * 0.0495, 0.802, -0.56, 0.006, 0.004, 0.035, C.paint, M.Paint, Z.Front);

  // The grille band: a dark panel across the nose holding the lamps and the grille.
  const band = new THREE.Shape(
    rounded([
      [-0.765, 0.255, 0.02],
      [0.765, 0.255, 0.02],
      [0.765, 0.515, 0.02],
      [-0.765, 0.515, 0.02],
    ]),
  );
  band.holes.push(
    new THREE.Path(
      rounded([
        [-0.478, 0.275, 0.012],
        [-0.478, 0.495, 0.012],
        [0.478, 0.495, 0.012],
        [0.478, 0.275, 0.012],
      ]),
    ),
  );
  extrudeZ(b, band, NOSE + 0.004, NOSE + 0.045, C.grille, M.Rubber, Z.Front, 0.006);
  // Square black surrounds round the round 7-inch sealed beams, edged with a thin chrome strip
  // (front-34-left-customwagon-1985.jpg; the Japanese Standard's are plain black). Until v2.14
  // the whole surround was chrome and read as a pale grey square.
  for (const side of [-1, 1]) {
    const x = side * 0.625;
    const square = (d: number): Vtx[] => [
      [x - 0.126 + d, 0.266 + d, 0.022],
      [x + 0.126 - d, 0.266 + d, 0.022],
      [x + 0.126 - d, 0.504 - d, 0.022],
      [x - 0.126 + d, 0.504 - d, 0.022],
    ];
    const bezel = new THREE.Shape(rounded(square(0)));
    const hole = new THREE.Path();
    hole.absarc(x, 0.385, 0.1, 0, Math.PI * 2, true);
    bezel.holes.push(hole);
    extrudeZ(b, bezel, NOSE - 0.006, NOSE + 0.006, C.rubber, M.Rubber, Z.Front, 0.004);
    const edge = new THREE.Shape(rounded(square(-0.004)));
    edge.holes.push(new THREE.Path(rounded(square(0.008)).reverse()));
    extrudeZ(b, edge, NOSE - 0.009, NOSE - 0.004, C.chrome, M.Metal, Z.Front, 0.002);
    roundHeadlamp(b, x, 0.385, NOSE + 0.016, 0.089, C.lamp, C.chrome, C.rubber);
    // Indicator wrapped round the corner: amber over a clear park lamp, in a black housing.
    const ix = side * 0.822;
    b.block(ix, 0.385, NOSE + 0.045, 0.118, 0.25, 0.1, C.rubber, M.Rubber, Z.Front, 0.012);
    b.block(ix, 0.427, NOSE - 0.006, 0.1, 0.152, 0.012, C.amber, M.Amber, Z.Front, 0.006);
    b.block(ix, 0.305, NOSE - 0.006, 0.1, 0.06, 0.012, C.lamp, M.Headlamp, Z.Front, 0.006);
    b.block(side * 0.882, 0.427, NOSE + 0.04, 0.012, 0.152, 0.07, C.amber, M.Amber, Z.Front, 0.005);
    b.block(side * 0.882, 0.305, NOSE + 0.04, 0.012, 0.06, 0.07, C.lamp, M.Headlamp, Z.Front, 0.005);
  }
  // Grille: horizontal bars in a dark recess, with the raised TOYOTA in the middle.
  b.block(0, 0.385, NOSE + 0.03, 0.96, 0.23, 0.01, C.well, M.Rubber, Z.Front);
  // The bars are dark grey, a shade lighter than the recess, so they show as on the photographs
  // (until v2.14 they were the recess's own black).
  for (let i = 0; i < 6; i++)
    b.block(0, 0.293 + i * 0.037, NOSE + 0.012, 0.95, 0.011, 0.03, GRILLE_BAR, M.Rubber, Z.Front, 0.004);
  toyota(b, 0, 0.385, NOSE - 0.01, 0.06, C.argent);
}

/** Block capitals T, O, Y and A, as outlines (x, y) on a cap height of 1. */
const LETTERS: Record<string, { w: number; outline: Vtx[]; hole?: Vtx[] }> = {
  T: {
    w: 0.78,
    outline: [
      [0, 1],
      [0.78, 1],
      [0.78, 0.8],
      [0.49, 0.8],
      [0.49, 0],
      [0.29, 0],
      [0.29, 0.8],
      [0, 0.8],
    ],
  },
  O: {
    w: 0.86,
    outline: [
      [0, 0, 0.3],
      [0.86, 0, 0.3],
      [0.86, 1, 0.3],
      [0, 1, 0.3],
    ],
    hole: [
      [0.2, 0.2, 0.14],
      [0.66, 0.2, 0.14],
      [0.66, 0.8, 0.14],
      [0.2, 0.8, 0.14],
    ],
  },
  Y: {
    w: 0.84,
    outline: [
      [0, 1],
      [0.23, 1],
      [0.42, 0.62],
      [0.61, 1],
      [0.84, 1],
      [0.52, 0.42],
      [0.52, 0],
      [0.32, 0],
      [0.32, 0.42],
    ],
  },
  A: {
    w: 0.9,
    outline: [
      [0, 0],
      [0.33, 1],
      [0.57, 1],
      [0.9, 0],
      [0.69, 0],
      [0.62, 0.22],
      [0.28, 0.22],
      [0.21, 0],
    ],
    hole: [
      [0.34, 0.39],
      [0.56, 0.39],
      [0.45, 0.74],
    ],
  },
};

/** TOYOTA in block capitals of height h, centred on (x, y), facing forwards at z. */
function toyota(b: VehicleBuilder, x: number, y: number, z: number, h: number, color: THREE.Color): void {
  const gap = 0.22;
  const word = 'TOYOTA';
  const total = [...word].reduce((s, c) => s + LETTERS[c].w, 0) + gap * (word.length - 1);
  // The driver's right is +x and the word reads left to right from in front, so lay it out
  // from +x towards -x.
  let u = total / 2;
  for (const c of word) {
    const letter = LETTERS[c];
    const map = (v: Vtx): Vtx => [x + (u - v[0]) * h, y - h / 2 + v[1] * h, (v[2] ?? 0) * h];
    const shape = new THREE.Shape(rounded(letter.outline.map(map)));
    if (letter.hole) shape.holes.push(new THREE.Path(rounded(letter.hole.map(map))));
    extrudeZ(b, shape, z, z + 0.012, color, M.Metal, Z.Front, 0.002);
    u -= letter.w + gap;
  }
}

function windscreen(b: VehicleBuilder): void {
  // A flat screen leaning back about 40 degrees in a black rubber surround, between the
  // A-pillars, with the wipers parked along its foot.
  const base = new THREE.Vector3(0, 0.79, -0.552),
    top = new THREE.Vector3(0, 1.232, -0.171);
  const v = top.clone().sub(base);
  const height = v.length();
  v.normalize();
  const u = new THREE.Vector3(1, 0, 0),
    w = new THREE.Vector3().crossVectors(u, v);
  const m = new THREE.Matrix4().makeBasis(u, v, w).setPosition(base);
  const pane: Vtx[] = [
    [-0.79, 0, 0.03],
    [0.79, 0, 0.03],
    [0.746, height, 0.05],
    [-0.746, height, 0.05],
  ];
  b.push(m);
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.geometry(new THREE.ShapeGeometry(new THREE.Shape(rounded(pane))), C.glass);
  const surround = new THREE.Shape(rounded(inset(pane, -0.018)));
  surround.holes.push(new THREE.Path(rounded(inset(pane, 0.012))));
  extrudeZ(b, surround, -0.008, 0.008, C.rubber, M.Rubber, Z.Front, 0.003);
  for (const [x0, x1] of [
    [-0.66, -0.16],
    [-0.08, 0.42],
  ]) {
    b.rod({ x: x0, y: 0.05, z: -0.02 }, { x: x1, y: 0.06, z: -0.02 }, 0.006, C.rubber, M.Rubber, Z.Front);
    b.rod({ x: x0 + 0.03, y: 0.04, z: -0.028 }, { x: x1 - 0.06, y: 0.052, z: -0.028 }, 0.004, C.bar);
  }
  b.pop();
  for (const x of [-0.66, -0.08])
    b.block(x, 0.81, -0.535, 0.03, 0.03, 0.03, C.rubber, M.Rubber, Z.Front, 0.008);
  // A-pillars, flush with the side glasshouse, from the cowl up to the roof.
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(
      side * (wAt(A_LOW.y + 0.01, A_LOW.z) - 0.032),
      A_LOW.y + 0.005,
      A_LOW.z + 0.024,
    );
    const c = new THREE.Vector3(
      side * (wAt(A_TOP.y - 0.01, A_TOP.z) - 0.032),
      A_TOP.y - 0.005,
      A_TOP.z + 0.024,
    );
    beam(b, a, c, 0.066, 0.05, new THREE.Vector3(0, 0.66, -0.75), C.paint, M.Paint, Z.Front, 0.018);
  }
}

function sides(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    // The side between the creases, cut round the rear wheel; the lower door and the lower
    // rear quarter tucked in under the lower crease; above the shoulder crease the upper
    // doors, and the glasshouse leaning in to the roof.
    skin(
      b,
      side,
      [
        [FRONT_DOOR, LC],
        [REAR_LC, LC],
        ...REAR_FLARE.slice(1, 4),
        [REAR_LCQ, LCQ],
        [REAR, LCQ],
        [REAR, sh(REAR)],
        [FRONT_DOOR, sh(FRONT_DOOR)],
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
        [REAR_LCQ, LCQ],
        [REAR, LCQ],
        [REAR, QUARTER_LOW],
        [REAR_QLOW, QUARTER_LOW],
      ],
      [],
      LEAN_LQ,
      Z.Rear,
    );
    skin(
      b,
      side,
      [
        [FRONT_DOOR, sh(FRONT_DOOR)],
        [REAR, sh(REAR)],
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
      [FRONT_WINDOW, REAR_DOOR_WINDOW, QUARTER_WINDOW],
      LEAN_G,
      Z.Sides,
    );
    for (const w of [FRONT_WINDOW, REAR_DOOR_WINDOW, QUARTER_WINDOW]) {
      sideGlass(b, side, w, LEAN_G);
      // Black rubber round each window.
      skin(
        b,
        side,
        inset(w, -0.014),
        [w],
        [LEAN_G[0] + 0.0015, LEAN_G[1], LEAN_G[2]],
        Z.Sides,
        C.rubber,
        M.Rubber,
        0.006,
        0.002,
      );
    }
    // The rear door's fixed vent pane behind its divider.
    b.rod(
      { x: side * (wAt(0.79, 0.963) - 0.006), y: 0.79, z: 0.963 },
      { x: side * (wAt(1.2, 0.963) - 0.006), y: 1.2, z: 0.963 },
      0.011,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );

    // Pressed flares round both wheel openings, standing proud of the side.
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

    // Crease lines: the sharp shoulder through the handles, and the lower crease. Each stops
    // short of the shut lines.
    const shoulder: [number, number][] = [
      [NOSE + 0.06, FRONT_DOOR - 0.004],
      [FRONT_DOOR + 0.004, B_SHUT - 0.004],
      [B_SHUT + 0.004, REAR_SHUT - 0.004],
      [REAR_SHUT + 0.004, REAR - 0.012],
    ];
    for (const [z0, z1] of shoulder) ridge(b, side, z0, sh(z0), z1, sh(z1), 0.009, C.paint);
    for (const [z0, z1] of [
      [FRONT_LC + 0.03, FRONT_DOOR - 0.004],
      [FRONT_DOOR + 0.004, B_SHUT - 0.004],
      [B_SHUT + 0.004, REAR_LC - 0.03],
    ])
      ridge(b, side, z0, LC + 0.001, z1, LC + 0.001, 0.006, C.paint, M.Paint, 0.003);
    ridge(b, side, REAR_LCQ + 0.03, LCQ + 0.001, REAR - 0.012, LCQ + 0.001, 0.006, C.paint, M.Paint, 0.003);
    // Rubber sill seals under the door glass.
    for (const [z0, z1] of [
      [-0.5, 0.39],
      [0.49, 1.27],
    ])
      ridge(b, side, z0, BELT + 0.006, z1, BELT + 0.006, 0.008, C.rubber, M.Rubber, 0.003);

    // Shut lines: the front door, the rear door (its lower back corner cut by the flare), the
    // bonnet's back edge along the cowl, and the fuel flap on the right.
    seam(b, side, [
      [FRONT_DOOR, DOOR_LOW + 0.004],
      [FRONT_DOOR, 0.728],
      [-0.52, BELT],
      [-0.16, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [B_SHUT, DOOR_LOW + 0.004],
      [B_SHUT, BELT],
      [0.415, 0.8],
      [0.415, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [0.465, BELT],
      [0.465, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [-0.12, ROOF_EDGE - 0.012],
      [1.282, ROOF_EDGE - 0.012],
    ]);
    seam(b, side, [
      [REAR_SHUT, 0.475],
      [REAR_SHUT, BELT],
      [1.282, 0.82],
      [1.282, ROOF_EDGE - 0.012],
    ]);
    if (side > 0)
      seam(b, side, [
        [1.45, 0.625],
        [1.58, 0.625],
        [1.58, 0.74],
        [1.45, 0.74],
        [1.45, 0.625],
      ]);

    // Door handles in their dished recesses, and the front door's lock.
    for (const [z, y] of [
      [0.217, 0.541],
      [1.161, 0.556],
    ]) {
      b.block(side * (WS + 0.0005), y, z, 0.004, 0.045, 0.15, C.rubber, M.Rubber, Z.Sides, 0.002);
      b.block(side * (WS + 0.008), y + 0.004, z, 0.014, 0.026, 0.13, C.chrome, M.Metal, Z.Sides, 0.007);
    }
    b.ring(side * (WS + 0.002), 0.488, 0.31, 0.011, 0.003, C.chrome, M.Metal, 'y', Z.Sides);
    // Amber marker on the front guard behind the flare.
    b.block(side * (WS + 0.004), 0.505, -1.05, 0.01, 0.026, 0.075, C.amber, M.Amber, Z.Front, 0.004);
    // Small louvred vent at the back of the front guard.
    const vx = side * (wAt(0.66, -0.68) + 0.001);
    b.block(vx, 0.66, -0.68, 0.006, 0.1, 0.035, C.grille, M.Rubber, Z.Front, 0.003);
    for (let i = 0; i < 4; i++)
      b.block(vx + side * 0.003, 0.625 + i * 0.023, -0.68, 0.006, 0.006, 0.035, C.paint, M.Paint, Z.Front);
    // Louvred vent behind the quarter window.
    const qx = side * wAt(0.91, 2.375);
    b.block(qx, 0.91, 2.375, 0.012, 0.115, 0.1, C.grille, M.Rubber, Z.Rear, 0.006);
    for (let i = 0; i < 5; i++)
      b.block(qx + side * 0.006, 0.87 + i * 0.02, 2.375, 0.008, 0.007, 0.085, C.rubber, M.Rubber, Z.Rear);
    // LAND CRUISER script on the rear quarter, and TOYOTA ahead of it.
    for (let i = 0; i < 11; i++) {
      const z = 2.13 + i * 0.022;
      b.rod(
        { x: side * (WS + 0.002), y: 0.548, z: z + 0.005 },
        { x: side * (WS + 0.002), y: 0.578, z: z - 0.004 },
        0.0028,
        C.chrome,
      );
    }
    b.block(side * (WS + 0.002), 0.556, 2.075, 0.004, 0.014, 0.07, C.chrome, M.Metal, Z.Rear, 0.002);

    // Door-mounted mirror on a cranked arm from a plate at the front of the door.
    const mx = wAt(0.69, -0.34);
    b.block(side * (mx + 0.008), 0.69, -0.34, 0.018, 0.055, 0.11, C.rubber, M.Rubber, Z.Sides, 0.008);
    stalk(
      b,
      [
        { x: side * (mx + 0.015), y: 0.7, z: -0.33 },
        { x: side * (mx + 0.07), y: 0.74, z: -0.3 },
        { x: side * (mx + 0.1), y: 0.78, z: -0.25 },
      ],
      0.009,
      C.rubber,
    );
    mirrorHead(b, side, { x: side * (mx + 0.125), y: 0.848, z: -0.23 }, 0.15, 0.18, 0.04, C.rubber);

    // Painted sills under the doors, between the arches.
    b.block(
      side * 0.835,
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
    // Inner wheelhouses, dark where they face the wheels.
    b.block(side * 0.4, 0.16, -AXLE, 0.02, 0.6, 1.0, C.well, M.Rubber, Z.Trim);
    extrudeX(
      b,
      sideShape([
        [0.94, 0.47],
        [1.95, 0.47],
        [1.95, 0.05],
        ...[...REAR_OPENING].reverse().slice(0, -1),
        [0.95, 0.02],
      ]),
      side > 0 ? 0.53 : -0.84,
      side > 0 ? 0.84 : -0.53,
      C.trim,
      M.Paint,
      Z.Trim,
      0.01,
      [[AXLE, -0.12]],
    );
    // Mud flaps behind each wheel.
    for (const [z, top] of [
      [-0.8, 0.05],
      [1.99, 0.06],
    ])
      b.block(side * 0.74, top - 0.18, z, 0.22, 0.36, 0.01, C.rubber, M.Rubber, Z.Trim, 0.004);
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
): void {
  const z = TAIL - RC;
  const w0 = half(l, y0, z),
    w1 = half(l, y1, z);
  const g = new THREE.CylinderGeometry(
    r,
    r,
    y1 - y0,
    18,
    1,
    true,
    side > 0 ? (from * Math.PI) / 2 : -(to * Math.PI) / 2,
    ((to - from) * Math.PI) / 2,
  );
  g.translate(0, (y1 - y0) / 2, 0);
  const k = (w1 - w0) / (y1 - y0);
  const m = new THREE.Matrix4().set(1, side * k, 0, side * (w0 - RC), 0, 1, 0, y0, 0, 0, 1, z, 0, 0, 0, 1);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push(m);
  b.geometry(g, color);
  b.pop();
}

/** Half-width of the barn-door opening at a height: the corner pillars stay 70 mm wide. */
const doorX = (y: number) => wAt(y, TAIL - RC) - RC - 0.07;
/** The barn doors split a little right of the middle: the left door is the wider. */
const SPLIT = 0.03;

function rear(b: VehicleBuilder): void {
  // Rear corners, band by band, and the flat rear face across the doors with their windows.
  const bands: [number, number, Lean][] = [
    [QUARTER_LOW, LCQ, LEAN_LQ],
    [LCQ, sh(TAIL - RC), LEAN_M],
    [sh(TAIL - RC), BELT, LEAN_U],
    [BELT, ROOF_EDGE, LEAN_G],
  ];
  for (const side of [-1, 1])
    for (const [y0, y1, l] of bands) rearCorner(b, side, y0, y1, l, RC, C.paint, M.Paint, Z.Rear);
  const ys = bands.map(([y0]) => y0).concat(ROOF_EDGE);
  const edge = (y: number) => wAt(y + 0.0001, TAIL - RC) - RC + 0.012;
  const outline: Vtx[] = [
    ...ys.map((y): Vtx => [edge(y), y]),
    ...[...ys].reverse().map((y): Vtx => [-edge(y), y]),
  ];
  const windows: Vtx[][] = [
    [
      [-0.63, 0.8, 0.06],
      [-0.06, 0.8, 0.06],
      [-0.06, 1.195, 0.06],
      [-0.63, 1.195, 0.06],
    ],
    [
      [0.11, 0.8, 0.06],
      [0.63, 0.8, 0.06],
      [0.63, 1.195, 0.06],
      [0.11, 1.195, 0.06],
    ],
  ];
  const face = new THREE.Shape(rounded(outline));
  for (const w of windows) face.holes.push(new THREE.Path(rounded(w)));
  extrudeZ(b, face, TAIL - 0.035, TAIL, C.paint, M.Paint, Z.Rear, 0.008);
  for (const w of windows) {
    const g = new THREE.ShapeGeometry(new THREE.Shape(rounded(inset(w, -0.012))));
    b.slot = M.Glass;
    b.tag = Z.Glass;
    b.push().translate(0, 0, TAIL - 0.016);
    b.geometry(g, C.glass);
    b.pop();
    const seal = new THREE.Shape(rounded(inset(w, -0.014)));
    seal.holes.push(new THREE.Path(rounded(w)));
    extrudeZ(b, seal, TAIL - 0.004, TAIL + 0.0015, C.rubber, M.Rubber, Z.Rear, 0.001);
  }
  // Barn-door shut lines: round each door and down the split.
  const lowY = QUARTER_LOW + 0.03,
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
  for (const side of [-1, 1]) {
    const pts = [lowY, LCQ, sh(TAIL - RC), BELT, topY];
    for (let i = 0; i + 1 < pts.length; i++)
      line(side * doorX(pts[i]), pts[i], side * doorX(pts[i + 1]), pts[i + 1]);
  }
  line(-doorX(lowY), lowY, doorX(lowY), lowY);
  line(-doorX(topY), topY, doorX(topY), topY);
  line(SPLIT, lowY, SPLIT, topY);
  for (const side of [-1, 1]) {
    // Exposed hinges on each door's outer edge.
    for (const y of [0.22, 0.98]) {
      const x = side * (doorX(y) + 0.008);
      b.block(x, y, TAIL + 0.01, 0.026, 0.075, 0.02, C.paint, M.Paint, Z.Rear, 0.006);
      b.rod({ x, y: y - 0.04, z: TAIL + 0.022 }, { x, y: y + 0.04, z: TAIL + 0.022 }, 0.009, C.steel);
    }
    // Upright tail lamps on the corners, wrapping round onto the sides: amber, clear, red.
    const lx = side * (doorX(0.45) + 0.047);
    b.block(lx, 0.4465, TAIL + 0.002, 0.072, 0.315, 0.012, C.rubber, M.Rubber, Z.Rear, 0.004);
    for (const [y0, y1, color, slot] of [
      [0.501, 0.598, C.amber, M.Amber],
      [0.447, 0.501, C.lamp, M.Lamp],
      [0.295, 0.447, C.red, M.Red],
    ] as const) {
      b.block(lx, (y0 + y1) / 2, TAIL + 0.008, 0.062, y1 - y0 - 0.006, 0.01, color, slot, Z.Rear, 0.003);
      rearCorner(b, side, y0 + 0.003, y1 - 0.003, LEAN_M, RC + 0.005, color, slot, Z.Rear, 0, 0.55);
    }
  }
  // Left door: the long pull handle over the number-plate recess. Right door: the handle and
  // lock by the split, and the TOYOTA and 4WD badges low on its outer corner.
  b.block(-0.33, 0.69, TAIL + 0.012, 0.21, 0.035, 0.022, C.chrome, M.Metal, Z.Rear, 0.01);
  b.block(
    -0.33,
    0.495,
    TAIL - 0.001,
    0.46,
    0.25,
    0.006,
    C.paint.clone().multiplyScalar(0.9),
    M.Paint,
    Z.Rear,
  );
  b.block(
    -0.33,
    0.495,
    TAIL + 0.004,
    0.372,
    0.134,
    0.008,
    new THREE.Color('#E8C935'),
    M.Paint,
    Z.Rear,
    0.006,
  );
  for (let i = 0; i < 6; i++)
    b.block(-0.47 + i * 0.055, 0.495, TAIL + 0.009, 0.03, 0.06, 0.004, C.rubber, M.Rubber, Z.Rear);
  b.block(0.1, 0.69, TAIL + 0.01, 0.1, 0.03, 0.018, C.chrome, M.Metal, Z.Rear, 0.008);
  b.ring(0.1, 0.62, TAIL + 0.003, 0.011, 0.003, C.chrome, M.Metal, 'z', Z.Rear);
  b.block(0.5, 0.62, TAIL + 0.004, 0.13, 0.03, 0.006, C.chrome, M.Metal, Z.Rear, 0.003);
  b.block(0.5, 0.56, TAIL + 0.004, 0.09, 0.05, 0.006, C.chrome, M.Metal, Z.Rear, 0.003);
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
  // The steel roof, crowned 28 mm down the middle, over the screen and the rear doors.
  const y0 = 1.236,
    y1 = ROOF - 0.028,
    bevel = 0.03;
  const w = wAt(ROOF_EDGE, 1) + 0.006;
  const raw = new THREE.ExtrudeGeometry(plan(-0.2, TAIL + 0.004, w, 0.14, RC + 0.006), {
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
    pos.setY(i, pos.getY(i) + t * 0.028 * Math.max(0, 1 - (x / w) ** 2));
    n.set(norm.getX(i) + ((t * 0.056 * x) / (w * w)) * norm.getY(i), norm.getY(i), norm.getZ(i)).normalize();
    norm.setXYZ(i, n.x, n.y, n.z);
  }
  b.slot = M.Paint;
  b.tag = Z.Roof;
  b.push().translate(0, y0 + bevel, 0);
  b.geometry(g, C.paint);
  b.pop();
  // Drip rails along both sides, turning down at the back.
  for (const side of [-1, 1]) {
    const x = side * (w + 0.008);
    b.block(
      x,
      1.248,
      (A_TOP.z + TAIL - RC - 0.03) / 2,
      0.016,
      0.026,
      TAIL - RC - 0.03 - A_TOP.z,
      C.paint,
      M.Paint,
      Z.Roof,
      0.006,
    );
    b.rod(
      { x, y: 1.248, z: A_TOP.z },
      { x: side * (w + 0.004), y: 1.17, z: A_TOP.z - 0.06 },
      0.008,
      C.paint,
      M.Paint,
      Z.Roof,
    );
  }
}

// The factory stripe kit of the mid-1980s 60s, measured off the red 1984 car in
// side-right-34-60-1984-mod.jpg. Along both sides a band under the handles, a pinstripe and a
// stripe at its top and bottom, from the rear corner to the front guard, broken round the rear
// wheel and closed at the back. Ahead of the B-pillar three slashes lean forward at the top,
// with TOYOTA LAND CRUISER between them, and a narrow slash and pinstripe close the front.
/** How far each slash moves back for every metre down. */
const SLANT = 0.75;
/** Heights of the pinstripes and stripes at the top and bottom of the band. */
const TOP_PIN: Vtx = [0.54, 0.552];
const TOP_STRIPE: Vtx = [0.497, 0.521];
const LOW_STRIPE: Vtx = [0.306, 0.322];
const LOW_PIN: Vtx = [0.292, 0.3];
/** The band's back end, and where its lower lines stop either side of the rear wheel. */
const STRIPE_END = 2.445;
const ARCH_GAP: Vtx = [0.99, 1.84];
/** Each slash's front and back edges, at the middle of the top stripe. */
const SLASHES = {
  rear: [-0.115, -0.032],
  dark: [-0.37, -0.252],
  front: [-0.569, -0.487],
  end: [-0.815, -0.798],
  endPin: [-0.85, -0.836],
} as const;
const STRIPE_COLOURS = {
  pin: new THREE.Color('#3F2A1D'),
  stripe: new THREE.Color('#CF732C'),
  text: new THREE.Color('#EFE9DA'),
};

/** The z of a slash's edge at height y. */
const slashAt = (edge: number) => (y: number) => edge + SLANT * (TOP_STRIPE[0] + 0.012 - y);

/**
 * Stroke letters for the side lettering: boxes on a 10 × 10 grid as "u0 v0 u1 v1", with u
 * along the reading direction and v up. A letter is as wide as its widest box.
 */
const STROKES: Record<string, string> = {
  T: '0 8 10 10, 4 0 6 8',
  O: '0 0 10 2, 0 8 10 10, 0 2 2 8, 8 2 10 8',
  Y: '0 5 2 10, 8 5 10 10, 0 4 10 6, 4 0 6 4',
  A: '0 0 2 8, 8 0 10 8, 0 8 10 10, 2 4 8 6',
  L: '0 0 2 10, 2 0 10 2',
  N: '0 0 2 10, 8 0 10 10, 2 8 8 10',
  D: '0 0 2 10, 2 8 8 10, 2 0 8 2, 8 2 10 8',
  C: '0 0 2 10, 2 8 10 10, 2 0 10 2',
  R: '0 0 2 10, 2 8 10 10, 8 5 10 8, 2 4 10 6, 7 0 9 4',
  U: '0 2 2 10, 8 2 10 10, 0 0 10 2',
  I: '0 0 2 10',
  S: '0 8 10 10, 0 5 2 8, 0 4 10 6, 8 2 10 5, 0 0 10 2',
  E: '0 0 2 10, 2 8 10 10, 2 4 8 6, 2 0 10 2',
};
const strokes = (c: string) => STROKES[c].split(', ').map((box) => box.split(' ').map((n) => +n / 10));
const strokeWidth = (c: string) => Math.max(...strokes(c).map((box) => box[2]));

function stripes(b: VehicleBuilder): void {
  const { rear, dark, front, end, endPin } = SLASHES;
  // A piece of the band between two heights, from a front edge back to a rear edge; each edge
  // is a fixed z or a slash. Long pieces are cut into lengths of 15 cm or less so they follow
  // the panel into a dent.
  type Edge = number | ((y: number) => number);
  const at = (e: Edge, y: number) => (typeof e === 'number' ? e : e(y));
  const piece = ([y0, y1]: Vtx, fore: Edge, aft: Edge): Vtx[][] => {
    const f0 = at(fore, y0),
      f1 = at(fore, y1),
      a0 = at(aft, y0),
      a1 = at(aft, y1);
    const n = Math.max(1, Math.ceil(Math.max(a0 - f0, a1 - f1) / 0.15));
    const z = (f: number, a: number, k: number) => f + ((a - f) * k) / n;
    return Array.from({ length: n }, (_, k): Vtx[] => [
      [z(f1, a1, k), y1],
      [z(f1, a1, k + 1), y1],
      [z(f0, a0, k + 1), y0],
      [z(f0, a0, k), y0],
    ]);
  };
  const slash = (edges: readonly [number, number], heights: Vtx) =>
    piece(heights, slashAt(edges[0]), slashAt(edges[1]));
  const tall: Vtx = [LOW_STRIPE[0], TOP_STRIPE[1]],
    taller: Vtx = [LOW_PIN[0], TOP_PIN[1]];
  const stripe = [
    piece(TOP_STRIPE, slashAt(rear[1]), STRIPE_END),
    piece(LOW_STRIPE, slashAt(rear[1]), ARCH_GAP[0]),
    piece(LOW_STRIPE, ARCH_GAP[1], STRIPE_END),
    piece([LOW_STRIPE[1], TOP_STRIPE[0]], STRIPE_END - 0.02, STRIPE_END),
    slash(rear, tall),
    slash(front, tall),
    piece(TOP_STRIPE, slashAt(end[1]), slashAt(front[0])),
    piece(LOW_STRIPE, slashAt(end[1]), slashAt(front[0])),
    slash(end, tall),
  ].flat();
  const pin = [
    piece(TOP_PIN, slashAt(dark[1]), STRIPE_END),
    piece(TOP_PIN, slashAt(endPin[1]), slashAt(dark[0])),
    piece(LOW_PIN, slashAt(dark[1]), ARCH_GAP[0]),
    piece(LOW_PIN, ARCH_GAP[1], STRIPE_END),
    piece(LOW_PIN, slashAt(endPin[1]), slashAt(dark[0])),
    slash(dark, taller),
    slash(endPin, taller),
  ].flat();
  for (const side of [-1, 1]) {
    // Flat shapes laid on the upright band of the side, 2 mm proud of the paint, with the
    // shape's x running forward on the right and back on the left so each faces outwards.
    const m = new THREE.Matrix4()
      .makeBasis(new THREE.Vector3(0, 0, -side), new THREE.Vector3(0, 1, 0), new THREE.Vector3(side, 0, 0))
      .setPosition(side * (WS + 0.002), 0, 0);
    b.push(m);
    b.slot = M.Paint;
    b.tag = Z.Sides;
    for (const [shapes, color] of [
      [stripe, STRIPE_COLOURS.stripe],
      [pin, STRIPE_COLOURS.pin],
    ] as const)
      for (const pts of shapes)
        b.geometry(
          new THREE.ShapeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-side * z, y)))),
          color,
        );
    b.pop();
    // TOYOTA LAND CRUISER in white stroke capitals reading towards the front on the right side
    // and towards the back on the left, as the kit was printed for each side.
    const words = 'TOYOTA LAND CRUISER',
      gap = 0.35,
      space = 1.2;
    let length = 0;
    for (const [i, c] of [...words].entries())
      length += (c === ' ' ? space : strokeWidth(c)) + (i > 0 && c !== ' ' && words[i - 1] !== ' ' ? gap : 0);
    const z0 = -0.001,
      z1 = -0.449,
      h = 0.031,
      y0 = 0.4 - h / 2,
      unit = (z0 - z1) / length;
    let u = 0;
    for (const [i, c] of [...words].entries()) {
      if (c === ' ') {
        u += space;
        continue;
      }
      if (i > 0 && words[i - 1] !== ' ') u += gap;
      for (const [a0, v0, a1, v1] of strokes(c)) {
        const zs = [a0, a1].map((a) => (side > 0 ? z0 - (u + a) * unit : z1 + (u + a) * unit));
        b.block(
          side * (WS + 0.003),
          y0 + ((v0 + v1) / 2) * h,
          (zs[0] + zs[1]) / 2,
          0.002,
          (v1 - v0) * h,
          Math.abs(zs[1] - zs[0]),
          STRIPE_COLOURS.text,
          M.Paint,
          Z.Sides,
        );
      }
      u += strokeWidth(c);
    }
  }
}

/** The 60 Series wagon with its bull bar, gutter rack, second spare and cabin. */
export function buildHj60Body(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontClip(b);
  windscreen(b);
  sides(b);
  stripes(b);
  rear(b);
  roof(b);
  addHj60Interior(b, tuning.engine.redlineRpm);
  addHj60Gear(b, tuning, wheel);
  // Split the bonnet's broad top so dents and dirt have points to work with.
  return cleanGeometry(
    subdivideSurface(b.build(), (c, n) => n.y > 0.9 && c.z < FRONT_DOOR && c.y > 0.6 && c.y < 0.82, 1),
  );
}
