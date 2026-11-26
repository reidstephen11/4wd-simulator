import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addTroopyInterior, type SeventyCabFit } from './troopyInterior';
import { vehicles } from '../data/vehicles';
import { troopyColors } from './troopyPaint';
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
import { BADGE_GLYPHS, PLATE_WHITE, numberPlate, strokeText } from './bodyKit';

/** Panels as `extrudePanel`, with a 22 mm crown on the bonnet top and an 8 mm outward press in the lower side skins. */
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
): void {
  const reshape = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const clip = zone === Z.Front && x1 - x0 > 1.6 && wells.length === 1;
    const skin = zone === Z.Sides && wells.length === 2;
    if (clip || skin) {
      g = subdivideSurface(g, (p, n) => (clip ? p.y > 0.5 && n.y > 0.6 : Math.abs(n.x) > 0.8), 2);
      const p = g.getAttribute('position'),
        n = g.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + x0 + bevel,
          y = p.getY(i),
          z = p.getZ(i);
        let h = 0,
          dx = 0,
          dy = 0,
          dz = 0;
        if (clip) {
          const span = CLIP.back - F,
            t = THREE.MathUtils.clamp((z - F) / span, 0, 1),
            a = Math.max(0, 1 - (x / 0.7) ** 2),
            q = Math.sin(Math.PI * t) ** 2,
            u = THREE.MathUtils.clamp((y - 0.5) / 0.1, 0, 1),
            fade = u * u * (3 - 2 * u),
            df = u > 0 && u < 1 ? (6 * u * (1 - u)) / 0.1 : 0;
          h = 0.022 * a * a * q * fade;
          dx = ((-0.088 * x) / (0.7 * 0.7)) * a * q * fade;
          dy = 0.022 * a * a * q * df;
          dz = ((0.022 * a * a * Math.PI * Math.sin(2 * Math.PI * t)) / span) * fade;
          const ny = n.getY(i) / (1 + dy),
            nn = new THREE.Vector3(n.getX(i) - dx * ny, ny, n.getZ(i) - dz * ny).normalize();
          p.setY(i, y + h);
          n.setXYZ(i, nn.x, nn.y, nn.z);
        } else {
          const side = Math.sign(x),
            start = z < DOOR.back ? DOOR.front : DOOR.back + 0.02,
            end = z < DOOR.back ? DOOR.back : 2.51,
            t = (z - start) / (end - start),
            u = (y - SILL) / (WAIST - SILL);
          if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
          const qy = Math.sin(Math.PI * u) ** 2,
            qz = Math.sin(Math.PI * t) ** 2;
          h = 0.008 * qy * qz;
          dy = ((0.008 * Math.PI * Math.sin(2 * Math.PI * u)) / (WAIST - SILL)) * qz;
          dz = (0.008 * qy * Math.PI * Math.sin(2 * Math.PI * t)) / (end - start);
          const nx = n.getX(i),
            nn = new THREE.Vector3(nx, n.getY(i) - side * dy * nx, n.getZ(i) - side * dz * nx).normalize();
          p.setX(i, p.getX(i) + side * h);
          n.setXYZ(i, nn.x, nn.y, nn.z);
        }
      }
    }
    return g;
  };
  extrudePanel(b, shape, x0, x1, color, slot, zone, bevel, wells, segments, ratio, reshape);
}
import { cleanGeometry, continuousTube, ROUND_BEND, subdivideSurface } from './bodyRefinement';
import { mountSpare, spareSidewall } from './spares';

/**
 * 75 Series Troop Carrier body: a front clip with round-shouldered guards, rounded front
 * corners and a bonnet sloping down to the nose; behind it, each side one pressed panel
 * from the door to the tail with its window openings; flat-topped wheel openings pressed
 * into the body (a deep painted flare on each front guard, a narrow lip at the back),
 * rounded rear corners and roof edges, round headlamps in one dark panel with the grille,
 * door mirrors on black sails and an ARB-style bar (ground about 0.52 m below the origin
 * when parked). Photographs and dimensions: reference/vehicles/landcruiser-hzj75-troopy/SOURCES.md.
 */
const { paint, bar, bumper, chrome } = troopyColors;
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

const SIDE = 0.895;
const SILL = 0.04;
/**
 * The line the door glass stands on. v2.08 set the cab's heights from side.jpg, measured from the
 * line through its hubs at 238 px a metre: the cowl 0.79 m above the origin (it was 0.84), the
 * windscreen's header 1.31 (1.48), the bonnet's nose 0.61 (0.745), the door glass from 0.80 to
 * 1.25, and the two side windows behind it from 0.97 to 1.43, higher than the door's.
 */
const WAIST = 0.76;
/**
 * The 75 Series wheel openings: a flat top at `y` with short rounded corners (`r`), `top`
 * half-wide along the flat, widening to `bottom` at the sill (side.jpg). `cy` is the well's
 * centre for the dark inner shading. v2.11 lowered the top 1.5 cm to side.jpg's (it was 0.435).
 */
const ARCH = { y: 0.42, top: 0.33, bottom: 0.46, r: 0.12, cy: -0.08 };
/**
 * The front guard's flare: it stands out round the opening from the corner under the indicator
 * back to the door, its top crease `top` above the origin (side.jpg, front-34.jpg), `out` proud
 * of the body side. The rear openings have a narrow lip `lip` wide.
 */
const FLARE = { top: 0.53, out: 0.018, lip: 0.035 };
/** The body's pressed swage line, and the door handle above it (side.jpg, front-34-b.jpg). */
const SWAGE_Y = 0.54;
const HANDLE_Y = 0.625;
/** The door spare's centre across the car (it was 0.33 until v2.11). */
const SPARE_X = 0.3;
const stripeGrey = new THREE.Color('#A2A39D'),
  stripeGold = new THREE.Color('#B4893A');
/** The nose's skin: 0.62 m ahead of the front axle on side.jpg (it was 0.71 m, at -2.2). */
const F = -2.11;
/** The foot of the windscreen and its header: the screen leans back 37 degrees (it was 12). */
const COWL = { y: 0.79, z: -0.79 };
const SCREEN_TOP = { y: 1.31, z: -0.4 };
const DOOR = { front: -0.85, back: 0.26 };
const ROOF = 1.54;
/**
 * The raised roof: from the header it stands up 12 cm and then slopes up to the full height
 * `flat` behind the header, over the driver's head (side.jpg, front-34-b.jpg). Until v2.08 the
 * roof was one flat sheet at full height from the top of an upright windscreen.
 */
const BROW = { z: SCREEN_TOP.z + 0.035, y: SCREEN_TOP.y + 0.125, flat: 0.3 };
const TAIL = 2.58;
const AXLE = 1.49;
/** Radius of the rear corners and the roof's back corners. */
const CORNER = 0.07;
/** The rack stands on the flat of the raised roof, behind the brow. */
const RACK = { y: 1.66, front: 0.4, back: 2.42 };
const GUARD_LOW = 0.25;
/** Centre height of the grille and the headlamps, under the lower nose. */
export const GRILLE_Y = 0.46;
export const NOSE_Z = F;
/** The front clip: where it meets the doors, its top at the nose and at the back, and the
 * radius its shoulders and front corners are rounded to (across the car, and `ratio` of it
 * along). Below `low` the side panel takes over behind the front wheel opening. */
const CLIP = {
  back: DOOR.front - 0.02,
  noseTop: 0.61,
  backTop: COWL.y - 0.005,
  round: 0.15,
  ratio: 0.55,
  low: 0.3,
};
const clipTop = (z: number) => CLIP.noseTop + ((z - F) / (CLIP.back - F)) * (CLIP.backTop - CLIP.noseTop);

const v = (x: number, y: number, z: number) => ({ x, y, z });

/** Where the cab's parts sit under the lower header and behind the leaning screen (v2.08). */
const TROOPY_CAB_FIT: SeventyCabFit = {
  cabin: vehicles.troopy.cabin,
  dash: { down: 0.15, back: 0.2 },
  seatDown: 0.12,
  door: { down: 0.055, z: (DOOR.front + DOOR.back) / 2, length: DOOR.back - DOOR.front - 0.06 },
  visor: { y: SCREEN_TOP.y - 0.045, z: SCREEN_TOP.z + 0.09 },
  liningFront: BROW.flat,
  bulkhead: { z: CLIP.back + 0.03, top: COWL.y - 0.06 },
};

/** Half-width of a wheel opening at height y: straight edges from the sill up to the flat top. */
function archHalf(y: number): number {
  const t = Math.max(0, Math.min(1, (y - SILL) / (ARCH.y - SILL)));
  return ARCH.bottom + (ARCH.top - ARCH.bottom) * t;
}

/**
 * A flat-topped opening's outline from height yBack on its back side, over the top, to
 * yFront on its front side, `grow` outside the opening itself.
 */
function archPath(axle: number, yBack: number, yFront: number, grow = 0): Vtx[] {
  return [
    [axle + archHalf(yBack) + grow, yBack],
    [axle + ARCH.top + grow, ARCH.y + grow, ARCH.r + grow],
    [axle - ARCH.top - grow, ARCH.y + grow, ARCH.r + grow],
    [axle - archHalf(yFront) - grow, yFront],
  ];
}

/** Where the A pillar's front edge is at height y. */
const pillarZ = (y: number) => COWL.z + ((y - COWL.y) * (SCREEN_TOP.z - COWL.z)) / (SCREEN_TOP.y - COWL.y);

/** The door's glass, and the two windows behind it, which sit higher (side.jpg). */
const WIN = { low: WAIST + 0.045, top: SCREEN_TOP.y - 0.06 };
const REAR_WIN = { low: 0.97, top: 1.43, r: 0.06 };
const SLIDE = { z0: 0.49, z1: 1.375 };
const FIXED = { z0: 1.49, z1: 2.34 };

function windows(): Vtx[][] {
  const { low, top } = WIN;
  const { low: rl, top: rt, r } = REAR_WIN;
  return [
    [
      [pillarZ(low) + 0.085, low, 0.03],
      [DOOR.back - 0.045, low, 0.03],
      [DOOR.back - 0.045, top, 0.03],
      [pillarZ(top) + 0.085, top, 0.04],
    ],
    [
      [SLIDE.z0, rl, r],
      [SLIDE.z1, rl, r],
      [SLIDE.z1, rt, r],
      [SLIDE.z0, rt, r],
    ],
    [
      [FIXED.z0, rl, r],
      [FIXED.z1, rl, r],
      [FIXED.z1, rt, r],
      [FIXED.z0, rt, r],
    ],
  ];
}

/** Each side: one panel from the nose to the rear corner, with the openings and windows. */
function sidePanels(b: VehicleBuilder): void {
  const wins = windows();
  const end = TAIL - CORNER;
  const archBack = (y: number) => -AXLE + archHalf(y);
  const outline: Vtx[] = [
    ...[SILL, 0.1, 0.2, CLIP.low].map((y): Vtx => [archBack(y), y]),
    [archBack(CLIP.low + 0.03), CLIP.low + 0.03],
    // The skin runs forward over the clip's rounded back edge up to its shoulder line, which
    // otherwise shows as a dark slot between the guard and the door.
    [CLIP.back - 0.085, CLIP.low + 0.03],
    [CLIP.back - 0.085, COWL.y - 0.1],
    [CLIP.back + 0.005, COWL.y - 0.1],
    [CLIP.back + 0.005, COWL.y - 0.03],
    [COWL.z - 0.01, COWL.y],
    [SCREEN_TOP.z, SCREEN_TOP.y],
    [BROW.z, BROW.y, 0.03],
    [BROW.flat, ROOF],
    [end, ROOF],
    [end, SILL],
    ...archPath(AXLE, SILL, SILL),
  ];
  const shape = sideShape(outline, wins);
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? SIDE - 0.04 : -SIDE;
    extrudeX(b, shape, x0, x0 + 0.04, paint, M.Paint, Z.Sides, 0.012, [
      [-AXLE, ARCH.cy],
      [AXLE, ARCH.cy],
    ]);
    // Glass in black rubbers, and the sliding window's centre rail.
    for (const w of wins) {
      sidePane(b, w, side, side * (SIDE - 0.022), rubber, M.Rubber, Z.Glass, inset(w, 0.022));
      sidePane(b, inset(w, 0.018), side, side * (SIDE - 0.02), glass, M.Glass, Z.Glass);
    }
    const mid = (SLIDE.z0 + SLIDE.z1) / 2;
    b.block(
      side * (SIDE - 0.016),
      (REAR_WIN.low + REAR_WIN.top) / 2,
      mid,
      0.012,
      REAR_WIN.top - REAR_WIN.low - 0.02,
      0.026,
      rubber,
      M.Rubber,
      Z.Sides,
    );
    // The openings are pressed into the body and painted with it (until v2.11 they had black
    // lips standing off the body). Each front guard's lower half is a deep flare: from the
    // corner under the indicator, over the opening and back to the door, standing out from
    // the guard above its crease. The rear openings have a narrow rolled lip.
    const front = sideShape([
      [CLIP.back - 0.005, SILL],
      [CLIP.back - 0.005, FLARE.top, 0.03],
      [F + 0.07, FLARE.top, 0.04],
      [F + 0.07, GUARD_LOW],
      ...archPath(-AXLE, SILL, GUARD_LOW, -0.005).reverse(),
    ]);
    const rear = sideShape([
      ...archPath(AXLE, SILL, SILL, FLARE.lip).reverse(),
      ...archPath(AXLE, SILL, SILL, -0.005),
    ]);
    for (const [shape, out, zone] of [
      [front, FLARE.out, Z.Front],
      [rear, 0.01, Z.Rear],
    ] as const) {
      const x0 = side > 0 ? SIDE - 0.02 : -SIDE - out,
        x1 = side > 0 ? SIDE + out : -SIDE + 0.02;
      extrudeX(b, shape, x0, x1, paint, M.Paint, zone, out === FLARE.out ? 0.012 : 0.007);
    }
    for (const axle of [-AXLE, AXLE]) {
      // Dark wheelhouse: an inner wall and a roof over the tyre, just above the opening's top
      // and reaching into the side panel, so no light shows between them. The wall reaches the
      // roof: until v2.11 it stopped at 0.40 m and light came across the car under the roof.
      const wellX = axle < 0 ? 0.34 : 0.52,
        wellTop = ARCH.y + 0.03;
      b.block(
        side * wellX,
        (wellTop - 0.16) / 2,
        axle,
        0.03,
        wellTop + 0.16,
        ARCH.bottom * 2,
        well,
        M.Rubber,
        Z.Trim,
      );
      // The back of each front wheelhouse is closed as well, by a dark panel lying against the
      // opening's sloping back edge from the sill to the roof. It was open there, and the cab's
      // footwell bulkhead (body colour) showed pale behind the tyre.
      if (axle < 0) {
        const z0 = axle + archHalf(SILL) + 0.012,
          z1 = axle + archHalf(wellTop) + 0.012;
        b.slot = M.Rubber;
        b.tag = Z.Trim;
        b.push()
          .translate((side * (wellX + SIDE - 0.04)) / 2, (SILL + wellTop) / 2, (z0 + z1) / 2)
          .rotate(Math.atan2(z1 - z0, wellTop - SILL), 0, 0);
        b.box(SIDE - 0.04 - wellX, Math.hypot(z1 - z0, wellTop - SILL), 0.02, well);
        b.pop();
      }
      // The rear wheelhouses are closed at each end too (the front clip closes its own); the
      // body's inside showed through the top of each rear opening.
      if (axle > 0)
        for (const end of [-1, 1])
          b.block(
            (side * (wellX + SIDE - 0.04)) / 2,
            (SILL + wellTop) / 2,
            axle + end * (ARCH.bottom + 0.01),
            SIDE - 0.04 - wellX,
            wellTop - SILL,
            0.02,
            well,
            M.Rubber,
            Z.Trim,
          );
      b.block(
        (side * (wellX + SIDE - 0.035)) / 2,
        ARCH.y + 0.02,
        axle,
        SIDE - 0.035 - wellX,
        0.02,
        ARCH.top * 2 + 0.1,
        well,
        M.Rubber,
        Z.Trim,
      );
    }
    // Door shut lines, the B pillar's, and the door's lower edge.
    const x = side * (SIDE + 0.001);
    b.block(
      x,
      (SILL + SCREEN_TOP.y) / 2 + 0.01,
      DOOR.back + 0.004,
      0.006,
      SCREEN_TOP.y - SILL - 0.02,
      0.006,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(
      x,
      SCREEN_TOP.y - 0.002,
      (SCREEN_TOP.z + 0.03 + DOOR.back) / 2,
      0.006,
      0.006,
      DOOR.back - SCREEN_TOP.z - 0.03,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(
      x,
      (SILL + COWL.y) / 2 - 0.02,
      DOOR.front + 0.004,
      0.006,
      COWL.y - SILL - 0.08,
      0.006,
      black,
      M.Rubber,
      Z.Sides,
    );
    b.block(
      x,
      SILL + 0.03,
      (DOOR.front + DOOR.back) / 2,
      0.006,
      0.006,
      DOOR.back - DOOR.front,
      black,
      M.Rubber,
      Z.Sides,
    );
    // The pressed swage line along the doors and body, in line with the front flare's crease
    // and under the rear vent (front-34-b.jpg). Until v2.11 there were two, at 0.72 and 0.5;
    // the stripe now runs where the upper one was.
    // It stops either side of the door's rear shut line, which it would otherwise cover.
    for (const [z0, z1] of [
      [DOOR.front + 0.03, DOOR.back - 0.01],
      [DOOR.back + 0.018, end - 0.02],
    ])
      b.block(
        side * (SIDE + 0.004),
        SWAGE_Y,
        (z0 + z1) / 2,
        0.01,
        0.02,
        z1 - z0,
        paint,
        M.Paint,
        Z.Sides,
        0.008,
      );
    // Chrome pull handle and lock on the door, under the stripe (side.jpg).
    b.block(
      side * (SIDE + 0.008),
      HANDLE_Y,
      DOOR.back - 0.16,
      0.016,
      0.032,
      0.13,
      chrome,
      M.Metal,
      Z.Sides,
      0.01,
    );
    b.ring(side * (SIDE + 0.006), HANDLE_Y, DOOR.back - 0.05, 0.012, 0.004, chrome, M.Metal, 'x', Z.Sides);
    stripes(b, side);
    rearQuarter(b, side);
    // Side indicator on the wing ahead of the door.
    b.block(
      side * (SIDE + 0.004),
      0.62,
      DOOR.front - 0.14,
      0.012,
      0.035,
      0.08,
      amber,
      M.Amber,
      Z.Front,
      0.006,
    );
    // Door mirror: a black sail in the window's front lower corner, a short neck out of it,
    // and the head with its glass facing back.
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
    // Rain gutter along the roof edge.
    b.rod(
      v(side * (SIDE + 0.004), ROOF - 0.08, DOOR.back + 0.02),
      v(side * (SIDE + 0.004), ROOF - 0.08, end),
      0.01,
      paint,
      M.Paint,
      Z.Roof,
    );
    b.rod(
      v(side * (SIDE + 0.004), SCREEN_TOP.y + 0.012, SCREEN_TOP.z + 0.02),
      v(side * (SIDE + 0.004), SCREEN_TOP.y + 0.012, DOOR.back + 0.02),
      0.01,
      paint,
      M.Paint,
      Z.Roof,
    );
    // Rounded rear corner, full height.
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
    b.push().translate(side * (SIDE - CORNER), (SILL + ROOF) / 2 - 0.01, TAIL - CORNER);
    b.geometry(g, paint);
    b.pop();
  }
}

/**
 * The period stripe (side.jpg, front-34-b.jpg): a thin grey band over a gold pinstripe, and a
 * wider grey band over another, from the door's front edge to the rear quarter, with LAND
 * CRUISER in black in the wide band at its end, reading from the front on the left and from
 * the back on the right. On the photographs it runs on along the front guard; it is left off
 * there, where the model's guard rounds over at the shoulder and a flat strip would stand off it.
 */
function stripes(b: VehicleBuilder, side: number): void {
  const x = side * (SIDE + 0.0015),
    end = 2.34;
  // Each band is cut at the door's rear shut line, as a decal is.
  for (const [y0, y1, colour, start] of [
    [0.762, 0.785, stripeGrey, -0.79],
    [0.749, 0.755, stripeGold, -0.79],
    [0.685, 0.735, stripeGrey, DOOR.front + 0.012],
    [0.671, 0.677, stripeGold, DOOR.front + 0.012],
  ] as const)
    for (const [z0, z1] of [
      [start, DOOR.back - 0.003],
      [DOOR.back + 0.011, end],
    ])
      b.block(x, (y0 + y1) / 2, (z0 + z1) / 2, 0.004, y1 - y0, z1 - z0, colour, M.Paint, Z.Sides);
  const text = 'LAND CRUISER',
    pitch = 0.046,
    w = 0.026,
    len = (text.length - 1) * pitch + w;
  b.push()
    .translate(side * (SIDE + 0.0045), 0.693, end - 0.02 - len / 2)
    .rotate(0, side * (Math.PI / 2), 0);
  strokeText(b, text, {
    x: -len / 2,
    y: 0,
    z: 0,
    dir: 1,
    w,
    h: 0.034,
    pitch,
    radius: 0.0032,
    colour: black,
    slot: M.Rubber,
    zone: Z.Sides,
    glyphs: BADGE_GLYPHS,
  });
  b.pop();
}

/**
 * The rear quarter: a black louvred vent under the stripe ahead of the tail lamp on each side
 * (side.jpg, front-34-b.jpg), and on the right two square fuel flaps, the main tank's behind
 * the rear wheel under the vent and the sub-tank's ahead of it, behind the door. Until v2.11
 * a round cap stood behind each rear wheel.
 */
function rearQuarter(b: VehicleBuilder, side: number): void {
  const vz = 2.2,
    vy = 0.62;
  b.block(side * (SIDE + 0.004), vy, vz, 0.012, 0.09, 0.27, black, M.Rubber, Z.Sides, 0.006);
  b.block(side * (SIDE + 0.0105), vy, vz, 0.002, 0.066, 0.24, new THREE.Color('#121413'), M.Rubber, Z.Sides);
  for (let i = 0; i < 6; i++)
    b.block(side * (SIDE + 0.012), vy, vz - 0.1 + i * 0.04, 0.004, 0.064, 0.008, trim, M.Rubber, Z.Sides);
  if (side < 0) return;
  for (const zc of [0.43, 2.0]) {
    const flap: Vtx[] = [
      [zc - 0.095, 0.37, 0.025],
      [zc + 0.095, 0.37, 0.025],
      [zc + 0.095, 0.52, 0.025],
      [zc - 0.095, 0.52, 0.025],
    ];
    // Clear of the side skin's outward press, which is 4 mm here.
    sidePane(b, flap, 1, SIDE + 0.005, black, M.Rubber, Z.Sides, inset(flap, 0.004));
    // The lock at the flap's back edge.
    b.slot = M.Metal;
    b.tag = Z.Sides;
    b.push()
      .translate(SIDE + 0.007, 0.445, zc + 0.065)
      .rotate(0, 0, Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 10), chrome);
    b.pop();
  }
}

/**
 * A rubber mud flap behind each wheel (side.jpg, front-34-b.jpg), hung from a strap that runs
 * from the chassis rail out under the sill, and a black side step under each door on two arms
 * from the rail (front-34.jpg, front-34-b.jpg).
 */
function flapsAndSteps(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    for (const axle of [-AXLE, AXLE]) {
      const z = axle + ARCH.bottom + 0.03,
        inner = axle < 0 ? 0.4 : 0.43;
      b.block(
        (side * (inner + SIDE - 0.02)) / 2,
        0.03,
        z + 0.016,
        SIDE - 0.02 - inner,
        0.02,
        0.022,
        black,
        M.Metal,
        Z.Trim,
      );
      b.block(side * 0.715, -0.13, z, 0.3, 0.3, 0.01, rubber, M.Rubber, Z.Trim, 0.004);
    }
    const z0 = -0.95,
      z1 = 0.24,
      mid = (z0 + z1) / 2;
    b.block(side * 0.83, -0.02, mid, 0.2, 0.035, z1 - z0, black, M.Metal, Z.Trim, 0.008);
    for (const dx of [-0.06, 0, 0.06])
      b.block(side * (0.83 + dx), 0.0005, mid, 0.014, 0.006, z1 - z0 - 0.06, trim, M.Rubber, Z.Trim);
    for (const z of [-0.7, 0.05]) b.block(side * 0.64, -0.045, z, 0.34, 0.03, 0.04, black, M.Metal, Z.Trim);
  }
}

function frontEnd(b: VehicleBuilder): void {
  // The front clip in one piece: the face, the bonnet and guard tops sloping down to the
  // nose, the front wheel openings, and its shoulders and front corners well rounded.
  const R = CLIP.round;
  extrudeX(
    b,
    sideShape([
      // The top corners are rounded more than the 8 cm the clip's edges are drawn in by, or sharp:
      // a smaller radius folds over itself and shows as crumpled facets.
      [F, GUARD_LOW],
      [F, CLIP.noseTop, 0.09],
      [CLIP.back, CLIP.backTop],
      [CLIP.back, CLIP.low],
      ...archPath(-AXLE, CLIP.low, GUARD_LOW),
    ]),
    -SIDE,
    SIDE,
    paint,
    M.Paint,
    Z.Front,
    R,
    [[-AXLE, ARCH.cy]],
    6,
    CLIP.ratio,
  );
  // Bonnet shut lines over its continuous crowned skin.
  for (const side of [-1, 1])
    b.rod(
      v(side * 0.69, clipTop(F + 0.06) + 0.002, F + 0.06),
      v(side * 0.69, clipTop(COWL.z - 0.08) + 0.002, COWL.z - 0.08),
      0.004,
      black,
      M.Rubber,
      Z.Front,
    );
  // Cowl under the screen, with its vent slots.
  // 1.48 m wide, inside the guards' rounded shoulders: at 1.76 m its ends stood out through them.
  b.block(0, COWL.y - 0.02, COWL.z - 0.03, 1.48, 0.05, 0.1, paint, M.Paint, Z.Front, 0.015);
  // Its ends, well rounded, close the corner between the guard's shoulder and the pillar's foot.
  for (const side of [-1, 1])
    b.block(side * 0.805, COWL.y - 0.05, COWL.z - 0.03, 0.15, 0.11, 0.1, paint, M.Paint, Z.Front, 0.04);
  for (let i = 0; i < 10; i++)
    b.block(-0.45 + i * 0.1, COWL.y + 0.006, COWL.z - 0.04, 0.06, 0.004, 0.05, black, M.Rubber, Z.Front);

  // Front panel: one dark grey panel across the face from indicator to indicator, holding the
  // round 7 inch headlamps in raised squares at its ends and, between them, the grille: three
  // horizontal bars in a frame (front-34.jpg, detail.jpg; until v2.11 vertical slats between
  // separate lamp surrounds). TOYOTA stays in letters on a plate on the middle bar, as on the
  // 1992 Australian ambulance (front-34-ambulance.jpg); the Peruvian car has the oval badge.
  // The indicators sit on the outer corners of the front clip, wrapping round them.
  const gy = GRILLE_Y;
  const grille = new THREE.Color('#4E5452');
  b.block(0, gy, F - 0.002, 1.46, 0.27, 0.012, grille, M.Rubber, Z.Front, 0.008);
  b.block(0, gy, F - 0.011, 0.86, 0.2, 0.004, black, M.Rubber, Z.Front);
  for (const y of [gy - 0.115, gy + 0.115])
    b.block(0, y, F - 0.017, 0.94, 0.03, 0.018, grille, M.Rubber, Z.Front, 0.006);
  for (const x of [-0.455, 0.455])
    b.block(x, gy, F - 0.017, 0.03, 0.26, 0.018, grille, M.Rubber, Z.Front, 0.006);
  for (const y of [gy - 0.056, gy, gy + 0.056])
    b.block(0, y, F - 0.019, 0.88, 0.026, 0.014, grille, M.Rubber, Z.Front, 0.004);
  b.block(0, gy, F - 0.031, 0.43, 0.06, 0.012, black, M.Rubber, Z.Front, 0.004);
  strokeText(b, 'TOYOTA', {
    x: 0.211,
    y: gy - 0.023,
    z: F - 0.04,
    dir: -1,
    w: 0.049,
    h: 0.046,
    pitch: 0.075,
    radius: 0.0032,
    colour: PLATE_WHITE,
    slot: M.Metal,
    zone: Z.Front,
  });
  for (const side of [-1, 1]) {
    const hx = side * 0.6;
    b.block(hx, gy, F - 0.002, 0.25, 0.25, 0.02, new THREE.Color('#525856'), M.Rubber, Z.Front, 0.02);
    roundHeadlamp(b, hx, gy, F - 0.012, 0.089, lens, chrome, black);
    // Indicator wrapped round the corner, in a black housing, with the white triangle
    // under it on the face.
    const cx = side * (SIDE - R),
      cz = F + CLIP.ratio * R;
    cornerWrap(
      b,
      side,
      cx,
      cz,
      R + 0.003,
      CLIP.ratio * R + 0.003,
      gy - 0.01,
      0.2,
      black,
      M.Rubber,
      Z.Front,
      0,
      0.8,
    );
    cornerWrap(
      b,
      side,
      cx,
      cz,
      R + 0.008,
      CLIP.ratio * R + 0.008,
      gy + 0.035,
      0.085,
      amber,
      M.Amber,
      Z.Front,
      0,
      0.8,
    );
    cornerWrap(
      b,
      side,
      cx,
      cz,
      R + 0.008,
      CLIP.ratio * R + 0.008,
      gy - 0.06,
      0.075,
      lens,
      M.Headlamp,
      Z.Front,
      0,
      0.8,
    );
    cornerWrap(
      b,
      side,
      cx,
      cz,
      R + 0.01,
      CLIP.ratio * R + 0.01,
      gy - 0.014,
      0.012,
      trim,
      M.Rubber,
      Z.Front,
      0,
      0.8,
    );
  }
  // The black bumper with its brackets.
  b.block(0, 0.18, F - 0.03, 1.8, 0.15, 0.1, bumper, M.Metal, Z.Front, 0.025);
  for (const x of [-0.43, 0.43]) b.block(x, 0.1, F + 0.06, 0.07, 0.07, 0.16, black, M.Metal, Z.Trim);
  // Sump, steering box and the air cleaner's intake behind the left headlamp.
  b.block(0, -0.04, -1.75, 0.44, 0.16, 0.5, black, M.Metal, Z.Trim, 0.02);
  b.block(0.38, 0.02, F + 0.2, 0.14, 0.16, 0.16, black, M.Metal, Z.Trim, 0.02);
}

function windscreen(b: VehicleBuilder): void {
  const lean = Math.atan2(SCREEN_TOP.z - COWL.z, SCREEN_TOP.y - COWL.y);
  const L = (SCREEN_TOP.y + 0.012 - COWL.y) / Math.cos(lean);
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
    [w - 0.085, L - 0.06, 0.04],
    [-w + 0.085, L - 0.06, 0.04],
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
  b.block(0, L - 0.12, 0.05, 0.22, 0.065, 0.02, black, M.Rubber, Z.Trim, 0.01);
  // The mirror's stem, from a foot on the header.
  b.rod({ x: 0, y: L - 0.11, z: 0.045 }, { x: 0, y: L - 0.035, z: 0.02 }, 0.008, black, M.Rubber, Z.Trim);
  b.block(0, L - 0.03, 0.022, 0.05, 0.03, 0.012, black, M.Rubber, Z.Trim, 0.004);
  b.pop();
}

function roof(b: VehicleBuilder): void {
  const front = BROW.flat - 0.02;
  // The brow: a shell across the car from the header up to the flat of the raised roof.
  extrudeX(
    b,
    sideShape([
      [SCREEN_TOP.z - 0.012, SCREEN_TOP.y - 0.01],
      [BROW.z - 0.008, BROW.y + 0.008, 0.03],
      [BROW.flat + 0.02, ROOF + 0.004],
      [BROW.flat + 0.02, ROOF - 0.036],
      [BROW.z + 0.03, BROW.y - 0.034, 0.02],
      [SCREEN_TOP.z + 0.03, SCREEN_TOP.y - 0.01],
    ]),
    -SIDE + 0.006,
    SIDE - 0.006,
    paint,
    M.Paint,
    Z.Roof,
    0.004,
  );
  const s = new THREE.Shape(
    rounded([
      [-SIDE, -front, 0.04],
      [SIDE, -front, 0.04],
      [SIDE, -TAIL, CORNER * 1.6],
      [-SIDE, -TAIL, CORNER * 1.6],
    ]),
  );
  // Plan shape in (x, -z); extruded upwards with a rounded edge.
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
  // Only the upper face takes the crown, so the underside stays flat above the headlining.
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0.01) continue;
    const x = p.getX(i),
      z = p.getZ(i),
      a = Math.max(0, 1 - (x / SIDE) ** 2),
      t = THREE.MathUtils.clamp((z - front) / (TAIL - front), 0, 1),
      q = Math.sin(Math.PI * t) ** 2;
    const h = 0.028 * a * a * q,
      dx = ((-0.112 * x) / (SIDE * SIDE)) * a * q,
      dz = (0.028 * a * a * Math.PI * Math.sin(2 * Math.PI * t)) / (TAIL - front);
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
  // Conforming transverse pressed ribs, sharing the roof crown.
  for (let j = 0; j < 5; j++) {
    const z = 0.52 + j * 0.42,
      q = Math.sin((Math.PI * (z - front)) / (TAIL - front)) ** 2;
    const point = (x: number) => v(x, ROOF + 0.004 + 0.028 * (1 - (x / SIDE) ** 2) ** 2 * q, z);
    for (let i = 0; i < 20; i++)
      b.rod(point(-0.75 + i * 0.075), point(-0.75 + (i + 1) * 0.075), 0.006, paint, M.Paint, Z.Roof);
  }
}

function rearEnd(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  const T = TAIL;
  const e = SIDE - CORNER;
  const split = -0.18;
  const winLo = 0.95,
    winHi = 1.4;
  const wins: Vtx[][] = [
    [
      [-e + 0.07, winLo, 0.03],
      [split - 0.08, winLo, 0.03],
      [split - 0.08, winHi, 0.03],
      [-e + 0.07, winHi, 0.03],
    ],
    [
      [split + 0.08, winLo, 0.03],
      [e - 0.07, winLo, 0.03],
      [e - 0.07, winHi, 0.03],
      [split + 0.08, winHi, 0.03],
    ],
  ];
  const s = new THREE.Shape(
    rounded([
      [-e - 0.002, SILL],
      [e + 0.002, SILL],
      [e + 0.002, ROOF - 0.03],
      [-e - 0.002, ROOF - 0.03],
    ]),
  );
  for (const w of wins) s.holes.push(new THREE.Path(rounded(w)));
  extrudeZ(b, s, T - 0.04, T, paint, M.Paint, Z.Rear, 0.012);
  for (const w of wins) {
    frontPane(b, w, T - 0.016, 1, rubber, M.Rubber, Z.Glass, inset(w, 0.022));
    frontPane(b, inset(w, 0.018), T - 0.014, 1, glass, M.Glass, Z.Glass);
  }
  // Door split, the top shut line, hinges and the handle on the narrow door.
  b.block(split, (SILL + ROOF) / 2, T + 0.002, 0.008, ROOF - SILL - 0.12, 0.006, black, M.Rubber, Z.Rear);
  b.block(0, ROOF - 0.07, T + 0.002, 2 * e - 0.04, 0.006, 0.006, black, M.Rubber, Z.Rear);
  b.block(split + 0.06, 0.72, T + 0.015, 0.03, 0.12, 0.02, black, M.Rubber, Z.Rear, 0.008);
  for (const side of [-1, 1])
    for (const y of [0.68, 1.2]) {
      b.block(side * (e - 0.03), y, T + 0.018, 0.05, 0.1, 0.03, paint, M.Paint, Z.Rear, 0.006);
      b.rod(
        v(side * (e - 0.03), y - 0.05, T + 0.04),
        v(side * (e - 0.03), y + 0.05, T + 0.04),
        0.009,
        steel,
        M.Metal,
        Z.Rear,
      );
    }
  // A tall lamp at each rear corner, on the rear face and standing 4 cm out behind it, so from
  // the side it shows as a strip behind the body's edge: red tail and stop over the clear
  // reverse lens over the amber indicator (side.jpg). Until v2.11 small lamps sat low on the
  // rear face, with the indicators in the bar.
  for (const side of [-1, 1]) {
    const x0 = SIDE - 0.135,
      x1 = SIDE - 0.03;
    b.block(
      (side * (x0 + x1 - 0.004)) / 2,
      0.3875,
      T + 0.003,
      x1 - 0.004 - x0,
      0.375,
      0.066,
      black,
      M.Rubber,
      Z.Rear,
      0.006,
    );
    for (const [y0, y1, colour, slot] of [
      [0.362, 0.567, red, M.Red],
      [0.307, 0.358, lens, M.Lamp],
      [0.208, 0.303, amber, M.Amber],
    ] as const)
      b.block(
        (side * (x0 + 0.004 + x1)) / 2,
        (y0 + y1) / 2,
        T + 0.02,
        x1 - x0 - 0.004,
        y1 - y0,
        0.04,
        colour,
        slot,
        Z.Rear,
        0.004,
      );
  }
  // Covered spare on the wide right door, carried off the painted skin: the cover's back
  // stands clear of the carrier's uprights and cross bar (with the cover at T + 0.215 and the
  // bar at T + 0.09, the bar ran 35 mm into the tyre). v2.11 moved it 3 cm in, clear of the
  // corner lamp, and stopped the uprights under the door's window (they stood over its glass).
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: SPARE_X, y: 0.72, z: T + 0.255 }, 'back', black, {
    reversed: true,
    cover: () => {
      const profile = [
        [0, -0.15],
        [0.36, -0.15],
        [0.402, -0.14],
        [0.418, -0.1],
        [0.418, 0.09],
        [0.407, 0.14],
        [0.36, 0.16],
        [0, 0.16],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      b.slot = M.Fabric;
      b.tag = Z.Rear;
      b.push()
        .translate(SPARE_X, 0.72, T + 0.255)
        .rotate(Math.PI / 2, 0, 0);
      b.geometry(new THREE.LatheGeometry(profile, 48), black.clone().multiplyScalar(1.18));
      b.pop();
    },
  });
  b.ring(SPARE_X, 0.72, T + 0.396, 0.397, 0.003, trim, M.Fabric, 'z', Z.Rear);
  for (const x of [SPARE_X - 0.25, SPARE_X + 0.25])
    b.block(x, 0.69, T + 0.055, 0.055, 0.48, 0.09, black, M.Metal, Z.Rear, 0.004);
  b.block(SPARE_X, 0.72, T + 0.07, 0.55, 0.055, 0.055, black, M.Metal, Z.Rear, 0.004);
  // Black rear bar with recovery points, a tow hitch, its brackets and the plate. Its ends wrap
  // round the corners and run forward along the body sides to the vent (side.jpg).
  b.block(0, 0.08, T + 0.07, 1.86, 0.15, 0.13, bumper, M.Metal, Z.Rear, 0.025);
  for (const side of [-1, 1])
    b.block(
      side * (SIDE + 0.01),
      0.08,
      (2.34 + T + 0.1) / 2,
      0.05,
      0.15,
      T + 0.1 - 2.34,
      bumper,
      M.Metal,
      Z.Rear,
      0.02,
    );
  b.block(0, 0.0, T + 0.16, 0.08, 0.06, 0.16, black, M.Metal, Z.Rear, 0.01);
  b.slot = M.Metal;
  b.push().translate(0, 0.05, T + 0.24);
  b.geometry(new THREE.SphereGeometry(0.03, 12, 8), steel);
  b.pop();
  for (const x of [-0.43, 0.43]) b.block(x, 0.04, T - 0.05, 0.06, 0.08, 0.16, black, M.Metal, Z.Trim);
  for (const side of [-1, 1]) b.ring(side * 0.62, -0.03, T + 0.12, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  numberPlate(b, -0.46, 0.5, T + 0.008, 1, 'HZJ-75', plateInk);
}

function jerryCan(b: VehicleBuilder, x: number, y: number, z: number): void {
  const can = new THREE.Color('#5E6A43');
  b.block(x, y, z, 0.34, 0.17, 0.47, can, M.Paint, Z.Roof, 0.02);
  b.block(x - 0.08, y, z - 0.26, 0.12, 0.03, 0.05, can, M.Paint, Z.Roof, 0.01);
  b.block(x + 0.1, y, z - 0.25, 0.06, 0.06, 0.04, can, M.Paint, Z.Roof, 0.01);
  b.block(x, y - 0.092, z, 0.4, 0.014, 0.53, bar, M.Metal, Z.Roof, 0.004);
  for (const dz of [-0.12, 0.12]) {
    b.block(x, y + 0.092, z + dz, 0.38, 0.012, 0.035, black, M.Rubber, Z.Roof);
    for (const side of [-1, 1])
      b.block(x + side * 0.176, y, z + dz, 0.012, 0.19, 0.035, black, M.Rubber, Z.Roof);
    b.block(x, y - 0.092, z + dz, 0.38, 0.012, 0.035, black, M.Rubber, Z.Roof);
  }
}
/** A flat webbing strip with mitred bends, rather than rectangular hoops above the load. */
function webbing(
  b: VehicleBuilder,
  points: THREE.Vector2[],
  z: number,
  width: number,
  color: THREE.Color,
): void {
  const normals = points.slice(0, -1).map((p, i) => {
    const d = points[i + 1].clone().sub(p).normalize();
    return new THREE.Vector2(-d.y, d.x);
  });
  const edges = [1, -1].map((side) =>
    points.map((p, i) => {
      const n =
        i === 0
          ? normals[0].clone()
          : i === points.length - 1
            ? normals[normals.length - 1].clone()
            : normals[i - 1].clone().add(normals[i]).normalize();
      return p.clone().addScaledVector(n, (side * 0.004) / n.dot(normals[Math.min(i, normals.length - 1)]));
    }),
  );
  const shape = new THREE.Shape([...edges[0], ...edges[1].reverse()]);
  extrudeZ(b, shape, z - width / 2, z + width / 2, color, M.Fabric, Z.Roof, 0);
}
function roofRack(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  const { y, front, back } = RACK;
  for (const side of [-1, 1]) {
    b.rod(v(side * 0.8, y, front), v(side * 0.8, y, back), 0.02, bar, M.Metal, Z.Roof);
    b.rod(v(side * 0.8, y - 0.06, front), v(side * 0.8, y - 0.06, back), 0.014, bar, M.Metal, Z.Roof);
    for (let i = 0; i <= 6; i++) {
      const z = front + ((back - front) * i) / 6;
      b.block(side * (SIDE + 0.004), ROOF - 0.026, z, 0.052, 0.022, 0.12, bar, M.Metal, Z.Roof, 0.003);
      b.rod(v(side * (SIDE + 0.004), ROOF - 0.023, z), v(side * 0.8, y, z), 0.017, bar, M.Metal, Z.Roof);
    }
  }
  for (let i = 0; i <= 8; i++) {
    const z = front + ((back - front) * i) / 8;
    b.rod(v(-0.8, y, z), v(0.8, y, z), 0.014, bar, M.Metal, Z.Roof);
  }
  const deflector = sideShape([
    [front - 0.08, y - 0.08],
    [front + 0.015, y + 0.035],
    [front + 0.027, y + 0.027],
    [front - 0.068, y - 0.088],
  ]);
  extrudeX(b, deflector, -0.8, 0.8, bar, M.Metal, Z.Roof, 0);
  for (const x of [-0.29, 0.29]) b.block(x, y + 0.045, 1.98, 0.055, 0.03, 0.65, bar, M.Metal, Z.Roof, 0.004);
  for (const z of [1.78, 2.18]) b.rod(v(-0.8, y, z), v(0.8, y, z), 0.014, bar, M.Metal, Z.Roof);
  // The tyre's sidewall rests on the two bars (their top at y + 0.06), 4 mm clear.
  const sy = y + 0.06 + spareSidewall(wheel) + 0.004;
  b.tag = Z.Roof;
  mountSpare(b, wheel, { x: 0, y: sy, z: 1.98 }, 'up', black);
  for (const z of [1.78, 2.18]) {
    const strap = new THREE.Color('#C2862F');
    webbing(
      b,
      [
        [-0.386, y - 0.018],
        [-0.37, sy + 0.105],
        [-0.2, sy + 0.118],
        [0.2, sy + 0.118],
        [0.37, sy + 0.105],
        [0.386, y - 0.018],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      z,
      0.04,
      strap,
    );
    b.block(0, y - 0.018, z, 0.78, 0.008, 0.04, strap, M.Fabric, Z.Roof);
  }
  jerryCan(b, 0, y + 0.113, 0.85);
}

/** Steel bar: a deep pan with swept wings, a centre hoop over the grille and loops over the lamps. */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z;
  const back = F - 0.09;
  const zc = (face + back) / 2,
    depth = back - face;
  const panY = 0.16,
    panH = 0.3;
  const panShape = new THREE.Shape();
  panShape.moveTo(-0.59, -face);
  panShape.lineTo(0.59, -face);
  panShape.lineTo(0.94, -face - 0.15);
  panShape.lineTo(0.91, -back - 0.13);
  panShape.lineTo(0.56, -back);
  panShape.lineTo(-0.56, -back);
  panShape.lineTo(-0.91, -back - 0.13);
  panShape.lineTo(-0.94, -face - 0.15);
  panShape.closePath();
  const pan = new THREE.ExtrudeGeometry(panShape, {
    depth: panH - 0.03,
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 3,
  });
  pan.rotateX(-Math.PI / 2);
  pan.translate(0, panY - panH / 2 + 0.015, 0);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.geometry(pan, bar);
  for (const side of [-1, 1]) {
    b.push()
      .translate(side * 0.76, panY + 0.05, face + 0.085)
      .rotate(0, -side * 0.42, 0);
    b.block(0, 0, -0.01, 0.14, 0.06, 0.025, black, M.Rubber, Z.Front, 0.006);
    b.block(0, 0, -0.027, 0.12, 0.04, 0.009, amber, M.Amber, Z.Front, 0.004);
    b.pop();
  }
  const top = panY + panH / 2;
  b.block(0, top, zc + 0.01, 1.26, 0.03, depth + 0.03, bar, M.Metal, Z.Front, 0.012);
  for (const x of [-0.43, 0.43]) b.block(x, 0.1, back + 0.1, 0.08, 0.12, 0.24, bar, M.Metal, Z.Trim);
  const zt = F - 0.06;
  const tube = (pts: ReturnType<typeof v>[], r: number) =>
    continuousTube(
      b,
      pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      r,
      bar,
      Z.Front,
      M.Metal,
      ROUND_BEND,
    );
  tube(
    [v(-0.4, top - 0.015, zc + 0.01), v(-0.4, 0.76, zt), v(0.4, 0.76, zt), v(0.4, top - 0.015, zc + 0.01)],
    0.032,
  );
  for (const side of [-1, 1]) {
    tube(
      [
        v(side * 0.4, 0.66, zt - 0.012),
        v(side * 0.86, 0.64, zt + 0.04),
        v(side * 0.86, top - 0.01, zc + 0.105),
      ],
      0.028,
    );
    b.block(side * 0.86, top, zc + 0.105, 0.09, 0.025, 0.1, bar, M.Metal, Z.Front, 0.005);
    b.block(side * 0.4, top, zc + 0.01, 0.09, 0.025, 0.1, bar, M.Metal, Z.Front, 0.005);
  }
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the fairlead in the face. Until v2.08 its drum stood on the pan in front of the grille.
  b.block(0, top + 0.04, zc + 0.02, 0.2, 0.06, 0.09, trim, M.Rubber, Z.Front, 0.012);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.005, 0.34, 0.12, 0.02, steel, M.Metal, Z.Front, 0.006);
  b.block(m.x, m.y, face - 0.012, 0.2, 0.05, 0.015, black, M.Rubber, Z.Front);
  for (const y of [m.y - 0.032, m.y + 0.032])
    b.rod(v(m.x - 0.1, y, face - 0.03), v(m.x + 0.1, y, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.11, m.x + 0.11])
    b.rod(v(x, m.y - 0.045, face - 0.03), v(x, m.y + 0.045, face - 0.03), 0.015, steel, M.Metal, Z.Front);
  for (const side of [-1, 1]) {
    const x = side * 0.6;
    b.block(x, 0.0, face + 0.02, 0.07, 0.08, 0.06, steel, M.Metal, Z.Trim);
    b.ring(x, -0.04, face - 0.01, 0.045, 0.011, red, M.Red, 'x', Z.Trim);
  }
  b.block(0.42, 0.17, face - 0.021, 0.38, 0.14, 0.02, bar, M.Metal, Z.Front, 0.004);
  numberPlate(b, 0.42, 0.17, face - 0.035, -1, 'HZJ-75', plateInk);
}

function chassis(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    b.block(side * 0.31, -0.02, -1.7, 0.09, 0.16, 1.08, black, M.Metal, Z.Trim);
    b.rod(v(side * 0.31, -0.02, -1.18), v(side * 0.43, -0.02, -0.93), 0.045, black, M.Metal, Z.Trim);
    b.block(side * 0.43, -0.02, 0.775, 0.09, 0.16, 3.41, black, M.Metal, Z.Trim);
  }
  for (const z of [-2.05, -0.95, 0.5, 1.9, 2.45])
    b.block(0, -0.02, z, 0.86, 0.08, 0.08, black, M.Metal, Z.Trim);
  b.block(0.04, -0.04, -0.4, 0.4, 0.17, 0.7, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.6);
  b.rod({ x: 0.1, y: -0.08, z: -0.7 }, { x: 0.08, y: -0.12, z: -1.36 }, 0.032, shaft);
  b.rod({ x: 0.0, y: -0.07, z: -0.05 }, { x: 0.05, y: -0.1, z: 1.38 }, 0.036, shaft);
  b.block(-0.6, 0.08, 2.25, 0.3, 0.26, 0.4, black, M.Metal, Z.Trim, 0.03);
  b.block(0.62, 0.06, 0.62, 0.26, 0.24, 0.7, black, M.Metal, Z.Trim, 0.03);
  b.rod({ x: 0.28, y: -0.06, z: -1.4 }, { x: 0.28, y: -0.08, z: 0.4 }, 0.028, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.28, -0.07, 0.75)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), shaft);
  b.pop();
  // The tailpipe climbs over the rear axle inside the right chassis rail, drops under the two
  // rear crossmembers and ends under the rear bar. Until v2.11 it ran through the axle tube and
  // its last length out through the rail to the corner.
  const pipe = [
    v(0.28, -0.08, 1.03),
    v(0.3, -0.005, 1.3),
    v(0.3, -0.005, 1.7),
    v(0.31, -0.1, 1.84),
    v(0.32, -0.1, 2.62),
  ];
  for (let i = 0; i < pipe.length - 1; i++) b.rod(pipe[i], pipe[i + 1], 0.026, steel);
  // Floor under the cab and load space.
  for (const [start, end, width] of [
    [-2.05, -0.88, 0.7],
    [-0.88, 0.875, 1.6],
    [0.875, 2.105, 1.1],
    [2.105, 2.45, 1.6],
  ])
    b.block(0, 0.1, (start + end) / 2, width, 0.03, end - start, black, M.Rubber, Z.Trim);
  // Whip aerial on the right front wing.
  b.block(0.745, clipTop(-1.0) - 0.004, -1.0, 0.05, 0.04, 0.05, black, M.Rubber, Z.Front);
  b.rod(
    v(0.745, clipTop(-1.0) + 0.016, -1.0),
    v(0.765, clipTop(-1.0) + 1.0, -0.96),
    0.004,
    black,
    M.Rubber,
    Z.Roof,
  );
}

export function buildTroopyBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  sidePanels(b);
  frontEnd(b);
  windscreen(b);
  roof(b);
  rearEnd(b, wheel);
  roofRack(b, wheel);
  bullBar(b, tuning);
  chassis(b);
  flapsAndSteps(b);
  addTroopyInterior(b, tuning.engine.redlineRpm, paint, false, TROOPY_CAB_FIT);
  const g = b.build();
  return cleanGeometry(g);
}

/** A 7.50R16 light-truck tyre with a chunky all-terrain tread, on a grey steel wheel. */
export function buildTroopyWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#232624');
  const rim = troopyColors.wheel;
  const rimR = 0.215;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.47],
    [r * 0.7, -w * 0.54],
    [r * 0.9, -w * 0.5],
    [r * 0.965, -w * 0.4],
    [r * 0.965, w * 0.4],
    [r * 0.9, w * 0.5],
    [r * 0.7, w * 0.54],
    [rimR - 0.01, w * 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Two rows of big staggered blocks that wrap onto the shoulders.
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.25, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.15, 0);
      b.box(w * 0.44, 0.036, 0.075, tyre);
      b.pop();
    }
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.74, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, the dished centre with round vents, the hub and six wheel nuts.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.013, rim, M.Paint, 'x');
    const circle = (cx: number, cy: number, r: number, n: number) =>
      Array.from(
        { length: n },
        (_, i) =>
          new THREE.Vector2(
            cx + r * Math.cos((i * Math.PI * 2) / n),
            cy + r * Math.sin((i * Math.PI * 2) / n),
          ),
      );
    const disc = new THREE.Shape(circle(0, 0, rimR - 0.01, 16));
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) * Math.PI) / 3;
      disc.holes.push(new THREE.Path(circle(Math.cos(a) * 0.168, Math.sin(a) * 0.168, 0.022, 8).reverse()));
    }
    disc.holes.push(new THREE.Path(circle(0, 0, 0.051, 12).reverse()));
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.01, 0.01, rim, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.12, 0.135, 0.03, 16), rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 + 0.008), Math.cos(a) * 0.0698, Math.sin(a) * 0.0698)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.0125, 0.015, 0.02, 6), steel);
      b.pop();
    }
    // Free-wheeling hub cap in the middle.
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.022), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.05, 0.058, 0.05, 12), steel.clone().multiplyScalar(0.9));
    b.pop();
  }
  return cleanGeometry(b.build());
}

/** A recovery board strapped along the roof rack (index 0 on the left). */
export function buildTroopyPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const x = index === 0 ? -0.6 : 0.6,
    y = RACK.y + 0.04,
    z = (RACK.front + RACK.back) / 2;
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
  for (const dz of [-0.8075, 0.7625]) {
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(x + s * (W / 2 + 0.006), y - 0.014, z + dz, 0.012, 0.1, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, y - 0.058, z + dz, W + 0.03, 0.012, 0.045, black, M.Rubber, Z.Roof);
  }
  return cleanGeometry(b.build());
}
