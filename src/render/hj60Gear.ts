import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { pal } from './colors';
import { extrudeZ } from './bodyShapes';
import { ROUND_BEND, cleanGeometry, continuousTube } from './bodyRefinement';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { hj60Colors as C } from './hj60Paint';
import { NOSE, ROOF_EDGE, TAIL, wAt } from './hj60Body';
import { mountSpare, spareSidewall } from './spares';

// What the game adds to the factory 60: a period steel bull bar with a winch, a steel rear
// bar with a tow ball, a gutter-mounted roof rack carrying the second spare and the planks,
// and the first spare slung under the back as the factory carried it.

type V = { x: number; y: number; z: number };
const v = (x: number, y: number, z: number): V => ({ x, y, z });
/** Height of the rack's deck slats. */
const DECK = 1.41;

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
 * A steel bull bar of the mid-eighties: a deep folded pan in place of the bumper, swept back
 * round the guards, a centre hoop over the grille, side loops across the headlamps, and an
 * electric winch inside the pan with a roller fairlead in its face.
 */
function bullBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const face = tuning.winchMount.z + 0.04,
    back = NOSE - 0.03,
    low = 0.04,
    top = 0.3;
  const outline = new THREE.Shape();
  outline.moveTo(-0.66, -face);
  outline.lineTo(0.66, -face);
  outline.quadraticCurveTo(0.86, -face, 0.94, -(face + 0.16));
  outline.lineTo(0.94, -back);
  outline.lineTo(-0.94, -back);
  outline.lineTo(-0.94, -(face + 0.16));
  outline.quadraticCurveTo(-0.86, -face, -0.66, -face);
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
  // Folded ribs across the pan's face.
  for (const y of [0.1, 0.24]) b.block(0, y, face - 0.004, 1.3, 0.012, 0.01, C.bar, M.Metal, Z.Front, 0.004);
  // Brackets back to the chassis rails.
  for (const x of [-0.43, 0.43]) b.block(x, 0.06, back + 0.08, 0.08, 0.12, 0.2, C.bar, M.Metal, Z.Trim, 0.01);
  // Centre hoop and side loops, bent from one size of tube.
  const zt = NOSE - 0.1;
  tube(b, [v(-0.3, top, zt - 0.03), v(-0.3, 0.66, zt), v(0.3, 0.66, zt), v(0.3, top, zt - 0.03)], 0.03);
  for (const side of [-1, 1])
    tube(
      b,
      [
        v(side * 0.9, top, back - 0.08),
        v(side * 0.88, 0.58, zt + 0.02),
        v(side * 0.72, 0.62, zt),
        v(side * 0.3, 0.62, zt),
      ],
      0.026,
    );
  b.rod(v(-0.3, 0.46, zt - 0.015), v(0.3, 0.46, zt - 0.015), 0.022, C.bar, M.Metal, Z.Front);
  // The winch is inside the pan, as in any winch bar: what shows is its control box on the pan's
  // top and the roller fairlead in the face. Until v2.14 its drum, motor and gearbox stood on the
  // pan in front of the grille.
  const wz = (face + back) / 2;
  b.block(0, top + 0.025, wz, 0.2, 0.05, 0.09, C.rubber, M.Rubber, Z.Front, 0.012);
  const m = tuning.winchMount;
  b.block(m.x, m.y, face - 0.022, 0.2, 0.09, 0.03, C.steel, M.Metal, Z.Front, 0.006);
  for (const y of [m.y - 0.03, m.y + 0.03])
    b.rod(v(m.x - 0.09, y, face - 0.035), v(m.x + 0.09, y, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  for (const x of [m.x - 0.1, m.x + 0.1])
    b.rod(v(x, m.y - 0.045, face - 0.035), v(x, m.y + 0.045, face - 0.035), 0.014, C.steel, M.Metal, Z.Front);
  b.ring(m.x, m.y, face - 0.05, 0.022, 0.007, C.red, M.Paint, 'z', Z.Front);
  for (const side of [-1, 1]) shackle(b, side * 0.62, low - 0.02, face + 0.06, -1);
  plate(b, -0.45, 0.17, face - 0.016, -1);
}

/** Steel rear bar across the back with a step, recovery points and the tow ball. */
function rearBar(b: VehicleBuilder, tuning: VehicleTuning): void {
  const z0 = TAIL + 0.012,
    z1 = TAIL + 0.15;
  b.block(0, 0.075, (z0 + z1) / 2, 1.84, 0.15, z1 - z0, C.bar, M.Metal, Z.Rear, 0.014);
  b.block(0, 0.155, (z0 + z1) / 2 + 0.01, 0.6, 0.012, z1 - z0 - 0.03, C.steel, M.Metal, Z.Rear, 0.004);
  for (const x of [-0.43, 0.43]) b.block(x, 0.05, TAIL - 0.08, 0.08, 0.1, 0.2, C.bar, M.Metal, Z.Trim);
  for (const side of [-1, 1]) shackle(b, side * 0.72, -0.02, z1 - 0.03, 1);
  const t = tuning.towPoint;
  b.block(t.x, t.y + 0.02, (z1 + t.z) / 2, 0.08, 0.06, t.z - z1 + 0.06, C.bar, M.Metal, Z.Rear, 0.008);
  b.rod(v(t.x, t.y + 0.05, t.z), v(t.x, t.y + 0.08, t.z), 0.012, C.steel);
  b.slot = M.Metal;
  b.tag = Z.Rear;
  b.push().translate(t.x, t.y + 0.1, t.z);
  b.geometry(new THREE.SphereGeometry(0.025, 12, 8), C.steel);
  b.pop();
}

function underside(b: VehicleBuilder, wheel: THREE.BufferGeometry, tuning: VehicleTuning): void {
  const frame = C.bar.clone().multiplyScalar(1.15);
  // Ladder chassis, crossmembers, the gearbox and transfer case, sump, tank and exhaust.
  for (const side of [-1, 1]) b.block(side * 0.43, -0.03, 0.2, 0.08, 0.15, 4.5, frame, M.Metal, Z.Trim, 0.01);
  for (const z of [-1.95, -0.55, 0.62, 1.95, 2.45])
    b.block(0, -0.03, z, 0.86, 0.1, 0.08, frame, M.Metal, Z.Trim);
  b.block(0.02, -0.07, -0.32, 0.34, 0.2, 0.72, C.steel.clone().multiplyScalar(0.55), M.Metal, Z.Trim, 0.03);
  b.block(0, -0.06, -1.6, 0.3, 0.16, 0.5, C.steel.clone().multiplyScalar(0.5), M.Metal, Z.Trim, 0.03);
  b.block(-0.1, -0.02, 0.85, 0.62, 0.2, 0.46, C.rubber, M.Rubber, Z.Trim, 0.03);
  // Exhaust down the right side inside the frame rail: under the front crossmembers, up over the
  // rear axle and the two rear crossmembers under the load floor, clear above the slung spare, and
  // down behind the last crossmember to come out under the rear bar. Until v2.14 it ran at the
  // axle's height through the axle tube and the three crossmembers behind the gearbox.
  const pipe = [
    v(0.28, -0.12, -0.9),
    v(0.3, -0.125, 0.08),
    v(0.3, -0.125, 0.52),
    v(0.31, -0.125, 1.05),
    v(0.33, 0.05, 1.22),
    v(0.33, 0.05, 2.515),
    v(0.33, -0.1, 2.53),
    v(0.56, -0.14, 2.62),
  ];
  for (let i = 0; i < pipe.length - 1; i++) {
    // The muffler (z 0.09 to 0.51) stands between the second and third points.
    if (i === 1) continue;
    b.rod(pipe[i], pipe[i + 1], 0.028, C.steel);
  }
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.3, -0.125, 0.3)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), C.steel.clone().multiplyScalar(0.6));
  b.pop();
  // Rubber hangers: from the top of the muffler up to the cab floor, and from the run over
  // the axle up to the load floor.
  for (const [a, c] of [
    [v(0.3, -0.06, 0.18), v(0.3, 0.085, 0.18)],
    [v(0.33, 0.075, 1.75), v(0.33, 0.09, 1.75)],
  ])
    b.rod(a, c, 0.009, C.rubber, M.Rubber, Z.Trim);
  // The first spare, slung flat under the back on its cradle as the factory carried it,
  // below the frame rails (bottom at -0.105) and the two rear crossmembers, high enough that
  // its lowest hub cap is 0.156 m off the ground.
  const sz = 2.06,
    sy = -0.105 - tuning.wheelWidth / 2;
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: 0, y: sy, z: sz }, 'down', C.rubber);
  b.block(0, sy - tuning.wheelWidth / 2 - 0.01, sz, 0.08, 0.02, 0.86, frame, M.Metal, Z.Rear);
  b.rod(v(0, sy - tuning.wheelWidth / 2 - 0.01, sz), v(0, 0.05, sz), 0.012, C.steel);
}

/** The gutter-mounted rack: clamps on the drip rails, a slatted deck and a tube rail round it. */
function rack(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  const front = -0.06,
    back = TAIL - 0.16,
    hx = 0.74,
    rail = DECK + 0.13;
  const gutter = wAt(ROOF_EDGE, 1) + 0.014;
  for (const side of [-1, 1]) {
    for (const z of [0.02, 0.8, 1.6, back - 0.06]) {
      b.block(side * gutter, 1.262, z, 0.03, 0.05, 0.07, C.bar, M.Metal, Z.Roof, 0.006);
      b.rod(v(side * gutter, 1.27, z), v(side * hx, DECK - 0.02, z), 0.014, C.bar, M.Metal, Z.Roof);
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
  // The second spare lying flat at the back, a canvas bag and a toolbox ahead of it.
  const sx = 0.32,
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
  b.block(0.33, DECK + 0.12, 0.38, 0.6, 0.22, 0.74, new THREE.Color('#7A7457'), M.Fabric, Z.Roof, 0.05);
  for (const z of [0.18, 0.58])
    b.block(0.33, DECK + 0.12, z, 0.62, 0.235, 0.035, C.rubber, M.Rubber, Z.Roof, 0.01);
  b.block(
    0.33,
    DECK + 0.09,
    1.16,
    0.6,
    0.16,
    0.42,
    C.bar.clone().multiplyScalar(1.6),
    M.Metal,
    Z.Roof,
    0.012,
  );
  // Whip aerial on the left guard by the screen.
  b.block(-0.82, 0.79, -0.72, 0.05, 0.03, 0.05, C.rubber, M.Rubber, Z.Front);
  b.rod(v(-0.82, 0.8, -0.72), v(-0.84, 1.62, -0.68), 0.005, C.bar);
}

export function addHj60Gear(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  bullBar(b, tuning);
  rearBar(b, tuning);
  underside(b, wheel, tuning);
  rack(b, tuning, wheel);
}

/** A recovery plank strapped down along the left of the rack. */
export function buildHj60Plank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = pal('barkOchre');
  // Their front ends are 2 cm behind the rack's front rail (at z 1.05 they stood 5 cm past it).
  const x = index === 0 ? -0.56 : -0.25,
    z = 1.12,
    y = DECK + 0.037;
  b.block(x, y, z, 0.29, 0.05, 2.2, wood, M.Fabric, Z.Roof);
  for (let i = 0; i < 4; i++)
    b.block(
      x - 0.11 + i * 0.073,
      y + 0.026,
      z,
      0.004,
      0.003,
      2.14,
      wood.clone().multiplyScalar(0.74),
      M.Fabric,
      Z.Roof,
    );
  for (const zz of [0.2, 1.9]) {
    b.block(x, y + 0.03, zz, 0.3, 0.012, 0.045, C.rubber, M.Rubber, Z.Roof);
    for (const side of [-1, 1])
      b.block(x + side * 0.152, y - 0.01, zz, 0.012, 0.08, 0.045, C.rubber, M.Rubber, Z.Roof);
    b.block(x + 0.12, y + 0.04, zz, 0.035, 0.012, 0.055, C.steel, M.Metal, Z.Roof);
  }
  return cleanGeometry(b.build());
}

/**
 * A 7.50R16 light-truck tyre on the Standard's white 16 × 5.5 split rim: six radial slots in
 * the disc, the lock ring round the outside, six nuts and a free-wheeling hub.
 */
export function buildHj60Wheel(tuning: VehicleTuning): THREE.BufferGeometry {
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
  // Two rows of staggered traction blocks with a groove down the middle.
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
    // Rim flange, and the lock ring with its split.
    b.ring(side * (w * 0.5 - 0.004), 0, 0, rimR, 0.012, C.wheel, M.Paint, 'x');
    b.ring(
      side * (w * 0.5 - 0.008),
      0,
      0,
      rimR - 0.022,
      0.006,
      C.wheel.clone().multiplyScalar(0.88),
      M.Paint,
      'x',
    );
    b.block(side * (w * 0.5 - 0.003), rimR - 0.022, 0, 0.012, 0.014, 0.008, tyre, M.Rubber, Z.Trim);
    // The dished disc with six radial slots, set in from the tyre's face.
    const disc = new THREE.Shape(circle(0, 0, rimR - 0.025, 32));
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const c = Math.cos(a),
        s = Math.sin(a);
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = Math.PI / 2 + (k / 8) * Math.PI;
        pts.push(new THREE.Vector2(0.105 * c + 0.019 * Math.cos(a + t), 0.105 * s + 0.019 * Math.sin(a + t)));
      }
      for (let k = 0; k <= 8; k++) {
        const t = -Math.PI / 2 + (k / 8) * Math.PI;
        pts.push(new THREE.Vector2(0.16 * c + 0.019 * Math.cos(a + t), 0.16 * s + 0.019 * Math.sin(a + t)));
      }
      disc.holes.push(new THREE.Path(pts.reverse()));
    }
    disc.holes.push(new THREE.Path(circle(0, 0, 0.05, 12).reverse()));
    b.push()
      .translate(side * (w * 0.5 - 0.035), 0, 0)
      .rotate(0, Math.PI / 2, 0);
    extrudeZ(b, disc, -0.008, 0.008, C.wheel, M.Paint, Z.Trim, 0);
    b.pop();
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.082, 0.096, 0.03, 16), C.wheel);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.slot = M.Metal;
      b.push()
        .translate(side * (w * 0.5 - 0.002), Math.cos(a) * 0.0698, Math.sin(a) * 0.0698)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.012, 0.014, 0.02, 6), C.steel);
      b.pop();
    }
    // Free-wheeling hub: a domed cap with its dial in the middle.
    b.slot = M.Metal;
    b.push()
      .translate(side * (w * 0.5 + 0.02), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.048, 0.056, 0.05, 12), C.steel.clone().multiplyScalar(0.92));
    b.pop();
    b.block(
      side * (w * 0.5 + 0.046),
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
