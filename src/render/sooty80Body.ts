import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleTuning } from '../data/vehicle';
import { sooty80Cabin } from '../data/sooty80';
import { VehicleBuilder, BodyZone as Z, VehicleMaterial as M } from './vehicleGeometry';
import { extrudeX, extrudeZ, sideShape, rounded, inset, cornerWrap, type Vtx } from './bodyShapes';
import { cleanGeometry, continuousTube, ROUND_BEND } from './bodyRefinement';
import { reviewRanges, markPart, attachParts } from './sooty80Parts';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';
import { mirrorHead } from './mirrors';
import { mountSpare } from './spares';
import { strokeText } from './bodyKit';
export { buildVehicleWheel } from './sooty80Wheel';
/**
 * The body is laid out on the 80 Series photographs in reference/vehicles/landcruiser-80-sooty
 * (SOURCES.md has the measurements): the lamp face F, the tail-lamp face TAIL, the windscreen
 * pillar's foot and top, the window line, and the height where the tail starts leaning forward.
 */
const F = -2.06,
  TAIL = 2.3,
  WB = 1.425,
  HW = 0.925,
  WAIST = 0.755,
  SILL = 0.035,
  ARCH = 0.56,
  ACY = -0.15,
  AFOOT = -0.615,
  ATOP = -0.205,
  HOOD = -0.8,
  RAKE = 0.62,
  LEAN = 0.53,
  ROOF = 1.275,
  CROWN = 0.045,
  CAB = 0.15;
const paint = new THREE.Color('#99ACB5'),
  dark = new THREE.Color('#252B2D'),
  black = new THREE.Color('#1D2426'),
  steel = new THREE.Color('#A5ADAE'),
  chrome = new THREE.Color('#C1C9CB');
const glass = new THREE.Color('#6F8990'),
  red = new THREE.Color('#AE2924'),
  amber = new THREE.Color('#DB8F2E'),
  lens = new THREE.Color('#E2E3D7'),
  orange = new THREE.Color('#DE722B');
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp01 = (t: number) => THREE.MathUtils.clamp(t, 0, 1);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const tube = (
  b: VehicleBuilder,
  p: number[][],
  r: number,
  c = black,
  zone: number = Z.Trim,
  slot: typeof b.slot = M.Metal,
) =>
  continuousTube(
    b,
    p.map((a) => v(a[0], a[1], a[2])),
    r,
    c,
    zone,
    slot,
  );
/** A light tube for shut lines, mouldings and rubber edges: a few sides, segments by point count. */
const line = (
  b: VehicleBuilder,
  p: number[][],
  r: number,
  c: THREE.Color,
  zone: number,
  slot: typeof b.slot = M.Rubber,
  sides = 5,
) => {
  const curve = new THREE.CatmullRomCurve3(
    p.map((a) => v(a[0], a[1], a[2])),
    false,
    'centripetal',
  );
  b.slot = slot;
  b.tag = zone;
  b.geometry(new THREE.TubeGeometry(curve, Math.max(4, (p.length - 1) * 3), r, sides, false), c);
};
const rectangle = (x0: number, y0: number, x1: number, y1: number, r = 0.01, seg = 6) =>
  new THREE.Shape(
    rounded(
      [
        [x0, y0, r],
        [x1, y0, r],
        [x1, y1, r],
        [x0, y1, r],
      ],
      seg,
    ),
  );
/** Wing tops and bonnet edges, rising from the lamps to the windscreen pillar's foot. */
const edgeAt = (z: number) => 0.62 + 0.13 * clamp01((z - F) / (AFOOT - F));
/** The tail: upright to RAKE, then leaning forward up the liftgate to the roof. */
const zRear = (y: number) => (y <= RAKE ? TAIL : TAIL - (y - RAKE) * LEAN);
/** Glasshouse tumblehome: the side frame leans in above the window line. */
const xAt = (y: number) => HW - 0.135 * clamp01((y - WAIST) / 0.535);
/** Roof edge: it dips at the front to meet the windscreen's top. */
const roofEdge = (z: number) => ROOF - 0.06 * (1 - smooth((z - ATOP) / 0.7));
/** Windscreen base: curved in plan, further forward and higher at the middle. */
const screenZ = (x: number) => -0.7 + 0.085 * Math.min(1, (x / 0.84) ** 2);
const screenY = (x: number) => 0.745 + 0.03 * (1 - Math.min(1, (x / 0.84) ** 2));
/** Top of the lower skin: wing shoulder, window line, then down the leaning tail. */
function topAt(z: number) {
  if (z > zRear(WAIST)) return RAKE + (TAIL - z) / LEAN;
  const wing = edgeAt(z) - 0.03;
  return wing + (WAIST - wing) * smooth((z - AFOOT + 0.3) / 0.3);
}
/** Plan-view rounding of the four corners: 0.07 m in at the faces, gone 0.12 m along the sides. */
function cornerIn(y: number, z: number) {
  const round = (t: number) => 0.07 * (1 - Math.sqrt(Math.max(0, 1 - clamp01(t) ** 2)));
  const front = round(1 - (z - F) / 0.12);
  const back = round(1 - (zRear(y) - z) / 0.12) * (1 - smooth((y - RAKE) / (WAIST - RAKE)));
  return Math.max(front, back);
}
function widthAt(y: number, z: number) {
  const blend = clamp01((y - SILL) / (topAt(z) - SILL));
  return 0.905 + 0.02 * blend + 0.02 * Math.sin(Math.PI * blend) - cornerIn(y, z);
}
/** Half-width of the tail face's edge at height y, where the side skins and frames end. */
const tailX = (y: number) => (y <= WAIST ? widthAt(y, zRear(y)) : xAt(y));
function archLow(z: number) {
  let y = SILL;
  for (const axle of [-WB, WB])
    if (Math.abs(z - axle) < ARCH)
      y = Math.max(y, ACY + Math.sqrt(Math.max(0, ARCH * ARCH - (z - axle) ** 2)));
  return y;
}
function reverse(g: THREE.BufferGeometry) {
  const raw = g.index ? g.toNonIndexed() : g;
  for (const a of Object.values(raw.attributes))
    for (let i = 0; i < a.count; i += 3)
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.getComponent(i + 1, k);
        a.setComponent(i + 1, k, a.getComponent(i + 2, k));
        a.setComponent(i + 2, k, t);
      }
  const n = raw.getAttribute('normal');
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return raw;
}
/** Indexed smooth patch: longitudinal rows, cross-section columns. */
function patch(
  b: VehicleBuilder,
  rows: THREE.Vector3[][],
  color: THREE.Color,
  slot: typeof b.slot,
  zone: number,
  flip = false,
) {
  const cols = rows[0].length,
    positions = rows.flat().flatMap((p) => p.toArray()),
    ids: number[] = [];
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j,
        c = a + cols + 1,
        bb = a + cols,
        d = a + 1;
      if (flip) ids.push(a, d, c, a, c, bb);
      else ids.push(a, bb, c, a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(ids);
  g.computeVertexNormals();
  b.slot = slot;
  b.tag = zone;
  b.geometry(g, color);
}
/** A patch and its inside face, `depth` behind it along `inward`, so the panel shows from both sides. */
function shell(
  b: VehicleBuilder,
  rows: THREE.Vector3[][],
  inward: THREE.Vector3,
  depth: number,
  color: THREE.Color,
  zone: number,
  flip = false,
) {
  patch(b, rows, color, M.Paint, zone, flip);
  const off = inward.clone().multiplyScalar(depth);
  patch(
    b,
    rows.map((r) => r.map((p) => p.clone().add(off))),
    color,
    M.Paint,
    zone,
    !flip,
  );
}
/** Row positions along the car shared by the lower skins and the wing tops, so their edges meet. */
function skinRows() {
  const tail = zRear(WAIST);
  const zs = Array.from({ length: 46 }, (_, i) => F + ((TAIL - F) * i) / 45).filter((z) => z <= tail);
  for (const a of [-WB, WB])
    for (const d of [-1, 1]) zs.push(a + d * Math.sqrt(ARCH * ARCH - (SILL - ACY) ** 2));
  zs.push(AFOOT);
  for (let k = 0; k <= 6; k++) zs.push(zRear(RAKE + ((WAIST - RAKE) * k) / 6));
  return [...new Set(zs.map((z) => Math.round(z * 1e5) / 1e5))].sort((a, b) => a - b);
}
const rakeHeights = Array.from({ length: 7 }, (_, k) => RAKE + ((WAIST - RAKE) * k) / 6);
const frameHeights = Array.from({ length: 8 }, (_, k) => WAIST + ((ROOF - WAIST) * k) / 7);
/** Roof rows: from the windscreen top (s = 0) to the liftgate (s = 1). */
const roofRows = Array.from({ length: 41 }, (_, i) => i / 40);
const roofColumns = Array.from({ length: 25 }, (_, j) => -1 + j / 12);
const roofBackZ = (u: number) => zRear(ROOF + CROWN * (1 - u * u));
const roofZ = (u: number, s: number) => ATOP + (roofBackZ(u) - ATOP) * s;
function roofPoint(u: number, s: number) {
  const z = roofZ(u, s),
    y = roofEdge(z);
  return v(u * xAt(y), y + CROWN * (1 - u * u) * smooth((z - ATOP) / 0.45), z);
}
/** Wing-top cross-section at z: from under the bonnet edge out to the side skin's top. */
function wingPoint(side: number, z: number, t: number) {
  const top = topAt(z),
    out = widthAt(top, z);
  return v(side * (0.64 + (out - 0.64) * t), edgeAt(z) - (edgeAt(z) - top) * t * t, z);
}
function lowerBody(b: VehicleBuilder) {
  const zs = skinRows();
  for (const side of [-1, 1]) {
    const outer = zs.map((z) =>
      Array.from({ length: 11 }, (_, j) => {
        const y = archLow(z) + ((topAt(z) - archLow(z)) * j) / 10;
        return v(side * widthAt(y, z), y, z);
      }),
    );
    const inner = outer.map((row) => row.map((p) => v(p.x - side * 0.028, p.y, p.z)));
    patch(b, outer, paint, M.Paint, Z.Sides, side > 0);
    patch(b, inner, paint, M.Paint, Z.Sides, side < 0);
    patch(
      b,
      outer.map((r, i) => [inner[i][0], r[0]]),
      dark,
      M.Rubber,
      Z.Trim,
      side < 0,
    );
    patch(
      b,
      outer.map((r, i) => [r[r.length - 1], inner[i][r.length - 1]]),
      paint,
      M.Paint,
      Z.Sides,
      side < 0,
    );
    // Rounded wing tops roll down to the side skins, on the same rows so the edges meet.
    const rows = zs
      .filter((z) => z <= AFOOT)
      .map((z) => Array.from({ length: 13 }, (_, j) => wingPoint(side, z, j / 12)));
    patch(b, rows, paint, M.Paint, Z.Front, side < 0);
  }
}
/** Superellipse outline of a wheel-arch flare: squarer than a circle, as on the wide-body 80. */
function flareOutline(axle: number, ahead: number, behind: number, lowBehind = SILL - 0.02): Vtx[] {
  const pts: Vtx[] = [];
  const low = SILL - 0.02,
    r = ARCH - 0.005;
  const end = (reach: number, y: number) => reach * (1 - Math.abs((y - ACY) / 0.66) ** 2.6) ** (1 / 2.6);
  pts.push([axle + end(behind, lowBehind), lowBehind]);
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * i) / 40,
      c = Math.cos(a),
      s = Math.sin(a),
      reach = c > 0 ? behind : ahead;
    const z = axle + reach * Math.sign(c) * Math.abs(c) ** (2 / 2.6),
      y = ACY + 0.66 * Math.abs(s) ** (2 / 2.6);
    if (y >= (c > 0 ? lowBehind : low)) pts.push([z, y]);
  }
  pts.push([axle - end(ahead, low), low]);
  const open = Math.asin((low - ACY) / r),
    shut = Math.asin((lowBehind - ACY) / r);
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI - open - ((Math.PI - open - shut) * i) / 40;
    pts.push([axle + r * Math.cos(a), ACY + r * Math.sin(a)]);
  }
  return pts;
}
function flares(b: VehicleBuilder) {
  for (const side of [-1, 1])
    for (const [axle, ahead, behind, lowBehind] of [
      [-WB, 0.58, 0.64, SILL - 0.02],
      // The rear flare's tail end stops short of the sill, above the bumper's end.
      [WB, 0.64, 0.55, 0.12],
    ]) {
      extrudeX(
        b,
        sideShape(flareOutline(axle, ahead, behind, lowBehind)),
        side > 0 ? 0.9 : -0.99,
        side > 0 ? 0.99 : -0.9,
        black,
        M.Rubber,
        axle < 0 ? Z.Front : Z.Rear,
        0.014,
      );
      // Wheel-well liners stand inside the openings.
      const innerX = axle < 0 ? 0.315 : 0.57;
      b.block(side * innerX, 0.44, axle, 0.025, 0.32, 1.12, dark, M.Rubber, Z.Trim);
      b.block((side * (innerX + 0.91)) / 2, 0.58, axle, 0.93 - innerX, 0.035, 1.12, dark, M.Rubber, Z.Trim);
    }
}
/** Shut lines, handles, the lower moulding, fillers and lamps on the sides. */
function sideDetails(b: VehicleBuilder) {
  const onSkin = (side: number, p: number[][], r = 0.0038) =>
    line(
      b,
      p.map(([y, z]) => [side * (widthAt(y, z) + 0.0015), y, z]),
      r,
      dark,
      Z.Sides,
    );
  const flareTop = (z: number, axle: number, reach: number) =>
    ACY + 0.66 * Math.max(0, 1 - Math.abs((z - axle) / reach) ** 2.6) ** (1 / 2.6);
  for (const side of [-1, 1]) {
    // Front door: its leading edge rises upright, then leans back to the pillar's foot.
    onSkin(side, [
      [SILL + 0.008, -0.71],
      [0.4, -0.71],
      [0.6, -0.695],
      [0.7, -0.655],
      [WAIST - 0.004, AFOOT + 0.006],
    ]);
    onSkin(side, [
      [SILL + 0.008, 0.355],
      [WAIST - 0.004, 0.355],
    ]);
    // The rear door's back edge stops on the rear flare.
    onSkin(side, [
      [flareTop(1.2, WB, 0.64) + 0.02, 1.2],
      [WAIST - 0.004, 1.2],
    ]);
    for (const z of [0.165, 1.07]) {
      const x = side * (widthAt(0.575, z) + 0.006);
      b.block(x, 0.575, z, 0.02, 0.045, 0.15, black, M.Rubber, Z.Sides, 0.009);
      b.block(x + side * 0.011, 0.582, z - 0.022, 0.008, 0.012, 0.085, steel, M.Metal, Z.Sides, 0.003);
    }
    // Lower moulding between the flares and on the rear quarter.
    for (const [z0, z1] of [
      [-0.875, 0.875],
      [1.95, TAIL - 0.13],
    ]) {
      const n = Math.max(2, Math.round((z1 - z0) / 0.1));
      line(
        b,
        Array.from({ length: n + 1 }, (_, i) => {
          const z = z0 + ((z1 - z0) * i) / n;
          return [side * (widthAt(0.31, z) + 0.004), 0.31, z];
        }),
        0.016,
        dark,
        Z.Sides,
        M.Rubber,
        8,
      );
    }
    // Fuel filler flap on each rear quarter (main and sub tank) and the wing repeater.
    b.block(
      side * (widthAt(0.555, 1.81) + 0.001),
      0.555,
      1.81,
      0.006,
      0.12,
      0.16,
      paint,
      M.Paint,
      Z.Sides,
      0.003,
    );
    b.block(
      side * (widthAt(0.555, 1.81) - 0.001),
      0.555,
      1.81,
      0.006,
      0.13,
      0.17,
      dark,
      M.Rubber,
      Z.Sides,
      0.003,
    );
    b.block(
      side * (widthAt(0.525, -0.89) + 0.003),
      0.525,
      -0.89,
      0.01,
      0.028,
      0.06,
      amber,
      M.Amber,
      Z.Sides,
      0.004,
    );
  }
}
function bonnet(b: VehicleBuilder) {
  // A low raised panel runs down the middle of the bonnet, as on the 80.
  const lift = (x: number, z: number) =>
    0.035 * (1 - (x / 0.66) ** 2) + 0.012 * smooth((0.42 - Math.abs(x)) / 0.08) * smooth((z - F) / 0.25);
  const rows = Array.from({ length: 28 }, (_, i) => {
    const z = F - 0.004 + ((HOOD - F + 0.004) * i) / 27;
    return Array.from({ length: 27 }, (_, j) => {
      const x = -0.655 + (1.31 * j) / 26;
      return v(x, edgeAt(z) + lift(x, z), z);
    });
  });
  patch(b, rows, paint, M.Paint, Z.Front);
  patch(
    b,
    rows.map((r) => r.map((p) => v(p.x, p.y - 0.035, p.z))),
    paint,
    M.Paint,
    Z.Front,
    true,
  );
  for (const j of [0, 26])
    patch(
      b,
      rows.map((r) => [v(r[j].x, r[j].y - 0.035, r[j].z), r[j]]),
      paint,
      M.Paint,
      Z.Front,
      j === 0,
    );
  for (const row of [rows[0], rows[rows.length - 1]])
    patch(b, [row.map((p) => v(p.x, p.y - 0.035, p.z)), row], paint, M.Paint, Z.Front, row !== rows[0]);
  // Scuttle panel from the bonnet's back edge to the windscreen, with its vent slots.
  const back = rows[rows.length - 1];
  const scuttle = back.map((p) =>
    Array.from({ length: 5 }, (_, k) => {
      const t = k / 4;
      return v(
        p.x,
        p.y - 0.012 + (screenY(p.x) - 0.004 - p.y + 0.012) * t,
        p.z + (screenZ(p.x) + 0.004 - p.z) * t,
      );
    }),
  );
  patch(b, scuttle, dark, M.Rubber, Z.Front, true);
  b.block(0, 0.38, -1.45, 0.58, 0.44, 1.05, black, M.Rubber, Z.Trim, 0.025);
}
/** Real openings in a tumblehome side frame, with smoothed bevels and preserved normals. */
function sidePanel(
  b: VehicleBuilder,
  side: number,
  verts: Vtx[],
  holes: Vtx[][],
  c: THREE.Color,
  slot: typeof b.slot,
  zone: number,
  offset = 0,
) {
  const raw = new THREE.ExtrudeGeometry(sideShape(verts, holes), {
    depth: 0.026,
    bevelEnabled: false,
    curveSegments: 16,
  });
  const g = toCreasedNormals(raw, Math.PI / 4);
  g.rotateY(Math.PI / 2);
  g.translate(side > 0 ? HW - 0.026 : -HW, 0, 0);
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + side * (xAt(y) - HW + offset));
    const nn = v(n.getX(i), n.getY(i) + ((side * 0.135) / 0.535) * n.getX(i), n.getZ(i)).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  b.slot = slot;
  b.tag = zone;
  b.geometry(g, c);
}
function sideGlass(b: VehicleBuilder, side: number, pts: Vtx[]) {
  let g = new THREE.ShapeGeometry(sideShape(pts), 20);
  g.rotateY(Math.PI / 2);
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, side * (xAt(y) - 0.01));
    n.setXYZ(i, 1, (side * 0.135) / 0.535, 0);
  }
  if (side < 0) g = reverse(g) as THREE.ShapeGeometry;
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.geometry(g, glass);
}
/** Where the windscreen pillar's outer edge is at height y (straight from its foot to the roof). */
const pillarZ = (y: number) => AFOOT + ((ATOP - AFOOT) * (y - WAIST)) / (roofEdge(ATOP) - WAIST);
function glasshouse(b: VehicleBuilder) {
  // Frame outline: window line, down the leaning tail, along the roof edge, down the pillar.
  const outline: Vtx[] = [
    [AFOOT, WAIST],
    ...frameHeights.map((y): Vtx => [zRear(y), y]),
    ...roofRows
      .slice(0, -1)
      .reverse()
      .map((s): Vtx => {
        const z = roofZ(1, s);
        return [z, roofEdge(z)];
      }),
  ];
  const pillarIn = (y: number) => pillarZ(y) + 0.072;
  const windows: Vtx[][] = [
    [
      [-0.46, 0.785, 0.01],
      [-0.46, 0.84],
      [pillarIn(1.17), 1.17, 0.025],
      [0.305, 1.17, 0.02],
      [0.305, 0.785, 0.015],
    ],
    [
      [0.4, 0.785, 0.015],
      [0.4, 1.17, 0.02],
      [1.125, 1.17, 0.02],
      [1.125, 0.785, 0.015],
    ],
    [
      [1.2, 0.8, 0.015],
      [1.2, 1.17, 0.02],
      [zRear(1.17) - 0.115, 1.17, 0.09],
      [zRear(0.8) - 0.12, 0.8, 0.035],
    ],
  ];
  for (const side of [-1, 1]) {
    sidePanel(b, side, outline, windows, paint, M.Paint, Z.Sides);
    for (const outer of windows) {
      const inner = inset(outer, 0.014);
      sidePanel(b, side, outer, [inner], black, M.Rubber, Z.Sides, 0.006);
      sideGlass(b, side, inset(inner, 0.002));
    }
    // Blacked-out door pillars and the mirror sail, as on the factory body.
    for (const strip of [
      [
        [0.305, 0.77],
        [0.305, 1.185],
        [0.4, 1.185],
        [0.4, 0.77],
      ],
      [
        [1.125, 0.77],
        [1.125, 1.185],
        [1.2, 1.185],
        [1.2, 0.77],
      ],
      [
        [pillarIn(0.775) - 0.01, 0.775],
        [pillarIn(0.86), 0.86],
        [-0.46, 0.86],
        [-0.46, 0.775],
      ],
    ] as Vtx[][])
      sidePanel(b, side, strip, [], black, M.Rubber, Z.Sides, 0.004);
    // Louvred vent behind the rear quarter glass.
    for (let i = 0; i < 6; i++) {
      const y = 0.86 + i * 0.035,
        z = zRear(y) - 0.06;
      b.block(side * (xAt(y) + 0.004), y, z, 0.008, 0.012, 0.035, black, M.Rubber, Z.Sides, 0.003);
    }
    // Door mirror on the sail.
    b.block(side * (xAt(0.8) + 0.012), 0.8, -0.49, 0.035, 0.07, 0.07, black, M.Rubber, Z.Trim, 0.012);
    b.rod(
      v(side * (xAt(0.8) + 0.02), 0.8, -0.49),
      v(side * 1.03, 0.815, -0.47),
      0.02,
      black,
      M.Rubber,
      Z.Trim,
    );
    mirrorHead(b, side, v(side * 1.07, 0.835, -0.46), 0.19, 0.15, 0.1, paint, 0.12);
    // Drip rail along the roof edge.
    line(
      b,
      roofRows.map((s) => {
        const p = roofPoint(side, s);
        return [p.x + side * 0.006, p.y + 0.004, p.z];
      }),
      0.008,
      dark,
      Z.Roof,
    );
  }
  windscreen(b);
}
function windscreen(b: VehicleBuilder) {
  // Glass curved in plan between the pillars, raked back to the roof's front edge.
  const top = roofEdge(ATOP) - 0.01;
  const pane = (x0: number, x1: number, inset = 0) =>
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return Array.from({ length: 21 }, (_, j) => {
        const u = -1 + j / 10,
          xb = u * (x0 - inset),
          xt = u * (x1 - inset);
        return v(
          xb + (xt - xb) * t,
          screenY(xb) + (top - screenY(xb)) * t,
          screenZ(xb) + (ATOP - 0.01 - screenZ(xb)) * t,
        );
      });
    });
  const glassRows = pane(0.8, 0.74, 0.012);
  b.slot = M.Glass;
  patch(b, glassRows, glass, M.Glass, Z.Glass, true);
  const edge = pane(0.8, 0.74);
  line(
    b,
    [
      ...edge[0].map((p) => [p.x, p.y + 0.004, p.z]),
      ...edge.slice(1).map((r) => [r[20].x, r[20].y, r[20].z]),
    ],
    0.012,
    black,
    Z.Front,
    M.Rubber,
    6,
  );
  line(
    b,
    [
      ...[...edge[8]].reverse().map((p) => [p.x, p.y + 0.004, p.z + 0.004]),
      ...edge
        .slice(0, -1)
        .reverse()
        .map((r) => [r[0].x, r[0].y, r[0].z]),
    ],
    0.012,
    black,
    Z.Front,
    M.Rubber,
    6,
  );
  // Body-coloured pillar faces from the glass edge out to the side frame.
  for (const side of [-1, 1]) {
    const rows = edge.map((r, i) => {
      const g = r[side > 0 ? 20 : 0],
        y = WAIST + ((roofEdge(ATOP) - WAIST) * i) / 8;
      return [g, v(side * xAt(y), y, pillarZ(y))];
    });
    shell(b, rows, v(0, 0, 1), 0.02, paint, Z.Front, side < 0);
  }
  for (const x of [-0.5, 0.1]) {
    const p = edge[1][Math.round((x / 0.8 + 1) * 10)];
    b.rod(
      v(x, p.y + 0.015, p.z + 0.012),
      v(x + 0.38, p.y + 0.03, p.z + 0.02),
      0.006,
      black,
      M.Rubber,
      Z.Front,
    );
  }
}
function roof(b: VehicleBuilder) {
  const rows = roofRows.map((s) => roofColumns.map((u) => roofPoint(u, s)));
  shell(b, rows, v(0, -1, 0), 0.02, paint, Z.Roof, true);
}
/** Planar end panel from an (x, y) outline at fixed z, or leaning with zRear; both faces drawn. */
function endPanel(
  b: VehicleBuilder,
  outline: [number, number][],
  depth: (y: number) => number,
  facing: number,
  zone: number,
  holes: [number, number][][] = [],
) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  for (const inside of [false, true]) {
    let g: THREE.BufferGeometry = new THREE.ShapeGeometry(shape);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, depth(p.getY(i)) - (inside ? facing * 0.02 : 0));
    g.computeVertexNormals();
    if (facing < 0 !== inside) g = reverse(g);
    b.slot = M.Paint;
    b.tag = zone;
    b.geometry(g, paint);
  }
}
function frontEnd(b: VehicleBuilder) {
  // Lamp face: meets the side skins' first row and the wing tops' first row exactly.
  const lowRow = Array.from({ length: 11 }, (_, j) => SILL + ((topAt(F) - SILL) * j) / 10);
  const right: [number, number][] = [
    ...lowRow.map((y): [number, number] => [widthAt(y, F), y]),
    ...Array.from({ length: 12 }, (_, j): [number, number] => {
      const p = wingPoint(1, F, 1 - (j + 1) / 12);
      return [p.x, p.y];
    }),
  ];
  endPanel(
    b,
    [...right, ...right.map(([x, y]): [number, number] => [-x, y]).reverse()],
    () => F,
    -1,
    Z.Front,
  );
  // Grille: the early pattern (front.jpg, grille-early.jpg), since Sooty MkII is a 1993 car
  // (MY4X4's build page): a chrome surround, three slats above and three below a grey bar across
  // the middle with TOYOTA in chrome letters and a small turbo badge at its left end, and five
  // uprights dividing it. Until v2.13 it was the 1995-on grille with the oval badge.
  b.block(0, 0.42, F - 0.01, 0.82, 0.24, 0.025, chrome, M.Metal, Z.Front, 0.012);
  b.block(0, 0.42, F - 0.016, 0.76, 0.195, 0.02, black, M.Rubber, Z.Front, 0.006);
  for (const y of [0.35, 0.372, 0.394, 0.462, 0.484, 0.506])
    b.block(0, y, F - 0.027, 0.74, 0.008, 0.01, dark, M.Metal, Z.Front, 0.003);
  for (let i = 0; i < 5; i++)
    b.block(-0.26 + i * 0.13, 0.428, F - 0.025, 0.008, 0.18, 0.01, dark, M.Metal, Z.Front);
  b.block(0, 0.428, F - 0.03, 0.74, 0.056, 0.012, new THREE.Color('#5A5E60'), M.Metal, Z.Front, 0.004);
  strokeText(b, 'TOYOTA', {
    x: 0.2075,
    y: 0.428 - 0.0205,
    z: F - 0.039,
    dir: -1,
    w: 0.05,
    h: 0.041,
    pitch: 0.073,
    radius: 0.0034,
    colour: chrome,
    slot: M.Metal,
    zone: Z.Front,
  });
  b.block(-0.32, 0.428, F - 0.038, 0.08, 0.022, 0.006, chrome, M.Metal, Z.Front, 0.003);
  b.block(-0.32, 0.428, F - 0.042, 0.068, 0.012, 0.004, dark, M.Rubber, Z.Front);
  for (const side of [-1, 1]) {
    // Two square lamps a side in a chrome bezel, the clear corner lamp wrapping the corner.
    b.block(side * 0.6, 0.455, F - 0.008, 0.37, 0.16, 0.02, chrome, M.Metal, Z.Front, 0.012);
    for (const x of [0.51, 0.69]) {
      b.block(side * x, 0.455, F - 0.016, 0.172, 0.138, 0.016, dark, M.Rubber, Z.Front, 0.008);
      b.block(side * x, 0.455, F - 0.024, 0.162, 0.126, 0.012, lens, M.Headlamp, Z.Front, 0.01);
      for (let i = 0; i < 5; i++)
        b.block(
          side * (x - 0.05 + i * 0.025),
          0.455,
          F - 0.031,
          0.003,
          0.1,
          0.003,
          lens,
          M.Headlamp,
          Z.Front,
        );
    }
    const cx = widthAt(0.455, F);
    b.block(
      (side * (0.78 + cx)) / 2,
      0.455,
      F - 0.006,
      cx - 0.78,
      0.15,
      0.014,
      lens,
      M.Headlamp,
      Z.Front,
      0.005,
    );
    cornerWrap(b, side, side * cx, F + 0.12, 0.076, 0.126, 0.455, 0.15, lens, M.Headlamp, Z.Front);
    // Indicators under the headlamps.
    b.block(side * 0.6, 0.33, F - 0.008, 0.32, 0.055, 0.02, amber, M.Amber, Z.Front, 0.008);
  }
}
function rearEnd(b: VehicleBuilder) {
  // Lower face, upright: the tail lamps and the drop-down tailgate.
  const lowRow = Array.from({ length: 11 }, (_, j) => SILL + ((RAKE - SILL) * j) / 10);
  const lower: [number, number][] = lowRow.map((y) => [tailX(y), y]);
  endPanel(
    b,
    [...lower, ...lower.map(([x, y]): [number, number] => [-x, y]).reverse()],
    () => TAIL,
    1,
    Z.Rear,
  );
  // Upper face, leaning: liftgate with its window, up to the roof's back edge.
  const crown = roofColumns
    .filter((u) => u >= 0)
    .reverse()
    .map((u): [number, number] => {
      const p = roofPoint(u, 1);
      return [p.x, p.y];
    });
  const right: [number, number][] = [
    ...rakeHeights.map((y): [number, number] => [tailX(y), y]),
    ...frameHeights.slice(1).map((y): [number, number] => [tailX(y), y]),
  ];
  const upper: [number, number][] = [
    ...right,
    ...crown.slice(1),
    ...crown
      .slice(0, -1)
      .reverse()
      .map(([x, y]): [number, number] => [-x, y]),
    ...right.map(([x, y]): [number, number] => [-x, y]).reverse(),
  ];
  const win = (d = 0) =>
    rounded([
      [-0.66 + d, 0.8 + d, 0.05],
      [0.66 - d, 0.8 + d, 0.05],
      [0.6 - d, 1.17 - d, 0.06],
      [-0.6 + d, 1.17 - d, 0.06],
    ]).map((p): [number, number] => [p.x, p.y]);
  endPanel(b, upper, zRear, 1, Z.Rear, [[...win()].reverse()]);
  // Window seal and glass sit just proud of the leaning liftgate.
  const lay = (
    pts: [number, number][],
    out: number,
    holes: [number, number][][],
    c: THREE.Color,
    slot: typeof b.slot,
  ) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(s);
    const p = g.getAttribute('position'),
      n = g.getAttribute('normal');
    const nn = v(0, LEAN, 1).normalize();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setXYZ(i, p.getX(i), y + nn.y * out, zRear(y) + nn.z * out);
      n.setXYZ(i, nn.x, nn.y, nn.z);
    }
    b.slot = slot;
    b.tag = slot === M.Glass ? Z.Glass : Z.Rear;
    b.geometry(g, c);
  };
  lay(win(-0.018), 0.006, [[...win(0.004)].reverse()], black, M.Rubber);
  lay(win(0.002), 0.004, [], glass, M.Glass);
  lay(
    rounded([
      [-0.13, 1.182, 0.008],
      [0.13, 1.182, 0.008],
      [0.13, 1.205, 0.008],
      [-0.13, 1.205, 0.008],
    ]).map((p): [number, number] => [p.x, p.y]),
    0.008,
    [],
    red,
    M.Red,
  );
  const nn = v(0, LEAN, 1).normalize();
  const onGate = (y: number, out: number) => zRear(y) + nn.z * out;
  b.rod(v(-0.5, 0.82, onGate(0.82, 0.02)), v(0.12, 0.84, onGate(0.84, 0.02)), 0.006, black, M.Rubber, Z.Rear);
  b.ring(-0.5, 0.71, onGate(0.71, 0.008), 0.03, 0.004, chrome, M.Metal, 'z', Z.Rear);
  // Tailgate shut lines, garnish and the plate recess.
  b.block(0, 0.597, TAIL + 0.002, 1.54, 0.006, 0.006, black, M.Rubber, Z.Rear);
  for (const side of [-1, 1])
    b.block(side * 0.77, 0.42, TAIL + 0.002, 0.006, 0.35, 0.006, black, M.Rubber, Z.Rear);
  b.block(0, 0.55, TAIL + 0.008, 0.66, 0.05, 0.016, black, M.Rubber, Z.Rear, 0.008);
  b.block(-0.3, 0.405, TAIL + 0.006, 0.37, 0.13, 0.012, black, M.Rubber, Z.Rear, 0.008);
  plate(b, -0.3, 0.405, TAIL + 0.02, 1, '80 MK2');
  for (const side of [-1, 1]) {
    // Tail lamps fill the corners: amber, clear reversing lamp, then the red stop and tail lamp.
    for (const [y0, y1, c, slot] of [
      [0.55, 0.615, amber, M.Amber],
      [0.5, 0.55, lens, M.Lamp],
      [0.33, 0.5, red, M.Red],
    ] as const) {
      const y = (y0 + y1) / 2,
        cx = tailX(y);
      b.block(
        (side * (0.775 + cx)) / 2,
        y,
        TAIL + 0.008,
        cx - 0.775,
        y1 - y0 - 0.004,
        0.016,
        c,
        slot,
        Z.Rear,
        0.004,
      );
      cornerWrap(b, side, side * cx, TAIL - 0.12, 0.076, 0.126, y, y1 - y0 - 0.004, c, slot, Z.Rear, 0, 0.6);
    }
  }
}
function chassis(b: VehicleBuilder, t: VehicleTuning) {
  // Long, stepped ladder frame with raised sections above the spring seats.
  for (const side of [-1, 1]) {
    const front: Vtx[] = [
      [F - 0.05, 0.04],
      [-1.82, 0.255],
      [-1.02, 0.255],
      [-0.76, -0.085],
      [-0.76, 0.085],
      [-1.02, 0.425],
      [-1.82, 0.425],
      [F - 0.05, 0.21],
    ];
    const back: Vtx[] = [
      [-0.65, -0.085],
      [0.65, -0.085],
      [0.94, 0.255],
      [1.94, 0.255],
      [2.16, 0.03],
      [TAIL + 0.03, 0.03],
      [TAIL + 0.03, 0.2],
      [2.16, 0.2],
      [1.94, 0.425],
      [0.94, 0.425],
      [0.65, 0.085],
      [-0.65, 0.085],
    ];
    extrudeX(b, sideShape(front), side * 0.31 - 0.045, side * 0.31 + 0.045, black, M.Metal, Z.Trim, 0.008);
    extrudeX(b, sideShape(back), side * 0.43 - 0.045, side * 0.43 + 0.045, black, M.Metal, Z.Trim, 0.008);
    b.rod(v(side * 0.31, 0, -0.76), v(side * 0.43, 0, -0.65), 0.045, black, M.Metal, Z.Trim);
  }
  for (const z of [F + 0.1, -0.62, 0.55, TAIL - 0.08])
    b.block(0, z < -1 ? 0.22 : 0.06, z, z < -1 ? 0.62 : 0.86, 0.08, 0.09, black, M.Metal, Z.Trim);
  for (const [z0, z1, width, y] of [
    [-0.88, 0.86, 1.72, 0.14],
    [0.86, 2.0, 1.1, 0.46],
    [2.0, TAIL - 0.02, 1.7, 0.46],
  ])
    b.block(0, y, (z0 + z1) / 2, width, 0.04, z1 - z0, black, M.Rubber, Z.Trim);
  b.block(0, 0.3, 0.85, 1.1, 0.32, 0.04, black, M.Rubber, Z.Trim);
  b.block(0, -0.025, -0.25, 0.36, 0.19, 0.71, dark, M.Metal, Z.Trim, 0.03);
  b.rod(v(0.08, -0.09, -0.56), v(0.08, -0.196, -WB), 0.031, steel, M.Metal, Z.Trim);
  // From inside the transfer case's tail (from 0.13 it started 2.5 cm behind it, in the air).
  b.rod(v(0.08, -0.08, 0.08), v(0.08, -0.196, WB), 0.031, steel, M.Metal, Z.Trim);
  b.block(0.6, 0.04, 0.15, 0.27, 0.22, 0.65, black, M.Metal, Z.Trim, 0.03);
  // The exhaust runs back on the right, climbs over the rear axle between the differential and
  // the coil spring, and comes out behind the right rear wheel, as on rear.jpg. Until v2.13 it
  // ran on the left and came out behind the left wheel.
  // At x 0.23 it clears the rear shock (x 0.315, 26 mm radius) by 2.5 cm and the differential.
  tube(
    b,
    [
      [0.23, -0.07, -0.85],
      [0.23, -0.07, 1.0],
      [0.23, 0.09, 1.2],
      [0.23, 0.09, 1.65],
      [0.23, -0.05, 1.85],
      [0.7, -0.04, TAIL - 0.02],
    ],
    0.034,
    steel,
    Z.Trim,
  );
  // Rubber hangers: one up to the cab floor, one up to the raised section over the axle's floor,
  // and one from the tail to the corner of the right chassis rail.
  for (const [a, c] of [
    [v(0.23, -0.04, 0.3), v(0.23, 0.12, 0.3)],
    [v(0.23, 0.12, 1.45), v(0.23, 0.44, 1.45)],
    [v(0.52, -0.012, 2.1), v(0.45, 0.1, 2.1)],
  ])
    b.rod(a, c, 0.009, black, M.Rubber, Z.Trim);
  // Explicit coil seats and damper towers; only their intended contacts are excluded in suspension-body checks.
  markPart(b, 1024, () => {
    for (const w of t.wheels) {
      const side = Math.sign(w.x),
        sx = w.x - side * 0.42,
        rail = side * (w.front ? 0.31 : 0.43),
        dz = w.front ? 0.16 : -0.16,
        dx = sx + (w.front ? 0.02 : -0.1) * side;
      b.block(sx, 0.26, w.z, 0.21, 0.025, 0.22, black, M.Metal, Z.Trim, 0.006);
      for (const z of [w.z - 0.075, w.z + 0.075])
        b.rod(v(rail, 0.34, z), v(sx, 0.25, z), 0.017, steel, M.Metal, Z.Trim);
      b.rod(v(rail, 0.34, w.z + dz), v(dx, 0.32, w.z + dz), 0.017, steel, M.Metal, Z.Trim);
      b.block(dx, 0.32, w.z + dz, 0.07, 0.04, 0.07, black, M.Metal, Z.Trim, 0.005);
    }
  });
}
function interior(b: VehicleBuilder, t: VehicleTuning) {
  const cloth = new THREE.Color('#4C5354');
  // Dashboard tucked under the windscreen, its top rolling down to the instrument face.
  const profile = (x: number) => [
    v(x, screenY(x) - 0.016, screenZ(x) + 0.018),
    v(x, 0.8, -0.565),
    v(x, 0.8, -0.505),
    v(x, 0.762, -0.472),
    v(x, 0.55, -0.48),
    v(x, 0.47, -0.565),
  ];
  patch(
    b,
    Array.from({ length: 17 }, (_, i) => profile(-0.84 + (1.68 * i) / 16)),
    black,
    M.Rubber,
    Z.Trim,
    true,
  );
  // The footwells' front wall under the dash: the ground showed under it from the seat.
  b.block(0, 0.4, -0.7, 1.66, 0.5, 0.02, black, M.Rubber, Z.Trim);
  // Door trims inside the front doors, below the glass (the doors were bare inside).
  const doorX = 0.905 - 0.03;
  for (const side of [-1, 1]) {
    b.block(
      side * doorX,
      0.52,
      -0.08,
      0.012,
      0.42,
      0.72,
      cloth.clone().multiplyScalar(0.8),
      M.Fabric,
      Z.Trim,
      0.004,
    );
    b.block(side * (doorX - 0.025), 0.62, -0.02, 0.04, 0.03, 0.34, black, M.Rubber, Z.Trim, 0.008);
    // A capping strip along the inside of each door's sill, under the glass: the seam between
    // the lower body and the glasshouse showed the ground through it as a hairline.
    for (const [z0, z1] of [
      [-0.5, 0.3],
      [0.41, 1.19],
    ])
      b.block(side * 0.885, WAIST, (z0 + z1) / 2, 0.03, 0.04, z1 - z0, black, M.Rubber, Z.Trim, 0.006);
    // The kick panel ahead of it, under the dash's end.
    b.block(side * doorX, 0.32, -0.55, 0.012, 0.3, 0.22, black, M.Rubber, Z.Trim, 0.004);
  }
  // Keep the instrument pod behind the dial faces so the working gauges are visible.
  b.block(0.43, 0.78, sooty80Cabin.dialZ - 0.055, 0.46, 0.17, 0.1, dark, M.Rubber, Z.Trim, 0.024);
  addDialFaces(b, sooty80Cabin, t.engine.redlineRpm);
  addSteeringColumn(b, sooty80Cabin);
  b.block(-0.04, 0.66, -0.468, 0.31, 0.19, 0.022, black, M.Rubber, Z.Trim, 0.009);
  b.block(-0.04, 0.67, -0.455, 0.25, 0.125, 0.008, new THREE.Color('#506A72'), M.Paint, Z.Trim, 0.005);
  for (const x of [-0.43, 0.43]) {
    b.block(x, 0.43, 0.03 + CAB, 0.51, 0.14, 0.54, cloth, M.Fabric, Z.Trim, 0.05);
    b.push()
      .translate(x, 0.79, 0.3 + CAB)
      .rotate(-0.1, 0, 0);
    b.block(0, 0, 0, 0.51, 0.65, 0.14, cloth, M.Fabric, Z.Trim, 0.05);
    b.pop();
    for (const dx of [-0.16, 0.16])
      b.block(x + dx, 0.28, 0.02 + CAB, 0.025, 0.2, 0.45, steel, M.Metal, Z.Trim);
    b.block(x, 1.12, 0.32 + CAB, 0.26, 0.16, 0.095, cloth, M.Fabric, Z.Trim, 0.035);
  }
  b.block(0, 0.33, 0.16 + CAB, 0.24, 0.25, 0.78, black, M.Rubber, Z.Trim, 0.025);
  for (const [x, z, h] of [
    [0.04, -0.16 + CAB, 0.62],
    [-0.08, -0.04 + CAB, 0.52],
  ]) {
    b.rod(v(x, 0.35, z + 0.1), v(x, h, z), 0.009, steel, M.Metal, Z.Trim);
    b.slot = M.Rubber;
    b.tag = Z.Trim;
    b.push().translate(x, h, z);
    b.geometry(new THREE.SphereGeometry(0.025, 12, 8), black);
    b.pop();
  }
  // Rear seats removed in the MkII-inspired layout: drawers, water and a fridge instead.
  b.block(0, 0.585, 1.475, 1.25, 0.21, 1.5, dark, M.Fabric, Z.Trim, 0.018);
  for (const x of [-0.32, 0.32]) {
    b.block(x, 0.579, 2.233, 0.59, 0.16, 0.022, black, M.Metal, Z.Trim, 0.006);
    b.rod(v(x - 0.08, 0.59, 2.252), v(x + 0.08, 0.59, 2.252), 0.009, steel, M.Metal, Z.Trim);
  }
  b.block(-0.32, 0.94, 1.6, 0.54, 0.48, 0.65, new THREE.Color('#727E80'), M.Metal, Z.Trim, 0.035);
  b.block(-0.32, 1.189, 1.6, 0.55, 0.032, 0.66, black, M.Rubber, Z.Trim, 0.018);
  for (const x of [-0.56, -0.08]) b.block(x, 0.99, 1.934, 0.022, 0.1, 0.028, black, M.Rubber, Z.Trim, 0.006);
  b.block(0.35, 0.85, 1.85, 0.3, 0.32, 0.2, new THREE.Color('#969F8E'), M.Paint, Z.Trim, 0.025);
  b.block(0.35, 1.024, 1.85, 0.16, 0.04, 0.06, black, M.Rubber, Z.Trim, 0.008);
  b.block(0.28, 0.82, 1.19, 0.53, 0.27, 0.5, new THREE.Color('#6D705E'), M.Fabric, Z.Trim, 0.04);
}
function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: number, text: string) {
  const glyphs: Record<string, string[]> = {
    '0': ['111', '101', '101', '101', '111'],
    '1': ['010', '110', '010', '010', '111'],
    '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'],
    '4': ['101', '101', '111', '001', '001'],
    '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'],
    '7': ['111', '001', '010', '010', '010'],
    '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
    M: ['10001', '11011', '10101', '10001', '10001'],
    K: ['101', '110', '100', '110', '101'],
    ' ': ['000', '000', '000', '000', '000'],
  };
  b.push()
    .translate(x, y, z)
    .rotate(0, facing < 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.34, 0.105, 0.016, black, M.Rubber, Z.Trim, 0.007);
  b.block(0, 0, 0.011, 0.32, 0.087, 0.008, new THREE.Color('#E3E5DD'), M.Paint, Z.Trim, 0.004);
  let xx = -0.132;
  for (const char of text) {
    const gl = glyphs[char];
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < gl[row].length; col++)
        if (gl[row][col] === '1')
          b.block(
            xx + col * 0.009,
            -0.025 + (4 - row) * 0.012,
            0.018,
            0.0085,
            0.0115,
            0.004,
            black,
            M.Rubber,
            Z.Trim,
          );
    xx += (gl[0].length + 1) * 0.009;
  }
  b.pop();
}
/** Factory bumpers, used when the vehicle is drawn without its touring gear. */
function stockBumpers(b: VehicleBuilder) {
  b.block(0, 0.12, F - 0.03, 1.84, 0.28, 0.12, dark, M.Rubber, Z.Front, 0.04);
  for (const side of [-1, 1])
    b.block(side * 0.87, 0.12, F + 0.07, 0.12, 0.28, 0.26, dark, M.Rubber, Z.Front, 0.04);
  b.block(0, 0.11, TAIL + 0.035, 1.84, 0.22, 0.13, dark, M.Rubber, Z.Rear, 0.04);
  for (const side of [-1, 1])
    b.block(side * 0.87, 0.11, TAIL - 0.17, 0.12, 0.22, 0.42, dark, M.Rubber, Z.Rear, 0.04);
}
function bullbar(b: VehicleBuilder) {
  const face = F - 0.22,
    back = F - 0.03;
  const p = new THREE.Shape(
    rounded([
      [-0.73, -face],
      [0.73, -face],
      [0.99, -face - 0.11],
      [1.01, -back],
      [-1.01, -back],
      [-0.99, -face - 0.11],
    ]),
  );
  const pan = new THREE.ExtrudeGeometry(p, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 3,
  });
  pan.rotateX(-Math.PI / 2);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push().translate(0, 0.105, 0);
  b.geometry(pan, black);
  b.pop();
  for (const x of [-0.31, 0.31])
    b.block(x, 0.17, back + 0.1, 0.08, 0.15, 0.34, black, M.Metal, Z.Trim, 0.006);
  const zc = (face + back) / 2,
    zt = F - 0.12;
  tube(
    b,
    [
      [-0.43, 0.32, zc],
      [-0.43, 0.79, zt],
      [0.43, 0.79, zt],
      [0.43, 0.32, zc],
    ],
    0.031,
    black,
    Z.Front,
  );
  const yy = 0.65,
    zz = zc + ((zt - zc) * (yy - 0.32)) / (0.79 - 0.32);
  for (const side of [-1, 1]) {
    tube(
      b,
      [
        [side * 0.99, 0.32, zc + 0.04],
        [side * 0.99, 0.67, zt + 0.05],
        [side * 0.84, 0.7, zz],
        [side * 0.43, yy, zz],
      ],
      0.028,
      black,
      Z.Front,
    );
    for (const x of [side * 0.43, side * 0.99])
      b.block(
        x,
        0.322,
        zc + (Math.abs(x) > 0.9 ? 0.04 : 0),
        0.075,
        0.04,
        0.12,
        black,
        M.Metal,
        Z.Front,
        0.004,
      );
  }
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the pierced hawse fairlead in the face. Until v2.13 its drum and red motor stood on
  // the pan in front of the grille.
  b.block(0, 0.345, zc + 0.02, 0.18, 0.05, 0.09, black, M.Rubber, Z.Front, 0.012);
  const fair = rectangle(-0.16, 0.17, 0.16, 0.28, 0.025);
  fair.holes.push(new THREE.Path(rectangle(-0.11, 0.203, 0.11, 0.247, 0.018).getPoints(16).reverse()));
  extrudeZ(b, fair, face - 0.055, face - 0.025, steel, M.Metal, Z.Front, 0.002);
  b.ring(0, 0.195, face - 0.084, 0.024, 0.008, new THREE.Color('#C13C2C'), M.Paint, 'z', Z.Front);
  for (const x of [-0.225, 0.225]) {
    b.block(x, 0.377, zt - 0.1, 0.055, 0.11, 0.07, black, M.Metal, Z.Front, 0.007);
    b.slot = M.Rubber;
    b.tag = Z.Front;
    b.push()
      .translate(x, 0.545, zt - 0.1)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.105, 0.091, 0.075, 32), black);
    b.pop();
    b.ring(x, 0.545, zt - 0.142, 0.101, 0.007, steel, M.Metal, 'z', Z.Front);
    b.slot = M.DrivingLamp;
    b.push()
      .translate(x, 0.545, zt - 0.148)
      .scale(1, 1, 0.12);
    b.geometry(new THREE.SphereGeometry(0.092, 20, 8), lens);
    b.pop();
    for (const [dx, dy] of [
      [-0.042, -0.032],
      [0, -0.032],
      [0.042, -0.032],
      [-0.042, 0.032],
      [0, 0.032],
      [0.042, 0.032],
    ])
      b.block(x + dx, 0.545 + dy, zt - 0.161, 0.027, 0.028, 0.004, lens, M.DrivingLamp, Z.Front, 0.004);
  }
  for (const side of [-1, 1]) {
    b.block(side * 0.66, 0.14, face - 0.014, 0.075, 0.11, 0.06, steel, M.Metal, Z.Front, 0.008);
    b.ring(side * 0.66, 0.1, face - 0.06, 0.036, 0.01, new THREE.Color('#B93828'), M.Paint, 'x', Z.Front);
  }
  b.block(-0.5, 0.215, face - 0.03, 0.36, 0.13, 0.025, black, M.Metal, Z.Front, 0.005);
  plate(b, -0.5, 0.215, face - 0.049, -1, '80 MK2');
  // Aerial base is bolted to the outer bar wing.
  b.block(0.83, 0.704, zt + 0.015, 0.075, 0.045, 0.08, black, M.Rubber, Z.Front, 0.01);
  b.rod(v(0.83, 0.725, zt + 0.015), v(0.85, 1.53, zt + 0.04), 0.006, black, M.Rubber, Z.Front);
}
function sideProtectionAndIntake(b: VehicleBuilder) {
  for (const side of [-1, 1]) {
    // Scrub rail from the bar along the wing, above the flare, down to the slider.
    tube(
      b,
      [
        // It starts inside the bar's side upright (from F - 0.04 its end stood 4 mm short of it).
        [side * 0.99, 0.62, F - 0.075],
        [side * 0.975, 0.62, -1.7],
        [side * 0.975, 0.6, -0.9],
        [side * 1.0, 0.46, -0.745],
        [side * 1.015, 0.04, -0.74],
      ],
      0.026,
    );
    line(
      b,
      [
        [side * 1.015, 0.04, -0.74],
        [side * 1.015, 0.04, 0.75],
      ],
      0.03,
      black,
      Z.Trim,
      M.Metal,
      12,
    );
    b.block(side * 0.985, 0.048, 0.005, 0.16, 0.028, 1.47, black, M.Metal, Z.Trim, 0.012);
    for (const z of [-0.45, 0.2, 0.65])
      b.rod(v(side * 0.43, 0.01, z), v(side * 1.015, 0.04, z), 0.025, black, M.Metal, Z.Trim);
  }
  // Four-inch stainless intake climbs the right windscreen pillar, with attached clamps. It
  // rises out of its base on the wing, bends out to the pillar and climbs it, in round bends.
  // Until v2.13 it ran into the top of the base nearly level, its open end showing, and its
  // tight bends pinched.
  const foot = v(0.975, 0.93, -0.62),
    head = v(0.955, 1.31, -0.27);
  b.block(0.8, 0.745, -0.86, 0.18, 0.06, 0.18, black, M.Rubber, Z.Front, 0.02);
  continuousTube(
    b,
    [v(0.8, 0.73, -0.86), v(0.8, 0.87, -0.86), foot, head],
    0.0508,
    steel,
    Z.Front,
    M.Metal,
    ROUND_BEND,
  );
  const up = head.clone().sub(foot).normalize();
  for (const t of [0.3, 0.72]) {
    const p = foot.clone().lerp(head, t);
    b.push().translate(p.x, p.y, p.z).rotate(Math.atan2(up.z, up.y), 0, 0);
    b.ring(0, 0, 0, 0.054, 0.004, black, M.Rubber, 'y', Z.Front);
    b.pop();
    b.rod(p, v(xAt(p.y) - 0.005, p.y, pillarZ(p.y) + 0.03), 0.009, black, M.Metal, Z.Front);
  }
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push().translate(0.955, 1.365, -0.245).rotate(-0.2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.065, 0.053, 0.11, 24), steel);
  b.pop();
  b.push().translate(0.955, 1.418, -0.256).rotate(-0.2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.07, 0.016, 24), black);
  b.pop();
}
/** Roof height under a point of the rack, so its feet stand on the panel. */
function roofAt(x: number, z: number) {
  const y = roofEdge(z),
    u = x / xAt(y);
  return y + CROWN * (1 - u * u) * smooth((z - ATOP) / 0.45);
}
const RACK0 = -0.17,
  RACK1 = 1.9;
function roofEquipment(b: VehicleBuilder) {
  // A full-length slatted platform on backbone rails standing on the roof.
  const mid = (RACK0 + RACK1) / 2,
    len = RACK1 - RACK0;
  for (const side of [-1, 1]) {
    const rail = side * 0.66;
    for (const z of [-0.05, 0.6, 1.25, 1.8]) {
      const foot = roofAt(rail, z);
      b.block(rail, foot + 0.012, z, 0.12, 0.03, 0.12, black, M.Rubber, Z.Roof, 0.008);
      b.block(rail, (foot + 1.41) / 2 + 0.012, z, 0.055, 1.41 - foot, 0.08, black, M.Metal, Z.Roof, 0.006);
    }
    b.block(rail, 1.433, mid, 0.045, 0.05, len - 0.2, black, M.Metal, Z.Roof, 0.008);
    b.block(side * 0.79, 1.475, mid, 0.035, 0.06, len, black, M.Metal, Z.Roof, 0.01);
  }
  for (const z of [RACK0 + 0.0225, RACK1 - 0.0225])
    b.block(0, 1.475, z, 1.61, 0.06, 0.045, black, M.Metal, Z.Roof, 0.01);
  for (let i = 0; i < 10; i++)
    b.block(-0.72 + i * 0.16, 1.476, mid, 0.074, 0.035, len - 0.04, black, M.Metal, Z.Roof, 0.005);
  // 50 inch dual-row roof light bar; two bolted end brackets meet the platform frame.
  for (const x of [-0.642, 0.642])
    b.block(x, 1.505, RACK0 - 0.012, 0.045, 0.09, 0.075, steel, M.Metal, Z.Roof, 0.006);
  b.block(0, 1.535, RACK0 - 0.046, 1.285, 0.079, 0.085, black, M.Metal, Z.Roof, 0.012);
  for (let i = 0; i < 30; i++)
    for (const y of [1.519, 1.55])
      b.block(-0.598 + i * 0.0412, y, RACK0 - 0.092, 0.03, 0.023, 0.008, lens, M.DrivingLamp, Z.Roof, 0.004);
  // Passenger-side awning bag and three closed mounting brackets.
  for (const z of [0.05, 0.85, 1.65]) {
    b.block(-0.887, 1.47, z, 0.22, 0.035, 0.075, steel, M.Metal, Z.Roof, 0.005);
    b.block(-0.975, 1.49, z, 0.035, 0.1, 0.075, steel, M.Metal, Z.Roof, 0.005);
  }
  b.block(-1.019, 1.515, 0.86, 0.145, 0.145, 1.95, new THREE.Color('#353B37'), M.Fabric, Z.Roof, 0.045);
  for (const z of [0.12, 0.86, 1.6])
    b.block(-1.095, 1.52, z, 0.012, 0.14, 0.043, black, M.Rubber, Z.Roof, 0.004);
  // Compact camp lights sit on visible platform brackets.
  for (const side of [-1, 1])
    for (const z of [0.25, 1.6]) {
      b.block(side * 0.82, 1.458, z, 0.065, 0.045, 0.085, black, M.Metal, Z.Roof, 0.008);
      b.block(side * 0.855, 1.46, z, 0.012, 0.025, 0.06, lens, M.DrivingLamp, Z.Roof, 0.004);
    }
}
function rearCarrier(b: VehicleBuilder, w: THREE.BufferGeometry) {
  b.block(0, 0.16, TAIL + 0.086, 1.96, 0.2, 0.21, black, M.Metal, Z.Rear, 0.025);
  for (const side of [-1, 1])
    b.block(side * 0.82, 0.18, TAIL - 0.005, 0.18, 0.16, 0.23, black, M.Metal, Z.Rear, 0.025);
  const x = 0.43,
    y = 0.75,
    z = TAIL + 0.39;
  markPart(b, 128, () => {
    b.block(0.88, 0.31, TAIL + 0.11, 0.09, 0.37, 0.1, steel, M.Metal, Z.Rear, 0.012);
    tube(
      b,
      [
        // Its lower run is in the middle of the post (at TAIL + 0.13 it showed through the post's
        // rounded back corner).
        [0.88, 0.3, TAIL + 0.11],
        [0.88, 0.65, TAIL + 0.13],
        [x, 0.75, z - 0.2],
      ],
      0.028,
      black,
      Z.Rear,
    );
    b.block(x, y, z - 0.22, 0.25, 0.24, 0.055, black, M.Metal, Z.Rear, 0.008);
    b.rod(v(x, y, z - 0.22), v(x, y, z - 0.1), 0.045, black, M.Metal, Z.Rear);
    b.block(-0.45, 0.29, TAIL + 0.145, 0.12, 0.05, 0.055, steel, M.Metal, Z.Rear, 0.006);
  });
  markPart(b, 64, () => {
    b.tag = Z.Rear;
    mountSpare(b, w, { x, y, z }, 'back', black);
  });
  b.block(0, 0.035, TAIL + 0.18, 0.11, 0.07, 0.18, black, M.Metal, Z.Rear, 0.008);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(0, 0.1, TAIL + 0.25);
  b.geometry(new THREE.SphereGeometry(0.027, 12, 8), steel);
  b.pop();
}
export function buildBodyCore(t: VehicleTuning, w: THREE.BufferGeometry, modified: boolean) {
  reviewRanges.length = 0;
  const b = new VehicleBuilder();
  lowerBody(b);
  flares(b);
  sideDetails(b);
  bonnet(b);
  glasshouse(b);
  frontEnd(b);
  rearEnd(b);
  chassis(b, t);
  interior(b, t);
  markPart(b, 8, () => roof(b));
  if (modified) {
    markPart(b, 1, () => bullbar(b));
    sideProtectionAndIntake(b);
    markPart(b, 2, () => roofEquipment(b));
    markPart(b, 4, () => rearCarrier(b, w));
  } else stockBumpers(b);
  return cleanGeometry(attachParts(b.build()));
}
export function buildVehicleBody(t: VehicleTuning, w: THREE.BufferGeometry) {
  return buildBodyCore(t, w, true);
}
/** Two pairs of recovery boards: four boards, each with moulded handles and traction teeth. */
export function buildRackPlank(index: number) {
  const b = new VehicleBuilder(),
    x = index === 0 ? -0.29 : 0.26;
  for (const y of [1.535, 1.59]) {
    // A plain slab with the two hand holes: no bevel, and three corner steps, since the
    // boards are 1.5 m up on the rack. The top board keeps its 51 teeth as plain blocks
    // (the lower board's teeth sit under the top one, so it gets three ridges).
    const body = new THREE.Shape(
      rounded(
        [
          [-0.155, -0.58, 0.05],
          [0.155, -0.58, 0.05],
          [0.166, -0.45, 0.03],
          [0.166, 0.45, 0.03],
          [0.155, 0.58, 0.05],
          [-0.155, 0.58, 0.05],
          [-0.166, 0.45, 0.03],
          [-0.166, -0.45, 0.03],
        ],
        3,
      ),
    );
    for (const z of [-0.38, 0.38])
      body.holes.push(
        new THREE.Path(
          rectangle(-0.095, z - 0.045, 0.095, z + 0.045, 0.018, 2)
            .getPoints(1)
            .reverse(),
        ),
      );
    const g = new THREE.ExtrudeGeometry(body, { depth: 0.027, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    b.slot = M.Fabric;
    b.tag = Z.Roof;
    b.push().translate(x, y, 0.9);
    b.geometry(g, orange);
    b.pop();
    for (const xx of [-0.11, 0, 0.11])
      if (y > 1.55)
        for (let j = 0; j < 17; j++)
          b.block(x + xx, y + 0.0435, 0.4 + j * 0.062, 0.026, 0.023, 0.026, steel, M.Metal, Z.Roof);
      else b.block(x + xx, y + 0.0435, 0.896, 0.026, 0.023, 1.018, steel, M.Metal, Z.Roof);
  }
  for (const z of [0.53, 1.27]) {
    b.block(x, 1.51, z, 0.34, 0.04, 0.06, black, M.Metal, Z.Roof, 0.006);
    for (const dx of [-0.12, 0.12])
      b.rod(v(x + dx, 1.51, z), v(x + dx, 1.69, z), 0.007, steel, M.Metal, Z.Roof);
    b.block(x, 1.653, z, 0.32, 0.022, 0.045, black, M.Rubber, Z.Roof, 0.005);
  }
  return cleanGeometry(b.build());
}
