import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { LC79_CAB_LIFT } from '../data/lc79';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addTroopyInterior } from './troopyInterior';
import { lc79Colors } from './lc79Paint';
import { extrudeX, extrudeZ, frontPane, inset, rounded, sidePane, sideShape, type Vtx } from './bodyShapes';
import { mirrorHead } from './mirrors';
import { BADGE_GLYPHS, GLYPHS, PLATE_WHITE, numberPlate, strokeText } from './bodyKit';
import { cleanGeometry, continuousTube, subdivideSurface } from './bodyRefinement';
import { mountSpare, spareSidewall } from './spares';

/**
 * LandCruiser 79 single cab, built up: the 70 Series cab and front clip on a 4 inch lift,
 * the V8's bonnet scoop, wide black flares over 37 inch tyres, rock sliders, a steel bar
 * with a winch, driving lamps and a light bar, a snorkel up the right pillar, and behind
 * the cab an alloy tray and a black canopy with gullwing doors, one spare on its rear
 * door and a second flat on its roof rack (ground about 0.59 m below the origin when parked).
 * Photographs and dimensions: reference/vehicles/landcruiser-79-2024/SOURCES.md.
 */
const { bar, flare, canopy, alloy, chrome } = lc79Colors;
const black = new THREE.Color('#1E2120'),
  rubber = new THREE.Color('#222524'),
  steel = new THREE.Color('#8F938D'),
  well = new THREE.Color('#262928'),
  trim = new THREE.Color('#2B2E2D');
const red = new THREE.Color('#B3271F'),
  amber = new THREE.Color('#E5992F'),
  lens = new THREE.Color('#E6E4D2');
const glass = new THREE.Color('#9FB6B3'),
  plateInk = new THREE.Color('#1F3D6B');

const DY = LC79_CAB_LIFT;
const SIDE = 0.895;
const SILL = 0.04 + DY;
const WAIST = 0.84 + DY;
const F = -2.36;
const AXLE = 1.59;
/**
 * Front wheel opening as on the 70 Series: a flat top with radiused corners and straight
 * sides that splay out towards the sill (front-34-single-cab.jpg), cut high and wide for
 * the big tyres. `top` is the flat's height, `half` the half width where the sides would
 * meet it, `splay` how far each side moves out per metre down, `corner` the corners' radius.
 * `r` is a nominal size for the wheelhouse's walls.
 */
const ARCH = { r: 0.6, cy: 0.0, top: 0.6, half: 0.5, splay: 0.3, corner: 0.17 };
/** Where the wheelhouse walls face, for the dark colouring of the opening's cut faces. */
const WELL_CENTRE: [number, number] = [-AXLE, 0.12];
const COWL = { y: WAIST, z: -0.98 };
const SCREEN_TOP = { y: 1.44 + DY, z: -0.8 };
const DOOR = { front: -0.95, back: 0.12 };
const ROOF = 1.5 + DY;
const CAB_BACK = 0.48;
const CORNER = 0.07;
const GUARD_LOW = 0.35;
const CLIP = {
  back: DOOR.front - 0.02,
  noseTop: 0.86,
  backTop: WAIST - 0.005,
  round: 0.045,
  ratio: 0.9,
  low: 0.4,
};
/** The tray: deck height, headboard, tail and half width. */
const TRAY = { deck: 0.64, front: 0.56, back: 2.98, half: 0.95 };
/**
 * The canopy on the tray, from the headboard to short of the tail, so the spare on its
 * rear door stays inside the tray.
 */
const CAN = {
  front: TRAY.front + 0.06,
  back: 2.58,
  top: ROOF + 0.02,
  half: 0.93,
};
const RACK = { y: CAN.top + 0.1 };
/** Where the second spare lies on the roof rack (its centre along the rack). */
const LC79_ROOF_SPARE_Z = (CAN.front + CAN.back) / 2;
const LAMP_Y = 0.68;

const clipTop = (z: number) => CLIP.noseTop + ((z - F) / (CLIP.back - F)) * (CLIP.backTop - CLIP.noseTop);
const v = (x: number, y: number, z: number) => ({ x, y, z });

/** Half the opening's width at height y, `grow` out from its edge. */
const archHalf = (y: number, grow = 0) =>
  ARCH.half + (ARCH.top - y) * ARCH.splay + grow * Math.hypot(1, ARCH.splay);

/**
 * The opening's outline from height yBack on its back side, over the flat top, to yFront
 * on its front side, `grow` out from its edge (a flare's outer edge, or inside it).
 */
function archPath(axle: number, yBack: number, yFront: number, grow = 0): Vtx[] {
  const top = ARCH.top + grow,
    corner = Math.max(0.02, ARCH.corner + grow);
  return [
    [axle + archHalf(yBack, grow), yBack],
    [axle + archHalf(top, grow), top, corner],
    [axle - archHalf(top, grow), top, corner],
    [axle - archHalf(yFront, grow), yFront],
  ];
}

/** Where the A pillar's front edge is at height y. */
const pillarZ = (y: number) => COWL.z + ((y - COWL.y) * (SCREEN_TOP.z - COWL.z)) / (SCREEN_TOP.y - COWL.y);

const WIN = { low: WAIST + 0.045, top: ROOF - 0.085 };
const doorWindow: Vtx[] = [
  [pillarZ(WIN.low) + 0.085, WIN.low, 0.03],
  [DOOR.back - 0.045, WIN.low, 0.03],
  [DOOR.back - 0.045, WIN.top, 0.03],
  [pillarZ(WIN.top) + 0.085, WIN.top, 0.04],
];

/** Each side of the cab: one panel from behind the front wheel to the back corner. */
function cabSides(b: VehicleBuilder, paint: THREE.Color): void {
  const end = CAB_BACK - CORNER;
  const archBack = (y: number) => -AXLE + archHalf(y);
  const outline: Vtx[] = [
    [archBack(SILL), SILL],
    ...[0.25, 0.35, CLIP.low].map((y): Vtx => [archBack(y), y]),
    [archBack(CLIP.low + 0.03), CLIP.low + 0.03],
    [CLIP.back + 0.005, CLIP.low + 0.03],
    [CLIP.back + 0.005, WAIST - 0.02],
    [pillarZ(WAIST) - 0.01, WAIST],
    [pillarZ(ROOF), ROOF],
    [end, ROOF],
    [end, SILL],
  ];
  const shape = sideShape(outline, [doorWindow]);
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? SIDE - 0.04 : -SIDE;
    extrudeX(b, shape, x0, x0 + 0.04, paint, M.Paint, Z.Sides, 0.012, [WELL_CENTRE]);
    sidePane(b, doorWindow, side, side * (SIDE - 0.022), rubber, M.Rubber, Z.Glass, inset(doorWindow, 0.022));
    sidePane(b, inset(doorWindow, 0.018), side, side * (SIDE - 0.02), glass, M.Glass, Z.Glass);
    const x = side * (SIDE + 0.001);
    // Door shut lines and its lower edge.
    for (const z of [DOOR.back + 0.004, DOOR.front + 0.004]) {
      const top = z > 0 ? ROOF - 0.04 : WAIST;
      b.block(x, (SILL + top) / 2, z, 0.006, top - SILL - 0.04, 0.006, black, M.Rubber, Z.Sides);
    }
    b.block(
      x,
      SILL + 0.03,
      (DOOR.front + DOOR.back) / 2,
      0.006,
      0.006,
      DOOR.back - DOOR.front,
      black,
      M.Rubber,
    );
    // Pressed swage line below the window, handle and lock, side indicator on the wing.
    b.block(
      side * (SIDE + 0.004),
      WAIST - 0.04,
      (DOOR.front + end) / 2,
      0.01,
      0.02,
      end - DOOR.front,
      paint,
      M.Paint,
      Z.Sides,
      0.008,
    );
    b.block(
      side * (SIDE + 0.008),
      WAIST - 0.1,
      DOOR.back - 0.16,
      0.016,
      0.035,
      0.15,
      black,
      M.Rubber,
      Z.Sides,
      0.01,
    );
    b.ring(side * (SIDE + 0.006), WAIST - 0.1, DOOR.back - 0.05, 0.012, 0.004, chrome, M.Metal, 'x', Z.Sides);
    // Door mirror on a black sail in the window's front lower corner.
    const lo = WIN.low - 0.02,
      hi = WIN.low + 0.16;
    const sail: Vtx[] = [
      [pillarZ(lo) + 0.065, lo, 0.012],
      [pillarZ(lo) + 0.255, lo, 0.012],
      [pillarZ(hi) + 0.065, hi, 0.012],
    ];
    extrudeX(
      b,
      sideShape(sail),
      side > 0 ? SIDE - 0.03 : -SIDE - 0.006,
      side > 0 ? SIDE + 0.006 : -SIDE + 0.03,
      black,
      M.Rubber,
      Z.Sides,
      0.004,
    );
    const mz = pillarZ(lo) + 0.17;
    b.block(
      side * (SIDE + 0.03),
      WIN.low + 0.05,
      mz - 0.015,
      0.09,
      0.06,
      0.05,
      black,
      M.Rubber,
      Z.Sides,
      0.015,
    );
    mirrorHead(b, side, v(side * (SIDE + 0.15), WIN.low + 0.12, mz), 0.2, 0.16, 0.075, black);
    // Rain gutter along the roof edge, and the rounded back corner.
    b.rod(
      v(side * (SIDE + 0.004), ROOF - 0.03, pillarZ(ROOF) + 0.03),
      v(side * (SIDE + 0.004), ROOF - 0.03, end),
      0.01,
      paint,
      M.Paint,
      Z.Roof,
    );
    const g = new THREE.CylinderGeometry(
      CORNER,
      CORNER,
      ROOF - SILL - 0.02,
      16,
      1,
      true,
      side > 0 ? 0 : -Math.PI / 2,
      Math.PI / 2,
    );
    b.slot = M.Paint;
    b.tag = Z.Rear;
    b.push().translate(side * (SIDE - CORNER), (SILL + ROOF) / 2 - 0.01, end);
    b.geometry(g, paint);
    b.pop();
    // The cab's vent: a black louvred grille on the back pillar just behind the door, under
    // the swage line (front-34-single-cab.jpg).
    const vz = DOOR.back + 0.12;
    b.block(side * (SIDE + 0.004), WAIST - 0.1, vz, 0.012, 0.08, 0.15, black, M.Rubber, Z.Sides, 0.006);
    for (let i = 0; i < 4; i++)
      b.block(
        side * (SIDE + 0.011),
        WAIST - 0.127 + i * 0.018,
        vz,
        0.006,
        0.006,
        0.13,
        trim,
        M.Rubber,
        Z.Sides,
      );
    // The fuel filler: a round body-colour flap on the left pillar below the vent.
    if (side < 0) {
      b.ring(-SIDE - 0.003, WAIST - 0.25, vz, 0.055, 0.004, black, M.Rubber, 'x', Z.Sides);
      b.slot = M.Paint;
      b.tag = Z.Sides;
      b.push()
        .translate(-SIDE - 0.004, WAIST - 0.25, vz)
        .rotate(0, 0, Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 24), paint);
      b.pop();
      b.block(-SIDE - 0.009, WAIST - 0.25, vz + 0.025, 0.004, 0.012, 0.012, chrome, M.Metal, Z.Sides);
    }
    // Rock slider along the sill: a black rail on outriggers with a step plate.
    const sx = side * (SIDE + 0.07);
    b.rod(
      v(sx, SILL - 0.06, DOOR.front - 0.02),
      v(sx, SILL - 0.06, CAB_BACK - 0.02),
      0.026,
      bar,
      M.Metal,
      Z.Sides,
    );
    b.block(
      side * (SIDE + 0.02),
      SILL - 0.06,
      (DOOR.front + CAB_BACK) / 2,
      0.11,
      0.025,
      CAB_BACK - DOOR.front - 0.04,
      bar,
      M.Metal,
      Z.Sides,
      0.008,
    );
    for (const z of [DOOR.front + 0.05, -0.25, CAB_BACK - 0.08])
      b.block(side * 0.66, SILL - 0.06, z, 0.4, 0.05, 0.05, bar, M.Metal, Z.Trim);
  }
  // The back wall with its small window.
  const e = SIDE - CORNER;
  const win: Vtx[] = [
    [-0.42, WAIST + 0.08, 0.04],
    [0.42, WAIST + 0.08, 0.04],
    [0.42, ROOF - 0.12, 0.04],
    [-0.42, ROOF - 0.12, 0.04],
  ];
  const s = new THREE.Shape(
    rounded([
      [-e - 0.002, SILL],
      [e + 0.002, SILL],
      [e + 0.002, ROOF - 0.03],
      [-e - 0.002, ROOF - 0.03],
    ]),
  );
  s.holes.push(new THREE.Path(rounded(win)));
  extrudeZ(b, s, CAB_BACK - 0.04, CAB_BACK, paint, M.Paint, Z.Rear, 0.012);
  frontPane(b, win, CAB_BACK - 0.016, 1, rubber, M.Rubber, Z.Glass, inset(win, 0.022));
  frontPane(b, inset(win, 0.018), CAB_BACK - 0.014, 1, glass, M.Glass, Z.Glass);
}

/**
 * A round LED headlamp as on the 2024-on 70 Series (side-wagon.jpg), standing in its pod in
 * the grille's surround: a black bezel, a dark chrome bowl behind clear glass, the bright
 * daytime-running ring round its edge, and a small projector with a chrome ring above the
 * middle.
 */
function headlamp(b: VehicleBuilder, x: number, y: number): void {
  const r = 0.105,
    f = F - 0.022;
  const bowl = new THREE.Color('#5C6163'),
    tint = new THREE.Color('#3A4244');
  b.ring(x, y, f - 0.022, r + 0.012, 0.014, black, M.Rubber, 'z', Z.Front);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push()
    .translate(x, y, f - 0.012)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r + 0.005, r + 0.005, 0.02, 32), bowl);
  b.pop();
  // The daytime-running ring, and a second fainter ring inside it.
  b.ring(x, y, f - 0.026, r - 0.014, 0.006, lens, M.Headlamp, 'z', Z.Front);
  b.ring(x, y, f - 0.024, r - 0.04, 0.003, chrome, M.Metal, 'z', Z.Front);
  // Projector: dark lens in a chrome ring, a little above the middle.
  b.ring(x, y + 0.012, f - 0.028, 0.034, 0.006, chrome, M.Metal, 'z', Z.Front);
  b.slot = M.Headlamp;
  b.push()
    .translate(x, y + 0.012, f - 0.026)
    .scale(1, 1, 0.35);
  b.geometry(new THREE.SphereGeometry(0.03, 20, 8), lens.clone().multiplyScalar(0.75));
  b.pop();
  // The clear outer glass, faintly tinted so the parts behind it read.
  b.slot = M.Glass;
  b.push()
    .translate(x, y, f - 0.032)
    .scale(1, 1, 0.1);
  b.geometry(new THREE.SphereGeometry(r - 0.004, 24, 8), tint);
  b.pop();
}

/** Height of the bonnet's raised centre panel above the clip's top. */
const CROWN = 0.024;

/**
 * The bonnet's raised centre panel, as on the 2024-on 70 Series: a flat-topped section
 * between two creases that runs from the cowl to the nose, where its front edge stands over
 * the raised middle of the grille's top edge (front-34-wagon.jpg, side-wagon.jpg).
 */
function bonnetCentre(b: VehicleBuilder, paint: THREE.Color): void {
  const z1 = COWL.z - 0.08;
  extrudeX(
    b,
    sideShape([
      [F - 0.012, clipTop(F) - 0.006],
      [F - 0.012, clipTop(F) + CROWN, 0.02],
      [z1, clipTop(z1) + CROWN],
      [z1, clipTop(z1) - 0.03],
      [F + 0.05, clipTop(F + 0.05) - 0.04],
    ]),
    -0.46,
    0.46,
    paint,
    M.Paint,
    Z.Front,
    0.016,
  );
}

function frontEnd(b: VehicleBuilder, paint: THREE.Color): void {
  // The front clip in one piece: the face, the bonnet and guard tops sloping down to the
  // nose, the cut-out front wheel openings, and tight shoulders and front corners, square
  // as the 70 Series' are rather than rolled.
  const R = CLIP.round;
  extrudeX(
    b,
    sideShape([
      [F, GUARD_LOW, 0.03],
      [F, CLIP.noseTop, 0.05],
      [CLIP.back, CLIP.backTop, 0.02],
      [CLIP.back, CLIP.low],
      ...archPath(-AXLE, CLIP.low, GUARD_LOW),
    ]),
    -SIDE - 0.02,
    SIDE + 0.02,
    paint,
    M.Paint,
    Z.Front,
    R,
    [WELL_CENTRE],
    4,
    CLIP.ratio,
  );
  bonnetCentre(b, paint);
  // A hollow scoop: separate crown and cheeks, recessed dark throat, no front cap.
  const z0 = F + 0.32,
    z1 = F + 0.9,
    y0 = clipTop(z0) + CROWN,
    y1 = clipTop(z1) + CROWN;
  extrudeX(
    b,
    sideShape([
      [z0, y0 + 0.055],
      [z0, y0 + 0.078, 0.014],
      [z1 - 0.14, y1 + 0.056, 0.06],
      [z1, y1 - 0.006],
      [z1 - 0.06, y1 - 0.008],
      [z1 - 0.18, y1 + 0.034],
      [z0 + 0.04, y0 + 0.055],
    ]),
    -0.3,
    0.3,
    paint,
    M.Paint,
    Z.Front,
    0.008,
  );
  for (const side of [-1, 1])
    extrudeX(
      b,
      sideShape([
        [z0, y0 - 0.005],
        [z0, y0 + 0.063],
        [z1 - 0.15, y1 + 0.044],
        [z1, y1 - 0.008],
      ]),
      side > 0 ? 0.278 : -0.3,
      side > 0 ? 0.3 : -0.278,
      paint,
      M.Paint,
      Z.Front,
      0.005,
    );
  b.block(0, y0 + 0.025, z0 + 0.12, 0.552, 0.065, 0.012, black, M.Rubber, Z.Front);
  for (const y of [0.012, 0.035])
    b.block(0, y0 + y, z0 + 0.045, 0.548, 0.006, 0.008, trim, M.Rubber, Z.Front);
  // Shut lines between the bonnet and the guards.
  for (const side of [-1, 1])
    b.rod(
      v(side * 0.7, clipTop(F + 0.06) + 0.002, F + 0.06),
      v(side * 0.7, clipTop(COWL.z - 0.08) + 0.002, COWL.z - 0.08),
      0.004,
      black,
      M.Rubber,
      Z.Front,
    );
  // Cowl under the screen, with its vent slots.
  b.block(0, COWL.y - 0.02, COWL.z - 0.03, 1.76, 0.05, 0.1, paint, M.Paint, Z.Front, 0.015);
  for (let i = 0; i < 10; i++)
    b.block(-0.45 + i * 0.1, COWL.y + 0.006, COWL.z - 0.04, 0.06, 0.004, 0.05, black, M.Rubber, Z.Front);

  // Front panel as on the 2024-on 70 Series (side-wagon.jpg, front-34-wagon.jpg): one wide
  // black surround across the face whose top edge rises in the middle under the bonnet's
  // raised panel, a round LED headlamp in a plain black pod at each end, a thick upright
  // between each pod and the mesh, and TOYOTA on the mesh. The amber indicators are on the
  // guards' front corners, outboard of the surround.
  const gy = LAMP_Y,
    low = gy - 0.16,
    high = gy + 0.14,
    brow = clipTop(F) - 0.004;
  const surround = new THREE.Shape(
    rounded([
      [-0.74, low, 0.02],
      [0.74, low, 0.02],
      [0.74, high, 0.02],
      [0.44, high],
      [0.4, brow, 0.01],
      [-0.4, brow, 0.01],
      [-0.44, high],
      [-0.74, high, 0.02],
    ]),
  );
  extrudeZ(b, surround, F - 0.03, F + 0.01, trim, M.Rubber, Z.Front, 0.008);
  // Recessed mesh between the uprights.
  b.block(0, gy - 0.005, F - 0.026, 0.74, 0.25, 0.01, black, M.Rubber, Z.Front, 0.006);
  // Open hexagonal ribs over the recess, clear of the lettering.
  // Cells of 30 mm radius: the real mesh is finer, but finer ribs cost thousands of
  // triangles and read the same from any distance the game shows them at.
  const mesh = trim.clone().multiplyScalar(1.7),
    radius = 0.03,
    inner = 0.0252;
  b.slot = M.Rubber;
  b.tag = Z.Front;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 14; col++) {
      const x = -0.34 + col * Math.sqrt(3) * radius + ((row % 2) * Math.sqrt(3) * radius) / 2;
      const y = gy - 0.095 + row * 0.045;
      if (Math.abs(x) > 0.345 || (Math.abs(x) < 0.21 && Math.abs(y - gy + 0.005) < 0.04)) continue;
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3,
          c = a + Math.PI / 3;
        b.quad(
          v(x + radius * Math.cos(a), y + radius * Math.sin(a), F - 0.033),
          v(x + inner * Math.cos(a), y + inner * Math.sin(a), F - 0.033),
          v(x + inner * Math.cos(c), y + inner * Math.sin(c), F - 0.033),
          v(x + radius * Math.cos(c), y + radius * Math.sin(c), F - 0.033),
          mesh,
        );
      }
    }
  b.block(0, gy - 0.005, F - 0.034, 0.42, 0.075, 0.012, black, M.Rubber, Z.Front, 0.006);
  // TOYOTA in stroke capitals, 0.36 m across; this grille's A has a slightly shorter crossbar.
  strokeText(b, 'TOYOTA', {
    x: 0.18,
    y: gy - 0.03,
    z: F - 0.042,
    dir: -1,
    w: 0.05,
    h: 0.05,
    pitch: 0.062,
    radius: 0.0045,
    colour: PLATE_WHITE,
    slot: M.Metal,
    zone: Z.Front,
    glyphs: {
      ...GLYPHS,
      A: [
        [0, 0, 0.5, 1],
        [0.5, 1, 1, 0],
        [0.22, 0.42, 0.78, 0.42],
      ],
    },
  });
  for (const side of [-1, 1]) {
    // The upright between the mesh and the lamp pod, standing proud of both.
    b.block(side * 0.395, gy - 0.01, F - 0.04, 0.05, high - low - 0.01, 0.025, trim, M.Rubber, Z.Front, 0.01);
    headlamp(b, side * 0.585, gy);
    // Indicator wrapped round the guard's front corner: amber on the face and the side.
    const ix = side * (SIDE + 0.02 - 0.055),
      iy = high - 0.055,
      iz = F + 0.045;
    b.block(ix, iy, iz, 0.13, 0.14, 0.13, black, M.Rubber, Z.Front, 0.012);
    b.block(ix + side * 0.004, iy, iz - 0.004, 0.118, 0.118, 0.13, amber, M.Amber, Z.Front, 0.012);
    // LandCruiser badge in chrome capitals on the guard, behind the indicator and above
    // the flare (front-34-single-cab.jpg), reading towards the front on the right and the
    // back on the left.
    const badge = 'LAND CRUISER',
      pitch = 0.024,
      len = (badge.length - 1) * pitch + 0.016;
    b.push()
      .translate(side * (SIDE + 0.023), WAIST - 0.13, -1.72)
      .rotate(0, side * (Math.PI / 2), 0);
    strokeText(b, badge, {
      x: -len / 2,
      y: 0,
      z: 0,
      dir: 1,
      w: 0.016,
      h: 0.026,
      pitch,
      radius: 0.0022,
      colour: chrome,
      slot: M.Metal,
      zone: Z.Sides,
      glyphs: BADGE_GLYPHS,
    });
    b.pop();
    // Side repeater on the guard ahead of the door.
    b.block(
      side * (SIDE + 0.022),
      WAIST - 0.15,
      CLIP.back - 0.12,
      0.012,
      0.03,
      0.06,
      amber,
      M.Amber,
      Z.Sides,
      0.005,
    );
  }
  // Three lower cooling slots and the narrow upper hood vent of the updated fascia.
  for (const x of [-0.235, 0, 0.235])
    b.block(x, 0.475, F - 0.012, 0.19, 0.032, 0.014, black, M.Rubber, Z.Front, 0.008);
  b.block(0, 0.85, F - 0.006, 0.49, 0.014, 0.012, black, M.Rubber, Z.Front, 0.004);
  // Sump guard, steering box and the front diff's breather.
  b.block(0, -0.02, -1.78, 0.6, 0.03, 0.7, bar, M.Metal, Z.Trim, 0.01);
  b.block(0.38, 0.06, -2.05, 0.14, 0.16, 0.16, black, M.Metal, Z.Trim, 0.02);
}

function windscreen(b: VehicleBuilder, paint: THREE.Color): void {
  const lean = Math.atan2(SCREEN_TOP.z - COWL.z, SCREEN_TOP.y - COWL.y);
  const L = (ROOF - 0.01 - COWL.y) / Math.cos(lean);
  const w = SIDE - 0.005;
  const outer: Vtx[] = [
    [-w, 0, 0.02],
    [w, 0, 0.02],
    [w, L, 0.04],
    [-w, L, 0.04],
  ];
  const hole: Vtx[] = [
    [-w + 0.085, 0.045, 0.04],
    [w - 0.085, 0.045, 0.04],
    [w - 0.085, L - 0.1, 0.04],
    [-w + 0.085, L - 0.1, 0.04],
  ];
  b.push().translate(0, COWL.y, COWL.z).rotate(lean, 0, 0);
  const s = new THREE.Shape(rounded(outer));
  s.holes.push(new THREE.Path(rounded(hole)));
  extrudeZ(b, s, -0.02, 0.025, paint, M.Paint, Z.Front, 0.012);
  frontPane(b, hole, -0.004, -1, rubber, M.Rubber, Z.Glass, inset(hole, 0.022));
  frontPane(b, inset(hole, 0.018), -0.006, -1, glass, M.Glass, Z.Glass);
  for (const x of [0.55, -0.1]) {
    b.rod({ x, y: 0.06, z: -0.03 }, { x: x - 0.46, y: 0.09, z: -0.03 }, 0.006, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.065, z: -0.036 }, { x: x - 0.42, y: 0.095, z: -0.036 }, 0.004, black, M.Rubber, Z.Front);
  }
  // Rear-view mirror on a stem from a foot on the screen frame's inside, above the glass.
  b.block(0, L - 0.16, 0.05, 0.22, 0.065, 0.02, black, M.Rubber, Z.Trim, 0.01);
  b.rod({ x: 0, y: L - 0.13, z: 0.045 }, { x: 0, y: L - 0.06, z: 0.03 }, 0.008, black, M.Rubber, Z.Trim);
  b.block(0, L - 0.06, 0.03, 0.05, 0.035, 0.012, black, M.Rubber, Z.Trim, 0.004);
  b.pop();
}

function roof(b: VehicleBuilder, paint: THREE.Color): void {
  const front = pillarZ(ROOF) - 0.01;
  const s = new THREE.Shape(
    rounded([
      [-SIDE, -front, 0.04],
      [SIDE, -front, 0.04],
      [SIDE, -CAB_BACK, CORNER * 1.6],
      [-SIDE, -CAB_BACK, CORNER * 1.6],
    ]),
  );
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(s, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.024,
    bevelOffset: -0.024,
    bevelSegments: 3,
    curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g = subdivideSurface(g, (_p, n) => Math.abs(n.y) > 0.7, 2);
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      a = Math.max(0, 1 - (x / SIDE) ** 2),
      t = THREE.MathUtils.clamp((z - front) / (CAB_BACK - front), 0, 1),
      q = Math.sin(Math.PI * t) ** 2;
    const h = 0.035 * a * a * q,
      dx = ((-0.14 * x) / (SIDE * SIDE)) * a * q,
      dz = (0.035 * a * a * Math.PI * Math.sin(2 * Math.PI * t)) / (CAB_BACK - front);
    p.setY(i, p.getY(i) + h);
    const normal = new THREE.Vector3(
      n.getX(i) - dx * n.getY(i),
      n.getY(i),
      n.getZ(i) - dz * n.getY(i),
    ).normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  b.slot = M.Paint;
  b.tag = Z.Roof;
  b.push().translate(0, ROOF - 0.04, 0);
  b.geometry(g, paint);
  b.pop();
  for (const z of [-0.45, -0.05, 0.35]) {
    const t = (z - front) / (CAB_BACK - front),
      q = Math.sin(Math.PI * t) ** 2;
    const point = (x: number) => v(x, ROOF + 0.004 + 0.035 * (1 - (x / SIDE) ** 2) ** 2 * q, z);
    b.chain(
      Array.from({ length: 21 }, (_, i) => point(-0.75 + i * 0.075)),
      0.006,
      paint,
      M.Paint,
      Z.Roof,
    );
  }
}

/**
 * Wide black flares round the front openings and over the tray's rear wheel cut-outs;
 * they reach 0.97 m out, over the 1.6 m track's 37 inch tyres.
 */
function flares(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    const lip = sideShape([
      ...archPath(-AXLE, SILL - 0.02, GUARD_LOW - 0.02, 0.11).reverse(),
      ...archPath(-AXLE, SILL - 0.02, GUARD_LOW - 0.02, -0.005),
    ]);
    extrudeX(
      b,
      lip,
      side > 0 ? SIDE - 0.01 : -SIDE - 0.075,
      side > 0 ? SIDE + 0.075 : -SIDE + 0.01,
      flare,
      M.Rubber,
      Z.Front,
      0.012,
    );
    // Dark wheelhouse: a liner following the opening's edge just inside it (its ends and
    // roof), and an inner wall across the whole opening so nothing shows through it.
    const liner = sideShape([
      ...archPath(-AXLE, SILL - 0.02, GUARD_LOW - 0.02, 0.03).reverse(),
      ...archPath(-AXLE, SILL - 0.02, GUARD_LOW - 0.02, -0.008),
    ]);
    extrudeX(
      b,
      liner,
      side > 0 ? 0.36 : -SIDE - 0.01,
      side > 0 ? SIDE + 0.01 : -0.36,
      well,
      M.Rubber,
      Z.Trim,
      0,
    );
    const h = ARCH.top + 0.03;
    b.block(side * 0.35, h / 2, -AXLE, 0.03, h, 2 * archHalf(0), well, M.Rubber, Z.Trim);
  }
}

/** A round driving lamp facing forward: black can, chrome rim, lens and its reflector's rings. */
function drivingLamp(b: VehicleBuilder, x: number, y: number, z: number, r: number): void {
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push()
    .translate(x, y, z + 0.06)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(r + 0.01, r * 0.75, 0.12, 24), black);
  b.pop();
  b.ring(x, y, z, r + 0.005, 0.01, chrome, M.Metal, 'z', Z.Front);
  b.slot = M.DrivingLamp;
  b.push().translate(x, y, z).scale(1, 1, 0.2);
  b.geometry(new THREE.SphereGeometry(r, 20, 8), lens.clone().multiplyScalar(0.86));
  b.pop();
  // The reflector's rings and the bulb's cap, seen through the lens.
  b.ring(x, y, z - r * 0.2 - 0.002, r * 0.62, 0.004, chrome, M.Metal, 'z', Z.Front);
  b.ring(x, y, z - r * 0.2 - 0.002, r * 0.3, 0.004, chrome, M.Metal, 'z', Z.Front);
  b.rod(v(x, y - r - 0.01, z + 0.06), v(x, y - r - 0.07, z + 0.06), 0.012, black, M.Metal, Z.Front);
}

/** The spare on the canopy's rear door (its centre), inside the end of the tray. */
export const LC79_SPARE = { y: 1.17, z: 2.8 };

/** Driving lamp lens centres, for the high-beam glow. */
export const LC79_DRIVING_LAMPS = [-0.21, 0.21].map((x) => ({
  x,
  y: 0.86,
  z: -2.51,
}));

/** Steel bar: a deep pan with swept wings, a centre hoop with a light bar, loops over the lamps. */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z;
  const back = F - 0.09;
  const zc = (face + back) / 2,
    depth = back - face;
  const panY = 0.28,
    panH = 0.34;
  const panShape = new THREE.Shape();
  panShape.moveTo(-0.61, -face);
  panShape.lineTo(0.61, -face);
  panShape.lineTo(0.98, -face - 0.16);
  panShape.lineTo(0.94, -back - 0.15);
  panShape.lineTo(0.58, -back);
  panShape.lineTo(-0.58, -back);
  panShape.lineTo(-0.94, -back - 0.15);
  panShape.lineTo(-0.98, -face - 0.16);
  panShape.closePath();
  const pan = new THREE.ExtrudeGeometry(panShape, {
    depth: panH - 0.03,
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 3,
    steps: 1,
  });
  pan.rotateX(-Math.PI / 2);
  pan.translate(0, panY - panH / 2 + 0.015, 0);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.geometry(pan, bar);
  for (const side of [-1, 1]) {
    b.push()
      .translate(side * 0.79, panY + 0.06, face + 0.08)
      .rotate(0, -side * 0.42, 0);
    b.block(0, 0, -0.012, 0.14, 0.06, 0.025, black, M.Rubber, Z.Front, 0.008);
    b.block(0, 0, -0.027, 0.12, 0.04, 0.009, amber, M.Amber, Z.Front, 0.005);
    b.pop();
  }
  const top = panY + panH / 2;
  b.block(0, top, zc + 0.01, 1.28, 0.03, depth + 0.03, bar, M.Metal, Z.Front, 0.012);
  for (const x of [-0.43, 0.43]) b.block(x, 0.16, back + 0.12, 0.08, 0.12, 0.28, bar, M.Metal, Z.Trim);
  const zt = F - 0.06;
  // Continuous bent hoops. Every tube end enters a welded post or a foot plate.
  const tube = (points: { x: number; y: number; z: number }[], r: number) =>
    continuousTube(
      b,
      points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      r,
      bar,
    );
  tube(
    [v(-0.4, top - 0.015, zc + 0.01), v(-0.4, 0.95, zt), v(0.4, 0.95, zt), v(0.4, top - 0.015, zc + 0.01)],
    0.032,
  );
  b.rod(v(-0.4, 0.765, (zc + zt) / 2), v(0.4, 0.765, (zc + zt) / 2), 0.022, bar, M.Metal, Z.Front);
  for (const side of [-1, 1]) {
    // Outboard of the indicators on the guards' corners, and ahead of them.
    const foot = v(side * 0.95, top, zc + 0.1);
    b.block(foot.x, top, foot.z, 0.1, 0.025, 0.1, bar, M.Metal, Z.Front, 0.006);
    tube(
      [v(foot.x, top - 0.01, foot.z), v(side * 0.99, 0.87, zt - 0.02), v(side * 0.4, 0.88, zt - 0.016)],
      0.028,
    );
    b.rod(v(side * 0.24, 0.95, zt), v(side * 0.24, 0.985, zt), 0.013, bar, M.Metal, Z.Front);
    // Lamp stem meets the middle rail rather than hanging ahead of it.
    b.rod(v(side * 0.21, 0.765, (zc + zt) / 2), v(side * 0.21, 0.775, -2.51), 0.013, bar, M.Metal, Z.Front);
  }
  b.block(0, 1.01, zt, 0.62, 0.07, 0.07, black, M.Metal, Z.Front, 0.012);
  b.block(0, 1.01, zt - 0.037, 0.58, 0.045, 0.006, lens, M.DrivingLamp, Z.Front, 0.004);
  // Driving lamps on the hoop's mid rail, in front of the grille.
  for (const p of LC79_DRIVING_LAMPS) drivingLamp(b, p.x, p.y, p.z, 0.085);
  // The winch sits inside the pan, hidden as in any winch bar: its control box shows on
  // the pan's top behind the face, and the roller fairlead is let into the face.
  b.block(0.12, top + 0.04, back - 0.06, 0.24, 0.08, 0.1, black, M.Rubber, Z.Front, 0.012);
  b.block(
    0.12,
    top + 0.081,
    back - 0.06,
    0.16,
    0.006,
    0.06,
    trim.clone().multiplyScalar(1.6),
    M.Rubber,
    Z.Front,
  );
  b.block(-0.1, top + 0.012, back - 0.06, 0.2, 0.024, 0.1, trim, M.Metal, Z.Front, 0.006);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.005, 0.34, 0.12, 0.02, steel, M.Metal, Z.Front, 0.006);
  b.block(m.x, m.y, face - 0.012, 0.2, 0.05, 0.015, black, M.Rubber, Z.Front);
  for (const y of [m.y - 0.032, m.y + 0.032])
    b.rod(v(m.x - 0.1, y, face - 0.03), v(m.x + 0.1, y, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.11, m.x + 0.11])
    b.rod(v(x, m.y - 0.045, face - 0.03), v(x, m.y + 0.045, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  for (const side of [-1, 1]) {
    const x = side * 0.6;
    b.block(x, 0.06, face + 0.02, 0.07, 0.08, 0.06, steel, M.Metal, Z.Trim);
    b.ring(x, 0.02, face - 0.01, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  }
  // The plate on the pan's face beside the fairlead (it used to sit behind it).
  numberPlate(b, -0.4, 0.22, face - 0.022, -1, 'VDJ-79', plateInk);
  // Whip aerial on the bar's right wing.
  b.rod(v(0.9, top + 0.02, zc + 0.14), v(0.92, top + 1.3, zc + 0.2), 0.004, black, M.Rubber, Z.Roof);
}

/** Snorkel: in through the right guard, up the windscreen pillar, a ram head above the roof. */
function snorkel(b: VehicleBuilder): void {
  const x = SIDE + 0.07;
  const pts = [
    v(SIDE - 0.02, clipTop(-1.2) - 0.06, -1.2),
    v(x, clipTop(-1.15) - 0.02, -1.15),
    v(x, WAIST + 0.02, pillarZ(WAIST) - 0.07),
    v(x, ROOF + 0.06, pillarZ(ROOF + 0.06) - 0.07),
  ];
  continuousTube(
    b,
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    0.05,
    black,
    Z.Front,
    M.Rubber,
  );
  // Flat body plate against the guard, the pillar brackets and the ram head.
  b.block(SIDE + 0.03, clipTop(-1.15) - 0.06, -1.16, 0.06, 0.2, 0.3, black, M.Rubber, Z.Front, 0.03);
  for (const y of [WAIST + 0.2, ROOF - 0.15])
    b.rod(v(SIDE - 0.01, y, pillarZ(y) + 0.06), v(x, y, pillarZ(y) - 0.06), 0.012, black, M.Metal, Z.Front);
  const top = pts[pts.length - 1];
  b.push()
    .translate(top.x, top.y + 0.09, top.z - 0.02)
    .rotate(-0.08, 0, 0);
  b.block(0, 0, 0, 0.13, 0.17, 0.2, black, M.Rubber, Z.Front, 0.05);
  b.block(0, 0.01, -0.101, 0.1, 0.12, 0.004, trim.clone().multiplyScalar(1.4), M.Rubber, Z.Front, 0.02);
  b.pop();
}

/** The alloy tray: deck, side rails, headboard, mudguards, under-tray boxes and the tail. */
function tray(b: VehicleBuilder): void {
  const { deck, front, back, half } = TRAY;
  const len = back - front,
    mid = (front + back) / 2;
  b.block(0, deck - 0.02, mid, half * 2, 0.04, len, alloy, M.Metal, Z.Rear, 0.006);
  // Deep side and rear rails under the deck edge, and the subframe on the chassis.
  for (const side of [-1, 1])
    extrudeX(
      b,
      sideShape([
        [front, deck - 0.18],
        [AXLE - 0.42, deck - 0.18],
        [AXLE - 0.27, deck - 0.06],
        [AXLE + 0.27, deck - 0.06],
        [AXLE + 0.42, deck - 0.18],
        [back, deck - 0.18],
        [back, deck - 0.02],
        [front, deck - 0.02],
      ]),
      side > 0 ? half - 0.04 : -half,
      side > 0 ? half : -half + 0.04,
      alloy,
      M.Metal,
      Z.Sides,
      0.004,
    );
  // Dark wheelhouse walls behind the rails' raised arches, so the gap over each rear tyre
  // doesn't show daylight through to the other side.
  for (const side of [-1, 1])
    b.block(side * (half - 0.06), deck - 0.11, AXLE, 0.02, 0.14, 0.86, well, M.Rubber, Z.Trim);
  b.block(0, deck - 0.1, back - 0.02, half * 2, 0.16, 0.04, alloy, M.Metal, Z.Rear, 0.008);
  for (const z of [0.7, 1.1, 2.1, 2.55, 2.9])
    b.block(
      0,
      deck - 0.12,
      z,
      half * 2 - 0.08,
      0.08,
      0.06,
      alloy.clone().multiplyScalar(0.8),
      M.Metal,
      Z.Trim,
    );
  for (const x of [-0.43, 0.43])
    b.block(x, (deck - 0.16 + 0.09) / 2, mid, 0.08, deck - 0.25, len - 0.1, black, M.Metal, Z.Trim);
  // Headboard behind the cab, the canopy's front wall above it.
  b.block(0, deck + 0.2, front + 0.02, half * 2 - 0.04, 0.4, 0.04, alloy, M.Metal, Z.Rear, 0.006);
  // Box mudguards under the deck over the rear wheels: a flat top, a short front face,
  // and a back face with a rubber flap hanging below it.
  for (const side of [-1, 1]) {
    const x = side * 0.8,
      top = deck - 0.04,
      half = 0.58;
    b.block(x, top, AXLE, 0.38, 0.02, half * 2, flare, M.Rubber, Z.Trim, 0.006);
    b.block(x, top - 0.09, AXLE - half, 0.38, 0.18, 0.02, flare, M.Rubber, Z.Trim, 0.006);
    b.block(x, top - 0.16, AXLE + half, 0.38, 0.32, 0.02, flare, M.Rubber, Z.Trim, 0.006);
    b.block(x, top - 0.52, AXLE + half + 0.005, 0.38, 0.4, 0.012, rubber, M.Rubber, Z.Trim);
    // Under-tray toolbox ahead of the wheel, and a water tank behind it.
    b.block(
      side * 0.72,
      deck - 0.36,
      0.84,
      0.44,
      0.36,
      0.5,
      alloy.clone().multiplyScalar(0.92),
      M.Metal,
      Z.Sides,
      0.01,
    );
    b.block(side * 0.94, deck - 0.36, 0.84, 0.006, 0.3, 0.44, black, M.Rubber, Z.Sides);
    b.block(side * 0.95, deck - 0.3, 0.84, 0.012, 0.03, 0.12, steel, M.Metal, Z.Sides, 0.004);
  }
  b.block(0, deck - 0.3, 2.55, 1.2, 0.3, 0.5, black.clone().multiplyScalar(1.2), M.Rubber, Z.Trim, 0.03);
  // Tail: lamps under the deck's back corners, the rear bar with a step, hitch and plate.
  for (const side of [-1, 1]) {
    const lx = side * (half - 0.16);
    b.block(lx, deck - 0.11, back + 0.004, 0.26, 0.11, 0.02, black, M.Rubber, Z.Rear, 0.01);
    b.block(lx + side * 0.07, deck - 0.11, back + 0.016, 0.1, 0.07, 0.008, red, M.Red, Z.Rear, 0.006);
    b.block(lx - side * 0.025, deck - 0.11, back + 0.016, 0.07, 0.07, 0.008, amber, M.Amber, Z.Rear, 0.006);
    b.block(lx - side * 0.095, deck - 0.11, back + 0.016, 0.05, 0.07, 0.008, lens, M.Lamp, Z.Rear, 0.006);
  }
  b.block(0, 0.12, back + 0.02, 1.68, 0.14, 0.12, bar, M.Metal, Z.Rear, 0.02);
  for (const x of [-0.43, 0.43]) b.block(x, 0.12, back - 0.2, 0.06, 0.08, 0.36, black, M.Metal, Z.Trim);
  b.block(0, 0.06, back + 0.12, 0.08, 0.06, 0.16, black, M.Metal, Z.Rear, 0.01);
  b.slot = M.Metal;
  b.push().translate(0, 0.11, back + 0.2);
  b.geometry(new THREE.SphereGeometry(0.03, 12, 8), steel);
  b.pop();
  for (const side of [-1, 1]) b.ring(side * 0.62, 0.04, back + 0.1, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  // Clear of the right shackle (v1.94: the shackle ran into its lower edge).
  numberPlate(b, 0.36, 0.15, back + 0.084, 1, 'VDJ-79', plateInk);
}

/** A spare wheel standing with its face to the back, or lying flat. */
function spare(
  b: VehicleBuilder,
  wheel: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  flat: boolean,
): void {
  b.tag = flat ? Z.Roof : Z.Rear;
  if (flat) mountSpare(b, wheel, { x, y, z }, 'up', black);
  else mountSpare(b, wheel, { x, y, z }, 'back', black, { reversed: true });
}

/** The canopy: black alloy box with gullwing doors each side, a rear door and a roof rack. */
function canopyBox(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const { front, back, top, half } = CAN;
  const base = TRAY.deck;
  const s = new THREE.Shape(
    rounded([
      [-half, base],
      [half, base],
      [half, top - 0.09, 0.02],
      [half - 0.08, top, 0.02],
      [-half + 0.08, top, 0.02],
      [-half, top - 0.09, 0.02],
    ]),
  );
  extrudeZ(b, s, front, back, canopy, M.Paint, Z.Rear, 0.02);
  const doors = [
    [front + 0.04, (front + back) / 2 - 0.01],
    [(front + back) / 2 + 0.01, back - 0.04],
  ];
  const panel = canopy.clone().multiplyScalar(1.26);
  for (const side of [-1, 1])
    for (const [z0, z1] of doors) {
      const mid = (z0 + z1) / 2,
        low = base + 0.075,
        high = top - 0.125,
        cy = (low + high) / 2;
      b.block(
        side * (half + 0.004),
        cy,
        mid,
        0.018,
        high - low + 0.018,
        z1 - z0 + 0.012,
        black,
        M.Rubber,
        Z.Sides,
        0.008,
      );
      b.block(
        side * (half + 0.015),
        cy,
        mid,
        0.016,
        high - low - 0.008,
        z1 - z0 - 0.016,
        panel,
        M.Paint,
        Z.Sides,
        0.012,
      );
      for (const z of [z0 + 0.13, z1 - 0.13]) {
        b.block(side * (half + 0.026), high - 0.012, z, 0.026, 0.024, 0.11, bar, M.Metal, Z.Sides, 0.005);
        b.rod(
          v(side * (half + 0.032), high - 0.012, z - 0.05),
          v(side * (half + 0.032), high - 0.012, z + 0.05),
          0.012,
          steel,
          M.Metal,
          Z.Sides,
        );
      }
      b.block(side * (half + 0.026), base + 0.3, mid, 0.012, 0.085, 0.19, black, M.Rubber, Z.Sides, 0.012);
      b.block(side * (half + 0.036), base + 0.3, mid, 0.018, 0.025, 0.12, steel, M.Metal, Z.Sides, 0.006);
      b.block(
        side * (half + 0.035),
        high - 0.17,
        z0 + 0.2,
        0.012,
        0.13,
        0.22,
        black,
        M.Rubber,
        Z.Sides,
        0.008,
      );
      for (let i = 0; i < 3; i++)
        b.block(
          side * (half + 0.045),
          high - 0.13 - i * 0.033,
          z0 + 0.2,
          0.016,
          0.014,
          0.19,
          trim.clone().multiplyScalar(1.8),
          M.Metal,
          Z.Sides,
          0.004,
        );
    }
  // Rear hatch gasket, raised skin, actual hinge knuckles and latch surround.
  b.block(0, base + 0.46, back + 0.008, 1.72, 0.79, 0.018, black, M.Rubber, Z.Rear, 0.02);
  b.block(0, base + 0.46, back + 0.02, 1.695, 0.765, 0.016, panel, M.Paint, Z.Rear, 0.018);
  for (const x of [-0.61, 0.61])
    b.rod(
      v(x - 0.08, top - 0.105, back + 0.036),
      v(x + 0.08, top - 0.105, back + 0.036),
      0.012,
      steel,
      M.Metal,
      Z.Rear,
    );
  b.block(0.63, base + 0.3, back + 0.035, 0.18, 0.085, 0.015, black, M.Rubber, Z.Rear, 0.01);
  b.block(0.63, base + 0.3, back + 0.048, 0.12, 0.025, 0.018, steel, M.Metal, Z.Rear, 0.006);
  for (const side of [-1, 1])
    b.block(side * 0.68, top - 0.05, back + 0.01, 0.16, 0.025, 0.016, red, M.Red, Z.Rear, 0.006);
  // The spare on the rear door: a carrier frame bolted through the door, a hub plate and
  // the wheel, its outer face just inside the end of the tray.
  const sp = LC79_SPARE;
  // The frame lies on the door skin; 28 mm further out it was in the tyre's inner sidewall.
  for (const y of [sp.y - 0.3, sp.y + 0.3])
    b.block(0, y, back + 0.02, 0.7, 0.05, 0.04, bar, M.Metal, Z.Rear, 0.008);
  for (const x of [-0.3, 0.3]) b.block(x, sp.y, back + 0.02, 0.05, 0.65, 0.04, bar, M.Metal, Z.Rear, 0.008);
  b.block(0, sp.y, back + 0.075, 0.24, 0.24, 0.04, bar, M.Metal, Z.Rear, 0.01);
  spare(b, wheel, 0, sp.y, sp.z, false);
  // Roof rack: two rails on low feet and cross bars, the platform for the recovery boards.
  for (const side of [-1, 1]) {
    b.block(
      side * 0.8,
      RACK.y,
      (front + back) / 2,
      0.05,
      0.04,
      back - front - 0.08,
      bar,
      M.Metal,
      Z.Roof,
      0.01,
    );
    for (const z of [front + 0.15, (front + back) / 2, back - 0.15])
      b.block(side * 0.8, (top + RACK.y) / 2, z, 0.05, RACK.y - top, 0.05, bar, M.Metal, Z.Roof);
  }
  for (let i = 0; i <= 6; i++)
    b.block(
      0,
      RACK.y,
      front + 0.1 + ((back - front - 0.2) * i) / 6,
      1.6,
      0.03,
      0.04,
      bar,
      M.Metal,
      Z.Roof,
      0.006,
    );
  // The second spare lies flat in the middle of the rack, between the boards, with a
  // strap over it.
  const sy = RACK.y + 0.015 + spareSidewall(wheel) + 0.004,
    sz = LC79_ROOF_SPARE_Z;
  spare(b, wheel, 0, sy, sz, true);
  const strapY = sy + tuning.wheelWidth * 0.53 + 0.006;
  b.block(0, strapY, sz, 0.98, 0.008, 0.05, black, M.Rubber, Z.Roof);
  for (const side of [-1, 1])
    b.rod(v(side * 0.49, strapY, sz), v(side * 0.52, RACK.y, sz), 0.012, black, M.Rubber, Z.Roof);
}

function chassis(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    b.block(side * 0.32, 0, -1.74, 0.09, 0.16, 1.22, black, M.Metal, Z.Trim);
    b.rod(v(side * 0.32, 0, -1.15), v(side * 0.43, 0, -0.9), 0.045, black, M.Metal, Z.Trim);
    b.block(side * 0.43, 0, 1.075, 0.09, 0.16, 3.55, black, M.Metal, Z.Trim);
  }
  for (const z of [-2.1, -0.95, 0.5, 1.9, 2.8]) b.block(0, 0.0, z, 0.86, 0.08, 0.08, black, M.Metal, Z.Trim);
  b.block(0.04, -0.02, -0.45, 0.4, 0.17, 0.7, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.6);
  b.rod({ x: 0.1, y: -0.06, z: -0.75 }, { x: 0.08, y: -0.12, z: -1.46 }, 0.032, shaft);
  b.rod({ x: 0.0, y: -0.05, z: -0.1 }, { x: 0.05, y: -0.1, z: 1.48 }, 0.036, shaft);
  // The 3 inch straight-through exhaust out ahead of the right rear wheel.
  b.rod({ x: 0.3, y: -0.04, z: -1.4 }, { x: 0.3, y: -0.06, z: 0.3 }, 0.038, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.3, -0.06, 0.55)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14), shaft);
  b.pop();
  b.rod({ x: 0.3, y: -0.06, z: 0.8 }, { x: 0.66, y: -0.04, z: 1.0 }, 0.038, steel);
  b.ring(0.68, -0.04, 1.01, 0.04, 0.008, black, M.Metal, 'z', Z.Trim);
  // Floor under the cab.
  b.block(0, 0.2, -0.25, 1.6, 0.03, 1.5, black, M.Rubber, Z.Trim);
}

export function buildLc79Body(
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
  paint: THREE.Color = lc79Colors.paint,
): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  cabSides(b, paint);
  frontEnd(b, paint);
  flares(b);
  windscreen(b, paint);
  roof(b, paint);
  bullBar(b, tuning);
  snorkel(b);
  tray(b);
  canopyBox(b, tuning, wheel);
  chassis(b);
  b.push().translate(0, DY, 0);
  addTroopyInterior(b, tuning.engine.redlineRpm, paint, true);
  b.pop();
  return cleanGeometry(b.build());
}

/** A 37×12.5R17 mud-terrain tyre with big shoulder lugs on a black beadlock-style wheel. */
export function buildLc79Wheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#202221');
  const rim = lc79Colors.wheel;
  const rimR = 0.225;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.46],
    [r * 0.68, -w * 0.53],
    [r * 0.9, -w * 0.5],
    [r * 0.955, -w * 0.42],
    [r * 0.955, w * 0.42],
    [r * 0.9, w * 0.5],
    [r * 0.68, w * 0.53],
    [rimR - 0.01, w * 0.46],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Big staggered tread lugs that run over the shoulder onto the sidewall.
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.26, Math.cos(angle) * r * 0.955, Math.sin(angle) * r * 0.955)
        .rotate(angle, side * 0.2, 0);
      b.box(w * 0.46, 0.045, 0.095, tyre);
      b.pop();
      b.push()
        .translate(side * w * 0.5, Math.cos(angle) * r * 0.86, Math.sin(angle) * r * 0.86)
        .rotate(angle, 0, 0);
      b.box(0.03, 0.05, 0.075, tyre);
      b.pop();
    }
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.72, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Beadlock ring with its bolts, the dished face with six spokes, and the centre cap.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.016, rim, M.Paint, 'x');
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.008), Math.cos(a) * (rimR - 0.004), Math.sin(a) * (rimR - 0.004))
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 6), steel);
      b.pop();
    }
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.06), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 24),
      rim.clone().multiplyScalar(0.7),
    );
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.push()
        .translate(side * (w * 0.5 - 0.03), Math.cos(a) * 0.13, Math.sin(a) * 0.13)
        .rotate(a, 0, 0);
      b.block(0, 0, 0, 0.05, 0.17, 0.05, rim, M.Paint, Z.Trim, 0.012);
      b.pop();
    }
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.075, 0.09, 0.04, 28), rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.004), Math.cos(a) * 0.07, Math.sin(a) * 0.07)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.011, 0.013, 0.02, 6), steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.008), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 12), steel.clone().multiplyScalar(0.9));
    b.pop();
  }
  return cleanGeometry(b.build());
}

/** A recovery board strapped to the canopy's roof rack (index 0 on the left). */
export function buildLc79Plank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const board = new THREE.Color('#C7742E');
  // Out by the rails, clear of the spare; the boards are longer than the rack, so their
  // ends overhang a little at the front and over the spare at the back.
  const x = index === 0 ? -0.68 : 0.68,
    y = RACK.y + 0.04,
    z = (CAN.front + CAN.back) / 2;
  const L = plankTuning.length,
    W = plankTuning.width;
  b.block(x, y, z, W, 0.05, L, board, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.12 + i * 0.08,
      y + 0.026,
      z,
      0.004,
      0.003,
      L - 0.06,
      board.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const dz of [-0.5866666667, 0.5866666667]) {
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(x + (s * (W + 0.02)) / 2, y - 0.025, z + dz, 0.012, 0.11, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, y - 0.074, z + dz, W + 0.03, 0.012, 0.045, black, M.Rubber, Z.Roof);
  }
  return cleanGeometry(b.build());
}
