import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { UTE_CAB_SHIFT } from '../data/ute40';
import { shortieCabin } from '../data/vehicles';
import { ROUND_BEND, cleanGeometry, continuousTube, subdivideSurface } from './bodyRefinement';
import { extrudeX, extrudeZ, rounded, sideShape } from './bodyShapes';
import { pal } from './colors';
import { ute40Colors as C } from './ute40Paint';
import {
  BELT,
  BW,
  CAP,
  DOOR_REAR,
  DOOR_Z,
  LOW,
  NOSE,
  ROOF,
  STEP,
  TUCK,
  WIN_LOW,
  WIN_TOP,
  front,
  plan,
  planProfile,
  sideProfile,
  windscreen,
  type Livery,
} from './vehicleBody';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addDialFaces, addSteeringColumn } from './vehicleInstruments';
import { buildVehicleWheel } from './vehicleWheel';
import { mountSpare, spareSidewall } from './spares';
import { mirrorHead } from './mirrors';

// The 40 Series ute: the game's 40 Series cab on the HJ47's long chassis with a steel farm
// tray. The cab is drawn by the 40's own code in the 40's frame (`src/render/vehicleBody.ts`,
// matched to its photographs) and moved forward with the front axle by UTE_CAB_SHIFT; the
// cab back, the roof, the tray and the gear are drawn here in the ute's frame (x right,
// y up, z back, origin at mid-wheelbase). The owner's two pictures of the real farm truck are
// the look reference: reference/vehicles/landcruiser-45-ute/SOURCES.md.

/** The cab's back panel, in the 40's frame: just behind the door shut. */
const CAB_BACK = DOOR_REAR + 0.12;
/** The cab's rear corners, round in plan. */
const CAB_R = 0.08;
/**
 * The foot of the door glass. On the FJ40 photographs it is about 0.19 m above the belt crease,
 * and the glass is about a third of the door's height from sill to roof (the FJ40's v1.85 notes
 * measured 30 to 34%); the 40's code cab has it 0.25 m above the belt (`WIN_LOW`). v2.12 lowered
 * the ute's 6 cm; its rear window keeps the 40's height.
 */
const DOOR_WIN_LOW = WIN_LOW - 0.06;
/** The tray in the ute's frame: 2.4 m long and 1.8 m wide, its deck above the rear tyres. */
export const TRAY_FRONT = 0.4;
export const TRAY_BACK = 2.8;
export const TRAY_HW = 0.9;
export const DECK = 0.4;
/** Top of the drop sides and the tailgate. */
const SIDE_TOP = DECK + 0.26;
/** Top rail of the headboard, a little above the cab roof. */
const HEADBOARD = 1.66;
/** The front face of the grille panel and the nose of the bull bar, in the ute's frame. */
export const UTE_NOSE = NOSE + UTE_CAB_SHIFT;

const livery: Livery = { body: C.paint, roof: C.roof, bonnet: C.rust };

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });

function tube(b: VehicleBuilder, pts: V[], r: number, color = C.bar, zone: number = Z.Front): void {
  continuousTube(
    b,
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    r,
    color,
    zone,
    M.Metal,
    ROUND_BEND,
  );
}

/** A number plate with made-up characters, facing forwards (-1) or backwards (+1). */
function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing < 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.372, 0.134, 0.01, C.lamp, M.Paint, Z.Trim, 0.006);
  for (let i = 0; i < 6; i++)
    b.block(-0.14 + i * 0.056 + (i > 2 ? 0.01 : 0), 0, 0.006, 0.03, 0.062, 0.004, C.rust, M.Paint, Z.Trim);
  b.pop();
}

/** Red bow shackle on a recovery point, its pin across the car. */
function shackle(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.block(x, y + 0.03, z, 0.06, 0.09, 0.04, C.steel, M.Metal, Z.Trim);
  b.ring(x, y - 0.03, z + facing * 0.03, 0.04, 0.01, C.red, M.Paint, 'x', Z.Trim);
  b.rod(v(x - 0.045, y, z + facing * 0.03), v(x + 0.045, y, z + facing * 0.03), 0.01, C.steel);
}

/**
 * The single cab behind the 40's doors, in the 40's frame: the short panel behind each door,
 * the rounded rear corners, the back panel with its rear window, the gutters and the roof.
 */
function cab(b: VehicleBuilder): void {
  const body = C.paint;
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? BW - 0.045 : -BW,
      x1 = side > 0 ? BW : -BW + 0.045;
    // Door and the cab side below the belt, to the rounded corner.
    sideProfile(
      b,
      [
        [DOOR_Z, LOW],
        [CAB_BACK - CAB_R, LOW],
        [CAB_BACK - CAB_R, BELT],
        [DOOR_Z, BELT],
      ],
      x0,
      x1,
      body,
      Z.Sides,
      0.015,
    );
    // Above the belt: the door window and the fixed quarter behind it.
    extrudeX(
      b,
      sideShape(
        // Its front edge meets the windscreen frame's back face, which leans back from z -0.37 at
        // its foot (y 0.865); until v2.12 it stopped at the door's front edge and left a slot.
        [
          [-0.38, BELT],
          [-0.37 + (TUCK - 0.865) * Math.tan(0.08), TUCK],
          [CAB_BACK - CAB_R, TUCK],
          [CAB_BACK - CAB_R, BELT],
        ],
        [
          [
            [DOOR_Z + 0.06, DOOR_WIN_LOW, 0.03],
            [DOOR_Z + 0.06, WIN_TOP, 0.03],
            [DOOR_REAR - 0.06, WIN_TOP, 0.05],
            [DOOR_REAR - 0.06, DOOR_WIN_LOW, 0.05],
          ],
        ],
      ),
      side > 0 ? BW - 0.04 : -BW,
      side > 0 ? BW : -BW + 0.04,
      body,
      M.Paint,
      Z.Sides,
      0.012,
    );
    const gx = side * (BW - 0.03);
    b.block(
      gx,
      (DOOR_WIN_LOW + WIN_TOP) / 2,
      (DOOR_Z + DOOR_REAR) / 2,
      0.012,
      WIN_TOP - DOOR_WIN_LOW + 0.03,
      0.72,
      C.glass,
      M.Glass,
      Z.Glass,
    );
    // Quarter-vent divider in the door glass.
    b.block(
      side * (BW - 0.022),
      (DOOR_WIN_LOW + WIN_TOP) / 2,
      DOOR_Z + 0.22,
      0.02,
      WIN_TOP - DOOR_WIN_LOW,
      0.025,
      body,
      M.Paint,
      Z.Sides,
      0.006,
    );
    // The pressed line along the belt, carried round to the back.
    b.block(
      side * (BW + 0.004),
      BELT,
      (DOOR_Z + CAB_BACK - CAB_R) / 2,
      0.024,
      0.032,
      CAB_BACK - CAB_R - DOOR_Z,
      body,
      M.Paint,
      Z.Sides,
      0.011,
    );
    // Rounded rear corner of the cab from the sill to the roof.
    const g = new THREE.CylinderGeometry(
      CAB_R,
      CAB_R,
      TUCK - LOW,
      12,
      1,
      true,
      side > 0 ? 0 : -Math.PI / 2,
      Math.PI / 2,
    );
    b.slot = M.Paint;
    b.tag = Z.Rear;
    b.push().translate(side * (BW - CAB_R), (LOW + TUCK) / 2, CAB_BACK - CAB_R);
    b.geometry(g, body);
    b.pop();
    // The corner's inside face: the curved panel above shows only from outside, so the sky
    // showed through the cab's rear corners from the seats (there before v2.12).
    const inner = new THREE.CylinderGeometry(
      CAB_R - 0.012,
      CAB_R - 0.012,
      TUCK - LOW,
      12,
      1,
      true,
      side > 0 ? 0 : -Math.PI / 2,
      Math.PI / 2,
    ).toNonIndexed();
    // Turn each triangle round, and its normals, so its face looks into the cab.
    for (const attr of [inner.getAttribute('position'), inner.getAttribute('normal')]) {
      const flip = attr === inner.getAttribute('normal') ? -1 : 1;
      for (let i = 0; i < attr.count; i += 3) {
        const x = attr.getX(i + 1),
          y = attr.getY(i + 1),
          z = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, x, y, z);
        if (flip < 0)
          for (let k = 0; k < 3; k++)
            attr.setXYZ(i + k, -attr.getX(i + k), -attr.getY(i + k), -attr.getZ(i + k));
      }
    }
    b.push().translate(side * (BW - CAB_R), (LOW + TUCK) / 2, CAB_BACK - CAB_R);
    b.geometry(inner, body.clone().multiplyScalar(0.85));
    b.pop();
    // Door: shut lines, two exposed hinges at the front and a chrome pull handle.
    const sx = side * (BW + 0.002);
    for (const z of [DOOR_Z, DOOR_REAR])
      b.block(sx, (LOW + 1.42) / 2, z, 0.006, 1.42 - LOW, 0.008, C.rubber, M.Rubber, Z.Sides);
    b.block(
      sx,
      1.42,
      (DOOR_Z + DOOR_REAR) / 2,
      0.006,
      0.008,
      DOOR_REAR - DOOR_Z,
      C.rubber,
      M.Rubber,
      Z.Sides,
    );
    for (const y of [0.4, 0.72]) {
      b.block(side * (BW + 0.012), y, DOOR_Z + 0.03, 0.02, 0.08, 0.07, body, M.Paint, Z.Sides, 0.006);
      b.rod(
        { x: side * (BW + 0.022), y: y - 0.045, z: DOOR_Z },
        { x: side * (BW + 0.022), y: y + 0.045, z: DOOR_Z },
        0.011,
        C.steel,
      );
    }
    b.block(
      side * (BW + 0.012),
      0.69,
      DOOR_REAR - 0.12,
      0.018,
      0.035,
      0.13,
      C.chrome,
      M.Metal,
      Z.Sides,
      0.008,
    );
    // Painted sill and the ribbed step under the door, from the guard to the door's rear edge.
    b.block(
      side * (BW - 0.02),
      (STEP + LOW) / 2 + 0.005,
      (-0.6 + CAB_BACK) / 2,
      0.03,
      LOW - STEP,
      CAB_BACK + 0.6,
      body,
      M.Paint,
      Z.Sides,
      0.006,
    );
    b.block(
      side * (BW - 0.1),
      STEP,
      (-0.64 + DOOR_REAR) / 2,
      0.26,
      0.03,
      DOOR_REAR + 0.64,
      body,
      M.Paint,
      Z.Sides,
      0.008,
    );
    for (let i = 0; i < 4; i++)
      b.block(
        side * (BW - 0.18 + i * 0.05),
        STEP + 0.017,
        (-0.6 + DOOR_REAR) / 2,
        0.012,
        0.006,
        DOOR_REAR + 0.56,
        body,
        M.Paint,
        Z.Sides,
      );
    for (const z of [-0.45, 0.3])
      b.block(side * 0.62, STEP - 0.07, z, 0.05, 0.13, 0.05, C.trim, M.Metal, Z.Trim);
    // Gutter along the roof's edge.
    b.block(
      side * (BW + 0.02),
      CAP + 0.008,
      (DOOR_Z + CAB_BACK - CAB_R) / 2,
      0.012,
      0.016,
      CAB_BACK - CAB_R - DOOR_Z,
      C.roof,
      M.Paint,
      Z.Roof,
      0.005,
    );
  }
  // The back panel with its rear window, between the rounded corners.
  const win: [number, number, number?][] = [
    [-0.5, WIN_LOW + 0.02, 0.04],
    [0.5, WIN_LOW + 0.02, 0.04],
    [0.5, WIN_TOP - 0.02, 0.04],
    [-0.5, WIN_TOP - 0.02, 0.04],
  ];
  const back = new THREE.Shape(
    rounded([
      [-(BW - CAB_R), LOW],
      [BW - CAB_R, LOW],
      [BW - CAB_R, TUCK],
      [-(BW - CAB_R), TUCK],
    ]),
  );
  back.holes.push(new THREE.Path(rounded(win)));
  extrudeZ(b, back, CAB_BACK - 0.035, CAB_BACK, body, M.Paint, Z.Rear, 0.008);
  b.block(
    0,
    (WIN_LOW + WIN_TOP) / 2,
    CAB_BACK - 0.02,
    1.0,
    WIN_TOP - WIN_LOW - 0.03,
    0.01,
    C.glass,
    M.Glass,
    Z.Glass,
  );
  const seal = new THREE.Shape(
    rounded(win.map(([x, y, r]) => [x * 1.03, y + (y > 1.2 ? 0.014 : -0.014), r])),
  );
  seal.holes.push(new THREE.Path(rounded(win)));
  extrudeZ(b, seal, CAB_BACK - 0.004, CAB_BACK + 0.002, C.rubber, M.Rubber, Z.Rear, 0.001);
  // The belt line and a pressed swage across the back panel.
  b.block(0, BELT, CAB_BACK + 0.004, 2 * (BW - CAB_R) - 0.02, 0.032, 0.024, body, M.Paint, Z.Rear, 0.011);
  // Roof: the 40's cap over the screen, square at the back over the short cab.
  planProfile(
    b,
    plan(DOOR_Z - 0.08, CAB_BACK + 0.012, BW + 0.015, 0.06, CAB_R + 0.015),
    CAP,
    ROOF,
    C.roof,
    Z.Roof,
    0.03,
  );
  // Cab floor and the toe board.
  b.block(0, 0.2, (-0.7 + CAB_BACK) / 2, 1.5, 0.06, CAB_BACK + 0.7, C.rubber, M.Rubber, Z.Trim);
}

/** The 40's cabin, cut at the cab back: two seats, the dash, dials, column and floor levers. */
function interior(b: VehicleBuilder, redlineRpm: number): void {
  const cabin = shortieCabin;
  const dark = new THREE.Color('#343B37'),
    seat = new THREE.Color('#615F4C');
  const metal = new THREE.Color('#858A83'),
    ivory = new THREE.Color('#D9D6BF');
  b.block(0, 0.265, (-0.78 + CAB_BACK) / 2, 1.16, 0.06, CAB_BACK + 0.78, dark, M.Rubber, Z.Trim);
  for (const x of [-0.38, 0.38]) {
    b.block(x, 0.47, 0.25, 0.52, 0.15, 0.5, seat, M.Fabric, Z.Trim, 0.055);
    b.push().rotate(-0.1, 0, 0);
    b.block(x, 0.78, 0.5, 0.52, 0.59, 0.11, seat, M.Fabric, Z.Trim, 0.045);
    b.pop();
    for (const dx of [-0.12, 0.12]) b.block(x + dx, 0.55, 0.23, 0.015, 0.009, 0.4, dark, M.Fabric, Z.Trim);
    for (const dx of [-0.15, 0.15]) b.block(x + dx, 0.35, 0.23, 0.025, 0.17, 0.4, metal, M.Metal, Z.Trim);
  }
  b.block(0, 0.83, -0.31, 1.4, 0.27, 0.18, dark, M.Rubber, Z.Trim, 0.018);
  b.block(0.36, 0.87, -0.203, 0.43, 0.19, 0.02, metal, M.Metal, Z.Trim, 0.014);
  addDialFaces(b, cabin, redlineRpm);
  for (const x of [-0.5, -0.4, -0.3, 0.03]) {
    b.slot = M.Rubber;
    b.push()
      .translate(x, 0.81, -0.195)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), dark);
    b.pop();
  }
  b.block(-0.34, 0.91, -0.202, 0.38, 0.08, 0.012, ivory.clone().multiplyScalar(0.5), M.Paint, Z.Trim);
  b.block(-0.34, 0.91, -0.191, 0.12, 0.012, 0.012, metal, M.Metal, Z.Trim);
  addSteeringColumn(b, cabin);
  b.block(0, 0.36, 0.0, 0.31, 0.16, 0.6, dark, M.Rubber, Z.Trim, 0.025);
  for (const [x, h, z] of [
    [0.02, 0.68, 0.18],
    [-0.12, 0.57, 0.33],
  ]) {
    b.rod({ x, y: 0.42, z: z + 0.07 }, { x, y: h, z }, 0.009, metal);
    b.slot = M.Rubber;
    b.push().translate(x, h, z);
    b.geometry(new THREE.SphereGeometry(0.028, 12, 8), dark);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.block(side * 0.748, 0.6, 0.1, 0.012, 0.6, 0.76, dark, M.Fabric, Z.Trim);
    b.block(side * 0.73, 0.71, 0.3, 0.05, 0.035, 0.19, dark, M.Rubber, Z.Trim);
    b.rod({ x: side * 0.72, y: 0.61, z: -0.07 }, { x: side * 0.69, y: 0.61, z: -0.01 }, 0.009, metal);
  }
  // Headlining under the roof.
  b.block(
    0,
    CAP - 0.004,
    (DOOR_Z + CAB_BACK) / 2,
    1.5,
    0.008,
    CAB_BACK - DOOR_Z - 0.04,
    ivory,
    M.Fabric,
    Z.Trim,
  );
}

/** The snorkel up the left screen pillar, the beacon and the door mirrors (40's frame). */
function cabGear(b: VehicleBuilder): void {
  // Snorkel: its body is a flat box on the left cowl side over the louvres just ahead of the
  // door, where the air goes in to the engine bay; the tube leaves its top and runs straight up
  // beside the windscreen pillar, leaning back with the screen, to a ram head facing forward at
  // the roof's front corner, held by two clamps to the pillar (as the FJ40's since v1.85).
  // Until v2.12 it left the guard over the tyre and crossed 0.5 m of air to the pillar.
  const x = -(BW + 0.05);
  // The screen frame's front face leans back from z -0.43 at its foot (y 0.865).
  const frameZ = (y: number) => -0.43 + (y - 0.865) * Math.tan(0.08);
  b.block(x, 0.71, -0.425, 0.1, 0.24, 0.13, C.bar, M.Metal, Z.Front, 0.02);
  // The tube's top runs up into the head, which stands just ahead of the roof's front edge.
  tube(b, [v(x, 0.8, -0.435), v(x, 0.9, -0.43), v(x, 1.48, frameZ(1.48)), v(x, 1.56, -0.41)], 0.042, C.bar);
  b.block(x, 1.585, -0.49, 0.12, 0.11, 0.2, C.bar, M.Metal, Z.Front, 0.03);
  b.block(x, 1.585, -0.592, 0.09, 0.08, 0.008, C.trim, M.Rubber, Z.Front, 0.006);
  for (const y of [1.0, 1.32]) {
    const tz = -0.43 + ((y - 0.9) / 0.6) * (frameZ(1.5) + 0.43);
    b.ring(x, y, tz, 0.045, 0.008, C.steel, M.Metal, 'y', Z.Front);
    b.rod(v(x + 0.03, y, tz), v(-(BW - 0.01), y, frameZ(y) + 0.02), 0.012, C.steel, M.Metal, Z.Front);
  }
  // Door mirrors: big flat heads on arms from the door hinges.
  for (const side of [-1, 1]) {
    b.rod(v(side * (BW + 0.02), 0.98, DOOR_Z + 0.02), v(side * (BW + 0.2), 1.0, DOOR_Z - 0.02), 0.011, C.bar);
    b.rod(v(side * (BW + 0.02), 0.72, DOOR_Z + 0.02), v(side * (BW + 0.2), 0.9, DOOR_Z - 0.02), 0.011, C.bar);
    mirrorHead(b, side, v(side * (BW + 0.21), 0.98, DOOR_Z - 0.02), 0.16, 0.2, 0.03, C.bar);
  }
}

/** The long chassis, crossmembers, transmission, tank, exhaust, in the ute's frame. */
function chassis(b: VehicleBuilder, tuning: VehicleTuning): void {
  const fz = UTE_CAB_SHIFT;
  for (const side of [-1, 1]) {
    b.block(side * 0.3, 0.02, -1.19 + fz, 0.09, 0.16, 0.84, C.trim, M.Metal, Z.Trim);
    b.rod(v(side * 0.3, 0.02, -0.77 + fz), v(side * 0.43, 0.02, -0.57 + fz), 0.045, C.trim, M.Metal, Z.Trim);
    b.block(
      side * 0.43,
      0.02,
      (-0.57 + fz + 2.86) / 2,
      0.09,
      0.16,
      2.86 - (-0.57 + fz),
      C.trim,
      M.Metal,
      Z.Trim,
    );
  }
  // The front rails are 0.3 m out, but the shared suspension stands each front shock's tower
  // on two braces from 0.47 m out and hangs each front spring from 0.48 m out, so their feet
  // and tops stood in the air. An outrigger from the rail carries each tower and each hanger.
  const ax = tuning.wheels[0].z;
  for (const side of [-1, 1]) {
    b.block(side * 0.395, 0.07, ax + 0.23, 0.19, 0.06, 0.22, C.trim, M.Metal, Z.Trim);
    for (const z of [ax - 0.46, ax + 0.46])
      b.block(side * 0.41, 0.08, z, 0.19, 0.08, 0.06, C.trim, M.Metal, Z.Trim);
  }
  // The crossmember ahead of the under-tray spare sits clear of it (at 2.05 it ran through it).
  for (const z of [-1.51 + fz, -0.55 + fz, 0.3, 1.0, 1.8, 2.75])
    b.block(0, 0.02, z, z < -1.5 ? 0.6 : 0.86, 0.09, 0.09, C.trim, M.Metal, Z.Trim);
  b.block(
    0,
    0.015,
    -0.23 + fz,
    0.38,
    0.15,
    0.65,
    C.steel.clone().multiplyScalar(0.5),
    M.Metal,
    Z.Trim,
    0.025,
  );
  // Fuel tank on the left behind the cab, and the exhaust down the right side.
  // Between the crossmembers at 0.3 and 1.0 (at 0.72 it ran into the one at 1.0).
  b.block(-0.25, 0.08, 0.65, 0.5, 0.22, 0.54, C.trim, M.Metal, Z.Trim, 0.03);
  // The exhaust runs back inside the right chassis rail, under the crossmembers, over the rear
  // axle and under the slung spare, to end under the rear bar. Until v2.12 it ran inside the
  // rail itself, through the rear axle, and out through the rail behind the wheel.
  const pipe = [
    v(0.28, -0.05, -0.66 + fz),
    v(0.3, -0.08, 0.0),
    v(0.3, -0.08, 1.07),
    v(0.3, 0.12, 1.25),
    v(0.3, 0.12, 1.62),
    v(0.3, -0.08, 1.74),
    v(0.3, -0.08, 2.85),
  ];
  for (let i = 0; i < pipe.length - 1; i++) b.rod(pipe[i], pipe[i + 1], 0.025, C.steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.27, -0.08, 0.65)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 12), C.steel.clone().multiplyScalar(0.6));
  b.pop();
}

/**
 * The bull bar: a folded steel pan carrying the winch, a centre hoop over the grille with
 * three spotlights on its top rail, side loops over the headlamps round to the guards and a
 * mid rail across, the plate low on the left, shackles and the UHF aerial on the left end.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z;
  const back = UTE_NOSE - 0.12;
  const zc = (face + back) / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-0.69, -face);
  outline.lineTo(0.69, -face);
  outline.lineTo(0.89, -(face + 0.1));
  outline.lineTo(0.89, -back);
  outline.lineTo(-0.89, -back);
  outline.lineTo(-0.89, -(face + 0.1));
  outline.closePath();
  const pan = new THREE.ExtrudeGeometry(outline, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 3,
  });
  pan.rotateX(-Math.PI / 2);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push().translate(0, 0.17, 0);
  b.geometry(pan, C.bar);
  b.pop();
  for (const x of [-0.31, 0.31])
    b.block(x, 0.17, UTE_NOSE - 0.06, 0.08, 0.22, 0.14, C.bar, M.Metal, Z.Trim, 0.008);
  const zt = UTE_NOSE - 0.075;
  const topY = 0.92,
    sideY = 0.7;
  // Centre hoop, side loops and the mid rail through the lamps.
  tube(b, [v(-0.3, 0.37, zc), v(-0.3, topY, zt), v(0.3, topY, zt), v(0.3, 0.37, zc)], 0.03);
  for (const side of [-1, 1]) {
    tube(
      b,
      [
        v(side * 0.86, 0.37, zc + 0.025),
        v(side * 0.84, sideY - 0.02, zt - 0.01),
        v(side * 0.72, sideY, zt + 0.02),
        v(side * 0.3, sideY, zt + 0.02),
      ],
      0.026,
    );
    b.block(side * 0.86, 0.37, zc + 0.025, 0.075, 0.045, 0.11, C.bar, M.Metal, Z.Front, 0.005);
    b.block(side * 0.3, 0.37, zc, 0.075, 0.045, 0.11, C.bar, M.Metal, Z.Front, 0.005);
  }
  b.rod(v(-0.86, 0.5, zt + 0.015), v(0.86, 0.5, zt + 0.015), 0.022, C.bar, M.Metal, Z.Front);
  // Three round spotlights on the hoop's top rail, their lenses facing forward.
  for (const x of [-0.26, 0, 0.26]) {
    b.block(x, topY + 0.03, zt, 0.03, 0.06, 0.03, C.bar, M.Metal, Z.Front, 0.006);
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.push()
      .translate(x, topY + 0.1, zt + 0.01)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.09, 0.075, 0.11, 20), C.chrome);
    b.pop();
    b.ring(x, topY + 0.1, zt - 0.046, 0.085, 0.009, C.bar, M.Metal, 'z', Z.Front);
    b.slot = M.DrivingLamp;
    b.push()
      .translate(x, topY + 0.1, zt - 0.05)
      .scale(1, 1, 0.3);
    b.geometry(new THREE.SphereGeometry(0.078, 20, 10), C.lamp);
    b.pop();
  }
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the roller fairlead in the face. Until v2.12 its drum stood on the pan in front of
  // the grille.
  b.block(0, 0.405, zc + 0.02, 0.2, 0.05, 0.09, C.rubber, M.Rubber, Z.Front, 0.012);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.005, 0.38, 0.14, 0.02, C.steel, M.Metal, Z.Front, 0.006);
  b.block(m.x, m.y, face - 0.012, 0.22, 0.06, 0.015, C.rubber, M.Rubber, Z.Front);
  for (const y of [m.y - 0.035, m.y + 0.035])
    b.rod(v(m.x - 0.11, y, face - 0.03), v(m.x + 0.11, y, face - 0.03), 0.016, C.steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.12, m.x + 0.12])
    b.rod(v(x, m.y - 0.05, face - 0.03), v(x, m.y + 0.05, face - 0.03), 0.016, C.steel, M.Metal, Z.Front);
  b.ring(m.x, m.y - 0.02, face - 0.05, 0.026, 0.008, C.red, M.Paint, 'z', Z.Front);
  for (const side of [-1, 1]) shackle(b, side * 0.66, 0.2, face - 0.02, -1);
  // Inside the pan's face, clear of the fairlead and the left shackle (it hung below the pan).
  plate(b, -0.41, 0.25, face - 0.03, -1);
  // The UHF aerial: a fat spring base on the bar's left end and a whip above it.
  b.block(-0.86, 0.5, zt + 0.015, 0.06, 0.05, 0.06, C.bar, M.Metal, Z.Front, 0.01);
  b.rod(v(-0.86, 0.52, zt + 0.015), v(-0.86, 1.05, zt + 0.015), 0.018, C.rubber, M.Rubber, Z.Front);
  b.rod(v(-0.86, 1.05, zt + 0.015), v(-0.87, 1.95, zt + 0.03), 0.005, C.bar);
}

/**
 * The farm tray in the ute's frame: runners and crossmembers on the chassis, the deck, drop
 * sides and tailgate with their hinges and latches, mud flaps, the tube headboard with the
 * high-lift jack and the beacon, the tarped load lashed down, the second spare on the deck
 * behind it, the first spare slung under the tray, and the rear bar with its lamps and plate.
 */
function tray(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const len = TRAY_BACK - TRAY_FRONT,
    mid = (TRAY_FRONT + TRAY_BACK) / 2;
  const width = tuning.drawnWheels?.width ?? tuning.wheelWidth;
  // Runners on the rails, crossmembers under the deck, and the deck plate.
  for (const side of [-1, 1]) b.block(side * 0.43, 0.16, mid, 0.08, 0.12, len - 0.1, C.trim, M.Metal, Z.Trim);
  for (let i = 0; i <= 6; i++) {
    const z = TRAY_FRONT + 0.05 + ((len - 0.1) * i) / 6;
    // Crossmembers above the rear tyres end at the chassis runners, leaving bump room.
    const rearZ = tuning.wheels.find((w) => !w.front)!.z;
    const crossWidth = Math.abs(z - rearZ) < tuning.wheelRadius + 0.05 ? 1.0 : 2 * TRAY_HW - 0.06;
    b.block(0, 0.29, z, crossWidth, 0.14, 0.06, C.tray, M.Metal, Z.Rear, 0.006);
  }
  // The frame rail under each drop side is shallower than the crossmembers, its foot 2 cm over
  // the rear tyres' tops (as deep as them, it hid the tyres' tops from the side).
  for (const side of [-1, 1])
    b.block(side * (TRAY_HW - 0.04), 0.32, mid, 0.08, 0.08, len, C.tray, M.Metal, Z.Rear, 0.006);
  b.block(0, DECK - 0.02, mid, 2 * TRAY_HW, 0.04, len, C.tray, M.Metal, Z.Rear, 0.006);
  // Drop sides and the tailgate, with the hinges along their bottoms and the latches.
  for (const side of [-1, 1]) {
    const x = side * (TRAY_HW - 0.015);
    b.block(x, (DECK + SIDE_TOP) / 2, mid, 0.03, SIDE_TOP - DECK, len - 0.04, C.tray, M.Metal, Z.Rear, 0.006);
    b.block(x, SIDE_TOP - 0.012, mid, 0.05, 0.024, len - 0.04, C.tray, M.Metal, Z.Rear, 0.008);
    for (const z of [TRAY_FRONT + 0.3, mid, TRAY_BACK - 0.3])
      b.rod(
        v(side * (TRAY_HW + 0.012), DECK + 0.02, z - 0.08),
        v(side * (TRAY_HW + 0.012), DECK + 0.02, z + 0.08),
        0.014,
        C.steel,
      );
    for (const z of [TRAY_FRONT + 0.02, TRAY_BACK - 0.02]) {
      b.block(
        side * (TRAY_HW - 0.015),
        (DECK + SIDE_TOP) / 2,
        z,
        0.05,
        SIDE_TOP - DECK,
        0.05,
        C.tray,
        M.Metal,
        Z.Rear,
        0.006,
      );
      b.block(side * (TRAY_HW + 0.02), DECK + 0.14, z, 0.03, 0.09, 0.04, C.steel, M.Metal, Z.Rear, 0.005);
    }
  }
  b.block(
    0,
    (DECK + SIDE_TOP) / 2,
    TRAY_BACK - 0.015,
    2 * TRAY_HW - 0.06,
    SIDE_TOP - DECK,
    0.03,
    C.tray,
    M.Metal,
    Z.Rear,
    0.006,
  );
  b.block(
    0,
    SIDE_TOP - 0.012,
    TRAY_BACK - 0.015,
    2 * TRAY_HW - 0.06,
    0.024,
    0.05,
    C.tray,
    M.Metal,
    Z.Rear,
    0.008,
  );
  for (const x of [-0.6, 0, 0.6])
    b.rod(
      v(x - 0.08, DECK + 0.02, TRAY_BACK + 0.012),
      v(x + 0.08, DECK + 0.02, TRAY_BACK + 0.012),
      0.014,
      C.steel,
    );
  // Mud flaps behind the rear wheels, hung from the tray's edge.
  for (const side of [-1, 1])
    b.block(
      side * 0.72,
      DECK - 0.22,
      tuning.wheels[2].z + 0.52,
      0.28,
      0.36,
      0.012,
      C.rubber,
      M.Rubber,
      Z.Trim,
      0.004,
    );
  // The headboard: tube uprights and rails behind the cab, with upright bars between them,
  // the high-lift jack strapped to the right upright and the beacon on the top rail.
  const hz = TRAY_FRONT + 0.03,
    hx = TRAY_HW - 0.06;
  for (const side of [-1, 1]) {
    tube(
      b,
      [v(side * hx, DECK, hz), v(side * hx, HEADBOARD, hz), v(side * 0.45, HEADBOARD, hz)],
      0.025,
      C.tray,
      Z.Rear,
    );
    b.block(side * hx, DECK + 0.02, hz, 0.1, 0.04, 0.1, C.tray, M.Metal, Z.Rear, 0.006);
  }
  b.rod(v(-0.47, HEADBOARD, hz), v(0.47, HEADBOARD, hz), 0.025, C.tray, M.Metal, Z.Rear);
  b.rod(v(-hx, 1.2, hz), v(hx, 1.2, hz), 0.02, C.tray, M.Metal, Z.Rear);
  b.rod(v(-hx, SIDE_TOP, hz), v(hx, SIDE_TOP, hz), 0.02, C.tray, M.Metal, Z.Rear);
  for (let i = 1; i < 8; i++) {
    const x = -hx + (2 * hx * i) / 8;
    b.rod(v(x, SIDE_TOP, hz), v(x, HEADBOARD - 0.02, hz), 0.009, C.tray, M.Metal, Z.Rear);
  }
  // Mesh plate across the lower headboard so the load cannot come through.
  b.block(
    0,
    (DECK + SIDE_TOP) / 2,
    hz,
    2 * hx - 0.05,
    SIDE_TOP - DECK,
    0.012,
    C.tray,
    M.Metal,
    Z.Rear,
    0.004,
  );
  // High-lift jack: the long red beam with its rack of holes, the foot and the lifting arm.
  const jx = hx - 0.09;
  b.block(jx, DECK + 0.72, hz - 0.04, 0.05, 1.3, 0.05, C.jack, M.Paint, Z.Rear, 0.006);
  for (let i = 0; i < 9; i++)
    b.block(jx, DECK + 0.2 + i * 0.14, hz - 0.068, 0.014, 0.05, 0.006, C.bar, M.Metal, Z.Rear);
  // The foot, the climbing block and the handle stop 2.5 cm short of the cab's back (until
  // v2.12 they touched it).
  b.block(jx, DECK + 0.04, hz - 0.065, 0.16, 0.04, 0.09, C.bar, M.Metal, Z.Rear, 0.006);
  b.block(jx, DECK + 0.55, hz - 0.075, 0.09, 0.14, 0.06, C.bar, M.Metal, Z.Rear, 0.008);
  b.rod(v(jx + 0.02, DECK + 0.62, hz - 0.095), v(jx + 0.04, DECK + 1.1, hz - 0.07), 0.012, C.steel);
  for (const y of [DECK + 0.35, DECK + 1.0])
    b.block(jx, y, hz - 0.02, 0.08, 0.03, 0.09, C.rubber, M.Rubber, Z.Rear, 0.004);
  // Amber beacon on the headboard's top rail at the right.
  b.block(0.36, HEADBOARD + 0.035, hz, 0.1, 0.03, 0.1, C.bar, M.Metal, Z.Rear, 0.008);
  b.slot = M.Amber;
  b.tag = Z.Rear;
  b.push().translate(0.36, HEADBOARD + 0.1, hz);
  b.geometry(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 14), C.amber);
  b.pop();
  b.push().translate(0.36, HEADBOARD + 0.15, hz);
  b.geometry(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.amber);
  b.pop();
  // The load under its tarp on the right of the deck, lashed over with two ropes.
  const lx = 0.33,
    lz = TRAY_FRONT + 0.72;
  b.block(lx, DECK + 0.2, lz, 1.04, 0.44, 1.2, C.tarp, M.Fabric, Z.Rear, 0.12);
  b.block(lx, DECK + 0.12, lz, 1.08, 0.24, 1.26, C.tarp, M.Fabric, Z.Rear, 0.05);
  // Each rope runs from a hook on the deck up the load's side, over its top and down the other
  // side to a hook inside the drop side. Until v2.12 its top ran just inside the tarp, one end
  // stopped on the load's side and the other went out through the drop side.
  for (const z of [lz - 0.35, lz + 0.35]) {
    const rope = [
      v(-0.235, DECK + 0.015, z),
      v(-0.225, DECK + 0.25, z),
      v(-0.2, DECK + 0.37, z),
      v(-0.14, DECK + 0.427, z),
      v(0.8, DECK + 0.427, z),
      v(0.86, DECK + 0.37, z),
      v(0.878, DECK + 0.25, z),
      v(0.878, DECK + 0.015, z),
    ];
    for (let i = 0; i < rope.length - 1; i++) b.rod(rope[i], rope[i + 1], 0.006, C.rope, M.Fabric, Z.Rear);
    for (const x of [-0.235, 0.878])
      b.block(x, DECK + 0.012, z, 0.012, 0.024, 0.05, C.steel, M.Metal, Z.Rear);
  }
  // The second spare lying flat on the deck behind the load, bolted through its centre.
  const sx = 0.42,
    sz = TRAY_BACK - 0.52;
  b.tag = Z.Rear;
  const sy = DECK + spareSidewall(wheel) + 0.004;
  mountSpare(b, wheel, { x: sx, y: sy, z: sz }, 'up', C.rubber);
  b.rod(v(sx, DECK, sz), v(sx, sy + width / 2 + 0.045, sz), 0.012, C.steel, M.Metal, Z.Rear);
  b.block(sx, sy + width / 2 + 0.035, sz, 0.22, 0.02, 0.05, C.bar, M.Metal, Z.Rear, 0.006);
  // The first spare lying flat under the tray behind the rear axle, tucked up between the
  // runners under the crossmembers (their underside is at 0.22) and held by a cradle bar
  // and a bolt, as a farm tray carries it; its bottom sits level with the chassis rails.
  const uz = tuning.wheels[2].z + 0.78,
    uy = 0.22 - width / 2 - 0.012;
  mountSpare(b, wheel, { x: 0, y: uy, z: uz }, 'down', C.rubber);
  b.block(0, uy - width / 2 - 0.012, uz, 0.08, 0.02, 0.86, C.trim, M.Metal, Z.Rear);
  b.rod(v(0, uy - width / 2 - 0.012, uz), v(0, 0.3, uz), 0.012, C.steel);
  // Rear bar under the tray with the tail lamps, the plate, shackles and the tow ball.
  const rz = TRAY_BACK + 0.06;
  b.block(0, 0.22, rz, 2 * TRAY_HW - 0.1, 0.1, 0.1, C.bar, M.Metal, Z.Rear, 0.012);
  for (const x of [-0.43, 0.43]) b.block(x, 0.14, TRAY_BACK - 0.06, 0.08, 0.1, 0.16, C.bar, M.Metal, Z.Trim);
  for (const side of [-1, 1]) {
    const tx = side * 0.72;
    b.block(tx, 0.34, TRAY_BACK + 0.006, 0.2, 0.09, 0.03, C.rubber, M.Rubber, Z.Rear, 0.008);
    b.block(tx - side * 0.045, 0.34, TRAY_BACK + 0.022, 0.08, 0.07, 0.01, C.red, M.Red, Z.Rear, 0.005);
    b.block(tx + side * 0.045, 0.34, TRAY_BACK + 0.022, 0.08, 0.07, 0.01, C.amber, M.Amber, Z.Rear, 0.005);
    shackle(b, side * 0.6, 0.17, rz + 0.05, 1);
  }
  plate(b, 0, 0.33, TRAY_BACK + 0.02, 1);
  const t = tuning.towPoint;
  b.block(t.x, t.y + 0.02, (rz + t.z) / 2, 0.1, 0.06, t.z - rz + 0.08, C.bar, M.Metal, Z.Rear);
  b.rod(v(t.x, t.y + 0.05, t.z), v(t.x, t.y + 0.08, t.z), 0.012, C.steel);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.1, t.z);
  b.geometry(new THREE.SphereGeometry(0.03, 12, 8), C.steel);
  b.pop();
}

/** Two or three darker and lighter patches of rust on the bonnet's bare top, as flat panels. */
function rustPatches(b: VehicleBuilder): void {
  const y = 0.835 + 0.0165;
  for (const [x, z, w, d, color] of [
    [-0.2, -1.15, 0.22, 0.4, C.rustDark],
    [0.18, -0.85, 0.2, 0.3, C.rustLight],
    [0.05, -1.4, 0.3, 0.2, C.rustDark],
    [-0.1, -0.7, 0.14, 0.14, C.rustLight],
  ] as const)
    b.block(x, y, z, w, 0.002, d, color, M.Paint, Z.Front, 0.001);
}

/** The 40 Series ute: the 40's cab moved forward on the long chassis, with the tray and gear. */
export function buildUte40Body(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  // The cab, in the 40's frame, moved forward with the front axle.
  b.push().translate(0, 0, UTE_CAB_SHIFT);
  front(b, livery);
  rustPatches(b);
  windscreen(b, livery, false);
  cab(b);
  interior(b, tuning.engine.redlineRpm);
  cabGear(b);
  b.pop();
  // Everything behind and below the cab, in the ute's own frame.
  chassis(b, tuning);
  bullBar(b, tuning);
  tray(b, tuning, wheel);
  const cabBack = CAB_BACK + UTE_CAB_SHIFT;
  return cleanGeometry(
    subdivideSurface(b.build(), (c, n) => n.y > 0.95 && c.y > 0.7 && c.y < CAP && c.z < cabBack, 1),
  );
}

/** The 40's 7.50-16 on its split rim, the rim painted a rusty tan. */
export function buildUte40Wheel(tuning: VehicleTuning): THREE.BufferGeometry {
  return buildVehicleWheel(tuning, C.rim);
}

/** A recovery plank lying along the left of the tray, strapped to the deck. */
export function buildUte40Plank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = pal('barkOchre');
  const x = index === 0 ? -0.72 : -0.4,
    // Centre the 2.2 m boards in the 2.4 m tray so their ends clear both walls.
    z = (TRAY_FRONT + TRAY_BACK) / 2,
    y = DECK + 0.0275;
  b.block(x, y, z, 0.3, 0.055, 2.2, wood, M.Fabric, Z.Rear);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.12 + i * 0.075,
      y + 0.03,
      z,
      0.004,
      0.003,
      2.14,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Rear,
    );
  for (const zz of [z - 0.7, z + 0.7]) {
    b.block(x, y + 0.03, zz, 0.305, 0.015, 0.045, C.rubber, M.Rubber, Z.Rear);
    for (const side of [-1, 1])
      b.block(x + side * 0.156, y - 0.01, zz, 0.012, 0.08, 0.045, C.rubber, M.Rubber, Z.Rear);
    b.block(x + 0.13, y + 0.04, zz, 0.035, 0.012, 0.055, C.steel, M.Metal, Z.Rear);
  }
  return cleanGeometry(b.build());
}
