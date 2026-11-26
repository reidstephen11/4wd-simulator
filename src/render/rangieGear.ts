import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { extrudeZ } from './bodyShapes';
import { ROUND_BEND, cleanGeometry, continuousTube } from './bodyRefinement';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { rangieColors as C } from './rangiePaint';
import { NOSE, ROOF_EDGE, TAIL, wAt } from './rangieBody';
import { mountSpare, spareSidewall } from './spares';

// What the game adds to the factory two-door: a tubular steel roo bar of the period with a
// winch inside its pan and two driving lamps on the centre hoop (as the green Australian car in
// the photographs carries), a towbar with a ball under the rear bumper, a gutter-mounted roof
// rack carrying the second spare and the planks, and the first spare standing in the load bay
// as the factory carried it.

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });
/** Height of the rack's deck slats, 60 mm over the roof's crown (a literal: rangieBody imports this file). */
const DECK = 1.345;
/** Lens centres of the two driving lamps on the bar (also in vehicleLooks). */
export const RANGIE_DRIVING_LAMPS: V[] = [-0.19, 0.19].map((x) => v(x, 0.665, -2.27));

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
 * The roo bar: a folded steel pan in the bumper's place holding the winch, a centre hoop over
 * the grille with the two driving lamps on it, a hoop over each headlamp, and a cross rail
 * tying the three together. Until v2.26 the pan was bolted on ahead of the factory bumper, which
 * stood the hoops 0.34 m ahead of the grille; a winch bar replaces the bumper, so the pan now
 * starts where the bumper did (it covers the blade, and the blade's wrapped ends are its wings)
 * and the hoops stand 0.2 m ahead of the grille.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z + 0.04,
    back = NOSE - 0.02,
    low = 0.025,
    top = 0.16;
  b.block(
    0,
    (low + top) / 2,
    (face + back) / 2,
    1.76,
    top - low,
    back - face,
    C.bar,
    M.Metal,
    Z.Front,
    0.012,
  );
  for (const y of [0.07, 0.13]) b.block(0, y, face - 0.004, 1.3, 0.01, 0.01, C.bar, M.Metal, Z.Front, 0.004);
  // Brackets back to the chassis rails under the bumper.
  for (const x of [-0.45, 0.45]) b.block(x, 0.04, back + 0.1, 0.08, 0.1, 0.24, C.bar, M.Metal, Z.Trim, 0.01);
  // The hoops, bent from one size of tube, and the cross rail.
  const zt = face + 0.05;
  tube(b, [v(-0.3, top, zt - 0.02), v(-0.3, 0.6, zt), v(0.3, 0.6, zt), v(0.3, top, zt - 0.02)], 0.028);
  for (const side of [-1, 1])
    tube(
      b,
      [
        v(side * 0.86, top, zt + 0.04),
        v(side * 0.85, 0.5, zt + 0.02),
        v(side * 0.43, 0.52, zt),
        v(side * 0.43, top, zt - 0.02),
      ],
      0.026,
    );
  b.rod(v(-0.86, 0.33, zt + 0.015), v(0.86, 0.33, zt + 0.015), 0.022, C.bar, M.Metal, Z.Front);
  // Two round driving lamps on the centre hoop's top rail.
  for (const p of RANGIE_DRIVING_LAMPS) {
    b.rod(v(p.x, 0.6, zt), v(p.x, p.y - 0.06, zt), 0.01, C.bar, M.Metal, Z.Front);
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.push()
      .translate(p.x, p.y, p.z + 0.06)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.085, 0.07, 0.11, 18), C.bar);
    b.pop();
    b.ring(p.x, p.y, p.z + 0.004, 0.08, 0.006, C.chrome, M.Metal, 'z', Z.Front);
    b.slot = M.DrivingLamp;
    b.push()
      .translate(p.x, p.y, p.z)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 18), C.lamp);
    b.pop();
  }
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the roller fairlead in the face. Until v2.16 its drum, motor and gearbox stood on the
  // pan in front of the grille.
  const wz = (face + back) / 2 + 0.02;
  b.block(0, top + 0.025, wz, 0.2, 0.05, 0.09, C.rubber, M.Rubber, Z.Front, 0.012);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.022, 0.2, 0.09, 0.03, C.steel, M.Metal, Z.Front, 0.006);
  for (const y of [m.y - 0.03, m.y + 0.03])
    b.rod(v(m.x - 0.09, y, face - 0.035), v(m.x + 0.09, y, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.1, m.x + 0.1])
    b.rod(v(x, m.y - 0.045, face - 0.035), v(x, m.y + 0.045, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  b.ring(m.x, m.y, face - 0.05, 0.022, 0.007, C.red, M.Paint, 'z', Z.Front);
  for (const side of [-1, 1]) shackle(b, side * 0.62, low - 0.02, face + 0.06, -1);
  plate(b, -0.5, 0.095, face - 0.016, -1);
}

/** The towbar under the rear bumper: a tongue to the ball, and recovery points. */
function towbar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const t = tuning.towPoint;
  b.block(0, -0.02, TAIL - 0.1, 1.2, 0.08, 0.08, C.bar, M.Metal, Z.Rear, 0.008);
  for (const x of [-0.45, 0.45]) b.block(x, -0.02, TAIL - 0.3, 0.08, 0.08, 0.4, C.bar, M.Metal, Z.Trim);
  b.block(
    t.x,
    t.y + 0.01,
    (TAIL - 0.06 + t.z) / 2,
    0.08,
    0.06,
    t.z - TAIL + 0.12,
    C.bar,
    M.Metal,
    Z.Rear,
    0.008,
  );
  b.rod(v(t.x, t.y + 0.04, t.z), v(t.x, t.y + 0.07, t.z), 0.012, C.steel);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.09, t.z);
  b.geometry(new THREE.SphereGeometry(0.025, 12, 8), C.steel);
  b.pop();
  for (const side of [-1, 1]) shackle(b, side * 0.5, -0.06, TAIL - 0.06, 1);
}

function underside(b: VehicleBuilder, wheel: THREE.BufferGeometry, tuning: VehicleTuning): void {
  const frame = C.bar.clone().multiplyScalar(1.15);
  // Box-section chassis, crossmembers, the gearbox and transfer case, sump, tank and exhaust.
  for (const side of [-1, 1])
    b.block(side * 0.45, -0.03, 0.12, 0.08, 0.15, 4.3, frame, M.Metal, Z.Trim, 0.01);
  for (const z of [-1.9, -0.55, 0.5, 1.85, 2.2]) b.block(0, -0.03, z, 0.9, 0.1, 0.08, frame, M.Metal, Z.Trim);
  b.block(0.02, -0.07, -0.3, 0.34, 0.2, 0.72, C.steel.clone().multiplyScalar(0.55), M.Metal, Z.Trim, 0.03);
  b.block(0, -0.06, -1.5, 0.32, 0.16, 0.5, C.steel.clone().multiplyScalar(0.5), M.Metal, Z.Trim, 0.03);
  b.block(0.15, -0.02, 1.95, 0.6, 0.2, 0.44, C.rubber, M.Rubber, Z.Trim, 0.03);
  // Exhaust down the left side inside the frame rail: under the crossmembers, the muffler under the
  // cab floor between two crossmembers, in towards the middle over the rear axle (clear of the coil
  // spring and the damper, under the load floor), back out under the two rear crossmembers and out
  // under the rear bar pointing back. Until v2.16 it ran at the axle's height, through the top of
  // its tube and through three crossmembers, and the muffler ran into the crossmember at 0.5.
  const pipe = [
    v(-0.28, -0.12, -0.9),
    v(-0.3, -0.125, -0.01),
    v(-0.3, -0.125, 0.41),
    v(-0.3, -0.125, 0.95),
    v(-0.18, 0.05, 1.12),
    v(-0.18, 0.05, 1.43),
    v(-0.33, -0.135, 1.62),
    v(-0.33, -0.135, 2.24),
    v(-0.42, -0.15, 2.36),
  ];
  for (let i = 0; i < pipe.length - 1; i++) {
    // The muffler stands between the second and third points.
    if (i === 1) continue;
    b.rod(pipe[i], pipe[i + 1], 0.028, C.steel);
  }
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(-0.3, -0.125, 0.2)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), C.steel.clone().multiplyScalar(0.6));
  b.pop();
  // Rubber hangers from the muffler up to the cab floor and from the run over the axle up to the
  // load floor.
  for (const [a, c] of [
    [v(-0.3, -0.06, 0.2), v(-0.3, 0.085, 0.2)],
    [v(-0.18, 0.075, 1.28), v(-0.18, 0.135, 1.28)],
  ])
    b.rod(a, c, 0.009, C.rubber, M.Rubber, Z.Trim);
  // The first spare standing upright in the load bay on the left, strapped to the side.
  b.tag = Z.Rear;
  // Its inner sidewall stands 6 mm off the rear wheelhouse's inner face (x -0.52), which it
  // stood inside at x -0.56, and the strap runs down its outer face over the hub.
  const bay = { x: -0.39, y: 0.16 + tuning.wheelRadius, z: 1.72 };
  mountSpare(b, wheel, bay, 'right', C.rubber);
  b.block(bay.x + 0.141, bay.y, bay.z, 0.03, 0.5, 0.05, C.rubber, M.Rubber, Z.Rear, 0.004);
}

/** The gutter-mounted rack: clamps on the rails, a slatted deck and a tube rail round it. */
function rack(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const front = 0.0,
    back = TAIL - 0.22,
    hx = 0.7,
    rail = DECK + 0.12;
  const gutter = wAt(ROOF_EDGE) + 0.018;
  for (const side of [-1, 1]) {
    for (const z of [0.08, 0.75, 1.4, back - 0.06]) {
      b.block(side * gutter, 1.228, z, 0.03, 0.05, 0.07, C.bar, M.Metal, Z.Roof, 0.006);
      b.rod(v(side * gutter, 1.235, z), v(side * hx, DECK - 0.02, z), 0.014, C.bar, M.Metal, Z.Roof);
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
      v(-hx, rail, z + (z < 0.5 ? 0.06 : -0.06)),
      v(hx, rail, z + (z < 0.5 ? 0.06 : -0.06)),
      0.015,
      C.bar,
      M.Metal,
      Z.Roof,
    );
  }
  for (let z = front + 0.12; z < back - 0.05; z += 0.2)
    b.block(0, DECK, z, 2 * hx - 0.02, 0.02, 0.04, C.bar, M.Metal, Z.Roof);
  // The second spare lying flat at the back, a canvas bag and a jerry can ahead of it.
  const sx = 0.3,
    sz = back - 0.45;
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
  b.block(0.3, DECK + 0.12, 0.42, 0.56, 0.22, 0.7, new THREE.Color('#6F6A55'), M.Fabric, Z.Roof, 0.05);
  for (const z of [0.22, 0.62])
    b.block(0.3, DECK + 0.12, z, 0.58, 0.235, 0.035, C.rubber, M.Rubber, Z.Roof, 0.01);
  b.block(0.33, DECK + 0.17, 1.1, 0.34, 0.32, 0.17, new THREE.Color('#4E6A3A'), M.Paint, Z.Roof, 0.012);
  // Whip aerial on the right wing by the screen.
  b.block(0.8, 0.615, -0.72, 0.05, 0.03, 0.05, C.rubber, M.Rubber, Z.Front);
  b.rod(v(0.8, 0.62, -0.72), v(0.82, 1.5, -0.68), 0.005, C.bar);
}

export function addRangieGear(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  bullBar(b, tuning);
  towbar(b, tuning);
  underside(b, wheel, tuning);
  rack(b, tuning, wheel);
}

/** A recovery plank strapped down along the left of the rack. */
export function buildRangiePlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = pal('barkOchre');
  const x = index === 0 ? -0.52 : -0.21,
    z = 1.02,
    y = DECK + 0.037;
  b.block(x, y, z, 0.29, 0.05, 2.0, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.11 + i * 0.073,
      y + 0.026,
      z,
      0.004,
      0.003,
      1.94,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const zz of [0.25, 1.8]) {
    b.block(x, y + 0.03, zz, 0.3, 0.012, 0.045, C.rubber, M.Rubber, Z.Roof);
    for (const side of [-1, 1])
      b.block(x + side * 0.152, y - 0.01, zz, 0.012, 0.08, 0.045, C.rubber, M.Rubber, Z.Roof);
    b.block(x + 0.12, y + 0.04, zz, 0.035, 0.012, 0.055, C.steel, M.Metal, Z.Roof);
  }
  return cleanGeometry(b.build());
}

/**
 * A 205 R16 road tyre on the pressed-steel 6 × 16 Rostyle wheel: a silver dished disc with
 * five slots round the hub, five nuts and a plain centre cap.
 */
export function buildRangieWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#222523');
  const rimR = 0.205;
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
  // Two rows of staggered tread blocks with a groove down the middle.
  const blocks = 16;
  for (let i = 0; i < blocks; i++)
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.24, Math.cos(angle) * r * 0.968, Math.sin(angle) * r * 0.968)
        .rotate(angle, side * 0.2, 0);
      b.box(w * 0.4, 0.03, 0.065, tyre);
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
    // Rim flange.
    b.ring(side * (w * 0.5 - 0.004), 0, 0, rimR, 0.012, C.wheel, M.Paint, 'x');
    // The dished disc with five slots, set in from the tyre's face.
    const disc = new THREE.Shape(circle(0, 0, rimR - 0.012, 32));
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 + Math.PI / 2;
      const c = Math.cos(a),
        s = Math.sin(a);
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = Math.PI / 2 + (k / 8) * Math.PI;
        pts.push(new THREE.Vector2(0.095 * c + 0.024 * Math.cos(a + t), 0.095 * s + 0.024 * Math.sin(a + t)));
      }
      for (let k = 0; k <= 8; k++) {
        const t = -Math.PI / 2 + (k / 8) * Math.PI;
        pts.push(new THREE.Vector2(0.15 * c + 0.03 * Math.cos(a + t), 0.15 * s + 0.03 * Math.sin(a + t)));
      }
      disc.holes.push(new THREE.Path(pts.reverse()));
    }
    disc.holes.push(new THREE.Path(circle(0, 0, 0.045, 12).reverse()));
    b.push()
      .translate(side * (w * 0.5 - 0.04), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.008, 0.008, C.wheel, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.022), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.07, 0.085, 0.036, 16), C.wheel);
    b.pop();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 - 0.004), Math.cos(a) * 0.0825, Math.sin(a) * 0.0825)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 6), C.steel);
      b.pop();
    }
    // Plain domed centre cap (full-time four-wheel drive: no free-wheeling hubs).
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.004), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.04, 0.05, 0.03, 12), C.steel.clone().multiplyScalar(0.95));
    b.pop();
  }
  return cleanGeometry(b.build());
}
