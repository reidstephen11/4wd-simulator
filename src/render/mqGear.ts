import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { extrudeZ } from './bodyShapes';
import { ROUND_BEND, cleanGeometry, continuousTube } from './bodyRefinement';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { mqColors as C } from './mqPaint';
import { NOSE, ROOF_EDGE, TAIL, WS } from './mqBody';
import { mountSpare, spareSidewall } from './spares';

// What the game adds to the factory MQ: a period steel bull bar with a winch, a steel rear
// bar with a tow ball, a gutter-mounted roof rack carrying the second spare and the planks,
// and the first spare on a swing-away carrier bolted to the rear bar, behind the rear door.

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });
/** Height of the rack's deck slats, 0.1 m over the hardtop's roof (TOP_ROOF in mqBody.ts, which imports this file, so the figure is repeated here). */
const DECK = 1.46;

function tube(b: VehicleBuilder, pts: V[], r: number): void {
  continuousTube(
    b,
    pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    r,
    C.bar,
    Z.Front,
    M.Metal,
    ROUND_BEND,
  );
}

/** Red bow shackle on a recovery point, its pin across the car. */
function shackle(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.block(x, y + 0.03, z, 0.06, 0.09, 0.04, C.steel, M.Metal, Z.Trim);
  b.ring(x, y - 0.03, z + facing * 0.03, 0.04, 0.01, C.red, M.Paint, 'x', Z.Trim);
  b.rod(v(x - 0.045, y, z + facing * 0.03), v(x + 0.045, y, z + facing * 0.03), 0.01, C.steel);
}

/** A yellow number plate with dark characters, facing forwards (-1) or backwards (+1). */
function plate(b: VehicleBuilder, x: number, y: number, z: number, facing: number): void {
  b.block(x, y, z, 0.372, 0.134, 0.008, new THREE.Color('#E8C935'), M.Paint, Z.Trim, 0.006);
  for (let i = 0; i < 6; i++)
    b.block(x - 0.14 + i * 0.056, y, z + facing * 0.005, 0.03, 0.062, 0.004, C.rubber, M.Rubber, Z.Trim);
}

/**
 * A steel bull bar of the early eighties: a folded pan in place of the bumper, swept back
 * round the guards, a centre hoop over the grille, side loops across the headlamps, and an
 * electric winch inside the pan with a roller fairlead in its face.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z + 0.04,
    back = NOSE - 0.02,
    low = -0.1,
    top = 0.1;
  const outline = new THREE.Shape();
  outline.moveTo(-0.62, -face);
  outline.lineTo(0.62, -face);
  outline.quadraticCurveTo(0.82, -face, 0.89, -(face + 0.15));
  outline.lineTo(0.89, -back);
  outline.lineTo(-0.89, -back);
  outline.lineTo(-0.89, -(face + 0.15));
  outline.quadraticCurveTo(-0.82, -face, -0.62, -face);
  const pan = new THREE.ExtrudeGeometry(outline, {
    depth: top - low - 0.02,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 3,
    curveSegments: 10,
  });
  pan.rotateX(-Math.PI / 2);
  b.slot = M.Metal;
  b.tag = Z.Front;
  b.push().translate(0, low + 0.01, 0);
  b.geometry(pan, C.bar);
  b.pop();
  for (const y of [-0.04, 0.06])
    b.block(0, y, face - 0.004, 1.22, 0.012, 0.01, C.bar, M.Metal, Z.Front, 0.004);
  for (const x of [-0.42, 0.42])
    b.block(x, -0.04, back + 0.08, 0.08, 0.12, 0.2, C.bar, M.Metal, Z.Trim, 0.01);
  // Centre hoop and side loops, bent from one size of tube.
  const zt = NOSE - 0.1;
  tube(b, [v(-0.28, top, zt - 0.03), v(-0.28, 0.6, zt), v(0.28, 0.6, zt), v(0.28, top, zt - 0.03)], 0.03);
  for (const side of [-1, 1])
    tube(
      b,
      [
        v(side * 0.85, top, back - 0.06),
        v(side * 0.83, 0.53, zt + 0.02),
        v(side * 0.68, 0.56, zt),
        v(side * 0.28, 0.56, zt),
      ],
      0.026,
    );
  b.rod(v(-0.28, 0.4, zt - 0.015), v(0.28, 0.4, zt - 0.015), 0.022, C.bar, M.Metal, Z.Front);
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the roller fairlead in the face. Until v2.15 its drum, motor and gearbox stood in a
  // cradle on the pan in front of the grille.
  const wz = (face + back) / 2;
  b.block(0, top + 0.025, wz, 0.2, 0.05, 0.09, C.rubber, M.Rubber, Z.Front, 0.012);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.022, 0.2, 0.09, 0.03, C.steel, M.Metal, Z.Front, 0.006);
  for (const y of [m.y - 0.03, m.y + 0.03])
    b.rod(v(m.x - 0.09, y, face - 0.035), v(m.x + 0.09, y, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.1, m.x + 0.1])
    b.rod(v(x, m.y - 0.045, face - 0.035), v(x, m.y + 0.045, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  b.ring(m.x, m.y, face - 0.05, 0.022, 0.007, C.red, M.Paint, 'z', Z.Front);
  for (const side of [-1, 1]) shackle(b, side * 0.58, low - 0.02, face + 0.06, -1);
  plate(b, -0.42, 0.0, face - 0.016, -1);
}

/** Steel rear bar across the back with a step, recovery points and the tow ball. */
function rearBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const z0 = TAIL + 0.012,
    z1 = TAIL + 0.14;
  b.block(0, -0.005, (z0 + z1) / 2, 1.76, 0.15, z1 - z0, C.bar, M.Metal, Z.Rear, 0.014);
  b.block(0, 0.075, (z0 + z1) / 2 + 0.01, 0.6, 0.012, z1 - z0 - 0.03, C.steel, M.Metal, Z.Rear, 0.004);
  for (const x of [-0.42, 0.42]) b.block(x, -0.03, TAIL - 0.08, 0.08, 0.1, 0.2, C.bar, M.Metal, Z.Trim);
  for (const side of [-1, 1]) shackle(b, side * 0.68, -0.1, z1 - 0.03, 1);
  const t = tuning.towPoint;
  b.block(t.x, t.y + 0.02, (z1 + t.z) / 2, 0.08, 0.06, t.z - z1 + 0.06, C.bar, M.Metal, Z.Rear, 0.008);
  b.rod(v(t.x, t.y + 0.05, t.z), v(t.x, t.y + 0.08, t.z), 0.012, C.steel);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.1, t.z);
  b.geometry(new THREE.SphereGeometry(0.025, 12, 8), C.steel);
  b.pop();
}

/**
 * Where the first spare's hub sits: behind the right half of the rear door, its inner hub cap
 * standing 0.12 m off the door skin so the tyre clears the door, the window and the tail lamps.
 * z is TAIL + 0.27 (mqBody.ts imports this file, so TAIL cannot be read here when it loads).
 */
export const MQ_SPARE = { x: 0.22, y: 0.56, z: 2.35 };

/**
 * The first spare on a swing-away carrier, as the MQ hardtop carried it: the carrier is
 * bolted to the rear bar, not the door. A stout post stands on the bar's right end with the
 * carrier's frame hung on it by two knuckles; the frame carries a plate with the wheel studs
 * behind the hub and latches to a pin on the bar left of the tow ball, so it swings open to
 * the right before the door does. Nothing of it touches the door skin.
 */
function doorSpare(b: VehicleBuilder, wheel: THREE.BufferGeometry): void {
  const { x: sx, y: sy, z: sz } = MQ_SPARE;
  /** The frame's tubes run 70 mm off the door skin, clear of its hinges and handle. */
  const fz = TAIL + 0.07,
    post = 0.82,
    barTop = 0.07,
    latch = -0.2;
  // Hinge post on a foot plate bolted to the bar's end, outboard of the right tail lamp,
  // with a cap on top.
  b.block(post - 0.01, barTop + 0.01, fz, 0.12, 0.02, 0.11, C.bar, M.Metal, Z.Rear, 0.006);
  b.rod(v(post, barTop + 0.02, fz), v(post, 0.64, fz), 0.024, C.bar, M.Metal, Z.Rear);
  b.block(post, 0.645, fz, 0.06, 0.012, 0.06, C.bar, M.Metal, Z.Rear, 0.004);
  // The frame: two knuckles round the post, an upper arm and a lower brace to the wheel
  // plate, and the latch arm on to the bar. The arm passes over the right tail lamp and the
  // brace under it, so neither crosses the lenses.
  const low = 0.115;
  b.rod(v(post, low - 0.02, fz), v(post, low + 0.02, fz), 0.034, C.bar, M.Metal, Z.Rear);
  b.rod(v(post, 0.515, fz), v(post, 0.605, fz), 0.034, C.bar, M.Metal, Z.Rear);
  const plateL = sx - 0.12,
    plateR = sx + 0.12;
  b.rod(v(post - 0.03, 0.56, fz), v(plateR - 0.01, 0.56, fz), 0.022, C.bar, M.Metal, Z.Rear);
  b.chain(
    [v(post - 0.03, low, fz), v(0.6, low, fz), v(plateR - 0.01, sy - 0.1, fz)],
    0.022,
    C.bar,
    M.Metal,
    Z.Rear,
  );
  b.rod(v(plateL + 0.01, sy - 0.1, fz), v(latch, 0.2, fz), 0.022, C.bar, M.Metal, Z.Rear);
  // The wheel plate: a cross brace on the frame and a backing plate the hub sits against.
  b.block(sx, sy, fz, 0.26, 0.26, 0.044, C.bar, M.Metal, Z.Rear, 0.01);
  const backFace = sz - 0.149; // inner end of the wheel's hub cap
  b.block(
    sx,
    sy,
    (fz + backFace) / 2 + 0.0015,
    0.2,
    0.2,
    backFace - fz + 0.003,
    C.bar,
    M.Metal,
    Z.Rear,
    0.008,
  );
  // The latch on the bar: a post with a pin, the arm's tongue over it and a spring catch.
  b.block(latch, barTop + 0.065, fz, 0.05, 0.13, 0.05, C.bar, M.Metal, Z.Rear, 0.006);
  b.block(latch, 0.2, fz, 0.07, 0.03, 0.07, C.bar, M.Metal, Z.Rear, 0.006);
  b.rod(v(latch, 0.18, fz), v(latch, 0.25, fz), 0.009, C.steel, M.Metal, Z.Rear);
  b.rod(v(latch - 0.04, 0.215, fz), v(latch + 0.04, 0.215, fz), 0.007, C.steel, M.Metal, Z.Rear);
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: sx, y: sy, z: sz }, 'back', C.rubber);
  // The centre stud through the hub, and its wing nut past the outer hub cap.
  b.rod(v(sx, sy, backFace), v(sx, sy, sz + 0.175), 0.012, C.steel, M.Metal, Z.Rear);
  b.block(sx, sy, sz + 0.165, 0.09, 0.024, 0.016, C.steel, M.Metal, Z.Rear, 0.004);
}

function underside(b: VehicleBuilder): void {
  const frame = C.bar.clone().multiplyScalar(1.15);
  // Ladder chassis, crossmembers, the gearbox and transfer case, sump, tank and exhaust.
  for (const side of [-1, 1]) b.block(side * 0.42, -0.03, 0.1, 0.08, 0.15, 3.9, frame, M.Metal, Z.Trim, 0.01);
  for (const z of [-1.7, -0.5, 0.5, 1.6, 1.95]) b.block(0, -0.03, z, 0.84, 0.1, 0.08, frame, M.Metal, Z.Trim);
  b.block(0.02, -0.07, -0.3, 0.34, 0.2, 0.72, C.steel.clone().multiplyScalar(0.55), M.Metal, Z.Trim, 0.03);
  b.block(0, -0.06, -1.4, 0.3, 0.16, 0.5, C.steel.clone().multiplyScalar(0.5), M.Metal, Z.Trim, 0.03);
  b.block(-0.1, -0.02, 0.9, 0.6, 0.2, 0.42, C.rubber, M.Rubber, Z.Trim, 0.03);
  // Exhaust down the right side inside the frame rail: under the crossmembers, the muffler under
  // the cab floor, up over the rear axle under the load floor, and out under the rear bar's right
  // end. Until v2.15 it ran at the axle's height, through the top of its tube and through three
  // crossmembers, and the muffler ran into the crossmember at 0.5.
  const pipe = [
    v(0.28, -0.12, -0.9),
    v(0.3, -0.125, -0.01),
    v(0.3, -0.125, 0.41),
    v(0.31, -0.125, 0.86),
    v(0.33, 0.05, 1.02),
    v(0.33, 0.05, 1.33),
    v(0.33, -0.135, 1.5),
    v(0.33, -0.135, 1.95),
    // The tail turns out a little and ends under the bar, pointing back, 0.2 m inboard of the
    // right recovery point (it ended pointing out at x 0.56, close under it).
    v(0.44, -0.15, 2.17),
  ];
  for (let i = 0; i < pipe.length - 1; i++) {
    // The muffler stands between the second and third points.
    if (i === 1) continue;
    b.rod(pipe[i], pipe[i + 1], 0.028, C.steel);
  }
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.3, -0.125, 0.2)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), C.steel.clone().multiplyScalar(0.6));
  b.pop();
  // Rubber hangers from the muffler up to the cab floor and from the run over the axle up to the
  // load floor.
  for (const [a, c] of [
    [v(0.3, -0.06, 0.2), v(0.3, 0.085, 0.2)],
    [v(0.33, 0.075, 1.18), v(0.33, 0.09, 1.18)],
  ])
    b.rod(a, c, 0.009, C.rubber, M.Rubber, Z.Trim);
  // The 24 V system's second battery box, bolted to the outside of the left chassis rail under the
  // cab floor. Until v2.15 it stood 1 cm off the rail and its top rose through the floor.
  b.block(-0.61, -0.03, 0.6, 0.3, 0.22, 0.36, C.rubber, M.Rubber, Z.Trim, 0.012);
}

/** The gutter-mounted rack: clamps on the drip rails, a slatted deck and a tube rail round it. */
function rack(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const front = -0.1,
    back = TAIL - 0.16,
    hx = 0.7,
    rail = DECK + 0.13;
  const gutter = WS + 0.02;
  for (const side of [-1, 1]) {
    for (const z of [0.0, 0.7, 1.4, back - 0.06]) {
      b.block(side * gutter, ROOF_EDGE + 0.02, z, 0.03, 0.05, 0.07, C.bar, M.Metal, Z.Roof, 0.006);
      // Rise outside the roof shoulder before turning in to the rack. A diagonal from
      // the low gutter disappeared inside the thick roof, leaving two detached stubs.
      const knee = v(side * gutter, DECK - 0.02, z);
      b.rod(v(side * gutter, ROOF_EDGE + 0.03, z), knee, 0.014, C.bar, M.Metal, Z.Roof);
      b.rod(knee, v(side * hx, DECK - 0.02, z), 0.014, C.bar, M.Metal, Z.Roof);
    }
    b.rod(v(side * hx, DECK - 0.02, front), v(side * hx, DECK - 0.02, back), 0.018, C.bar, M.Metal, Z.Roof);
    b.rod(v(side * hx, rail, front + 0.06), v(side * hx, rail, back - 0.06), 0.015, C.bar, M.Metal, Z.Roof);
    for (let i = 0; i <= 5; i++) {
      const z = front + 0.06 + ((back - front - 0.12) * i) / 5;
      b.rod(v(side * hx, DECK - 0.02, z), v(side * hx, rail, z), 0.011, C.bar, M.Metal, Z.Roof);
    }
  }
  for (const z of [front, back]) {
    b.rod(v(-hx, DECK - 0.02, z), v(hx, DECK - 0.02, z), 0.018, C.bar, M.Metal, Z.Roof);
    b.rod(
      v(-hx, rail, z + (z < 0 ? 0.06 : -0.06)),
      v(hx, rail, z + (z < 0 ? 0.06 : -0.06)),
      0.015,
      C.bar,
      M.Metal,
      Z.Roof,
    );
  }
  for (let z = front + 0.12; z < back - 0.05; z += 0.2)
    b.block(0, DECK, z, 2 * hx - 0.02, 0.02, 0.04, C.bar, M.Metal, Z.Roof);
  // The second spare lying flat at the back, a canvas swag and a toolbox ahead of it.
  const sx = 0.3,
    sz = back - 0.46;
  b.tag = Z.Roof;
  // The tyre's sidewall rests on the slats (their top at DECK + 0.01), 4 mm clear.
  const sy = DECK + 0.01 + spareSidewall(wheel) + 0.004;
  mountSpare(b, wheel, { x: sx, y: sy, z: sz }, 'up', C.rubber);
  b.rod(
    v(sx, DECK + 0.01, sz),
    v(sx, sy + tuning.wheelWidth / 2 + 0.04, sz),
    0.012,
    C.steel,
    M.Metal,
    Z.Roof,
  );
  b.block(sx, sy + tuning.wheelWidth / 2 + 0.03, sz, 0.22, 0.02, 0.05, C.bar, M.Metal, Z.Roof, 0.006);
  b.block(0.3, DECK + 0.12, 0.3, 0.56, 0.22, 0.7, new THREE.Color('#6E6B4E'), M.Fabric, Z.Roof, 0.05);
  for (const z of [0.12, 0.5])
    b.block(0.3, DECK + 0.12, z, 0.58, 0.235, 0.035, C.rubber, M.Rubber, Z.Roof, 0.01);
  // The toolbox stops short of the spare's tread (at z 0.98 it ran 0.12 m into it).
  b.block(
    0.3,
    DECK + 0.09,
    0.86,
    0.56,
    0.16,
    0.36,
    C.bar.clone().multiplyScalar(1.6),
    M.Metal,
    Z.Roof,
    0.012,
  );
  // Whip aerial on the left guard by the screen.
  b.block(-0.76, 0.62, -0.8, 0.05, 0.03, 0.05, C.rubber, M.Rubber, Z.Front);
  b.rod(v(-0.76, 0.63, -0.8), v(-0.78, 1.5, -0.76), 0.005, C.bar);
}

export function addMqGear(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  bullBar(b, tuning);
  rearBar(b, tuning);
  doorSpare(b, wheel);
  underside(b);
  rack(b, tuning, wheel);
}

/** A recovery plank strapped down along the left of the rack. */
export function buildMqPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = pal('barkOchre');
  const x = index === 0 ? -0.53 : -0.22,
    z = 0.9,
    y = DECK + 0.037;
  b.block(x, y, z, 0.29, 0.05, 1.9, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.11 + i * 0.073,
      y + 0.026,
      z,
      0.004,
      0.003,
      1.84,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const zz of [0.15, 1.65]) {
    b.block(x, y + 0.03, zz, 0.3, 0.012, 0.045, C.rubber, M.Rubber, Z.Roof);
    for (const side of [-1, 1])
      b.block(x + side * 0.152, y - 0.01, zz, 0.012, 0.08, 0.045, C.rubber, M.Rubber, Z.Roof);
    b.block(x + 0.12, y + 0.04, zz, 0.035, 0.012, 0.055, C.steel, M.Metal, Z.Roof);
  }
  return cleanGeometry(b.build());
}

/**
 * A 7.50R16 light-truck tyre on a silver pressed-steel 16 × 5.5 rim: a dished disc with eight
 * round vent holes, six nuts and a free-wheeling hub.
 */
export function buildMqWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#222523');
  const rimR = 0.212;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.012, -w * 0.46],
    [r * 0.72, -w * 0.55],
    [r * 0.9, -w * 0.52],
    [r * 0.968, -w * 0.4],
    [r * 0.968, w * 0.4],
    [r * 0.9, w * 0.52],
    [r * 0.72, w * 0.55],
    [rimR - 0.012, w * 0.46],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  const blocks = 16;
  for (let i = 0; i < blocks; i++)
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.24, Math.cos(angle) * r * 0.968, Math.sin(angle) * r * 0.968)
        .rotate(angle, side * 0.25, 0);
      b.box(w * 0.4, 0.03, 0.07, tyre);
      b.pop();
    }
  const circle = (cx: number, cy: number, rr: number, n: number) =>
    Array.from(
      { length: n },
      (_, i) =>
        new THREE.Vector2(
          cx + rr * Math.cos((i * Math.PI * 2) / n),
          cy + rr * Math.sin((i * Math.PI * 2) / n),
        ),
    );
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.76, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    b.ring(side * (w * 0.5 - 0.004), 0, 0, rimR, 0.012, C.wheel, M.Paint, 'x');
    // The dished disc with eight vent holes, set in from the tyre's face.
    const disc = new THREE.Shape(circle(0, 0, rimR - 0.012, 32));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      disc.holes.push(new THREE.Path(circle(0.135 * Math.cos(a), 0.135 * Math.sin(a), 0.024, 12).reverse()));
    }
    disc.holes.push(new THREE.Path(circle(0, 0, 0.05, 12).reverse()));
    b.push()
      .translate(side * (w * 0.5 - 0.04), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.008, 0.008, C.wheel, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.025), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.082, 0.096, 0.03, 16), C.wheel);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 - 0.007), Math.cos(a) * 0.0698, Math.sin(a) * 0.0698)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 6), C.steel);
      b.pop();
    }
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.015), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.048, 0.056, 0.05, 12), C.steel.clone().multiplyScalar(0.92));
    b.pop();
    b.block(
      side * (w * 0.5 + 0.041),
      0,
      0,
      0.006,
      0.05,
      0.012,
      C.steel.clone().multiplyScalar(0.7),
      M.Metal,
      Z.Trim,
    );
  }
  return cleanGeometry(b.build());
}
