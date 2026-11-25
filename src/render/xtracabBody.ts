import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { xtracabColors } from './xtracabPaint';
import { extrudeX, extrudeZ, frontPane, inset, rounded, sidePane, sideShape, type Vtx } from './bodyShapes';
import { mirrorGlass, mirrorHead } from './mirrors';
import { strokeText } from './bodyKit';
import { cleanGeometry, subdivideSurface } from './bodyRefinement';
import { mountSpare } from './spares';
import { addXtracabInterior } from './xtracabInterior';
import { frontBar, rearBar, rollBar, towTongue, winch } from './xtracabGear';
import { AXLE, BED, F, SIDE } from './xtracabLayout';

/**
 * 1985 Toyota Pickup (Hilux) SR5 Xtracab 4x4 in gloss black, left-hand drive: a flat bonnet
 * that falls to an upright nose with one rectangular headlamp a side in an argent bezel and a
 * big amber lamp round each corner, a steeply raked screen, a low roof, the extended cab with
 * its narrow quarter window behind the door, the short styleside bed with squared wheel
 * openings under black flares, and TOYOTA pressed into the tailgate. Fitted as the film truck
 * was: double-tube bumpers front and rear, a hoop over the grille carrying two rectangular
 * lamps, a double-hoop roll bar in the bed with four round lamps on top (all six under yellow
 * covers), and black steel wheels with chromed rims on 31 inch tyres at stock height. Added
 * for the game: a winch between the frame horns and the two recovery boards on the bed floor.
 * The ground is about 0.51 m below the origin when parked.
 * Photographs, dimensions and the fit-out's sources:
 * reference/vehicles/hilux-sr5-xtracab-1985/SOURCES.md.
 */
const { paint, flare, argent, chrome } = xtracabColors;
const black = new THREE.Color('#1B1D1E'),
  rubber = new THREE.Color('#222524'),
  steel = new THREE.Color('#8F938D'),
  well = new THREE.Color('#232526');
const red = new THREE.Color('#B3271F'),
  amber = new THREE.Color('#E5992F'),
  lens = new THREE.Color('#E6E4D2');
const glass = new THREE.Color('#8FA6A6');

/** The flares' half-width: the published 1.69 m. */
const FLARE = 0.845;
const SILL = 0.07;
const WAIST = 0.725;
const ROOF = 1.225;
const NOSE_TOP = 0.565;
const COWL = { y: 0.775, z: -1.03 };
const SCREEN_TOP = { y: 1.185, z: -0.44 };
const DOOR = { front: -0.894, back: 0.165 };
const CAB_BACK = 0.515;
const CLIP = { back: DOOR.front - 0.012, top: 0.74 };
/** Tops of the wheel openings: 0.537 and 0.528 m above the hubs in the side photograph. */
const ARCH = { front: 0.417, rear: 0.408 };
const LAMP = { y: 0.41, low: 0.315, high: 0.505 };
/** The flat top of the pressed fenders round the wheel openings. */
const FENDER_TOP = 0.515;

const v = (x: number, y: number, z: number) => ({ x, y, z });
/** Where the screen pillar's front edge is at height y. */
const pillarZ = (y: number) => COWL.z + ((y - COWL.y) * (SCREEN_TOP.z - COWL.z)) / (SCREEN_TOP.y - COWL.y);
const clipTop = (z: number) => NOSE_TOP + ((z - F) / (CLIP.back - F)) * (CLIP.top - NOSE_TOP);

/**
 * A wheel opening's outline from the sill behind the wheel, over its flat top, to the lower
 * edge ahead of it: squared, with rounded upper corners, as on the 1984–88 trucks.
 */
function opening(axle: number, front: boolean): Vtx[] {
  return front
    ? [
        [axle + 0.47, SILL],
        [axle + 0.4, 0.26, 0.05],
        [axle + 0.25, ARCH.front, 0.11],
        [axle - 0.22, ARCH.front, 0.11],
        [axle - 0.375, 0.21, 0.04],
        [axle - 0.4, 0.17],
      ]
    : [
        [axle + 0.37, 0.205],
        [axle + 0.355, 0.24, 0.03],
        [axle + 0.22, ARCH.rear, 0.1],
        [axle - 0.23, ARCH.rear, 0.1],
        [axle - 0.385, 0.2, 0.04],
        [axle - 0.4, 0.15],
      ];
}

/** A strip `grow` wide along the outside of an opening's outline, for its flare. */
function band(path: Vtx[], grow: number): Vtx[] {
  const n = path.length;
  const normal = (i: number, j: number) => {
    const dz = path[j][0] - path[i][0],
      dy = path[j][1] - path[i][1],
      l = Math.hypot(dz, dy);
    return [dy / l, -dz / l];
  };
  const outer: Vtx[] = path.map(([z, y, r = 0], i) => {
    const a = normal(Math.max(0, i - 1), Math.max(1, i)),
      c = normal(Math.min(n - 2, i), Math.min(n - 1, i + 1));
    const k = grow / (1 + a[0] * c[0] + a[1] * c[1]);
    return [z + (a[0] + c[0]) * k, y + (a[1] + c[1]) * k, r ? r + grow : 0];
  });
  return [...outer, ...[...path].reverse()];
}

/** Raise the bonnet's centre 35 mm over the fender tops, fading out to the nose. */
function crownBonnet(geometry: THREE.BufferGeometry, x0: number): THREE.BufferGeometry {
  const g = subdivideSurface(geometry, (p, n) => p.y > 0.5 && n.y > 0.96, 4);
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal');
  const height = (x: number, z: number) => {
    const u = THREE.MathUtils.clamp((z - F) / (CLIP.back - F), 0, 1),
      a = Math.max(0, 1 - (x / 0.66) ** 2),
      q = THREE.MathUtils.smoothstep(u, 0.02, 0.55);
    return 0.035 * a * a * q;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + x0,
      z = p.getZ(i),
      y = p.getY(i);
    const fade = THREE.MathUtils.smoothstep(y, clipTop(z) - 0.05, clipTop(z) - 0.005);
    if (fade <= 0) continue;
    const e = 0.004;
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e),
      dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    p.setY(i, y + height(x, z) * fade);
    const ny = n.getY(i);
    const normal = new THREE.Vector3(n.getX(i) - dx * ny * fade, ny, n.getZ(i) - dz * ny * fade).normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return g;
}

function frontEnd(b: VehicleBuilder): void {
  // The front clip in one piece across the car: the upright nose, the bonnet rising to the
  // cowl, the fenders with their squared wheel openings.
  const R = 0.045;
  extrudeX(
    b,
    sideShape([
      [F, 0.17, 0.03],
      [F, NOSE_TOP, 0.04],
      [CLIP.back, CLIP.top, 0.01],
      [CLIP.back, SILL],
      ...opening(-AXLE, true),
    ]),
    -SIDE,
    SIDE,
    paint,
    M.Paint,
    Z.Front,
    R,
    [[-AXLE, -0.1]],
    4,
    0.6,
    (g) => crownBonnet(g, -SIDE + R),
  );
  for (const side of [-1, 1]) {
    // Black flare round the opening, out to the published width.
    extrudeX(
      b,
      sideShape(band(opening(-AXLE, true), 0.05)),
      side > 0 ? SIDE - 0.012 : -FLARE,
      side > 0 ? FLARE : -SIDE + 0.012,
      flare,
      M.Rubber,
      Z.Front,
      0.014,
    );
    // The pressed fender round the front opening, from the corner lamp back to the door.
    extrudeX(
      b,
      sideShape([
        [F + 0.13, 0.17, 0.01],
        [F + 0.13, FENDER_TOP - 0.03, 0.04],
        [CLIP.back - 0.004, FENDER_TOP, 0.02],
        [CLIP.back - 0.004, SILL, 0.01],
        ...opening(-AXLE, true),
      ]),
      side > 0 ? SIDE - 0.02 : -SIDE - 0.022,
      side > 0 ? SIDE + 0.022 : -SIDE + 0.02,
      paint,
      M.Paint,
      Z.Front,
      0.014,
      [[-AXLE, -0.1]],
    );
    // The front damper's top eye (drawn by the shared suspension) hangs from a bracket under
    // the wheelhouse roof.
    b.block(side * 0.54, 0.4, -AXLE + 0.23, 0.05, 0.12, 0.06, well, M.Metal, Z.Trim);
    // Dark wheelhouse: an inner wall clear of the tyre at full lock, and a roof over it.
    b.block(side * 0.35, 0.2, -AXLE, 0.03, 0.56, 0.98, well, M.Rubber, Z.Trim);
    b.block(side * 0.575, ARCH.front + 0.045, -AXLE, 0.47, 0.02, 0.9, well, M.Rubber, Z.Trim);
    // The pressed crease along the fender, level with the one on the door and the bed.
    b.block(
      side * (SIDE + 0.002),
      0.545,
      (F + 0.1 + CLIP.back) / 2,
      0.006,
      0.01,
      CLIP.back - F - 0.14,
      paint,
      M.Paint,
      Z.Front,
      0.003,
    );
    // Shut line between the bonnet and the fender.
    b.rod(
      v(side * 0.7, clipTop(F + 0.05) + 0.004, F + 0.05),
      v(side * 0.7, clipTop(COWL.z - 0.1) + 0.006, COWL.z - 0.1),
      0.004,
      black,
      M.Rubber,
      Z.Front,
    );
    // The bonnet's two pressed lines, closing in towards the nose.
    b.rod(
      v(side * 0.24, clipTop(F + 0.1) + 0.012, F + 0.1),
      v(side * 0.36, clipTop(COWL.z - 0.1) + 0.033, COWL.z - 0.1),
      0.005,
      paint,
      M.Paint,
      Z.Front,
    );
  }
  // Cowl panel under the screen with its vent slots.
  b.block(0, COWL.y - 0.012, COWL.z - 0.04, 1.5, 0.03, 0.12, paint, M.Paint, Z.Front, 0.012);
  for (let i = 0; i < 11; i++)
    b.block(-0.5 + i * 0.1, COWL.y + 0.004, COWL.z - 0.05, 0.06, 0.004, 0.05, black, M.Rubber, Z.Front);

  // The face: a black grille between the lamps, an argent bezel round each rectangular
  // headlamp and a tall amber lamp outboard of it that wraps round the corner.
  const gw = 0.86,
    gh = LAMP.high - LAMP.low;
  b.block(0, LAMP.y, F - 0.004, gw, gh, 0.02, black, M.Rubber, Z.Front, 0.008);
  for (const y of [LAMP.low + 0.008, LAMP.high - 0.008])
    b.block(0, y, F - 0.014, gw, 0.01, 0.008, argent, M.Metal, Z.Front);
  b.block(0, LAMP.y, F - 0.016, gw - 0.02, 0.026, 0.01, well, M.Rubber, Z.Front, 0.004);
  for (const x of [-0.145, 0.145])
    b.block(x, LAMP.y, F - 0.016, 0.022, gh - 0.03, 0.01, well, M.Rubber, Z.Front, 0.004);
  // TOYOTA in the grille's upper cell on the truck's left, as on the 1984–86 face.
  strokeText(b, 'TOYOTA', {
    x: -0.2,
    y: LAMP.y + 0.035,
    z: F - 0.02,
    dir: -1,
    w: 0.022,
    h: 0.03,
    pitch: 0.033,
    radius: 0.0028,
    colour: argent,
    slot: M.Metal,
    zone: Z.Front,
  });
  for (const side of [-1, 1]) {
    b.block(side * 0.555, LAMP.y, F - 0.006, 0.25, gh, 0.024, argent, M.Metal, Z.Front, 0.008);
    b.block(side * 0.575, LAMP.y, F - 0.012, 0.2, 0.145, 0.02, black, M.Rubber, Z.Front, 0.008);
    b.block(side * 0.575, LAMP.y, F - 0.022, 0.185, 0.13, 0.012, lens, M.Headlamp, Z.Front, 0.006);
    for (let i = -3; i <= 3; i++)
      b.block(
        side * 0.575 + i * 0.024,
        LAMP.y,
        F - 0.029,
        0.0025,
        0.118,
        0.002,
        lens.clone().multiplyScalar(0.84),
        M.Headlamp,
        Z.Front,
      );
    b.block(side * 0.745, LAMP.y, F - 0.004, 0.125, gh, 0.03, black, M.Rubber, Z.Front, 0.01);
    b.block(side * 0.742, LAMP.y, F - 0.016, 0.105, gh - 0.02, 0.012, amber, M.Amber, Z.Front, 0.006);
    b.block(side * (SIDE + 0.001), LAMP.y, F + 0.05, 0.012, gh - 0.02, 0.085, amber, M.Amber, Z.Front, 0.005);
    // Amber turn lamps in the valance, between the two bumper tubes.
    b.block(side * 0.55, 0.19, F - 0.006, 0.12, 0.04, 0.012, black, M.Rubber, Z.Front, 0.005);
    b.block(side * 0.55, 0.19, F - 0.013, 0.105, 0.028, 0.008, amber, M.Amber, Z.Front, 0.004);
  }
  // Radiator support and sump guard behind the valance.
  b.block(0, 0.02, -1.72, 0.44, 0.03, 0.62, black, M.Metal, Z.Trim, 0.01);
  b.block(0, 0.2, -AXLE, 0.66, 0.5, 0.86, well, M.Rubber, Z.Trim);
  // Whip aerial on the right front fender, ahead of the screen pillar.
  b.block(0.74, clipTop(-1.2) + 0.012, -1.2, 0.045, 0.03, 0.045, black, M.Rubber, Z.Front, 0.01);
  b.rod(
    v(0.74, clipTop(-1.2) + 0.02, -1.2),
    v(0.75, clipTop(-1.2) + 0.86, -1.14),
    0.004,
    steel,
    M.Metal,
    Z.Roof,
  );
}

const WIN = { low: WAIST + 0.03, top: 1.14 };
/** The door glass (its front edge stands more upright than the screen pillar) and the quarter window. */
const doorWindow: Vtx[] = [
  [-0.8, WIN.low, 0.02],
  [DOOR.back - 0.05, WIN.low, 0.02],
  [DOOR.back - 0.05, WIN.top, 0.03],
  [pillarZ(WIN.top) + 0.085, WIN.top, 0.03],
];
const quarterWindow: Vtx[] = [
  [DOOR.back + 0.075, WIN.low + 0.02, 0.02],
  [CAB_BACK - 0.07, WIN.low + 0.02, 0.02],
  [CAB_BACK - 0.07, WIN.top - 0.01, 0.03],
  [DOOR.back + 0.075, WIN.top - 0.01, 0.03],
];

/** Each side of the cab in one panel, from the fender to the back corner. */
function cabSides(b: VehicleBuilder): void {
  const outline: Vtx[] = [
    [CLIP.back + 0.004, SILL, 0.01],
    [CLIP.back + 0.004, CLIP.top - 0.02],
    [pillarZ(CLIP.top), CLIP.top],
    [pillarZ(ROOF - 0.01), ROOF - 0.01, 0.03],
    [CAB_BACK, ROOF - 0.01, 0.03],
    [CAB_BACK, SILL, 0.01],
  ];
  const shape = sideShape(outline, [doorWindow, quarterWindow]);
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? SIDE - 0.04 : -SIDE;
    extrudeX(b, shape, x0, x0 + 0.04, paint, M.Paint, Z.Sides, 0.012);
    for (const win of [doorWindow, quarterWindow]) {
      sidePane(b, win, side, side * (SIDE - 0.022), rubber, M.Rubber, Z.Glass, inset(win, 0.02));
      // The glass fills the whole opening, so no gap shows round it from inside.
      sidePane(b, inset(win, 0.002), side, side * (SIDE - 0.02), glass, M.Glass, Z.Glass);
    }
    const x = side * (SIDE + 0.001);
    // Vent window divider: from the bottom of the glass up to its sloping front edge.
    const ventZ = -0.63,
      ventTop = WIN.low + ((ventZ + 0.8) * (WIN.top - WIN.low)) / (pillarZ(WIN.top) + 0.085 + 0.8) - 0.012;
    b.block(
      side * (SIDE - 0.018),
      (WIN.low + ventTop) / 2,
      ventZ,
      0.012,
      ventTop - WIN.low,
      0.016,
      black,
      M.Rubber,
      Z.Sides,
    );
    // Door shut lines: up the front to the waist, up the back to the roof, along the sill.
    b.block(
      x,
      (SILL + CLIP.top) / 2,
      DOOR.front,
      0.006,
      CLIP.top - SILL - 0.05,
      0.006,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(
      x,
      (SILL + ROOF) / 2 - 0.02,
      DOOR.back,
      0.006,
      ROOF - SILL - 0.1,
      0.006,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(
      x,
      SILL + 0.035,
      (DOOR.front + DOOR.back) / 2,
      0.006,
      0.006,
      DOOR.back - DOOR.front,
      black,
      M.Rubber,
      Z.Sides,
    );
    // The pressed crease, the flush handle in its recess and the lock.
    for (const [from, to] of [
      [DOOR.front + 0.015, DOOR.back - 0.015],
      [DOOR.back + 0.015, CAB_BACK - 0.02],
    ])
      b.block(
        side * (SIDE + 0.002),
        0.545,
        (from + to) / 2,
        0.006,
        0.01,
        to - from,
        paint,
        M.Paint,
        Z.Sides,
        0.003,
      );
    b.block(
      side * (SIDE + 0.003),
      0.63,
      DOOR.back - 0.14,
      0.01,
      0.045,
      0.13,
      black,
      M.Rubber,
      Z.Sides,
      0.004,
    );
    b.block(side * (SIDE + 0.008), 0.638, DOOR.back - 0.14, 0.008, 0.022, 0.1, well, M.Metal, Z.Sides, 0.003);
    b.ring(side * (SIDE + 0.004), 0.585, DOOR.back - 0.075, 0.011, 0.004, chrome, M.Metal, 'x', Z.Sides);
    // Drip rail along the roof edge.
    b.rod(
      v(side * (SIDE - 0.004), ROOF - 0.035, pillarZ(ROOF) + 0.14),
      v(side * (SIDE - 0.004), ROOF - 0.035, CAB_BACK - 0.02),
      0.008,
      paint,
      M.Paint,
      Z.Roof,
    );
    // Black door mirror: a plate bolted to the door below the glass, a bent wire arm out
    // from it and the rectangular head on the arm's end.
    const mz = -0.72;
    b.block(side * (SIDE + 0.01), WAIST - 0.06, mz, 0.022, 0.07, 0.11, black, M.Rubber, Z.Sides, 0.008);
    b.chain(
      [
        v(side * (SIDE + 0.016), WAIST - 0.075, mz + 0.03),
        v(side * (SIDE + 0.09), WAIST - 0.06, mz + 0.02),
        v(side * (SIDE + 0.15), WAIST + 0.0, mz),
        v(side * (SIDE + 0.15), WAIST + 0.045, mz - 0.005),
      ],
      0.007,
      black,
      M.Metal,
      Z.Sides,
    );
    b.rod(
      v(side * (SIDE + 0.016), WAIST - 0.04, mz - 0.03),
      v(side * (SIDE + 0.15), WAIST + 0.02, mz - 0.004),
      0.006,
      black,
      M.Metal,
      Z.Sides,
    );
    mirrorHead(b, side, v(side * (SIDE + 0.155), WAIST + 0.105, mz), 0.2, 0.135, 0.06, black);
  }
  // The back wall with its wide rear window.
  const e = SIDE - 0.012;
  const win: Vtx[] = [
    [-0.6, WIN.low + 0.03, 0.04],
    [0.6, WIN.low + 0.03, 0.04],
    [0.6, WIN.top - 0.02, 0.04],
    [-0.6, WIN.top - 0.02, 0.04],
  ];
  const s = new THREE.Shape(
    rounded([
      [-e, SILL + 0.03],
      [e, SILL + 0.03],
      [e, ROOF - 0.03],
      [-e, ROOF - 0.03],
    ]),
  );
  s.holes.push(new THREE.Path(rounded(win)));
  extrudeZ(b, s, CAB_BACK - 0.035, CAB_BACK, paint, M.Paint, Z.Rear, 0.01);
  frontPane(b, win, CAB_BACK - 0.014, 1, rubber, M.Rubber, Z.Glass, inset(win, 0.02));
  frontPane(b, inset(win, 0.002), CAB_BACK - 0.012, 1, glass, M.Glass, Z.Glass);
  // Floor pan and sills between the two sides.
  b.block(
    0,
    SILL + 0.012,
    (CLIP.back + CAB_BACK) / 2,
    2 * SIDE - 0.05,
    0.025,
    CAB_BACK - CLIP.back,
    well,
    M.Rubber,
    Z.Trim,
  );
}

function windscreen(b: VehicleBuilder): void {
  const lean = Math.atan2(SCREEN_TOP.z - COWL.z, SCREEN_TOP.y - COWL.y);
  const L = (ROOF - 0.012 - COWL.y) / Math.cos(lean);
  const w = SIDE - 0.004;
  const outer: Vtx[] = [
    [-w, -0.05, 0.02],
    [w, -0.05, 0.02],
    [w, L, 0.04],
    [-w, L, 0.04],
  ];
  const hole: Vtx[] = [
    [-w + 0.07, 0.03, 0.05],
    [w - 0.07, 0.03, 0.05],
    [w - 0.07, L - 0.075, 0.05],
    [-w + 0.07, L - 0.075, 0.05],
  ];
  b.push().translate(0, COWL.y, COWL.z).rotate(lean, 0, 0);
  const s = new THREE.Shape(rounded(outer));
  s.holes.push(new THREE.Path(rounded(hole)));
  extrudeZ(b, s, -0.018, 0.022, paint, M.Paint, Z.Front, 0.01);
  frontPane(b, hole, -0.004, -1, rubber, M.Rubber, Z.Glass, inset(hole, 0.02));
  frontPane(b, inset(hole, 0.002), -0.006, -1, glass, M.Glass, Z.Glass);
  for (const x of [-0.08, 0.55]) {
    b.rod({ x, y: 0.05, z: -0.03 }, { x: x - 0.46, y: 0.075, z: -0.03 }, 0.006, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.055, z: -0.036 }, { x: x - 0.42, y: 0.08, z: -0.036 }, 0.004, black, M.Rubber, Z.Front);
  }
  // The maker's name across the top of the screen, as the film truck's banner had it.
  strokeText(b, 'TOYOTA', {
    x: 0.262,
    y: L - 0.15,
    z: -0.009,
    dir: -1,
    w: 0.062,
    h: 0.05,
    pitch: 0.092,
    radius: 0.0045,
    colour: new THREE.Color('#A9D3E2'),
    slot: M.Lamp,
    zone: Z.Glass,
  });
  b.pop();
  // Rear-view mirror hanging inside the top of the screen, upright so it looks back.
  const my = 1.1,
    mz = pillarZ(my) + 0.075;
  b.rod(v(0, my + 0.045, mz - 0.035), v(0, my + 0.01, mz - 0.006), 0.006, black, M.Rubber, Z.Trim);
  b.block(0, my, mz, 0.22, 0.06, 0.016, black, M.Rubber, Z.Trim, 0.006);
  b.block(0, my, mz + 0.009, 0.2, 0.044, 0.002, mirrorGlass, M.Mirror, Z.Trim);
}

function roof(b: VehicleBuilder): void {
  const front = pillarZ(ROOF) - 0.012;
  const s = new THREE.Shape(
    rounded([
      [-SIDE, -front, 0.05],
      [SIDE, -front, 0.05],
      [SIDE, -CAB_BACK, 0.05],
      [-SIDE, -CAB_BACK, 0.05],
    ]),
  );
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(s, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.022,
    bevelOffset: -0.022,
    bevelSegments: 3,
    curveSegments: 8,
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
    const h = 0.022 * a * a * q,
      dx = ((-0.088 * x) / (SIDE * SIDE)) * a * q,
      dz = (0.022 * a * a * Math.PI * Math.sin(2 * Math.PI * t)) / (CAB_BACK - front);
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
  // The crown's peak is the published height: 1.225 m above the origin.
  b.push().translate(0, ROOF - 0.054, 0);
  b.geometry(g, paint);
  b.pop();
}

/** The short styleside bed: flared sides, double walls, wheel housings, floor and tailgate. */
function bed(b: VehicleBuilder): void {
  const { front, back, rail, floor, inner } = BED;
  const len = back - front,
    mid = (front + back) / 2;
  const dark = paint.clone().multiplyScalar(0.85);
  const outline: Vtx[] = [
    [front, 0.15, 0.01],
    [front, rail, 0.012],
    [back, rail, 0.012],
    [back, 0.205, 0.01],
    ...opening(AXLE, false),
  ];
  for (const side of [-1, 1]) {
    extrudeX(
      b,
      sideShape(outline),
      side > 0 ? SIDE - 0.035 : -SIDE,
      side > 0 ? SIDE : -SIDE + 0.035,
      paint,
      M.Paint,
      Z.Rear,
      0.012,
      [[AXLE, -0.1]],
    );
    extrudeX(
      b,
      sideShape(band(opening(AXLE, false), 0.05)),
      side > 0 ? SIDE - 0.012 : -FLARE,
      side > 0 ? FLARE : -SIDE + 0.012,
      flare,
      M.Rubber,
      Z.Rear,
      0.014,
    );
    // The pressed fender round the opening: a squared bulge from ahead of the wheel to the
    // tail, its flat top under the crease.
    extrudeX(
      b,
      sideShape([
        [AXLE - 0.5, 0.15, 0.01],
        [AXLE - 0.5, FENDER_TOP, 0.05],
        [back - 0.035, FENDER_TOP, 0.03],
        [back - 0.035, 0.205, 0.01],
        ...opening(AXLE, false),
      ]),
      side > 0 ? SIDE - 0.02 : -SIDE - 0.022,
      side > 0 ? SIDE + 0.022 : -SIDE + 0.02,
      paint,
      M.Paint,
      Z.Rear,
      0.014,
      [[AXLE, -0.1]],
    );
    b.block(
      side * (SIDE + 0.002),
      0.545,
      (front + 0.02 + AXLE - 0.52) / 2,
      0.006,
      0.01,
      AXLE - 0.54 - front,
      paint,
      M.Paint,
      Z.Rear,
      0.003,
    );
    // Rail cap, the inner wall above the floor, and the wheel housing in the bed.
    b.block(side * (SIDE - 0.045), rail - 0.012, mid, 0.09, 0.024, len, paint, M.Paint, Z.Sides, 0.008);
    // The inner wall stands on the floor ahead of and behind the wheel housing, and on the
    // housing's top over the wheel, so nothing hangs down into the tyre's space.
    for (const [from, to, low] of [
      [front + 0.02, AXLE - 0.49, floor],
      [AXLE - 0.49, AXLE + 0.49, 0.515],
      [AXLE + 0.49, back - 0.02, floor],
    ])
      b.block(
        side * (inner + 0.012),
        (low + rail) / 2 - 0.01,
        (from + to) / 2,
        0.024,
        rail - low - 0.02,
        to - from,
        dark,
        M.Paint,
        Z.Trim,
      );
    b.block(side * 0.63, 0.515, AXLE, 0.26, 0.024, 0.98, dark, M.Paint, Z.Trim);
    b.block(side * 0.512, (floor + 0.515) / 2, AXLE, 0.024, 0.515 - floor, 0.98, dark, M.Paint, Z.Trim);
    for (const dz of [-0.478, 0.478])
      b.block(side * 0.63, (floor + 0.515) / 2, AXLE + dz, 0.26, 0.515 - floor, 0.024, dark, M.Paint, Z.Trim);
    // The rear damper's top eye bolts to a lug on the wheel housing's inner wall.
    b.block(side * 0.532, 0.352, AXLE + 0.23, 0.03, 0.05, 0.06, well, M.Metal, Z.Trim);
    // The outer wheelhouse's dark roof, above the tyre at full bump.
    b.block(side * 0.76, 0.5, AXLE, 0.05, 0.02, 0.9, well, M.Rubber, Z.Trim);
    // Floor outboard of the housings, ahead of and behind them.
    for (const [from, to] of [
      [front + 0.02, AXLE - 0.49],
      [AXLE + 0.49, back - 0.03],
    ])
      b.block(side * 0.62, floor, (from + to) / 2, 0.24, 0.024, to - from, dark, M.Paint, Z.Trim);
    // Tail lamps in the rear corners: amber, the white reversing lamp, then red.
    const lx = side * 0.745;
    b.block(lx, 0.5, back + 0.004, 0.115, 0.36, 0.02, black, M.Rubber, Z.Rear, 0.008);
    b.block(lx, 0.612, back + 0.016, 0.098, 0.115, 0.01, amber, M.Amber, Z.Rear, 0.005);
    b.block(lx, 0.52, back + 0.016, 0.098, 0.055, 0.01, lens, M.Lamp, Z.Rear, 0.005);
    b.block(lx, 0.405, back + 0.016, 0.098, 0.16, 0.01, red, M.Red, Z.Rear, 0.005);
    b.block(side * (SIDE + 0.001), 0.5, back - 0.04, 0.01, 0.34, 0.07, red, M.Red, Z.Rear, 0.004);
    // Corner post behind the lamp.
    b.block(
      side * 0.745,
      (0.205 + rail) / 2,
      back - 0.025,
      0.13,
      rail - 0.205,
      0.05,
      paint,
      M.Paint,
      Z.Rear,
      0.008,
    );
  }
  // Front wall, the ribbed floor between the housings, and the panel under the tailgate.
  b.block(
    0,
    (0.15 + rail) / 2,
    front + 0.012,
    2 * SIDE - 0.06,
    rail - 0.15,
    0.024,
    paint,
    M.Paint,
    Z.Rear,
    0.008,
  );
  b.block(0, floor, mid, 1.0, 0.024, len - 0.03, dark, M.Paint, Z.Trim);
  for (let i = 0; i < 7; i++)
    b.block(
      -0.42 + i * 0.14,
      floor + 0.016,
      mid,
      0.05,
      0.01,
      len - 0.1,
      dark.clone().multiplyScalar(1.15),
      M.Paint,
      Z.Trim,
    );
  // Tailgate between the corner posts, with the maker's name pressed into it and the handle.
  const gateW = 2 * 0.68,
    gateLow = 0.225;
  b.block(
    0,
    (gateLow + rail) / 2 - 0.005,
    back - 0.015,
    gateW,
    rail - gateLow - 0.01,
    0.03,
    paint,
    M.Paint,
    Z.Rear,
    0.01,
  );
  strokeText(b, 'TOYOTA', {
    x: -0.435,
    y: 0.44,
    z: back - 0.002,
    dir: 1,
    w: 0.105,
    h: 0.12,
    pitch: 0.153,
    radius: 0.008,
    colour: paint.clone().multiplyScalar(1.9),
    slot: M.Paint,
    zone: Z.Rear,
  });
  b.block(0, rail - 0.075, back + 0.004, 0.13, 0.04, 0.012, black, M.Rubber, Z.Rear, 0.005);
  b.block(
    0,
    (0.15 + gateLow) / 2 + 0.02,
    back - 0.03,
    2 * SIDE - 0.08,
    gateLow - 0.15 + 0.03,
    0.03,
    paint,
    M.Paint,
    Z.Rear,
    0.008,
  );
  // Fuel filler flap on the left side behind the cab.
  b.block(
    -(SIDE + 0.002),
    0.62,
    front + 0.2,
    0.006,
    0.12,
    0.13,
    paint.clone().multiplyScalar(1.5),
    M.Paint,
    Z.Sides,
    0.003,
  );
}

function chassis(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  // Ladder frame: the rails narrow at the engine and stand wider behind the rear axle, where
  // the spare hangs between them.
  for (const side of [-1, 1]) {
    const stations = [
      [-2.02, 0.32],
      [-0.85, 0.32],
      [-0.5, 0.42],
      [1.5, 0.42],
      [1.66, 0.485],
      [2.46, 0.485],
    ];
    const profile = new THREE.Shape();
    const points = [
      ...stations.map(([z, x]) => [side * x - 0.04, z]),
      ...[...stations].reverse().map(([z, x]) => [side * x + 0.04, z]),
    ];
    points.forEach(([x, z], i) => (i ? profile.lineTo(x, z) : profile.moveTo(x, z)));
    profile.closePath();
    const rail = new THREE.ExtrudeGeometry(profile, { depth: 0.14, bevelEnabled: false });
    rail.rotateX(Math.PI / 2);
    rail.translate(0, 0.07, 0);
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.geometry(rail, black);
    // Body mounts from the rails up to the bed floor.
    for (const z of [0.7, 2.3]) b.block(side * 0.45, 0.2, z, 0.07, 0.25, 0.07, black, M.Metal, Z.Trim);
  }
  for (const z of [-1.98, -0.85, 0.45, 1.0]) b.block(0, 0.0, z, 0.8, 0.08, 0.07, black, M.Metal, Z.Trim);
  b.block(0, 0.0, 2.44, 0.97, 0.1, 0.06, black, M.Metal, Z.Trim);
  // Gearbox with the transfer case behind it, both propshafts, the tank and the exhaust.
  b.block(0.04, -0.02, -0.3, 0.36, 0.17, 0.66, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.6);
  b.rod(v(0.12, -0.06, -0.6), v(0.1, -0.1, -1.28), 0.028, shaft);
  b.rod(v(0.0, -0.05, 0.03), v(0.04, -0.09, 1.3), 0.034, shaft);
  b.block(-0.2, 0.1, 0.95, 0.3, 0.22, 0.7, black, M.Metal, Z.Trim, 0.02);
  b.rod(v(0.3, -0.04, -1.25), v(0.3, -0.06, 0.25), 0.026, steel);
  b.rod(v(0.3, -0.05, 0.25), v(0.3, -0.05, 0.85), 0.075, shaft);
  b.rod(v(0.3, -0.06, 0.85), v(0.34, 0.14, 1.36), 0.024, steel);
  b.rod(v(0.34, 0.14, 1.36), v(0.34, 0.14, 1.6), 0.024, steel);
  b.rod(v(0.34, 0.14, 1.6), v(0.62, 0.02, 2.2), 0.024, steel);
  // The tail pipe hangs from the right-hand rail on a strap.
  b.block(0.52, 0.045, 2.02, 0.07, 0.012, 0.03, black, M.Metal, Z.Trim);
  b.block(0.535, 0.02, 2.02, 0.012, 0.06, 0.03, black, M.Metal, Z.Trim);
  // The spare, as from the factory: flat under the back of the bed between the frame rails,
  // its tread up against nothing, wound up on a hanger from a crossmember above it, with a
  // plate under its hub.
  const sz = 2.02,
    sy = 0.03;
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: 0, y: sy, z: sz }, 'down', black);
  b.block(0, 0.27, sz, 1.0, 0.06, 0.07, black, M.Metal, Z.Trim);
  for (const side of [-1, 1]) b.block(side * 0.485, 0.17, sz, 0.06, 0.2, 0.07, black, M.Metal, Z.Trim);
  // The plate bears on the hub's face, 0.164 m below the wheel's centre.
  b.rod(v(0, 0.27, sz), v(0, sy - 0.172, sz), 0.012, steel, M.Metal, Z.Trim);
  b.block(0, sy - 0.171, sz, 0.2, 0.012, 0.2, black, M.Metal, Z.Trim, 0.004);
}

/** Narrow the cab towards the roof, as the hiluxBody does: up to 7% in from the waist. */
function tumblehome(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position'),
    normals = g.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    if (z < pillarZ(CLIP.top) - 0.03 || z > CAB_BACK + 0.004 || y < WAIST || Math.abs(x) > SIDE + 0.02)
      continue;
    const k = 1 - 0.07 * Math.min(1, (y - WAIST) / (ROOF - WAIST));
    pos.setX(i, x * k);
    n.set(normals.getX(i) / k, normals.getY(i), normals.getZ(i)).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
}

export function buildXtracabBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontEnd(b);
  cabSides(b);
  windscreen(b);
  roof(b);
  bed(b);
  chassis(b, wheel);
  frontBar(b);
  winch(b, tuning);
  rearBar(b);
  towTongue(b, tuning);
  rollBar(b);
  addXtracabInterior(b, tuning.engine.redlineRpm);
  const g = b.build();
  tumblehome(g);
  return cleanGeometry(g);
}

/**
 * A 31×10.50R15 all-terrain tyre on a 15 inch steel wheel: a black centre with a ring of round
 * holes, a chromed rim, six chromed nuts and the locking hub's red dial.
 */
export function buildXtracabWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#222423');
  const rim = xtracabColors.wheel;
  const rimR = 0.2;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.45],
    [r * 0.68, -w * 0.52],
    [r * 0.9, -w * 0.5],
    [r * 0.96, -w * 0.41],
    [r * 0.96, w * 0.41],
    [r * 0.9, w * 0.5],
    [r * 0.68, w * 0.52],
    [rimR - 0.01, w * 0.45],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // An all-terrain tread: close-set shoulder blocks and two broken centre ribs, 9 mm proud.
  const blocks = 26;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.33, Math.cos(angle) * r * 0.966, Math.sin(angle) * r * 0.966)
        .rotate(angle, side * 0.12, 0);
      b.box(w * 0.3, 0.026, 0.062, tyre);
      b.pop();
      const mid = ((i + (side > 0 ? 0.25 : 0.75)) / blocks) * Math.PI * 2;
      b.push()
        .translate(side * w * 0.09, Math.cos(mid) * r * 0.967, Math.sin(mid) * r * 0.967)
        .rotate(mid, -side * 0.18, 0);
      b.box(w * 0.15, 0.026, 0.06, tyre);
      b.pop();
    }
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.74, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Chromed rim and its lip, the black dished centre, and the ring of round holes.
    b.ring(side * (w * 0.5 - 0.004), 0, 0, rimR, 0.013, xtracabColors.chrome, M.Metal, 'x');
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.006, rimR - 0.006, 0.05, 28, 1, true),
      xtracabColors.chrome,
    );
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.05), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(rimR - 0.008, rimR - 0.008, 0.02, 28), rim);
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.034), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.1, 0.125, 0.03, 20), rim);
    b.pop();
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * (w * 0.5 - 0.039), Math.cos(a) * 0.155, Math.sin(a) * 0.155)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 12), new THREE.Color('#050505'));
      b.pop();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 - 0.012), Math.cos(a) * 0.0698, Math.sin(a) * 0.0698)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.0125, 0.015, 0.02, 6), xtracabColors.chrome);
      b.pop();
    }
    // The locking hub: a black body with a red dial.
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.002), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.042, 0.05, 0.05, 12), new THREE.Color('#2A2C2D'));
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 + 0.029), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 12), new THREE.Color('#A8271D'));
    b.pop();
  }
  return b.build();
}

/**
 * A recovery board in the bed, on the left: index 0 underneath, index 1 lying on it. The
 * boards are 2.4 m long and the bed 1.9 m, so the pair stands with its front end on the floor
 * against the front wall and rests on the tailgate's top edge, its tail out over the back, as
 * timber is carried in a short bed; each board has its own strap down to the floor.
 */
export function buildXtracabPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const L = plankTuning.length,
    W = plankTuning.width,
    T = 0.05;
  const x = -0.3;
  const z0 = BED.front + 0.05,
    y0 = BED.floor + 0.022,
    z1 = BED.back - 0.015,
    y1 = BED.rail + 0.004;
  // The lower board's underside runs from the floor at the front wall to the tailgate's top;
  // the upper one lies 12 mm above it, clear of the lower one's strap.
  const slope = Math.atan2(y1 - y0, z1 - z0);
  const lift = index * (T + 0.012);
  b.push().translate(x, y0, z0).rotate(-slope, 0, 0);
  b.block(0, lift + T / 2, L / 2, W, T, L, wood, M.Fabric, Z.Rear);
  for (let i = 0; i < 4; i++)
    b.block(
      -0.12 + i * 0.08,
      lift + T + 0.001,
      L / 2,
      0.004,
      0.003,
      L - 0.06,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Rear,
    );
  // Straps over the board, down to a tie-down ring bolted to the floor each side: one on the
  // lower board, and two on the upper board that go over both (one near the tailgate).
  const half = (W + 0.016 + index * 0.02) / 2;
  const straps = index === 0 ? [0.55] : [0.95, 1.72];
  for (const along of straps)
    b.block(0, lift + T + 0.005, along, 2 * half, 0.008, 0.04, black, M.Rubber, Z.Rear);
  b.pop();
  for (const along of straps) {
    const sz = z0 + along * Math.cos(slope) - (lift + T) * Math.sin(slope),
      sy = y0 + along * Math.sin(slope) + (lift + T) * Math.cos(slope);
    for (const s of [-1, 1]) {
      b.block(
        x + s * half,
        (sy + BED.floor + 0.012) / 2,
        sz,
        0.008,
        sy - BED.floor - 0.012,
        0.04,
        black,
        M.Rubber,
        Z.Rear,
      );
      b.block(x + s * half, BED.floor + 0.022, sz, 0.03, 0.02, 0.05, steel, M.Metal, Z.Rear);
    }
  }
  return b.build();
}
