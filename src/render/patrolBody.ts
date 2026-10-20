import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addPatrolInterior } from './patrolInterior';
import { patrolColors } from './patrolPaint';

/**
 * Nissan GQ Patrol wagon set up for touring: a square five-door body in white over a
 * charcoal lower body, black wheel-arch flares, a flat bonnet over a black grille with
 * rectangular headlamps, split rear doors with the spare on the wider one, a black steel
 * bull bar with a winch and two driving lamps, a snorkel up the left windscreen pillar
 * and a full-length roof rack. Ground is about 0.51 m below the origin when parked.
 */
const { paint, lower, flare, bar, trim } = patrolColors;
const black = new THREE.Color('#1B1E1F'),
  rubber = new THREE.Color('#242729'),
  steel = new THREE.Color('#A2A6A6'),
  chrome = new THREE.Color('#C9CDCD');
const red = new THREE.Color('#B12F27'),
  amber = new THREE.Color('#E59A33'),
  lens = new THREE.Color('#E6E6D8');
const glass = new THREE.Color('#9FB6B7');

/** Body sides, wheel openings and the main heights (vehicle frame). */
const SIDE = 0.87;
const WAIST = 0.76;
const SILL = 0.02;
/** Where the white upper body meets the charcoal lower body. */
const TWO_TONE = 0.3;
const ARCH = { radius: 0.5, cy: -0.07 };
const AXLE = 1.485;
const FRONT_FACE = -2.27;
const BONNET = 0.63;
const SCUTTLE = -0.8;
const SCREEN_BASE = 0.75;
const SCREEN_TOP = { y: 1.24, z: -0.5 };
const B_PILLAR = 0.3;
const C_PILLAR = 1.08;
const TAIL = 2.45;
const ROOF = 1.29;
/** The glasshouse leans in this far from the waist to the roof. */
const TUMBLE = 0.05;
/** Split between the rear doors: the left door, with the spare, is the wider one. */
const DOOR_SPLIT = 0.16;

/**
 * One side of the lower body from `start` to `end`: a skin with round wheel openings cut
 * around each axle in `arches`, white above the two-tone line and charcoal below it, and
 * a return edge so a wheel well can be looked into.
 */
function sideSkin(
  b: VehicleBuilder,
  side: number,
  start: number,
  end: number,
  top: number,
  arches: readonly number[],
  zone: number,
): void {
  const outer = side * SIDE,
    inner = side * (SIDE - 0.05);
  const steps = Math.max(8, Math.round((end - start) / 0.04));
  const low = (z: number) => {
    let y = SILL;
    for (const axle of arches)
      y = Math.max(y, Math.sqrt(Math.max(0, ARCH.radius ** 2 - (z - axle) ** 2)) + ARCH.cy);
    return y;
  };
  const strip = (
    za: number,
    zb: number,
    ya: number,
    yb: number,
    ta: number,
    tb: number,
    col: THREE.Color,
  ) => {
    const a = { x: outer, y: ya, z: za },
      c = { x: outer, y: tb, z: zb };
    const bb = { x: outer, y: yb, z: zb },
      d = { x: outer, y: ta, z: za };
    if (side < 0) b.quad(a, bb, c, d, col);
    else b.quad(d, c, bb, a, col);
    const ai = { ...a, x: inner },
      bi = { ...bb, x: inner },
      ci = { ...c, x: inner },
      di = { ...d, x: inner };
    if (side > 0) b.quad(ai, bi, ci, di, col);
    else b.quad(di, ci, bi, ai, col);
    return { a, bb, ai, bi };
  };
  b.slot = M.Paint;
  b.tag = zone;
  for (let i = 0; i < steps; i++) {
    const za = start + ((end - start) * i) / steps,
      zb = start + ((end - start) * (i + 1)) / steps;
    const ya = low(za),
      yb = low(zb);
    // Bottom edge (the lip of an opening or the sill) and top edge.
    let edge;
    if (ya < TWO_TONE && yb < TWO_TONE) {
      edge = strip(za, zb, ya, yb, TWO_TONE, TWO_TONE, lower);
      strip(za, zb, TWO_TONE, TWO_TONE, top, top, paint);
    } else edge = strip(za, zb, ya, yb, top, top, ya < TWO_TONE || yb < TWO_TONE ? lower : paint);
    const { a, bb, ai, bi } = edge;
    const col = ya < TWO_TONE ? lower : paint;
    if (side > 0) b.quad(a, ai, bi, bb, col);
    else b.quad(bb, bi, ai, a, col);
  }
}

/** Black flat-topped flare round a wheel opening, and the dark wheel well behind it. */
function flareAndWell(b: VehicleBuilder, side: number, axle: number, wellX: number, zone: number): void {
  b.slot = M.Rubber;
  b.tag = zone;
  b.push()
    .translate(side * (SIDE + 0.03), ARCH.cy, axle)
    .rotate(0, Math.PI / 2, 0)
    .scale(1, 1.02, 0.9);
  b.geometry(new THREE.TorusGeometry(ARCH.radius + 0.045, 0.062, 4, 36, Math.PI), flare);
  b.pop();
  // The flare's flat top and its feet at the sill.
  b.block(
    side * (SIDE + 0.035),
    ARCH.cy + ARCH.radius + 0.07,
    axle,
    0.11,
    0.05,
    0.5,
    flare,
    M.Rubber,
    zone,
    0.015,
  );
  for (const dz of [-1, 1])
    b.block(
      side * (SIDE + 0.03),
      ARCH.cy + 0.03,
      axle + dz * (ARCH.radius + 0.04),
      0.11,
      0.14,
      0.09,
      flare,
      M.Rubber,
      zone,
      0.012,
    );
  b.block(side * wellX, ARCH.cy + 0.2, axle, 0.03, 0.62, ARCH.radius * 2, black, M.Rubber, Z.Trim);
  b.block(
    (side * (wellX + SIDE)) / 2,
    ARCH.cy + ARCH.radius + 0.015,
    axle,
    SIDE - wellX,
    0.03,
    ARCH.radius * 1.7,
    black,
    M.Rubber,
    Z.Trim,
  );
}

function frontEnd(b: VehicleBuilder): void {
  const F = FRONT_FACE;
  // Flat bonnet between the guard tops, its front lip and the cowl vent below the screen.
  const bonnetLen = SCUTTLE - (F + 0.04);
  b.block(0, BONNET, F + 0.04 + bonnetLen / 2, 1.58, 0.05, bonnetLen, paint, M.Paint, Z.Front, 0.02);
  b.block(0, BONNET + 0.028, -1.45, 0.7, 0.012, 1.05, paint, M.Paint, Z.Front, 0.006);
  b.block(0, BONNET - 0.035, F + 0.03, 1.6, 0.06, 0.06, paint, M.Paint, Z.Front, 0.015);
  b.block(0, BONNET + 0.06, SCUTTLE + 0.06, 1.6, 0.1, 0.14, paint, M.Paint, Z.Front, 0.012);
  b.block(0, BONNET + 0.112, SCUTTLE + 0.04, 1.4, 0.008, 0.08, black, M.Rubber, Z.Front);
  for (const side of [-1, 1]) {
    // Guard tops flush with the bonnet, and the lower guard round the front wheel.
    b.block(
      side * 0.835,
      BONNET - 0.005,
      (F + SCUTTLE) / 2,
      0.07,
      0.05,
      SCUTTLE - F,
      paint,
      M.Paint,
      Z.Front,
      0.012,
    );
    sideSkin(b, side, F + 0.02, SCUTTLE, BONNET - 0.02, [-AXLE], Z.Front);
    flareAndWell(b, side, -AXLE, 0.42, Z.Front);
    // Rectangular headlamp in a chrome bezel, the parking lamp and the wrap-round indicator.
    b.block(side * 0.645, 0.43, F - 0.005, 0.36, 0.21, 0.03, chrome, M.Metal, Z.Front, 0.012);
    b.block(side * 0.645, 0.43, F - 0.02, 0.31, 0.16, 0.012, lens, M.Headlamp, Z.Front, 0.01);
    for (let i = 1; i < 4; i++)
      b.block(
        side * (0.645 - 0.155 + i * 0.0775),
        0.43,
        F - 0.028,
        0.004,
        0.15,
        0.004,
        chrome,
        M.Metal,
        Z.Front,
      );
    b.block(side * 0.69, 0.27, F - 0.006, 0.26, 0.075, 0.03, black, M.Rubber, Z.Front, 0.01);
    b.block(side * 0.75, 0.27, F - 0.022, 0.13, 0.055, 0.012, amber, M.Amber, Z.Front, 0.006);
    b.block(side * 0.63, 0.27, F - 0.022, 0.1, 0.055, 0.012, lens, M.Headlamp, Z.Front, 0.006);
    b.block(side * (SIDE - 0.005), 0.29, F + 0.08, 0.02, 0.06, 0.12, amber, M.Amber, Z.Front, 0.006);
    // Side repeater on the guard behind the wheel.
    b.block(side * (SIDE + 0.008), 0.45, -0.95, 0.012, 0.03, 0.07, amber, M.Amber, Z.Front, 0.006);
  }
  // Front panel under the bonnet lip, the black grille between the headlamps with its
  // horizontal bars, and a plain badge.
  b.block(0, 0.38, F + 0.02, 1.72, 0.44, 0.04, paint, M.Paint, Z.Front, 0.01);
  b.block(0, 0.43, F - 0.004, 0.9, 0.24, 0.03, black, M.Rubber, Z.Front, 0.01);
  for (let i = 0; i < 6; i++)
    b.block(0, 0.335 + i * 0.038, F - 0.022, 0.86, 0.016, 0.014, trim, M.Rubber, Z.Front, 0.004);
  b.block(0, 0.43, F - 0.034, 0.16, 0.05, 0.012, chrome, M.Metal, Z.Front, 0.012);
  // Pressed-steel bumper behind the bar, the sump guard and the steering damper.
  b.block(0, 0.12, F - 0.05, 1.7, 0.16, 0.1, black, M.Metal, Z.Front, 0.02);
  b.block(0, -0.12, -1.72, 0.7, 0.03, 0.6, bar, M.Metal, Z.Trim);
  b.rod({ x: -0.5, y: -0.08, z: -1.62 }, { x: 0.35, y: -0.06, z: -1.62 }, 0.022, black);
}

function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const z = -2.41;
  // Pan under the bumper, the centre hoop round the grille and the wings over the lamps.
  b.block(0, 0.08, z + 0.03, 1.84, 0.22, 0.08, bar, M.Metal, Z.Front, 0.02);
  b.block(0, 0.21, z + 0.01, 1.8, 0.05, 0.1, bar, M.Metal, Z.Front, 0.012);
  for (const x of [-0.4, 0.4])
    b.rod({ x, y: 0.22, z }, { x: x * 0.98, y: 0.76, z: z + 0.04 }, 0.034, bar, M.Metal, Z.Front);
  b.rod({ x: -0.4, y: 0.76, z: z + 0.04 }, { x: 0.4, y: 0.76, z: z + 0.04 }, 0.034, bar, M.Metal, Z.Front);
  for (const x of [-0.16, 0, 0.16])
    b.rod({ x, y: 0.22, z }, { x, y: 0.73, z: z + 0.035 }, 0.016, bar, M.Metal, Z.Front);
  for (const side of [-1, 1]) {
    b.rod(
      { x: side * 0.4, y: 0.6, z: z + 0.03 },
      { x: side * 0.86, y: 0.52, z: z + 0.08 },
      0.03,
      bar,
      M.Metal,
      Z.Front,
    );
    b.rod(
      { x: side * 0.86, y: 0.52, z: z + 0.08 },
      { x: side * 0.92, y: 0.2, z: z + 0.1 },
      0.03,
      bar,
      M.Metal,
      Z.Front,
    );
    for (const y of [0.36, 0.46])
      b.rod(
        { x: side * 0.42, y, z: z + 0.02 },
        { x: side * 0.88, y, z: z + 0.05 },
        0.014,
        bar,
        M.Metal,
        Z.Front,
      );
    // Driving lamp on the hoop: black can, chrome rim, clear lens (lit on high beam).
    const lx = side * 0.28,
      ly = 0.86,
      lz = z + 0.02;
    b.rod(
      { x: lx, y: 0.77, z: lz + 0.03 },
      { x: lx, y: ly - 0.06, z: lz + 0.03 },
      0.012,
      black,
      M.Metal,
      Z.Front,
    );
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.push()
      .translate(lx, ly, lz + 0.03)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.095, 0.08, 0.1, 24), black);
    b.pop();
    b.ring(lx, ly, lz - 0.02, 0.09, 0.01, chrome, M.Metal, 'z', Z.Front);
    b.slot = M.DrivingLamp;
    b.push()
      .translate(lx, ly, lz - 0.022)
      .scale(1, 1, 0.3);
    b.geometry(new THREE.SphereGeometry(0.083, 20, 10), lens);
    b.pop();
  }
  // Plate on the pan, the winch drum behind it and the roller fairlead at the cable exit.
  b.block(0.42, 0.08, z - 0.015, 0.37, 0.12, 0.012, new THREE.Color('#F0EEE6'), M.Lamp, Z.Front, 0.006);
  b.block(0.42, 0.08, z - 0.02, 0.34, 0.012, 0.004, black, M.Rubber, Z.Front);
  b.rod({ x: -0.25, y: 0.12, z: z + 0.1 }, { x: 0.25, y: 0.12, z: z + 0.1 }, 0.075, black, M.Metal, Z.Front);
  b.rod(
    { x: -0.2, y: 0.12, z: z + 0.1 },
    { x: 0.2, y: 0.12, z: z + 0.1 },
    0.08,
    steel.clone().multiplyScalar(0.55),
    M.Metal,
    Z.Front,
  );
  const mount = tuning.winchMount;
  for (const y of [mount.y - 0.035, mount.y + 0.035])
    b.rod({ x: -0.12, y, z: mount.z }, { x: 0.12, y, z: mount.z }, 0.014, steel, M.Metal, Z.Front);
  for (const x of [-0.13, 0.13])
    b.rod(
      { x, y: mount.y - 0.045, z: mount.z },
      { x, y: mount.y + 0.045, z: mount.z },
      0.014,
      steel,
      M.Metal,
      Z.Front,
    );
  for (const side of [-1, 1]) b.ring(side * 0.62, -0.03, z - 0.02, 0.04, 0.012, red, M.Red, 'x', Z.Front);
}

function windscreen(b: VehicleBuilder): void {
  const lean = Math.atan2(SCREEN_TOP.z - SCUTTLE, SCREEN_TOP.y - SCREEN_BASE);
  const h = Math.hypot(SCREEN_TOP.z - SCUTTLE, SCREEN_TOP.y - SCREEN_BASE);
  b.push().translate(0, SCREEN_BASE, SCUTTLE).rotate(lean, 0, 0);
  b.block(0, 0.02, 0, 1.66, 0.05, 0.06, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h - 0.025, 0, 1.6, 0.06, 0.06, paint, M.Paint, Z.Front, 0.01);
  b.block(0, h / 2, 0.005, 1.56, h - 0.07, 0.012, glass, M.Glass, Z.Glass);
  for (const y of [0.05, h - 0.055]) b.block(0, y, -0.012, 1.58, 0.014, 0.01, rubber, M.Rubber, Z.Front);
  for (const x of [0.42, -0.2]) {
    b.rod({ x, y: 0.06, z: -0.03 }, { x: x - 0.44, y: 0.12, z: -0.03 }, 0.007, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.06, z: -0.034 }, { x: x - 0.4, y: 0.11, z: -0.034 }, 0.004, black, M.Rubber, Z.Front);
  }
  b.pop();
  // A pillars, leaning back with the screen and in with the glasshouse.
  for (const side of [-1, 1])
    b.rod(
      { x: side * (SIDE - 0.035), y: SCREEN_BASE, z: SCUTTLE },
      { x: side * (SIDE - 0.075), y: SCREEN_TOP.y, z: SCREEN_TOP.z },
      0.04,
      paint,
      M.Paint,
      Z.Front,
    );
}

/** A side of the glasshouse: pillars, glass, frames and gutters, leaning in towards the roof. */
function glasshouse(b: VehicleBuilder, side: number): void {
  const lean = Math.atan2(TUMBLE, ROOF - WAIST);
  const h = ROOF - WAIST;
  b.push()
    .translate(side * (SIDE - 0.025), WAIST, 0)
    .rotate(0, 0, side * lean);
  const pillar = (z0: number, z1: number) =>
    b.block(0, h / 2, (z0 + z1) / 2, 0.05, h, z1 - z0, paint, M.Paint, Z.Sides, 0.012);
  // The front pillar stands where the screen's A pillar meets the door.
  pillar(B_PILLAR - 0.04, B_PILLAR + 0.06);
  pillar(C_PILLAR - 0.05, C_PILLAR + 0.05);
  pillar(TAIL - 0.12, TAIL);
  // The front door glass runs forward to the sloping A pillar.
  const front = { bottom: SCUTTLE + 0.08, top: SCREEN_TOP.z + 0.08, back: B_PILLAR - 0.04 };
  const gx = side * -0.005;
  const ga = { x: gx, y: 0.04, z: front.bottom },
    gb = { x: gx, y: 0.04, z: front.back },
    gc = { x: gx, y: h - 0.04, z: front.back },
    gd = { x: gx, y: h - 0.04, z: front.top };
  b.slot = M.Glass;
  b.tag = Z.Glass;
  b.quad(ga, gb, gc, gd, glass);
  b.quad(gd, gc, gb, ga, glass);
  for (const y of [0.025, h - 0.03]) {
    const z0 = y < h / 2 ? front.bottom : front.top;
    b.block(side * 0.012, y, (z0 + front.back) / 2, 0.016, 0.03, front.back - z0, rubber, M.Rubber, Z.Sides);
  }
  const windows: [number, number][] = [
    [B_PILLAR + 0.06, C_PILLAR - 0.05],
    [C_PILLAR + 0.05, TAIL - 0.12],
  ];
  for (const [z0, z1] of windows) {
    b.block(side * -0.005, h / 2 + 0.01, (z0 + z1) / 2, 0.01, h - 0.08, z1 - z0, glass, M.Glass, Z.Glass);
    for (const y of [0.025, h - 0.03])
      b.block(side * 0.012, y, (z0 + z1) / 2, 0.016, 0.03, z1 - z0, rubber, M.Rubber, Z.Sides);
  }
  // Front door glass runs forward to the A pillar on a sloping frame.
  const slope = Math.hypot(SCREEN_TOP.z - SCUTTLE, h);
  b.push()
    .translate(0, 0, SCUTTLE)
    .rotate(Math.atan2(SCREEN_TOP.z - SCUTTLE, h), 0, 0);
  b.block(side * 0.005, slope / 2, 0.03, 0.04, slope, 0.06, paint, M.Paint, Z.Sides, 0.012);
  b.pop();
  b.pop();
  // Rain gutter along the roof edge.
  b.block(
    side * (SIDE - TUMBLE - 0.03),
    ROOF - 0.05,
    (SCREEN_TOP.z + TAIL) / 2 + 0.02,
    0.03,
    0.025,
    TAIL - SCREEN_TOP.z,
    paint,
    M.Paint,
    Z.Roof,
    0.008,
  );
}

function sides(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    // Doors and rear quarter as one skin with the rear opening cut in, shut lines over it.
    sideSkin(b, side, SCUTTLE, TAIL, WAIST, [AXLE], Z.Sides);
    flareAndWell(b, side, AXLE, 0.6, Z.Rear);
    for (const z of [SCUTTLE + 0.02, B_PILLAR, C_PILLAR - 0.02])
      b.block(
        side * (SIDE + 0.003),
        (SILL + WAIST) / 2,
        z,
        0.006,
        WAIST - SILL - 0.04,
        0.008,
        black,
        M.Rubber,
        Z.Sides,
      );
    // The rear door's lower edge follows the wheel opening.
    b.block(side * (SIDE + 0.003), 0.44, C_PILLAR - 0.02, 0.006, 0.1, 0.06, black, M.Rubber, Z.Sides);
    // Body-side moulding along the two-tone line, door handles and the sill step.
    for (const [z0, z1] of [
      [SCUTTLE + 0.05, AXLE - ARCH.radius - 0.08],
      [AXLE + ARCH.radius + 0.08, TAIL - 0.04],
    ])
      b.block(
        side * (SIDE + 0.01),
        TWO_TONE + 0.02,
        (z0 + z1) / 2,
        0.02,
        0.045,
        z1 - z0,
        trim,
        M.Rubber,
        Z.Sides,
        0.008,
      );
    for (const z of [B_PILLAR - 0.14, C_PILLAR - 0.16]) {
      b.block(side * (SIDE + 0.006), 0.6, z, 0.012, 0.05, 0.14, black, M.Rubber, Z.Sides, 0.006);
      b.block(side * (SIDE + 0.014), 0.6, z, 0.012, 0.022, 0.1, chrome, M.Metal, Z.Sides, 0.006);
    }
    b.rod(
      { x: side * 0.86, y: -0.04, z: -0.92 },
      { x: side * 0.86, y: -0.04, z: 0.92 },
      0.032,
      bar,
      M.Metal,
      Z.Sides,
    );
    for (const z of [-0.7, 0, 0.7])
      b.rod({ x: side * 0.86, y: -0.04, z }, { x: side * 0.5, y: 0.0, z }, 0.022, bar, M.Metal, Z.Trim);
    // Big rectangular door mirror on a two-legged arm.
    for (const y of [0.78, 0.88])
      b.rod(
        { x: side * SIDE, y, z: SCUTTLE + 0.1 },
        { x: side * 1.04, y: y + 0.12, z: SCUTTLE + 0.06 },
        0.01,
        black,
        M.Rubber,
        Z.Sides,
      );
    b.block(side * 1.07, 0.98, SCUTTLE + 0.05, 0.05, 0.22, 0.15, black, M.Rubber, Z.Trim, 0.015);
    b.block(side * 1.07, 0.98, SCUTTLE + 0.128, 0.04, 0.19, 0.006, chrome, M.Metal, Z.Trim, 0.01);
    glasshouse(b, side);
  }
  // Fuel filler flap on the right rear quarter.
  b.block(SIDE + 0.006, 0.55, 2.0, 0.012, 0.16, 0.16, paint, M.Paint, Z.Rear, 0.02);
}

function roofAndRack(b: VehicleBuilder): void {
  const half = SIDE - TUMBLE - 0.03;
  b.block(
    0,
    ROOF - 0.03,
    (SCREEN_TOP.z + TAIL) / 2 + 0.02,
    half * 2,
    0.06,
    TAIL - SCREEN_TOP.z + 0.03,
    paint,
    M.Paint,
    Z.Roof,
    0.03,
  );
  for (const x of [-0.45, 0, 0.45]) b.block(x, ROOF + 0.002, 1.0, 0.012, 0.006, 2.6, paint, M.Paint, Z.Roof);
  // Steel tradesman rack: feet on the gutters, side rails, cross bars and a wind deflector.
  const y = ROOF + 0.11,
    z0 = -0.36,
    z1 = 2.3;
  for (const side of [-1, 1]) {
    b.block(side * 0.79, y, (z0 + z1) / 2, 0.04, 0.04, z1 - z0, bar, M.Metal, Z.Roof, 0.01);
    for (let z = z0 + 0.1; z <= z1 - 0.05; z += (z1 - z0 - 0.15) / 4)
      b.rod(
        { x: side * 0.79, y: y - 0.02, z },
        { x: side * half, y: ROOF - 0.04, z },
        0.016,
        bar,
        M.Metal,
        Z.Roof,
      );
  }
  for (let z = z0 + 0.05; z <= z1; z += 0.33)
    b.rod({ x: -0.79, y, z }, { x: 0.79, y, z }, 0.014, bar, M.Metal, Z.Roof);
  b.push()
    .translate(0, y + 0.02, z0 - 0.02)
    .rotate(-0.6, 0, 0);
  b.block(0, 0, 0, 1.6, 0.012, 0.16, bar, M.Metal, Z.Roof);
  b.pop();
  // A rolled swag and a jerry can tied to the back of the rack.
  b.slot = M.Fabric;
  b.tag = Z.Roof;
  b.push()
    .translate(0, y + 0.12, 2.05)
    .rotate(0, 0, Math.PI / 2);
  b.geometry(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16), new THREE.Color('#5E6B4A'));
  b.pop();
  b.block(0.55, y + 0.2, 1.55, 0.16, 0.36, 0.34, new THREE.Color('#2F5E37'), M.Paint, Z.Roof, 0.02);
}

function snorkel(b: VehicleBuilder, tuning: VehicleTuning): void {
  const x = -(SIDE + 0.04);
  const black2 = new THREE.Color('#202325');
  // Into the guard, up beside the A pillar to above the roof, and the ram head on top.
  b.block(x + 0.01, 0.5, -0.98, 0.1, 0.2, 0.14, black2, M.Rubber, Z.Front, 0.03);
  b.rod({ x, y: 0.58, z: -0.92 }, { x, y: 0.82, z: -0.82 }, 0.055, black2, M.Rubber, Z.Front);
  b.rod({ x, y: 0.82, z: -0.82 }, { x: x + 0.02, y: 1.38, z: -0.55 }, 0.055, black2, M.Rubber, Z.Front);
  for (const t of [0.3, 0.7]) {
    const y = 0.82 + (1.38 - 0.82) * t,
      z = -0.82 + 0.27 * t;
    b.rod(
      { x: x + 0.03, y, z },
      { x: -(SIDE - 0.05), y: y + 0.02, z: z + 0.04 },
      0.012,
      steel,
      M.Metal,
      Z.Front,
    );
  }
  const head = tuning.intake;
  b.block(head.x, head.y, head.z + 0.02, 0.15, 0.13, 0.22, black2, M.Rubber, Z.Roof, 0.04);
  b.block(head.x, head.y, head.z - 0.095, 0.12, 0.1, 0.012, black, M.Rubber, Z.Roof, 0.02);
  for (let i = 0; i < 4; i++)
    b.block(head.x, head.y - 0.03 + i * 0.02, head.z - 0.103, 0.11, 0.005, 0.006, trim, M.Rubber, Z.Roof);
}

function rearEnd(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  // Split barn doors: the wider left one carries the spare.
  const doorTop = ROOF - 0.05;
  const z = TAIL;
  for (const [x0, x1] of [
    [-(SIDE - 0.01), DOOR_SPLIT - 0.006],
    [DOOR_SPLIT + 0.006, SIDE - 0.01],
  ]) {
    const w = x1 - x0,
      cx = (x0 + x1) / 2;
    b.block(cx, (SILL + TWO_TONE) / 2, z, w, TWO_TONE - SILL, 0.05, lower, M.Paint, Z.Rear, 0.008);
    b.block(cx, (TWO_TONE + 0.86) / 2, z, w, 0.86 - TWO_TONE, 0.05, paint, M.Paint, Z.Rear, 0.008);
    b.block(cx, (doorTop + 1.2) / 2, z, w, doorTop - 1.2, 0.05, paint, M.Paint, Z.Rear, 0.008);
    for (const xx of [x0 + 0.025, x1 - 0.025])
      b.block(xx, 1.03, z, 0.05, 0.34, 0.05, paint, M.Paint, Z.Rear, 0.008);
    b.block(cx, 1.03, z + 0.005, w - 0.05, 0.34, 0.01, glass, M.Glass, Z.Glass);
    for (const y of [0.87, 1.19]) b.block(cx, y, z + 0.022, w - 0.04, 0.014, 0.01, rubber, M.Rubber, Z.Rear);
  }
  b.block(DOOR_SPLIT, (SILL + doorTop) / 2, z + 0.02, 0.012, doorTop - SILL, 0.012, black, M.Rubber, Z.Rear);
  for (const side of [-1, 1])
    for (const y of [0.25, 0.95])
      b.block(side * (SIDE - 0.03), y, z + 0.035, 0.03, 0.1, 0.03, black, M.Metal, Z.Rear, 0.008);
  b.block(DOOR_SPLIT - 0.08, 0.62, z + 0.035, 0.1, 0.03, 0.02, chrome, M.Metal, Z.Rear, 0.006);
  // Tall tail lamps in the rear corners, wrapping round onto the sides.
  for (const side of [-1, 1]) {
    b.block(side * (SIDE - 0.06), 0.4, z + 0.028, 0.12, 0.32, 0.012, red, M.Red, Z.Rear, 0.008);
    b.block(side * (SIDE - 0.06), 0.27, z + 0.03, 0.12, 0.06, 0.012, amber, M.Amber, Z.Rear, 0.006);
    b.block(side * (SIDE + 0.005), 0.4, z - 0.05, 0.012, 0.3, 0.09, red, M.Red, Z.Rear, 0.006);
  }
  // Steel rear bar with a tow hitch and the plate.
  b.block(0, 0.04, z + 0.07, 1.8, 0.16, 0.12, bar, M.Metal, Z.Rear, 0.02);
  b.block(0, -0.04, z + 0.16, 0.08, 0.06, 0.16, bar, M.Metal, Z.Rear, 0.01);
  b.ring(0, -0.02, z + 0.23, 0.035, 0.012, steel, M.Metal, 'y', Z.Rear);
  b.block(0.42, 0.24, z + 0.032, 0.36, 0.12, 0.01, new THREE.Color('#F0EEE6'), M.Lamp, Z.Rear, 0.006);
  // The spare on its carrier, with a black cover plate over the hub.
  b.tag = Z.Rear;
  b.push()
    .translate(-0.3, 0.5, z + 0.16)
    .rotate(0, Math.PI / 2, 0);
  b.geometry(wheel.clone(), black);
  b.pop();
  b.block(-0.3, 0.5, z + 0.05, 0.3, 0.3, 0.05, bar, M.Metal, Z.Rear, 0.02);
}

function chassis(b: VehicleBuilder): void {
  for (const x of [-0.47, 0.47]) b.block(x, 0.02, 0.04, 0.1, 0.18, 4.4, black, M.Metal, Z.Trim);
  for (const z of [-2.1, -0.75, 0.6, 2.2]) b.block(0, 0.0, z, 0.9, 0.08, 0.08, black, M.Metal, Z.Trim);
  // Gearbox and transfer case, propshafts, fuel tank, and the exhaust out the left side.
  b.block(0.06, -0.03, -0.25, 0.42, 0.2, 0.62, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.55);
  b.rod({ x: 0.06, y: -0.08, z: -0.55 }, { x: 0.08, y: -0.12, z: -AXLE + 0.12 }, 0.032, shaft);
  b.rod({ x: 0.06, y: -0.08, z: 0.08 }, { x: 0.05, y: -0.12, z: AXLE - 0.12 }, 0.035, shaft);
  b.block(0, 0.1, 2.0, 0.84, 0.2, 0.6, black, M.Metal, Z.Trim, 0.03);
  b.rod({ x: -0.3, y: -0.06, z: -0.8 }, { x: -0.3, y: -0.08, z: 0.9 }, 0.028, steel);
  b.rod({ x: -0.3, y: -0.08, z: 0.9 }, { x: -0.72, y: -0.1, z: 1.05 }, 0.028, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.3, -0.07, 0.25)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12), steel.clone().multiplyScalar(0.6));
  b.pop();
  // Floor pan under the cabin and the cargo floor behind the seats.
  b.block(0, 0.14, 0.15, 1.66, 0.03, 4.4, black, M.Rubber, Z.Trim);
}

export function buildPatrolBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontEnd(b);
  bullBar(b, tuning);
  windscreen(b);
  sides(b);
  roofAndRack(b);
  snorkel(b, tuning);
  rearEnd(b, wheel);
  chassis(b);
  addPatrolInterior(b, tuning.engine.redlineRpm);
  return b.build();
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
  const blocks = 30;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.2, Math.cos(angle) * r * 0.968, Math.sin(angle) * r * 0.968)
        .rotate(angle, side * 0.12, 0);
      b.box(w * 0.34, 0.03, 0.055, tyre);
      b.pop();
      b.push()
        .translate(side * w * 0.47, Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9)
        .rotate(angle, 0, 0);
      b.box(0.03, 0.05, 0.04, tyre);
      b.pop();
    }
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.74, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, the dished centre with its ring of holes, hub cap and studs.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.014, rimColor, M.Paint, 'x');
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.035), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 40),
      rimColor.clone().multiplyScalar(0.92),
    );
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.015), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.11, 0.125, 0.03, 32), rimColor);
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
    b.geometry(new THREE.CylinderGeometry(0.042, 0.05, 0.045, 20), chrome);
    b.pop();
  }
  return b.build();
}

/** A recovery board strapped to the roof rack (index 0 on the left). */
export function buildPatrolPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const x = index === 0 ? -0.4 : 0.4,
    y = ROOF + 0.155,
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
  for (const dz of [-0.8, 0.8]) {
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(x + (s * (W + 0.02)) / 2, y - 0.01, z + dz, 0.012, 0.07, 0.045, black, M.Rubber, Z.Roof);
  }
  return b.build();
}
