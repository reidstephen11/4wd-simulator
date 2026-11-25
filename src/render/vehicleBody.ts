export { buildVehicleWheel } from './vehicleWheel';
export { buildRackPlank } from './vehicleEquipment';
import { cleanGeometry, subdivideSurface } from './bodyRefinement';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addVehicleInterior } from './vehicleInterior';
import { pal } from './colors';
import { addVehicleEquipment } from './vehicleEquipment';
import { extrudeX, extrudeZ, rounded, sideShape, type Vtx } from './bodyShapes';
import { mirrorHead, stalk } from './mirrors';

// Axes as in the game: x across, y up from the body origin (the axles sit 0.12 m lower on
// the lifted springs), z backwards, so the nose is at -z. Heights below are the stock car's
// heights above its hubs, which the lift carries up unchanged.
// Photographs and dimensions: reference/vehicles/landcruiser-fj40/SOURCES.md.
/** Half the 1.665 m width, over the front guards' flared lips. */
export const HW = 0.832;
/** Half-width of the cowl, doors, tub and hardtop sides, inside the guard flares. */
export const BW = 0.8;
const AXLE = 1.15; // half the 2.3 m wheelbase the physics uses (2,285 mm published)
const ARCH = 0.5; // rear wheel opening, round about the axle line
const ARCH_Y = 0;
export const LOW = 0.28; // bottom edge of the doors and the tub sides
export const STEP = 0.18;
export const BELT = 0.74; // the tub's top edge, where the hardtop sits
export const WIN_LOW = 0.99;
export const WIN_TOP = 1.38;
export const CAP = 1.45; // lower edge of the white roof cap
/** Panels under the roof cap run up into it by this, so no seam shows below its edge. */
export const TUCK = CAP + 0.02;
/** Top of the roof at its edges; it crowns 35 mm higher down the middle. */
export const ROOF = 1.56;
/** Front face of the grille panel. */
export const NOSE = -1.68;
export const TAIL = 1.9;
const GRILLE_HW = 0.577;
export const COWL_Z = -0.5; // rear end of the bonnet and the guards
export const DOOR_Z = -0.3; // door front edge; the screen stands just ahead of it
export const DOOR_REAR = 0.5;
export const GUARD_TOP = 0.63;
export const GUARD_FRONT = -1.61;
export const GUARD_OUT = HW - 0.025; // the guard's face; its lip stands out to HW
export const LAMP_X = 0.427;
export const LAMP_Y = 0.515;
const TUB_R = 0.22; // the tub's rear corners, flush with the hardtop's
export const TOP_R = 0.22; // the hardtop's rounder rear corners, round the curved windows
/** Top face of the flat bonnet. */
export const BONNET_TOP = 0.835;

/** Half-width of the engine bay's sides: the bonnet narrows from the cowl to the grille. */
const bayHalf = (z: number) =>
  GRILLE_HW + (BW - 0.01 - GRILLE_HW) * THREE.MathUtils.clamp((z - NOSE) / (COWL_Z - NOSE), 0, 1);

export const steel = new THREE.Color('#93988F'),
  chrome = new THREE.Color('#C9CCC6'),
  rubber = new THREE.Color('#252B28'),
  dark = new THREE.Color('#1C201E'),
  well = new THREE.Color('#2A2D2A'),
  glass = new THREE.Color('#9CB9B5'),
  red = new THREE.Color('#AE3029'),
  amber = new THREE.Color('#EDA53E'),
  lamp = new THREE.Color('#E3E4CD');

/** Paint for the body panels and for the hardtop, window frames and grille surround. */
export interface Livery {
  body: THREE.Color;
  roof: THREE.Color;
  /** The bonnet's panels when they are not in the body colour (the farm ute's bare steel). */
  bonnet?: THREE.Color;
}

export const standardLivery: Livery = {
  body: pal('vehicleBody'),
  roof: pal('vehicleRoof'),
};

type P =
  | [number, number]
  | { arc: [number, number, number, number, number] }
  | { quad: [number, number, number, number] };

/**
 * A side profile (z, y), extruded across the car from x0 to x1. Edges are rounded by `bevel`
 * without growing the outline; curved panels get smooth shading and sharp folds stay sharp.
 * Faces of the wheel arches (`arches`: z, y, r) are painted as the dark inner wheel well.
 */
export function sideProfile(
  b: VehicleBuilder,
  pts: P[],
  x0: number,
  x1: number,
  color: THREE.Color,
  zone: number,
  bevel: number,
  arches: [number, number, number][] = [],
): void {
  const s = new THREE.Shape();
  let first = true;
  for (const p of pts) {
    if (Array.isArray(p)) {
      if (first) s.moveTo(-p[0], p[1]);
      else s.lineTo(-p[0], p[1]);
    } else if ('arc' in p) {
      const [z, y, r, a0, a1] = p.arc;
      s.absarc(-z, y, r, a0, a1, false);
    } else {
      const [cz, cy, z, y] = p.quad;
      s.quadraticCurveTo(-cz, cy, -z, y);
    }
    first = false;
  }
  const size = bevel * 0.8;
  const raw = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, x1 - x0 - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: size,
    bevelOffset: -size,
    bevelSegments: 4,
    curveSegments: 28,
  });
  const g = toCreasedNormals(raw, Math.PI / 5);
  // Paint the arch walls dark: faces near an arch circle that face its centre.
  const pos = g.getAttribute('position'),
    nrm = g.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3),
    slots = new Float32Array(pos.count);
  const c = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(0, 0, 0);
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      c.x += pos.getX(i + k) / 3;
      c.y += pos.getY(i + k) / 3;
      n.x += nrm.getX(i + k);
      n.y += nrm.getY(i + k);
      n.z += nrm.getZ(i + k);
    }
    n.normalize();
    let inWell = false;
    for (const [az, ay, ar] of arches) {
      const dx = -az - c.x,
        dy = ay - c.y,
        d = Math.hypot(dx, dy);
      if (d < ar + 0.01 && d > ar - 0.08 && (n.x * dx + n.y * dy) / d > 0.55) inWell = true;
    }
    const col = inWell ? well : color;
    for (let k = 0; k < 3; k++) {
      colors.set([col.r, col.g, col.b], (i + k) * 3);
      slots[i + k] = inWell ? M.Rubber : M.Paint;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('materialSlot', new THREE.BufferAttribute(slots, 1));
  g.rotateY(Math.PI / 2);
  b.tag = zone;
  b.push().translate(x0 + bevel, 0, 0);
  b.geometry(g, color);
  b.pop();
}

/** A plan-view outline (x, -z), extruded upwards from y0 to y1 with rounded edges. */
export function planProfile(
  b: VehicleBuilder,
  shape: THREE.Shape,
  y0: number,
  y1: number,
  color: THREE.Color,
  zone: number,
  bevel: number,
): void {
  const size = bevel * 0.8;
  const raw = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, y1 - y0 - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: size,
    bevelOffset: -size,
    bevelSegments: 4,
    curveSegments: zone === Z.Roof ? 8 : 20,
  });
  let g = toCreasedNormals(raw, Math.PI / 5);
  g.rotateX(-Math.PI / 2);
  b.slot = M.Paint;
  if (zone === Z.Roof) {
    // Crown the top, fading to nothing at the lower edge so the cap still sits flush on the
    // body. Every face is split alike, so the top and its rounded edges share their seams.
    g = subdivideSurface(g, () => true, 1);
    const pos = g.getAttribute('position'),
      norm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        t = THREE.MathUtils.clamp((pos.getY(i) + bevel) / (y1 - y0), 0, 1);
      pos.setY(i, pos.getY(i) + t * 0.035 * Math.max(0, 1 - (x / HW) ** 2));
      const n = new THREE.Vector3(
        norm.getX(i) + ((t * 0.07 * x) / (HW * HW)) * norm.getY(i),
        norm.getY(i),
        norm.getZ(i),
      ).normalize();
      norm.setXYZ(i, n.x, n.y, n.z);
    }
  }
  b.tag = zone;
  b.push().translate(0, y0 + bevel, 0);
  b.geometry(g, color);
  b.pop();
}

/** Plan outline: the body's width, square-ish at the front and rounded at the back. */
export function plan(front: number, rear: number, half: number, rFront: number, rRear: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-half + rFront, -front);
  s.lineTo(half - rFront, -front);
  s.quadraticCurveTo(half, -front, half, -front - rFront);
  s.lineTo(half, -rear + rRear);
  s.absarc(half - rRear, -rear + rRear, rRear, 0, -Math.PI / 2, true);
  s.lineTo(-half + rRear, -rear);
  s.absarc(-half + rRear, -rear + rRear, rRear, -Math.PI / 2, -Math.PI, true);
  s.lineTo(-half, -front - rFront);
  s.quadraticCurveTo(-half, -front, -half + rFront, -front);
  return s;
}

/** Round lamp: chrome bezel, dark seat and a domed lens, facing forwards from (x, y, z). */
function headlamp(b: VehicleBuilder, x: number, y: number, z: number): void {
  b.ring(x, y, z - 0.012, 0.094, 0.016, chrome, M.Metal, 'z', Z.Front);
  b.slot = M.Rubber;
  b.tag = Z.Front;
  b.push()
    .translate(x, y, z - 0.006)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.096, 0.096, 0.012, 28), rubber);
  b.pop();
  b.slot = M.Headlamp;
  b.push()
    .translate(x, y, z - 0.014)
    .scale(1, 1, 0.3);
  b.geometry(new THREE.SphereGeometry(0.084, 20, 8), lamp);
  b.pop();
  for (let i = -3; i <= 3; i++) {
    const w = Math.sqrt(0.078 ** 2 - (i * 0.02) ** 2) * 2;
    b.block(x, y + i * 0.02, z - 0.04, w, 0.003, 0.003, lamp, M.Headlamp, Z.Front);
  }
}

/** Part of an upright cylinder of radius r round a rear corner, from y0 to y1. */
function corner(
  b: VehicleBuilder,
  side: number,
  r: number,
  y0: number,
  y1: number,
  color: THREE.Color,
  slot: number,
  zone: number,
): void {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 18, 1, true, side > 0 ? 0 : -Math.PI / 2, Math.PI / 2);
  b.slot = slot as typeof b.slot;
  b.tag = zone;
  b.push().translate(side * (BW - r), (y0 + y1) / 2, TAIL - r);
  b.geometry(g, color);
  b.pop();
}

/**
 * A side-view outline (z, y) extruded right across the car, its half-width set by `half(z)`
 * along the car, so a panel can narrow towards the nose.
 */
function tapered(
  b: VehicleBuilder,
  verts: Vtx[],
  half: (z: number) => number,
  color: THREE.Color,
  zone: number,
  bevel: number,
): void {
  extrudeX(b, sideShape(verts), -1, 1, color, M.Paint, zone, bevel, [], 3, 0.8, (g) => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setX(i, (p.getX(i) - 1 + bevel) * half(p.getZ(i)) + 1 - bevel);
    return toCreasedNormals(g, Math.PI / 5);
  });
}

/** Points along the front guard's opening, front to back, and the same line pushed out by w. */
function guardEdge(w: number): Vtx[] {
  const chain = rounded(
    [
      [GUARD_FRONT, 0.45],
      [-1.47, 0.45, 0.1],
      [-1.3, 0.575, 0.12],
      [-0.98, 0.575, 0.12],
      [-0.62, STEP + 0.02],
    ],
    8,
  );
  if (!w) return chain.map((p) => [p.x, p.y]);
  return chain.map((p, i) => {
    const a = chain[Math.max(0, i - 1)],
      c = chain[Math.min(chain.length - 1, i + 1)];
    const tz = c.x - a.x,
      ty = c.y - a.y,
      l = Math.hypot(tz, ty);
    return [p.x - (ty / l) * w, p.y + (tz / l) * w];
  });
}

export function front(b: VehicleBuilder, livery: Livery): void {
  const body = livery.body,
    cream = livery.roof,
    bonnet = livery.bonnet ?? body;
  // Grille panel: a flat upright face between the guards, narrower than the body.
  const face = new THREE.Shape(
    rounded([
      [-GRILLE_HW, 0.21, 0.05],
      [GRILLE_HW, 0.21, 0.05],
      [GRILLE_HW, 0.725, 0.03],
      [-GRILLE_HW, 0.725, 0.03],
    ]),
  );
  extrudeZ(b, face, NOSE, NOSE + 0.14, body, M.Paint, Z.Front, 0.02);
  // The engine bay's sides above the guards, widening from the grille back to the cowl.
  tapered(
    b,
    [
      [NOSE + 0.02, GUARD_TOP - 0.03],
      [NOSE + 0.02, 0.8],
      [COWL_Z, 0.8],
      [COWL_Z, GUARD_TOP - 0.03],
    ],
    bayHalf,
    body,
    Z.Front,
    0.02,
  );
  // Bonnet, tapered the same way: a flat top that rolls down over the grille at the front.
  tapered(
    b,
    [
      [COWL_Z, 0.785],
      [COWL_Z, BONNET_TOP, 0.02],
      [-1.6, BONNET_TOP, 0.11],
      [NOSE - 0.035, 0.74, 0.03],
      [NOSE - 0.02, 0.725],
      [-1.5, 0.79],
    ],
    (z) => bayHalf(z) + 0.015,
    bonnet,
    Z.Front,
    0.03,
  );
  // The raised centre panel between the bonnet's two creases.
  tapered(
    b,
    [
      [COWL_Z - 0.06, BONNET_TOP - 0.01],
      [COWL_Z - 0.06, BONNET_TOP + 0.014, 0.01],
      [-1.55, BONNET_TOP + 0.014, 0.04],
      [-1.62, BONNET_TOP - 0.01],
    ],
    (z) => 0.33 + (0.1 * (z + 1.62)) / 1.06,
    bonnet,
    Z.Front,
    0.012,
  );
  // Dark air slot under the bonnet's lip, and the louvres at its back corners.
  b.block(0, 0.712, NOSE - 0.004, 0.66, 0.028, 0.012, dark, M.Rubber, Z.Front, 0.006);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++)
      b.block(side * 0.6, BONNET_TOP + 0.003, -0.62 - i * 0.024, 0.11, 0.006, 0.01, dark, M.Rubber, Z.Front);
    // External over-centre catches at the bonnet's back edge.
    b.block(side * 0.42, BONNET_TOP + 0.01, COWL_Z + 0.03, 0.05, 0.03, 0.08, steel, M.Metal, Z.Front, 0.006);
    b.rod(
      { x: side * 0.42, y: BONNET_TOP + 0.03, z: COWL_Z + 0.06 },
      { x: side * 0.42, y: 0.9, z: COWL_Z + 0.11 },
      0.008,
      steel,
    );
  }

  // Lamp surround spanning both round lamps and the grille, in the roof's colour.
  const surround = new THREE.Shape(
    rounded(
      [
        [-0.56, 0.37, 0.12],
        [0.56, 0.37, 0.12],
        [0.56, 0.66, 0.12],
        [-0.56, 0.66, 0.12],
      ],
      8,
    ),
  );
  for (const side of [-1, 1]) {
    const h = new THREE.Path();
    h.absarc(side * LAMP_X, LAMP_Y, 0.107, 0, Math.PI * 2, true);
    surround.holes.push(h);
  }
  surround.holes.push(
    new THREE.Path(
      rounded([
        [-0.27, 0.405, 0.02],
        [-0.27, 0.625, 0.02],
        [0.27, 0.625, 0.02],
        [0.27, 0.405, 0.02],
      ]),
    ),
  );
  extrudeZ(b, surround, NOSE - 0.022, NOSE + 0.004, cream, M.Paint, Z.Front, 0.006);
  for (const side of [-1, 1]) headlamp(b, side * LAMP_X, LAMP_Y, NOSE - 0.004);
  // Black grille mesh behind a raised TOYOTA, and two mesh slots below the surround.
  b.block(0, 0.515, NOSE - 0.002, 0.54, 0.22, 0.01, dark, M.Rubber, Z.Front);
  for (let i = 0; i < 9; i++)
    b.block(0, 0.42 + i * 0.024, NOSE - 0.008, 0.53, 0.004, 0.005, well, M.Metal, Z.Front);
  for (let i = 0; i < 19; i++)
    b.block(-0.252 + i * 0.028, 0.515, NOSE - 0.008, 0.004, 0.21, 0.005, well, M.Metal, Z.Front);
  for (const side of [-1, 1]) {
    b.block(side * 0.2, 0.3, NOSE - 0.002, 0.27, 0.055, 0.01, dark, M.Rubber, Z.Front, 0.004);
    for (let i = 0; i < 9; i++)
      b.block(side * 0.2 - 0.12 + i * 0.03, 0.3, NOSE - 0.007, 0.004, 0.05, 0.004, well, M.Metal, Z.Front);
  }
  const glyphs: Record<string, string[]> = {
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  };
  for (let k = 0; k < 6; k++)
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (glyphs['TOYOTA'[k]][row][col] === '1')
          b.block(
            -(-0.185 + k * 0.063 + col * 0.01),
            0.565 - row * 0.01,
            NOSE - 0.014,
            0.0102,
            0.0102,
            0.008,
            cream,
            M.Paint,
            Z.Front,
          );

  for (const side of [-1, 1]) {
    // Front guard: a flat shelf from the cowl to a rounded nose, over a wide opening whose
    // back edge runs down to the step.
    const out = side * GUARD_OUT,
      inner = side * 0.56;
    extrudeX(
      b,
      sideShape([
        [COWL_Z, GUARD_TOP],
        [GUARD_FRONT, GUARD_TOP, 0.08],
        ...guardEdge(0),
        [COWL_Z + 0.02, STEP + 0.02, 0.02],
      ]),
      Math.min(out, inner),
      Math.max(out, inner),
      body,
      M.Paint,
      Z.Front,
      0.05,
      [[-AXLE, -0.12]],
    );
    // The rolled lip standing proud round the opening.
    const edge = guardEdge(0);
    extrudeX(
      b,
      sideShape([...edge, ...guardEdge(0.06).reverse()]),
      side > 0 ? BW - 0.03 : -HW,
      side > 0 ? HW : -BW + 0.03,
      body,
      M.Paint,
      Z.Front,
      0.012,
    );
    // Inner wheelhouse beside the engine, so the opening doesn't show daylight.
    b.block(side * 0.37, 0.3, -AXLE, 0.02, 0.6, 1.0, well, M.Rubber, Z.Trim);
    b.block(side * 0.47, GUARD_TOP - 0.06, -AXLE, 0.2, 0.02, 1.0, well, M.Rubber, Z.Trim);
    // Indicator on the guard's nose: an amber lens under a clear park lamp.
    const ix = side * 0.69;
    b.block(ix, GUARD_TOP + 0.05, GUARD_FRONT + 0.05, 0.15, 0.1, 0.07, rubber, M.Rubber, Z.Front, 0.01);
    b.block(ix, GUARD_TOP + 0.035, GUARD_FRONT + 0.012, 0.135, 0.05, 0.012, amber, M.Amber, Z.Front, 0.005);
    b.block(ix, GUARD_TOP + 0.077, GUARD_FRONT + 0.012, 0.135, 0.03, 0.012, lamp, M.Headlamp, Z.Front, 0.005);
  }

  // Land Cruiser script on each side of the engine bay.
  for (const side of [-1, 1]) {
    const z = -1.0,
      a = Math.atan2(BW - 0.01 - GRILLE_HW, COWL_Z - NOSE);
    b.push()
      .translate(side * (bayHalf(z) + 0.004), 0.715, z)
      .rotate(0, side * a, 0);
    b.block(0, 0, 0, 0.006, 0.022, 0.15, chrome, M.Metal, Z.Front, 0.003);
    b.pop();
  }
  // Cowl in front of the screen, and its sides: full body width down to the step, with a
  // louvred vent and a small hatch.
  b.block(0, 0.825, COWL_Z + 0.07, 2 * BW, 0.08, 0.16, body, M.Paint, Z.Front, 0.02);
  for (const side of [-1, 1]) {
    b.block(
      side * (BW - 0.03),
      (STEP + 0.865) / 2,
      (COWL_Z + DOOR_Z) / 2,
      0.06,
      0.865 - STEP,
      DOOR_Z - COWL_Z,
      body,
      M.Paint,
      Z.Sides,
      0.015,
    );
    b.block(side * (BW + 0.001), 0.7, -0.43, 0.006, 0.13, 0.075, dark, M.Rubber, Z.Sides, 0.004);
    for (let i = 0; i < 5; i++)
      b.block(side * (BW + 0.005), 0.65 + i * 0.026, -0.43, 0.01, 0.008, 0.075, body, M.Paint, Z.Sides);
    b.block(side * (BW + 0.003), 0.5, -0.4, 0.008, 0.13, 0.07, body, M.Paint, Z.Sides, 0.01);
  }
}

export function windscreen(b: VehicleBuilder, livery: Livery, doorMirrors = true): void {
  const body = livery.body;
  // One flat pane in a body-colour frame, leaning back a little, wipers parked at the bottom.
  const h = CAP - 0.865;
  b.push()
    .translate(0, 0.865, DOOR_Z - 0.1)
    .rotate(0.08, 0, 0);
  b.block(0, 0.035, 0, 2 * BW, 0.07, 0.06, body, M.Paint, Z.Front, 0.015);
  b.block(0, h - 0.035, 0, 2 * BW, 0.07, 0.06, body, M.Paint, Z.Front, 0.015);
  for (const x of [-(BW - 0.035), BW - 0.035])
    b.block(x, h / 2, 0, 0.07, h, 0.06, body, M.Paint, Z.Front, 0.015);
  b.block(0, h / 2, 0, 2 * BW - 0.12, h - 0.13, 0.012, glass, M.Glass, Z.Glass);
  for (const x of [-0.45, 0.22])
    b.rod({ x, y: 0.09, z: -0.035 }, { x: x + 0.38, y: 0.11, z: -0.035 }, 0.007, rubber, M.Rubber, Z.Front);
  for (const x of [-0.45, 0.22]) b.block(x, 0.085, -0.03, 0.03, 0.03, 0.03, rubber, M.Rubber, Z.Front);
  b.pop();
  if (!doorMirrors) return;
  for (const side of [-1, 1]) {
    // Rectangular mirrors on cranked arms from the doors' upper hinges.
    stalk(
      b,
      [
        { x: side * (BW + 0.02), y: 0.76, z: DOOR_Z + 0.02 },
        { x: side * (BW + 0.08), y: 0.86, z: DOOR_Z },
        { x: side * (BW + 0.13), y: 1.0, z: DOOR_Z - 0.01 },
      ],
      0.01,
      steel,
    );
    mirrorHead(b, side, { x: side * (BW + 0.15), y: 1.08, z: DOOR_Z - 0.01 }, 0.13, 0.17, 0.035, steel);
  }
}

function sides(b: VehicleBuilder, livery: Livery): void {
  const body = livery.body;
  const a = Math.asin((LOW - ARCH_Y) / ARCH);
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? BW - 0.045 : -BW,
      x1 = side > 0 ? BW : -BW + 0.045;
    // Door and tub side below the belt, cut round the rear wheel.
    sideProfile(
      b,
      [
        [DOOR_Z, LOW],
        [AXLE - ARCH * Math.cos(a), LOW],
        { arc: [AXLE, ARCH_Y, ARCH, a, Math.PI - a] },
        [TAIL - TUB_R, LOW],
        [TAIL - TUB_R, BELT],
        [DOOR_Z, BELT],
      ],
      x0,
      x1,
      body,
      Z.Sides,
      0.015,
      [[AXLE, ARCH_Y, ARCH]],
    );
    // Hardtop side above the belt, with the door window and the sliding side window.
    extrudeX(
      b,
      sideShape(
        [
          [DOOR_Z - 0.01, BELT],
          [DOOR_Z - 0.01, TUCK],
          [TAIL - TOP_R - 0.1, TUCK],
          [TAIL - TOP_R - 0.1, BELT],
        ],
        [
          [
            [DOOR_Z + 0.06, WIN_LOW, 0.03],
            [DOOR_Z + 0.06, WIN_TOP, 0.03],
            [DOOR_REAR - 0.06, WIN_TOP, 0.05],
            [DOOR_REAR - 0.06, WIN_LOW, 0.05],
          ],
          [
            [0.58, WIN_LOW, 0.06],
            [0.58, WIN_TOP, 0.06],
            [1.47, WIN_TOP, 0.06],
            [1.47, WIN_LOW, 0.06],
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
      (WIN_LOW + WIN_TOP) / 2,
      (DOOR_Z + DOOR_REAR) / 2,
      0.012,
      0.42,
      0.72,
      glass,
      M.Glass,
      Z.Glass,
    );
    b.block(gx, (WIN_LOW + WIN_TOP) / 2, 1.025, 0.012, 0.42, 0.92, glass, M.Glass, Z.Glass);
    // Quarter-vent divider in the door glass, and the sliding window's centre frame.
    b.block(
      side * (BW - 0.022),
      (WIN_LOW + WIN_TOP) / 2,
      DOOR_Z + 0.22,
      0.02,
      0.39,
      0.025,
      body,
      M.Paint,
      Z.Sides,
      0.006,
    );
    b.block(
      side * (BW - 0.022),
      (WIN_LOW + WIN_TOP) / 2,
      1.27,
      0.02,
      0.39,
      0.035,
      body,
      M.Paint,
      Z.Sides,
      0.006,
    );
    // The joint between the hardtop and the tub, carried along the door as a pressed line.
    b.block(
      side * (BW + 0.004),
      BELT,
      (DOOR_Z + TAIL - TUB_R) / 2,
      0.024,
      0.032,
      TAIL - TUB_R - DOOR_Z,
      body,
      M.Paint,
      Z.Sides,
      0.011,
    );
    // A painted lip round the rear opening and a dark inner wheelhouse.
    b.slot = M.Paint;
    b.tag = Z.Rear;
    b.push()
      .translate(side * (BW + 0.006), ARCH_Y, AXLE)
      .rotate(0, Math.PI / 2, 0);
    b.geometry(new THREE.TorusGeometry(ARCH + 0.012, 0.018, 6, 36, Math.PI - 2 * a).rotateZ(a), body);
    b.pop();
    b.block(side * 0.52, 0.3, AXLE, 0.02, 0.44, 1.0, well, M.Rubber, Z.Trim);
    b.block(side * 0.635, ARCH + 0.02, AXLE, 0.23, 0.02, 1.0, well, M.Rubber, Z.Trim);
    // Door: shut lines, two exposed hinges at the front and a chrome pull handle.
    const sx = side * (BW + 0.002);
    for (const z of [DOOR_Z, DOOR_REAR])
      b.block(sx, (LOW + 1.42) / 2, z, 0.006, 1.42 - LOW, 0.008, rubber, M.Rubber, Z.Sides);
    b.block(sx, 1.42, (DOOR_Z + DOOR_REAR) / 2, 0.006, 0.008, DOOR_REAR - DOOR_Z, rubber, M.Rubber, Z.Sides);
    for (const y of [0.4, 0.72]) {
      b.block(side * (BW + 0.012), y, DOOR_Z + 0.03, 0.02, 0.08, 0.07, body, M.Paint, Z.Sides, 0.006);
      b.rod(
        { x: side * (BW + 0.022), y: y - 0.045, z: DOOR_Z },
        { x: side * (BW + 0.022), y: y + 0.045, z: DOOR_Z },
        0.011,
        steel,
      );
    }
    b.block(side * (BW + 0.012), 0.69, DOOR_REAR - 0.12, 0.018, 0.035, 0.13, chrome, M.Metal, Z.Sides, 0.008);
    // Painted sill under the doors, from the guard to the rear wheel opening, so no gap shows
    // between the door's bottom edge and the step.
    b.block(
      side * (BW - 0.02),
      (STEP + LOW) / 2 + 0.005,
      0.05,
      0.03,
      LOW - STEP,
      1.36,
      body,
      M.Paint,
      Z.Sides,
      0.006,
    );
    // Ribbed step under the door, from the guard back to the door's rear edge.
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
      b.block(side * 0.62, STEP - 0.07, z, 0.05, 0.13, 0.05, dark, M.Metal, Z.Trim);
  }
}

function rear(b: VehicleBuilder, livery: Livery): void {
  const body = livery.body;
  const DOOR_X = 0.555;
  for (const side of [-1, 1]) {
    corner(b, side, TUB_R, LOW, BELT, body, M.Paint, Z.Rear);
    // Flat rear face beside the doors, below and above the belt.
    const fx = side * (DOOR_X + (BW - TUB_R - DOOR_X) / 2);
    b.block(
      fx,
      (LOW + BELT) / 2,
      TAIL - 0.02,
      BW - TUB_R - DOOR_X + 0.01,
      BELT - LOW,
      0.04,
      body,
      M.Paint,
      Z.Rear,
    );
    b.block(
      side * (DOOR_X + 0.025),
      (BELT + TUCK) / 2,
      TAIL - 0.02,
      0.06,
      TUCK - BELT,
      0.04,
      body,
      M.Paint,
      Z.Rear,
    );
    // Hardtop corner: bands above and below a curved window.
    const band = (y0: number, y1: number, r: number, color: THREE.Color, slot: number) => {
      const g = new THREE.CylinderGeometry(
        r,
        r,
        y1 - y0,
        18,
        1,
        true,
        side > 0 ? 0 : -Math.PI / 2,
        Math.PI / 2,
      );
      b.slot = slot as typeof b.slot;
      b.tag = Z.Rear;
      b.push().translate(side * (BW - TOP_R), (y0 + y1) / 2, TAIL - TOP_R);
      b.geometry(g, color);
      b.pop();
    };
    band(BELT, WIN_LOW, TOP_R, body, M.Paint);
    band(WIN_LOW, WIN_TOP, TOP_R - 0.01, glass, M.Glass);
    band(WIN_TOP, TUCK, TOP_R, body, M.Paint);
    // The corner window starts on the side, ahead of the curve.
    const zs = TAIL - TOP_R - 0.1;
    b.block(
      side * (BW - 0.02),
      (BELT + WIN_LOW) / 2,
      zs + 0.05,
      0.04,
      WIN_LOW - BELT,
      0.1,
      body,
      M.Paint,
      Z.Rear,
    );
    b.block(
      side * (BW - 0.02),
      (WIN_TOP + TUCK) / 2,
      zs + 0.05,
      0.04,
      TUCK - WIN_TOP,
      0.1,
      body,
      M.Paint,
      Z.Rear,
    );
    b.block(
      side * (BW - 0.01),
      (WIN_LOW + WIN_TOP) / 2,
      zs + 0.05,
      0.012,
      WIN_TOP - WIN_LOW,
      0.1,
      glass,
      M.Glass,
      Z.Glass,
    );
    // Rear barn doors from the tub floor to the roof, each with a round-cornered window.
    const door = new THREE.Shape(
      rounded([
        [side * 0.005, LOW + 0.01],
        [side * DOOR_X, LOW + 0.01, 0.03],
        [side * DOOR_X, TUCK - 0.005, 0.03],
        [side * 0.005, TUCK - 0.005],
      ]),
    );
    door.holes.push(
      new THREE.Path(
        rounded([
          [side * 0.07, WIN_LOW + 0.01, 0.07],
          [side * 0.07, WIN_TOP - 0.02, 0.07],
          [side * 0.49, WIN_TOP - 0.02, 0.07],
          [side * 0.49, WIN_LOW + 0.01, 0.07],
        ]),
      ),
    );
    extrudeZ(b, door, TAIL - 0.035, TAIL, body, M.Paint, Z.Rear, 0.008);
    b.block(side * 0.28, (WIN_LOW + WIN_TOP) / 2, TAIL - 0.025, 0.44, 0.4, 0.008, glass, M.Glass, Z.Glass);
    // Shut line and exposed hinges on each door's outer edge.
    b.block(
      side * (DOOR_X + 0.004),
      (LOW + CAP) / 2,
      TAIL + 0.002,
      0.008,
      CAP - LOW,
      0.006,
      rubber,
      M.Rubber,
      Z.Rear,
    );
    for (const y of [0.5, 1.2]) {
      b.block(side * (DOOR_X - 0.02), y, TAIL + 0.01, 0.07, 0.07, 0.02, body, M.Paint, Z.Rear, 0.006);
      b.rod(
        { x: side * (DOOR_X + 0.005), y: y - 0.045, z: TAIL + 0.02 },
        { x: side * (DOOR_X + 0.005), y: y + 0.045, z: TAIL + 0.02 },
        0.011,
        steel,
      );
    }
    // Upright combination lamps on the lower corner panels, clear of the doors.
    const tx = side * 0.63;
    b.block(tx, 0.42, TAIL + 0.012, 0.1, 0.24, 0.025, rubber, M.Rubber, Z.Rear, 0.01);
    b.block(tx, 0.495, TAIL + 0.026, 0.078, 0.07, 0.012, red, M.Red, Z.Rear, 0.006);
    b.block(tx, 0.42, TAIL + 0.026, 0.078, 0.065, 0.012, amber, M.Amber, Z.Rear, 0.006);
    b.block(tx, 0.345, TAIL + 0.026, 0.078, 0.055, 0.012, lamp, M.Lamp, Z.Rear, 0.006);
  }
  // Stamped panel low on the right door (behind the jerry can; the spare carrier is on the
  // left door), the right door's handle, and the badges on the right corner.
  b.block(0.28, 0.52, TAIL + 0.004, 0.4, 0.22, 0.012, livery.body, M.Paint, Z.Rear, 0.02);
  b.block(0, (LOW + CAP) / 2, TAIL + 0.002, 0.008, CAP - LOW, 0.006, rubber, M.Rubber, Z.Rear);
  b.block(0.09, 0.82, TAIL + 0.012, 0.11, 0.025, 0.025, steel, M.Metal, Z.Rear);
  b.block(0.68, 0.62, TAIL + 0.003, 0.13, 0.03, 0.006, chrome, M.Metal, Z.Rear, 0.003);
}

function roof(b: VehicleBuilder, livery: Livery): void {
  const cream = livery.roof;
  // White hardtop cap overhanging the screen, rounded at the back over the curved windows.
  planProfile(
    b,
    plan(DOOR_Z - 0.08, TAIL + 0.012, BW + 0.015, 0.06, TOP_R + 0.015),
    CAP,
    ROOF,
    cream,
    Z.Roof,
    0.03,
  );
  for (const side of [-1, 1])
    b.block(
      side * (BW + 0.02),
      CAP + 0.008,
      (DOOR_Z + TAIL - TOP_R - 0.02) / 2,
      0.012,
      0.016,
      TAIL - TOP_R - 0.02 - DOOR_Z,
      cream,
      M.Paint,
      Z.Roof,
      0.005,
    );
}

/** The short-wheelbase body in a livery; `extras` adds what that livery carries on top. */
export function buildVehicleBody(
  tuning: VehicleTuning,
  wheel: THREE.BufferGeometry,
  livery: Livery = standardLivery,
  extras?: { aerialSide: -1 | 1; add(b: VehicleBuilder): void },
): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  for (const [z0, z1, w] of [
    [-0.7, 0.64, 1.5],
    [0.64, 1.66, 1.04],
    [1.66, 1.86, 1.5],
  ])
    b.block(0, 0.2, (z0 + z1) / 2, w, 0.06, z1 - z0, rubber, M.Rubber, Z.Trim);
  front(b, livery);
  windscreen(b, livery);
  sides(b, livery);
  rear(b, livery);
  roof(b, livery);
  addVehicleInterior(b, tuning.engine.redlineRpm);
  addVehicleEquipment(b, tuning, wheel, extras?.aerialSide);
  extras?.add(b);
  return cleanGeometry(subdivideSurface(b.build(), (c, n) => n.y > 0.95 && c.y > 0.7 && c.y < CAP, 1));
}
