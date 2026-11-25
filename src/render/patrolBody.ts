import * as THREE from 'three';
import { badgeText, plateText } from './patrolLettering';
import { continuousTube, subdivideSurface, cleanGeometry } from './bodyRefinement';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addPatrolInterior } from './patrolInterior';
import { patrolColors } from './patrolPaint';
import {
  cornerWrap,
  extrudeX as extrudePanel,
  extrudeZ,
  frontPane,
  inset,
  rounded,
  roundHeadlamp,
  sidePane,
  sideShape,
  type Vtx,
} from './bodyShapes';
import { mirrorHead } from './mirrors';
import { mountSpare, spareSidewall } from './spares';

/** Panels as `extrudePanel`, with an 18 mm crown on the bonnet top and the thin side skins split finer, so the bow pressed into the sides at the end of `buildPatrolBody` bends them smoothly. */
function extrudeX(
  b: VehicleBuilder,
  shape: THREE.Shape,
  x0: number,
  x1: number,
  color: THREE.Color,
  slot: number,
  zone: number,
  bevel: number,
  wells: [number, number][] = [],
  segments = 3,
  ratio = 0.8,
  keep?: 'above' | 'below',
): void {
  const reshape = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const shaped = shapePanel(g);
    return keep ? cutAtSplit(shaped, keep === 'above') : shaped;
  };
  const shapePanel = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    if (zone === Z.Sides && slot === M.Paint && x1 - x0 < 0.08)
      return subdivideSurface(g, (_p, n) => Math.abs(n.x) > 0.5, 1);
    if (zone !== Z.Front || slot !== M.Paint || x1 - x0 <= 1.6) return g;
    g = subdivideSurface(g, (p, n) => p.y > 0.6 && n.y > 0.6, 2);
    const p = g.getAttribute('position'),
      n = g.getAttribute('normal');
    const smooth = (t: number) => {
      t = Math.max(0, Math.min(1, t));
      return t * t * (3 - 2 * t);
    };
    const crown = (x: number, z: number) =>
      0.018 * Math.max(0, 1 - (x / 0.74) ** 2) * smooth((z + 2.23) / 0.1) * smooth((-0.9 - z) / 0.1);
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) > 0.6 && n.getY(i) > 0.4) {
        const x = p.getX(i) + x0 + bevel,
          z = p.getZ(i),
          eps = 0.0001;
        const dx = (crown(x + eps, z) - crown(x - eps, z)) / (2 * eps),
          dz = (crown(x, z + eps) - crown(x, z - eps)) / (2 * eps);
        p.setY(i, p.getY(i) + crown(x, z));
        const v = new THREE.Vector3(
          n.getX(i) - dx * n.getY(i),
          n.getY(i),
          n.getZ(i) - dz * n.getY(i),
        ).normalize();
        n.setXYZ(i, v.x, v.y, v.z);
      }
    return g;
  };
  extrudePanel(b, shape, x0, x1, color, slot, zone, bevel, wells, segments, ratio, reshape);
}

/**
 * GQ Patrol wagon body: a front clip with rounded shoulders and front corners and a bonnet
 * sloping gently to the nose with a raised centre and a thick front edge over a grey front
 * panel (three grille openings, NISSAN across them, round lamps in square recesses), square GQ wheel openings under flat-topped flares, panels
 * with rounded edges, a glasshouse with its pillars and window rubbers, door mirrors on
 * black sails, and a wide ARB-style bar with driving lamps under its top rail (x across,
 * y up, z back; the ground 0.51 m below the origin when parked).
 * Photographs and dimensions: reference/vehicles/nissan-gq-patrol/SOURCES.md.
 */
const { paint, lower, flare, bar, trim } = patrolColors;
const black = new THREE.Color('#1B1E1F'),
  rubber = new THREE.Color('#202325'),
  steel = new THREE.Color('#A2A6A6'),
  chrome = new THREE.Color('#C9CDCD'),
  well = new THREE.Color('#25282A');
const red = new THREE.Color('#B12F27'),
  amber = new THREE.Color('#E59A33'),
  lens = new THREE.Color('#E6E6D8');
const glass = new THREE.Color('#9FB6B7');

const SIDE = 0.87;
/** The finished body is stretched across by this much: the flares then measure 1.93 m. */
export const WIDEN = 1.035;
const WAIST = 0.76;
const SILL = 0.02;
/** The body-side moulding's height, where the panels of the lower body are joined. */
const TWO_TONE = 0.3;
/**
 * Where the two colours meet: just under the door handles and just over the flares, along the
 * crease pressed into the body sides, as on the two-colour cars in front-34-left-1989.jpg and
 * side-right-1989.jpg. Until v2.05 they met at the moulding, 0.27 m lower.
 */
const SPLIT = 0.57;
const AXLE = 1.485;
/** Square wheel openings: half-widths at the sill and at the flat top, and the top height. */
const ARCH = { bottom: 0.58, top: 0.4, y: 0.455 };
const F = -2.27;
const BONNET_FRONT = 0.675;
const BONNET_BACK = 0.72;
const SCUTTLE = -0.8;
const SCREEN_BASE = 0.775;
const SCREEN_TOP = { y: 1.24, z: -0.5 };
const B_PILLAR = 0.3;
const C_PILLAR = 1.08;
const TAIL = 2.45;
const ROOF = 1.29;
const TUMBLE = 0.05;
/** Half-width of the bull bar's centre hoop, and how far out each driving lamp stands inside it. */
const HOOP = 0.46;
export const DRIVING_LAMP_X = 0.32;
/** The door spare's hub: on the wide right-hand door. */
const SPARE_X = 0.27,
  SPARE_Y = 0.6;
/**
 * Where the two rear doors meet. The narrow door is on the left with the handle and the plate;
 * the wide door is on the right and carries the spare (rear-34-1988.jpg, rear-34-left-1994.jpg,
 * side-right-1989.jpg). Until v2.04 the split was at +0.16, the mirror image.
 */
const DOOR_SPLIT = -0.16;
/** The front clip: where it meets the front doors, its top there, and the radius its
 * shoulders and front corners are rounded to (across the car, and `ratio` of it along). */
const CLIP = { back: SCUTTLE, backTop: 0.745, round: 0.11, ratio: 0.6 };

/** Half-width of a wheel opening at height y. */
function archHalf(y: number): number {
  const t = (y - SILL) / (ARCH.y - SILL);
  return ARCH.bottom + (ARCH.top - ARCH.bottom) * t;
}

/** The opening's outline from height y on its back side, over the top and down to y on its front side. */
function archPath(axle: number, y: number, grow = 0, r = 0.1): Vtx[] {
  const w = archHalf(y) + grow;
  return [
    [axle + w, y],
    [axle + ARCH.top + grow, ARCH.y + grow, r + grow],
    [axle - ARCH.top - grow, ARCH.y + grow, r + grow],
    [axle - w, y],
  ];
}

const v = (x: number, y: number, z: number) => ({ x, y, z });

/**
 * The part of a panel above (or below) the two-colour line, cut cleanly along it. A panel that
 * crosses the line is built once and drawn twice, each half in its own colour, so the colours
 * meet on one straight line round the rounded shoulders and corners, with no groove between
 * two separately rounded pieces.
 */
function cutAtSplit(source: THREE.BufferGeometry, above: boolean): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.getAttribute(n));
  const sizes = attrs.map((a) => a.itemSize);
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((sum, n) => sum + n, 0));
  const yAt = offsets[names.indexOf('position')] + 1;
  const read = (i: number) =>
    attrs.flatMap((a) => Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k)));
  const inside = (p: number[]) => (above ? p[yAt] >= SPLIT : p[yAt] <= SPLIT);
  const out: number[][] = [];
  for (let i = 0; i < attrs[0].count; i += 3) {
    const tri = [read(i), read(i + 1), read(i + 2)];
    const poly: number[][] = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k],
        c = tri[(k + 1) % 3];
      if (inside(a)) poly.push(a);
      if (inside(a) !== inside(c)) {
        const t = (SPLIT - a[yAt]) / (c[yAt] - a[yAt]);
        poly.push(a.map((value, j) => value + (c[j] - value) * t));
      }
    }
    for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
  }
  const cut = new THREE.BufferGeometry();
  names.forEach((name, n) => {
    const data = new Float32Array(out.length * sizes[n]);
    out.forEach((p, i) => data.set(p.slice(offsets[n], offsets[n] + sizes[n]), i * sizes[n]));
    cut.setAttribute(name, new THREE.BufferAttribute(data, sizes[n]));
  });
  return cut;
}

function lowerBody(b: VehicleBuilder): void {
  const wells: [number, number][] = [
    [-AXLE, -0.05],
    [AXLE, -0.05],
  ];
  const t = TWO_TONE;
  // Upper body panel from the front doors to the tail, with the top of the rear opening cut in:
  // white above the two-colour line and the lower colour below it.
  const upper = sideShape([
    [CLIP.back + 0.005, t],
    [CLIP.back + 0.005, CLIP.backTop - 0.01],
    [SCUTTLE + 0.02, WAIST, 0.05],
    [TAIL, WAIST, 0.03],
    [TAIL, t],
    ...archPath(AXLE, t),
  ]);
  // Lower body panels below the moulding, between and behind the openings.
  const lowerParts: Vtx[][] = [
    [
      [-AXLE + archHalf(SILL), SILL],
      [-AXLE + archHalf(t), t],
      [AXLE - archHalf(t), t],
      [AXLE - archHalf(SILL), SILL],
    ],
    [
      [AXLE + archHalf(SILL), SILL],
      [AXLE + archHalf(t), t],
      [TAIL, t],
      [TAIL, SILL + 0.03, 0.03],
      [TAIL - 0.03, SILL],
    ],
  ];
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? SIDE - 0.05 : -SIDE,
      x1 = x0 + 0.05;
    extrudeX(b, upper, x0, x1, paint, M.Paint, Z.Sides, 0.018, wells, 3, 0.8, 'above');
    extrudeX(b, upper, x0, x1, lower, M.Paint, Z.Sides, 0.018, wells, 3, 0.8, 'below');
    for (const p of lowerParts) extrudeX(b, sideShape(p), x0, x1, lower, M.Paint, Z.Sides, 0.018, wells);
    // Flat-topped flares round the openings, standing out from the body.
    for (const axle of [-AXLE, AXLE]) {
      const foot = SILL - 0.03;
      const shape = sideShape([
        ...archPath(axle, foot, 0.09, 0.08).reverse(),
        ...archPath(axle, foot, 0, 0.08),
      ]);
      // archPath runs back-to-front; the reversed outer run and the inner run close the band.
      extrudeX(
        b,
        shape,
        side > 0 ? SIDE - 0.03 : -SIDE - 0.065,
        side > 0 ? SIDE + 0.065 : -SIDE + 0.03,
        flare,
        M.Rubber,
        axle < 0 ? Z.Front : Z.Rear,
        0.025,
      );
      // Dark wheelhouse: an inner wall and a roof over the tyre.
      const wellX = axle < 0 ? 0.38 : 0.59;
      b.block(side * wellX, 0.17, axle, 0.03, 0.5, ARCH.bottom * 2, well, M.Rubber, Z.Trim);
      b.block(
        (side * (wellX + SIDE - 0.05)) / 2,
        ARCH.y + 0.035,
        axle,
        SIDE - 0.05 - wellX,
        0.02,
        ARCH.top * 2 + 0.1,
        well,
        M.Rubber,
        Z.Trim,
      );
      for (const dz of [-1, 1])
        b.block(
          (side * (wellX + SIDE - 0.05)) / 2,
          0.2,
          axle + dz * 0.62,
          SIDE - 0.05 - wellX,
          0.4,
          0.02,
          well,
          M.Rubber,
          Z.Trim,
        );
    }
  }
}

function bonnetAndFace(b: VehicleBuilder): void {
  // The front clip in two pieces joined at the moulding's height, with the bonnet and guard
  // tops sloping down to the nose; both with the front wheel opening cut in and their shoulders
  // and front corners well rounded. The upper piece is white above the two-colour line and the
  // lower colour below it.
  const t = TWO_TONE,
    R = CLIP.round;
  const clip = (shape: Vtx[], color: THREE.Color, keep?: 'above' | 'below') =>
    extrudeX(
      b,
      sideShape(shape),
      -SIDE,
      SIDE,
      color,
      M.Paint,
      Z.Front,
      R,
      [[-AXLE, -0.05]],
      6,
      CLIP.ratio,
      keep,
    );
  const upperClip: Vtx[] = [
    [F, t],
    [F, BONNET_FRONT, 0.07],
    [SCUTTLE - 0.12, BONNET_BACK],
    // A sharp corner in profile: rounded 2 cm, less than the 6.6 cm the clip's edges are drawn in
    // by, it folded over itself and showed as crumpled facets at the top back corner of each guard.
    [CLIP.back, CLIP.backTop],
    [CLIP.back, t],
    ...archPath(-AXLE, t),
  ];
  clip(upperClip, paint, 'above');
  clip(upperClip, lower, 'below');
  clip(
    [
      // Sharp in profile, like the clip's top back corner: rounded 4 cm it folded over itself and
      // showed as a dark facet under the guard's front lower edge.
      [F, SILL + 0.04],
      [F, t],
      [-AXLE - archHalf(t), t],
      [-AXLE - archHalf(SILL), SILL],
      [F + 0.1, SILL],
    ],
    lower,
  );
  const top = (z: number) => BONNET_FRONT + ((z - F) / (SCUTTLE - 0.12 - F)) * (BONNET_BACK - BONNET_FRONT);
  // Shut lines between the bonnet and the guard tops.
  for (const side of [-1, 1])
    b.rod(
      v(side * 0.74, top(F + 0.06) + 0.002, F + 0.06),
      v(side * 0.74, top(SCUTTLE - 0.13) + 0.002, SCUTTLE - 0.13),
      0.004,
      black,
      M.Rubber,
      Z.Front,
    );
  // Cowl panel under the windscreen with its vent slots.
  b.block(0, 0.715, SCUTTLE - 0.06, 1.56, 0.12, 0.14, paint, M.Paint, Z.Front, 0.02);
  for (let i = 0; i < 14; i++)
    b.block(-0.52 + i * 0.08, 0.777, SCUTTLE - 0.07, 0.05, 0.004, 0.06, black, M.Rubber, Z.Front);

  // The bonnet's thick front edge overhangs the grille, and a raised centre panel runs back
  // from it (front-34-1988.jpg, front-34-left-1989.jpg).
  b.block(0, BONNET_FRONT - 0.03, F - 0.018, 1.5, 0.055, 0.07, paint, M.Paint, Z.Front, 0.02);
  const rise = Math.atan2(BONNET_BACK - BONNET_FRONT, SCUTTLE - 0.12 - F),
    bz0 = F + 0.05,
    bz1 = SCUTTLE - 0.16;
  b.push()
    .translate(0, top((bz0 + bz1) / 2) + 0.012, (bz0 + bz1) / 2)
    .rotate(-rise, 0, 0);
  b.block(0, 0, 0, 0.92, 0.03, bz1 - bz0, paint, M.Paint, Z.Front, 0.014);
  b.pop();

  // Front panel (Series 1, front-34-1988.jpg): a grey moulded panel across the front with
  // three grille openings of horizontal slats between the lamps, big NISSAN letters across
  // the middle, a round 7 inch headlamp in a square recess at each end, and the park lamp
  // and indicator wrapped round each guard corner outboard of the headlamps.
  const gy = 0.48;
  const facia = new THREE.Color('#5E6264');
  const slat = trim.clone().multiplyScalar(1.35);
  b.block(0, gy, F - 0.002, 1.56, 0.25, 0.02, facia, M.Rubber, Z.Front, 0.014);
  for (const cx of [-0.3, 0, 0.3]) {
    b.block(cx, gy - 0.005, F - 0.008, 0.24, 0.17, 0.012, black, M.Rubber, Z.Front, 0.006);
    for (let i = 0; i < 5; i++)
      b.block(cx, gy - 0.072 + i * 0.034, F - 0.016, 0.23, 0.016, 0.012, slat, M.Rubber, Z.Front, 0.004);
  }
  const glyphs: Record<string, string[]> = {
    N: ['10001', '11001', '10101', '10011', '10001'],
    I: ['00100', '00100', '00100', '00100', '00100'],
    S: ['11111', '10000', '11111', '00001', '11111'],
    A: ['01110', '10001', '11111', '10001', '10001'],
  };
  const letter = new THREE.Color('#E8E8E2');
  const word = 'NISSAN',
    px = 0.012,
    py = 0.016,
    pitch = 0.072,
    x0 = (word.length * pitch - (pitch - 5 * px)) / 2 - px / 2;
  [...word].forEach((ch, k) =>
    glyphs[ch].forEach((row, j) =>
      [...row].forEach((pixel, i) => {
        if (pixel === '1')
          b.block(
            x0 - k * pitch - i * px,
            gy + 2 * py - j * py,
            F - 0.026,
            px * 1.02,
            py * 1.02,
            0.008,
            letter,
            M.Metal,
            Z.Front,
          );
      }),
    ),
  );
  for (const side of [-1, 1]) {
    const x = side * 0.645;
    // Square recess round the lamp, then the lamp itself.
    b.block(x, gy, F - 0.012, 0.23, 0.21, 0.012, black.clone().multiplyScalar(0.8), M.Rubber, Z.Front, 0.02);
    roundHeadlamp(b, x, gy, F - 0.018, 0.089, lens, chrome, black);
    // Corner lamp wrapped round the guard corner: clear park lamp on top, amber indicator
    // below, in a black housing.
    const cx = side * (SIDE - R),
      cz = F + CLIP.ratio * R,
      rz = CLIP.ratio * R;
    cornerWrap(b, side, cx, cz, R + 0.003, rz + 0.003, gy, 0.225, black, M.Rubber, Z.Front);
    cornerWrap(b, side, cx, cz, R + 0.008, rz + 0.008, gy + 0.055, 0.09, lens, M.Lamp, Z.Front, 0.03, 0.97);
    cornerWrap(b, side, cx, cz, R + 0.008, rz + 0.008, gy - 0.05, 0.1, amber, M.Amber, Z.Front, 0.03, 0.97);
    // Side repeater on the guard behind the wheel.
    b.block(side * (SIDE + 0.004), 0.48, -0.88, 0.012, 0.03, 0.07, amber, M.Amber, Z.Front, 0.006);
  }
  // The steering damper and the sump guard.
  b.block(0, -0.12, -1.72, 0.7, 0.03, 0.6, bar, M.Metal, Z.Trim);
  b.rod({ x: -0.5, y: -0.08, z: -1.62 }, { x: 0.35, y: -0.06, z: -1.62 }, 0.022, black);
}

function tubePath(b: VehicleBuilder, pts: ReturnType<typeof v>[], r: number, color: THREE.Color): void {
  continuousTube(
    b,
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    r,
    color,
    Z.Front,
    M.Rubber,
  );
}

/**
 * Wide steel bar: a deep pan with its wings swept back past the guard corners, a centre
 * hoop over the grille and loops over the headlamps, the winch fairlead in the pan, the
 * indicators in the wings and two driving lamps under its top rail.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z;
  const back = F - 0.03;
  const zc = (face + back) / 2;
  const panY = 0.12,
    panH = 0.3;
  const outline = new THREE.Shape();
  const perimeter = [
    [-1.0, face + 0.22],
    [-0.89, face + 0.04],
    [-0.62, face],
    [0.62, face],
    [0.89, face + 0.04],
    [1.0, face + 0.22],
    [0.93, back + 0.1],
    [0.68, back],
    [-0.68, back],
    [-0.93, back + 0.1],
  ];
  perimeter.forEach(([x, z], i) => (i ? outline.lineTo(x, z) : outline.moveTo(x, z)));
  outline.closePath();
  const pan = new THREE.ExtrudeGeometry(outline, {
    depth: panH,
    bevelEnabled: true,
    bevelSize: 0.009,
    bevelThickness: 0.009,
    bevelSegments: 2,
    steps: 1,
  });
  pan.rotateX(Math.PI / 2);
  pan.translate(0, panY + panH / 2, 0);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.geometry(pan, bar);
  for (const side of [-1, 1]) {
    b.push()
      .translate(side * 0.8, panY + 0.04, face + 0.014)
      .rotate(0, -side * 0.16, 0);
    b.block(0, 0, 0, 0.155, 0.075, 0.014, black, M.Rubber, Z.Front, 0.008);
    b.block(0, 0, -0.008, 0.13, 0.053, 0.008, amber, M.Amber, Z.Front, 0.005);
    b.pop();
  }
  const top = panY + panH / 2,
    zt = F - 0.09;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const zAt = (y: number) => zc + 0.01 + ((y - top) / (0.78 - top)) * (zt - zc - 0.01);
  continuousTube(
    b,
    [
      V(-HOOP, top - 0.018, zAt(top)),
      V(-HOOP, 0.78, zAt(0.78)),
      V(HOOP, 0.78, zAt(0.78)),
      V(HOOP, top - 0.018, zAt(top)),
    ],
    0.032,
    bar,
  );
  // Branch ends penetrate the centre posts; their bases penetrate the swept bumper.
  for (const side of [-1, 1]) {
    continuousTube(
      b,
      [
        V(side * (HOOP - 0.006), 0.67, zAt(0.67)),
        V(side * 0.91, 0.65, zt + 0.07),
        V(side * 0.92, top - 0.018, back + 0.01),
      ],
      0.028,
      bar,
    );
    b.block(side * HOOP, top + 0.008, zAt(top), 0.085, 0.028, 0.085, bar, M.Metal, Z.Front, 0.006);
    b.block(side * 0.92, top + 0.008, back + 0.01, 0.08, 0.028, 0.085, bar, M.Metal, Z.Front, 0.006);
    b.rod(v(side * 0.36, 0.1, back + 0.08), v(side * 0.36, 0.06, F + 0.28), 0.028, bar, M.Metal, Z.Trim);
  }
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the fairlead in the face. Until v2.04 its drum stood on the pan in front of the grille.
  b.block(0, top + 0.03, zc + 0.02, 0.2, 0.06, 0.09, trim, M.Rubber, Z.Front, 0.012);
  // Fairlead, plate and shackles on the pan face.
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.005, 0.34, 0.12, 0.02, steel, M.Metal, Z.Front, 0.006);
  b.block(m.x, m.y, face - 0.012, 0.2, 0.05, 0.015, black, M.Rubber, Z.Front);
  for (const y of [m.y - 0.032, m.y + 0.032])
    b.rod(v(m.x - 0.1, y, face - 0.03), v(m.x + 0.1, y, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.11, m.x + 0.11])
    b.rod(v(x, m.y - 0.045, face - 0.03), v(x, m.y + 0.045, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  b.block(0.44, 0.12, face - 0.012, 0.37, 0.12, 0.01, new THREE.Color('#F0EEE6'), M.Lamp, Z.Front, 0.006);
  plateText(b, 'GQ-060', 0.44, 0.12, face - 0.02, -1);
  for (const side of [-1, 1]) {
    const x = side * 0.62;
    b.block(x, -0.04, face + 0.02, 0.07, 0.08, 0.06, steel, M.Metal, Z.Trim);
    b.ring(x, -0.08, face - 0.01, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  }
  // Driving lamps standing on the pan inside the hoop, one each side of the NISSAN letters
  // (lit on high beam). At 0.19 m out they covered the letters.
  for (const side of [-1, 1]) {
    const lx = side * DRIVING_LAMP_X,
      ly = 0.48,
      lz = zt - 0.01;
    b.block(lx, 0.335, zt, 0.045, 0.14, 0.05, black, M.Metal, Z.Front, 0.005);
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.push()
      .translate(lx, ly, lz)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.085, 0.07, 0.09, 24), black);
    b.pop();
    b.ring(lx, ly, lz - 0.045, 0.08, 0.009, chrome, M.Metal, 'z', Z.Front);
    b.slot = M.DrivingLamp;
    b.push()
      .translate(lx, ly, lz - 0.047)
      .scale(1, 1, 0.3);
    b.geometry(new THREE.SphereGeometry(0.074, 20, 8), lens);
    b.pop();
  }
}

function windscreen(b: VehicleBuilder): void {
  const lean = Math.atan2(SCREEN_TOP.z - SCUTTLE, SCREEN_TOP.y - SCREEN_BASE);
  const h = Math.hypot(SCREEN_TOP.z - SCUTTLE, SCREEN_TOP.y - SCREEN_BASE);
  const wb = SIDE - 0.01,
    wt = SIDE - TUMBLE - 0.025;
  const outer: Vtx[] = [
    [-wb, 0, 0.02],
    [wb, 0, 0.02],
    [wt, h, 0.05],
    [-wt, h, 0.05],
  ];
  const hole: Vtx[] = [
    [-wb + 0.075, 0.05, 0.05],
    [wb - 0.075, 0.05, 0.05],
    [wt - 0.07, h - 0.045, 0.06],
    [-wt + 0.07, h - 0.045, 0.06],
  ];
  b.push().translate(0, SCREEN_BASE, SCUTTLE).rotate(lean, 0, 0);
  const s = new THREE.Shape(rounded(outer));
  s.holes.push(new THREE.Path(rounded(hole)));
  extrudeZ(b, s, -0.02, 0.025, paint, M.Paint, Z.Front, 0.012);
  frontPane(b, hole, -0.004, -1, rubber, M.Rubber, Z.Glass, inset(hole, 0.022));
  frontPane(b, inset(hole, 0.02), -0.006, -1, glass, M.Glass, Z.Glass);
  // Wipers parked along the bottom of the glass.
  for (const x of [0.42, -0.24]) {
    b.rod({ x, y: 0.07, z: -0.03 }, { x: x - 0.46, y: 0.12, z: -0.03 }, 0.007, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.07, z: -0.036 }, { x: x - 0.42, y: 0.11, z: -0.036 }, 0.004, black, M.Rubber, Z.Front);
  }
  b.pop();
}

/** Side glasshouse: one panel from the A pillar to the tail with its three windows, leaning in. */
function glasshouse(b: VehicleBuilder, side: number): void {
  const h = ROOF - WAIST;
  const lean = Math.atan2(TUMBLE, h);
  const aSlope = (SCREEN_TOP.z - SCUTTLE) / h;
  const aAt = (y: number, inset: number) => SCUTTLE + inset + y * aSlope;
  const outline: Vtx[] = [
    [SCUTTLE, 0],
    [SCREEN_TOP.z, h, 0.05],
    [TAIL, h, 0.05],
    [TAIL, 0],
  ];
  const lo = 0.045,
    hi = h - 0.05;
  const windows: Vtx[][] = [
    [
      [aAt(lo, 0.09), lo, 0.03],
      [B_PILLAR - 0.045, lo, 0.03],
      [B_PILLAR - 0.045, hi, 0.03],
      [aAt(hi, 0.09), hi, 0.05],
    ],
    [
      [B_PILLAR + 0.055, lo, 0.03],
      [C_PILLAR - 0.045, lo, 0.03],
      [C_PILLAR - 0.045, hi, 0.03],
      [B_PILLAR + 0.055, hi, 0.03],
    ],
    [
      [C_PILLAR + 0.055, lo, 0.03],
      [TAIL - 0.13, lo, 0.04],
      [TAIL - 0.13, hi, 0.04],
      [C_PILLAR + 0.055, hi, 0.03],
    ],
  ];
  b.push()
    .translate(side * SIDE, WAIST - 0.005, 0)
    .rotate(0, 0, side * lean);
  const x0 = side > 0 ? -0.04 : 0;
  extrudeX(b, sideShape(outline, windows), x0, x0 + 0.04, paint, M.Paint, Z.Sides, 0.01);
  for (const w of windows) {
    sidePane(b, w, side, -side * 0.014, rubber, M.Rubber, Z.Glass, inset(w, 0.022));
    sidePane(b, inset(w, 0.018), side, -side * 0.012, glass, M.Glass, Z.Glass);
  }
  // Black mirror sail filling the front window's lower front corner.
  const sail: Vtx[] = [
    [aAt(0.02, 0.07), 0.02, 0.012],
    [aAt(0.02, 0.07) + 0.19, 0.02, 0.012],
    [aAt(0.2, 0.07), 0.2, 0.012],
  ];
  extrudeX(
    b,
    sideShape(sail),
    side > 0 ? -0.022 : -0.008,
    side > 0 ? 0.008 : 0.022,
    black,
    M.Rubber,
    Z.Sides,
    0.004,
  );
  // Black louvred air vent on the D pillar at the rear side window's lower back corner.
  b.block(side * 0.005, 0.11, TAIL - 0.068, 0.016, 0.2, 0.085, black, M.Rubber, Z.Sides, 0.006);
  for (let i = 0; i < 4; i++)
    b.block(side * 0.014, 0.045 + i * 0.043, TAIL - 0.068, 0.006, 0.014, 0.06, trim, M.Rubber, Z.Sides);
  // Shut lines down the B and C pillars.
  for (const z of [B_PILLAR + 0.005, C_PILLAR + 0.005])
    b.block(side * 0.001, h / 2, z, 0.004, h - 0.02, 0.006, black, M.Rubber, Z.Sides);
  b.pop();
  // Rain gutter along the roof edge.
  b.rod(
    v(side * (SIDE - TUMBLE + 0.002), ROOF - 0.02, SCREEN_TOP.z + 0.02),
    v(side * (SIDE - TUMBLE + 0.002), ROOF - 0.02, TAIL - 0.02),
    0.012,
    paint,
    M.Paint,
    Z.Roof,
  );
}

function sides(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    const x = side * (SIDE + 0.002);
    // Door shut lines on the lower body: front door, rear door (stopping at the flare).
    for (const [z, y0] of [
      [SCUTTLE + 0.005, 0.03],
      [B_PILLAR + 0.005, 0.03],
      [C_PILLAR - 0.04, 0.53],
    ] as const)
      b.block(x, (y0 + WAIST) / 2, z, 0.006, WAIST - y0, 0.006, black, M.Rubber, Z.Sides);
    b.block(
      x,
      0.03,
      (SCUTTLE + C_PILLAR) / 2 - 0.1,
      0.006,
      0.006,
      C_PILLAR - SCUTTLE - 0.4,
      black,
      M.Rubber,
      Z.Sides,
    );
    // Body-side moulding on the two-tone line, between the flares.
    b.block(
      side * (SIDE + 0.012),
      TWO_TONE,
      0,
      0.024,
      0.05,
      2 * (AXLE - ARCH.bottom - 0.1),
      trim,
      M.Rubber,
      Z.Sides,
      0.01,
    );
    b.block(
      side * (SIDE + 0.012),
      TWO_TONE,
      (AXLE + ARCH.bottom + 0.1 + TAIL) / 2,
      0.024,
      0.05,
      TAIL - AXLE - ARCH.bottom - 0.12,
      trim,
      M.Rubber,
      Z.Sides,
      0.01,
    );
    // Pull handles near each door's back edge.
    for (const z of [B_PILLAR - 0.16, C_PILLAR - 0.2]) {
      b.block(side * (SIDE + 0.004), 0.64, z, 0.012, 0.05, 0.15, black, M.Rubber, Z.Sides, 0.008);
      b.block(side * (SIDE + 0.012), 0.64, z, 0.01, 0.022, 0.11, chrome, M.Metal, Z.Sides, 0.006);
    }
    // The crease pressed along the body side at the two-colour line, in lengths that stop at
    // each shut line: one unbroken bead bridged the gaps between the panels.
    for (const [from, to] of [
      [F + 0.14, SCUTTLE - 0.03],
      [SCUTTLE + 0.03, B_PILLAR - 0.005],
      [B_PILLAR + 0.015, C_PILLAR - 0.05],
      [C_PILLAR - 0.03, TAIL - 0.03],
    ])
      b.block(
        side * SIDE,
        SPLIT,
        (from + to) / 2,
        0.006,
        0.012,
        to - from,
        lower.clone().multiplyScalar(0.72),
        M.Paint,
        Z.Sides,
        0.002,
      );
    // Mud flap behind the rear wheel, hung from a strip under the body's edge.
    b.block(side * 0.775, 0.01, AXLE + ARCH.bottom + 0.04, 0.27, 0.024, 0.022, black, M.Metal, Z.Trim);
    b.block(
      side * 0.775,
      -0.14,
      AXLE + ARCH.bottom + 0.04,
      0.27,
      0.28,
      0.012,
      black,
      M.Rubber,
      Z.Trim,
      0.004,
    );
    // Rock sliders on the chassis.
    b.rod(v(side * 0.86, -0.04, -0.92), v(side * 0.86, -0.04, 0.92), 0.032, bar, M.Metal, Z.Sides);
    for (const z of [-0.7, 0, 0.7])
      b.rod(v(side * 0.86, -0.04, z), v(side * 0.5, 0.0, z), 0.022, bar, M.Metal, Z.Trim);
    // Door mirror: a short neck out of the sail, and a black head with the glass facing back.
    const mz = SCUTTLE + 0.2;
    b.block(side * (SIDE + 0.03), 0.885, mz - 0.015, 0.09, 0.06, 0.05, black, M.Rubber, Z.Sides, 0.015);
    mirrorHead(b, side, v(side * (SIDE + 0.15), 0.95, mz), 0.2, 0.15, 0.075, black);
    glasshouse(b, side);
  }
  // PATROL 4X4 on the left guard above the flare (side-1992.jpg has it on both guards; the
  // snorkel's body lies over the right-hand one) and on the narrow rear door above the handle
  // (rear-34-1988.jpg). The real badge is a decal in outlined letters; these are stroke capitals.
  const badge = new THREE.Color('#2A2D2F');
  badgeText(b, 'PATROL 4X4', v(-(SIDE + 0.002), 0.6, -1.08), 0, 1, 0.036, badge, Z.Front);
  badgeText(b, 'PATROL 4X4', v(-0.5, 0.75, TAIL + 0.003), 1, 0, 0.045, badge, Z.Rear);
  // Fuel filler flap on the right rear quarter, below the two-colour line (side-right-1989.jpg).
  b.block(SIDE + 0.003, 0.485, 2.14, 0.008, 0.15, 0.15, lower, M.Paint, Z.Rear, 0.02);
  b.block(SIDE + 0.002, 0.485, 2.14, 0.006, 0.16, 0.16, black, M.Rubber, Z.Rear, 0.02);
}

function roofAndRack(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const half = SIDE - TUMBLE;
  const front = SCREEN_TOP.z - 0.03,
    rear = TAIL;
  const s = new THREE.Shape(
    rounded([
      [-half, -front, 0.06],
      [half, -front, 0.06],
      [half, -rear, 0.04],
      [-half, -rear, 0.04],
    ]),
  );
  const raw = new THREE.ExtrudeGeometry(s, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.024,
    bevelOffset: -0.024,
    bevelSegments: 3,
    curveSegments: 8,
  });
  let g = toCreasedNormals(raw, Math.PI / 5);
  g.rotateX(-Math.PI / 2);
  g = subdivideSurface(g, (_p, n) => Math.abs(n.y) > 0.8, 2);
  const rp = g.getAttribute('position'),
    rn = g.getAttribute('normal');
  const centre = (front + rear) / 2,
    halfLength = (rear - front) / 2;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i),
      z = rp.getZ(i),
      u = x / half,
      t = (z - centre) / halfLength;
    const qx = Math.max(0, 1 - u * u),
      qz = Math.max(0, 1 - t * t),
      crown = 0.018 * qx * qz;
    const dx = ((-0.036 * x) / (half * half)) * qz,
      dz = ((-0.036 * (z - centre)) / (halfLength * halfLength)) * qx;
    rp.setY(i, rp.getY(i) + crown);
    const n = new THREE.Vector3(
      rn.getX(i) - dx * rn.getY(i),
      rn.getY(i),
      rn.getZ(i) - dz * rn.getY(i),
    ).normalize();
    rn.setXYZ(i, n.x, n.y, n.z);
  }
  b.slot = M.Paint;
  b.tag = Z.Roof;
  b.push().translate(0, ROOF - 0.05, 0);
  b.geometry(g, paint);
  b.pop();
  for (const x of [-0.5, -0.17, 0.17, 0.5])
    for (let k = 0; k < 24; k++) {
      const z0 = -0.3 + (k * 2.6) / 24,
        z1 = z0 + 2.6 / 24;
      const y = (z: number) =>
        ROOF +
        0.003 +
        0.018 * Math.max(0, 1 - (x / half) ** 2) * Math.max(0, 1 - ((z - centre) / halfLength) ** 2);
      b.rod(v(x, y(z0), z0), v(x, y(z1), z1), 0.006, paint, M.Paint, Z.Roof);
    }
  // Steel tradesman rack: feet on the gutters, side rails, cross bars and a wind deflector.
  const y = ROOF + 0.11,
    z0 = -0.36,
    z1 = 2.3;
  for (const side of [-1, 1]) {
    b.block(side * 0.79, y, (z0 + z1) / 2, 0.04, 0.04, z1 - z0, bar, M.Metal, Z.Roof, 0.01);
    for (let z = z0 + 0.1; z <= z1 - 0.05; z += (z1 - z0 - 0.15) / 4) {
      b.rod(
        v(side * 0.79, y - 0.02, z),
        v(side * (half - 0.01), ROOF - 0.01, z),
        0.016,
        bar,
        M.Metal,
        Z.Roof,
      );
      b.block(side * (half - 0.01), ROOF - 0.015, z, 0.05, 0.03, 0.08, bar, M.Metal, Z.Roof, 0.008);
    }
  }
  for (let z = z0 + 0.05; z <= z1; z += 0.33)
    b.rod(v(-0.79, y, z), v(0.79, y, z), 0.014, bar, M.Metal, Z.Roof);
  b.push()
    .translate(0, y + 0.02, z0 - 0.1)
    .rotate(-0.6, 0, 0);
  // 1.5 m wide: at 1.6 m its end was 2.5 cm from the snorkel's head.
  b.block(0, 0, 0, 1.5, 0.012, 0.16, bar, M.Metal, Z.Roof);
  b.pop();
  for (const side of [-1, 1])
    b.rod(v(side * 0.74, y + 0.061, z0 - 0.04), v(side * 0.79, y, z0 + 0.02), 0.012, bar, M.Metal, Z.Roof);
  // A rolled swag and a jerry can tied to the back of the rack.
  b.slot = M.Fabric;
  b.tag = Z.Roof;
  b.push()
    .translate(0, y + 0.134, 2.0)
    .rotate(0, 0, Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16), new THREE.Color('#5E6B4A'));
  b.pop();
  for (const x of [-0.35, 0.35]) {
    b.slot = M.Rubber;
    b.tag = Z.Roof;
    b.push()
      .translate(x, y + 0.134, 2.0)
      .rotate(0, Math.PI / 2, 0)
      .scale(1, 1, 8);
    b.geometry(new THREE.TorusGeometry(0.1215, 0.0025, 6, 48), black);
    b.pop();
  }
  // The can stands on a steel tray across three crossbars; it stood on one bar.
  b.block(0, y + 0.019, 1.34, 0.26, 0.01, 0.7, black, M.Rubber, Z.Roof);
  b.block(0, y + 0.204, 1.3, 0.16, 0.36, 0.34, new THREE.Color('#2F5E37'), M.Paint, Z.Roof, 0.02);
  // A strap closes around the can and a rack crossbar.
  b.block(0, y + 0.393, 1.34, 0.2, 0.012, 0.045, black, M.Rubber, Z.Roof);
  b.block(0, y - 0.02, 1.34, 0.2, 0.012, 0.045, black, M.Rubber, Z.Roof);
  for (const x of [-0.094, 0.094]) b.block(x, y + 0.1865, 1.34, 0.012, 0.425, 0.045, black, M.Rubber, Z.Roof);
  // The second spare lies flat at the front of the rack, between the boards, strapped down.
  const sy = y + 0.014 + spareSidewall(wheel) + 0.004,
    sz = 0.32,
    // Run the strap beside the raised hub cap rather than through it.
    strapZ = sz + 0.16,
    strapY = sy + tuning.wheelWidth * 0.53 + 0.006;
  b.tag = Z.Roof;
  mountSpare(b, wheel, { x: 0, y: sy, z: sz }, 'up', black);
  b.block(0, strapY, strapZ, 0.8, 0.008, 0.05, black, M.Rubber, Z.Roof);
  for (const side of [-1, 1])
    b.rod(v(side * 0.4, strapY, strapZ), v(side * 0.43, y, strapZ), 0.012, black, M.Rubber, Z.Roof);
}

function snorkel(b: VehicleBuilder, tuning: VehicleTuning): void {
  // On the right-hand guard, the driver's side, where the GQ's air cleaner is (the owner's
  // call in v2.05: the photographs are stock cars and show no snorkel). It was on the left.
  const x = SIDE + 0.045;
  const black2 = new THREE.Color('#202325');
  // A flat moulded body lying along the guard's side under the bonnet's edge, then up the A
  // pillar to above the roof, and the ram head on top.
  b.block(x - 0.03, 0.61, -1.1, 0.11, 0.14, 0.44, black2, M.Rubber, Z.Front, 0.035);
  tubePath(
    b,
    [v(x, 0.62, -0.95), v(x, 0.71, -0.86), v(x - 0.01, 0.84, -0.83), v(x - 0.03, 1.43, -0.546)],
    0.055,
    black2,
  );
  for (const t of [0.3, 0.7]) {
    const y = 0.84 + (1.38 - 0.84) * t,
      z = -0.83 + 0.26 * t;
    b.rod(v(x - 0.03, y, z), v(SIDE - 0.04, y + 0.02, z + 0.04), 0.012, steel, M.Metal, Z.Front);
  }
  const head = tuning.intake;
  b.block(head.x, head.y, head.z + 0.02, 0.15, 0.13, 0.22, black2, M.Rubber, Z.Roof, 0.045);
  b.block(head.x, head.y, head.z - 0.095, 0.12, 0.1, 0.012, black, M.Rubber, Z.Roof, 0.02);
  for (let i = 0; i < 4; i++)
    b.block(head.x, head.y - 0.03 + i * 0.02, head.z - 0.103, 0.11, 0.005, 0.006, trim, M.Rubber, Z.Roof);
}

function rearEnd(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  const z = TAIL;
  const topHalf = SIDE - TUMBLE;
  // The rear face as one panel with the two door windows, white above the two-colour line.
  const e = SIDE - 0.004;
  const outer: Vtx[] = [
    [-e, TWO_TONE],
    [e, TWO_TONE],
    [e, WAIST],
    [topHalf - 0.004, ROOF - 0.02, 0.04],
    [-topHalf + 0.004, ROOF - 0.02, 0.04],
    [-e, WAIST],
  ];
  const winLo = 0.87,
    winHi = 1.2;
  const halfAt = (y: number) => SIDE - (TUMBLE * Math.max(0, y - WAIST)) / (ROOF - WAIST);
  const windows: Vtx[][] = [
    [
      [-halfAt(winLo) + 0.075, winLo, 0.03],
      [DOOR_SPLIT - 0.07, winLo, 0.03],
      [DOOR_SPLIT - 0.07, winHi, 0.03],
      [-halfAt(winHi) + 0.075, winHi, 0.03],
    ],
    [
      [DOOR_SPLIT + 0.07, winLo, 0.03],
      [halfAt(winLo) - 0.075, winLo, 0.03],
      [halfAt(winHi) - 0.075, winHi, 0.03],
      [DOOR_SPLIT + 0.07, winHi, 0.03],
    ],
  ];
  const s = new THREE.Shape(rounded(outer));
  for (const w of windows) s.holes.push(new THREE.Path(rounded(w)));
  extrudeZ(b, s, z - 0.05, z, paint, M.Paint, Z.Rear, 0.016, (g) => cutAtSplit(g, true));
  extrudeZ(b, s, z - 0.05, z, lower, M.Paint, Z.Rear, 0.016, (g) => cutAtSplit(g, false));
  const band = new THREE.Shape(
    rounded([
      [-e, SILL, 0.03],
      [e, SILL, 0.03],
      [e, TWO_TONE],
      [-e, TWO_TONE],
    ]),
  );
  extrudeZ(b, band, z - 0.05, z, lower, M.Paint, Z.Rear, 0.016);
  for (const w of windows) {
    frontPane(b, w, z - 0.014, 1, rubber, M.Rubber, Z.Glass, inset(w, 0.022));
    frontPane(b, inset(w, 0.018), z - 0.012, 1, glass, M.Glass, Z.Glass);
  }
  // Door split, hinges and handle.
  b.block(
    DOOR_SPLIT,
    (SILL + ROOF - 0.04) / 2,
    z + 0.002,
    0.008,
    ROOF - 0.08 - SILL,
    0.006,
    black,
    M.Rubber,
    Z.Rear,
  );
  b.block(0, ROOF - 0.07, z + 0.002, 2 * topHalf - 0.08, 0.006, 0.006, black, M.Rubber, Z.Rear);
  for (const side of [-1, 1])
    for (const y of [0.72, 1.06])
      b.block(side * (SIDE - 0.035), y, z + 0.02, 0.035, 0.1, 0.03, black, M.Metal, Z.Rear, 0.008);
  // The handle: a black moulding on the narrow door, against the split, with its grip.
  b.block(DOOR_SPLIT - 0.17, 0.61, z + 0.012, 0.28, 0.085, 0.024, black, M.Rubber, Z.Rear, 0.012);
  b.block(DOOR_SPLIT - 0.08, 0.6, z + 0.026, 0.09, 0.03, 0.012, chrome, M.Metal, Z.Rear, 0.005);
  // Tall tail lamps in the corners: stop and tail, indicator and reverse, wrapping onto the sides.
  for (const side of [-1, 1]) {
    const x = side * (SIDE - 0.075);
    b.block(x, 0.43, z + 0.008, 0.15, 0.38, 0.02, black, M.Rubber, Z.Rear, 0.01);
    b.block(x, 0.53, z + 0.016, 0.13, 0.15, 0.01, red, M.Red, Z.Rear, 0.008);
    b.block(x, 0.39, z + 0.016, 0.13, 0.1, 0.01, amber, M.Amber, Z.Rear, 0.008);
    b.block(x, 0.295, z + 0.016, 0.13, 0.07, 0.01, lens, M.Lamp, Z.Rear, 0.008);
    b.block(side * (SIDE + 0.001), 0.53, z - 0.022, 0.012, 0.15, 0.04, red, M.Red, Z.Rear, 0.005);
    b.block(side * (SIDE + 0.001), 0.39, z - 0.022, 0.012, 0.1, 0.04, amber, M.Amber, Z.Rear, 0.005);
  }
  // Steel rear bar with recovery points, a tow hitch and the plate.
  b.block(0, 0.04, z + 0.08, 1.8, 0.17, 0.13, bar, M.Metal, Z.Rear, 0.025);
  for (const x of [-0.47, 0.47]) b.block(x, 0.04, z + 0.01, 0.08, 0.1, 0.14, bar, M.Metal, Z.Trim);
  b.block(0, -0.04, z + 0.17, 0.08, 0.06, 0.16, bar, M.Metal, Z.Rear, 0.01);
  b.ring(0, -0.02, z + 0.23, 0.035, 0.012, steel, M.Metal, 'y', Z.Rear);
  for (const side of [-1, 1]) b.ring(side * 0.66, -0.07, z + 0.12, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  // The plate on the narrow door, under the handle.
  b.block(-0.46, 0.42, z + 0.006, 0.36, 0.12, 0.01, new THREE.Color('#F0EEE6'), M.Lamp, Z.Rear, 0.006);
  plateText(b, 'GQ-060', -0.46, 0.42, z + 0.02, 1);
  // The spare on its carrier on the wide right-hand door, its face to the rear, high enough to
  // stand over the foot of that door's window, as on the photographed cars.
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: SPARE_X, y: SPARE_Y, z: z + 0.16 }, 'back', black, { reversed: true });
  b.block(SPARE_X, SPARE_Y, z + 0.04, 0.3, 0.3, 0.06, bar, M.Metal, Z.Rear, 0.02);
}

function chassis(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    const outline = new THREE.Shape(),
      stations = [
        [-2.16, 0.35],
        [-0.87, 0.35],
        [-0.6, 0.47],
        [2.24, 0.47],
      ];
    const pts = [
      ...stations.map(([z, x]) => [side * x - 0.05, z]),
      ...[...stations].reverse().map(([z, x]) => [side * x + 0.05, z]),
    ];
    pts.forEach(([x, z], i) => (i ? outline.lineTo(x, z) : outline.moveTo(x, z)));
    outline.closePath();
    const rail = new THREE.ExtrudeGeometry(outline, {
      depth: 0.18,
      bevelEnabled: false,
    });
    rail.rotateX(Math.PI / 2);
    rail.translate(0, 0.11, 0);
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.geometry(rail, black);
  }
  for (const z of [-2.1, -0.75, 0.6, 2.2]) b.block(0, 0.0, z, 0.9, 0.08, 0.08, black, M.Metal, Z.Trim);
  b.block(0.06, -0.03, -0.25, 0.42, 0.2, 0.62, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.55);
  b.rod({ x: 0.06, y: -0.08, z: -0.55 }, { x: 0.08, y: -0.12, z: -AXLE + 0.12 }, 0.032, shaft);
  b.rod({ x: 0.06, y: -0.08, z: 0.08 }, { x: 0.05, y: -0.12, z: AXLE - 0.12 }, 0.035, shaft);
  b.block(0, 0.1, 2.0, 0.84, 0.2, 0.6, black, M.Metal, Z.Trim, 0.03);
  b.rod({ x: -0.3, y: -0.06, z: -0.8 }, { x: -0.3, y: -0.08, z: 0.9 }, 0.028, steel);
  // The tailpipe turns out and ends inboard of the left rear tyre, 11 cm ahead of it. Until v2.04
  // it ran on to stop 4 cm in front of the tread.
  b.rod({ x: -0.3, y: -0.08, z: 0.9 }, { x: -0.54, y: -0.1, z: 0.98 }, 0.028, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.3, -0.07, 0.25)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
  // Floor pan under the cabin and the cargo floor behind the seats.
  for (const [start, end, width] of [
    [-2.05, -0.86, 0.72],
    [-0.86, 0.89, 1.66],
    [0.89, 2.1, 1.16],
    [2.1, 2.35, 1.66],
  ])
    b.block(0, 0.14, (start + end) / 2, width, 0.03, end - start, black, M.Rubber, Z.Trim);
}

export function buildPatrolBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  lowerBody(b);
  bonnetAndFace(b);
  bullBar(b, tuning);
  windscreen(b);
  sides(b);
  roofAndRack(b, tuning, wheel);
  snorkel(b, tuning);
  rearEnd(b, wheel);
  chassis(b);
  addPatrolInterior(b, tuning.engine.redlineRpm, WIDEN);
  const g = b.build();
  const pos = g.getAttribute('position'),
    normal = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      ax = Math.abs(x),
      t = (y - SILL) / (WAIST - SILL);
    if (t <= 0 || t >= 1 || ax <= 0.78) continue;
    const u = Math.min(1, (ax - 0.78) / 0.06),
      gain = u * u * (3 - 2 * u),
      dg = u < 1 ? (6 * u * (1 - u)) / 0.06 : 0;
    const bow = 0.009 * Math.sin(Math.PI * t) - 0.008 * Math.sin(2 * Math.PI * t);
    const by =
      (0.009 * Math.PI * Math.cos(Math.PI * t) - 0.016 * Math.PI * Math.cos(2 * Math.PI * t)) /
      (WAIST - SILL);
    pos.setX(i, x + Math.sign(x) * gain * bow);
    const nx = normal.getX(i) / (1 + dg * bow),
      n = new THREE.Vector3(nx, normal.getY(i) - Math.sign(x) * gain * by * nx, normal.getZ(i)).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  // Widened evenly to the wagon's published 1,930 mm across the flares (side-right-1989.jpg,
  // front-34-1988.jpg). Normals are left alone: a 3.5% stretch barely turns them.
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * WIDEN);
  return cleanGeometry(g);
}

/**
 * 31×10.5R15 all-terrain tyre on a white steel wheel with a ring of round holes and six
 * studs, the classic Australian touring wheel.
 */
export function buildPatrolWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#222524');
  const rimColor = new THREE.Color('#ECEBE4');
  const rimR = 0.19;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.46],
    [r * 0.72, -w * 0.52],
    [r * 0.92, -w * 0.5],
    [r * 0.965, -w * 0.4],
    [r * 0.965, w * 0.4],
    [r * 0.92, w * 0.5],
    [r * 0.72, w * 0.52],
    [rimR - 0.01, w * 0.46],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Two rows of staggered tread blocks and shoulder lugs down the sidewall.
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.2, Math.cos(angle) * r * 0.968, Math.sin(angle) * r * 0.968)
        .rotate(angle, side * 0.12, 0);
      b.box(w * 0.34, 0.03, 0.075, tyre);
      b.pop();
      b.push()
        .translate(side * w * 0.47, Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9)
        .rotate(angle, 0, 0);
      b.box(0.03, 0.05, 0.055, tyre);
      b.pop();
    }
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.74, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, the dished centre with its ring of holes, hub cap and studs.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.014, rimColor, M.Paint, 'x');
    // The rim's well between the disc and the bead: without it there was a slit to see through.
    b.ring(
      side * (w * 0.5 - 0.018),
      0,
      0,
      rimR - 0.006,
      0.012,
      rimColor.clone().multiplyScalar(0.92),
      M.Paint,
      'x',
    );
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.035), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 24),
      rimColor.clone().multiplyScalar(0.92),
    );
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.015), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.11, 0.125, 0.03, 16), rimColor);
    b.pop();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * (w * 0.5 - 0.02), Math.cos(a) * 0.15, Math.sin(a) * 0.15)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 12), black);
      b.pop();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.005), Math.cos(a) * 0.075, Math.sin(a) * 0.075)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.013, 0.016, 0.022, 6), steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.015), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.042, 0.05, 0.045, 12), chrome);
    b.pop();
  }
  return cleanGeometry(b.build());
}

/** A recovery board strapped to the roof rack (index 0 on the left). */
export function buildPatrolPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const x = (index === 0 ? -0.6 : 0.6) * WIDEN,
    y = ROOF + 0.149,
    z = 0.75;
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
  for (const dz of [-0.73, 0.92]) {
    b.block(x, ROOF + 0.09, z + dz, W + 0.02, 0.012, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(
        x + (s * (W + 0.02)) / 2,
        (y + 0.03 + ROOF + 0.09) / 2,
        z + dz,
        0.012,
        y + 0.03 - (ROOF + 0.09),
        0.045,
        black,
        M.Rubber,
        Z.Roof,
      );
  }
  return b.build();
}
