import * as THREE from 'three';
import type { Livery } from './vehicleBody';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/**
 * Camel Trophy dress for the short-wheelbase 4WD: Land Rover's Sandglow yellow all
 * over, black decals on the doors and bonnet, four roof lamps on the rack and a
 * snorkel up the left windscreen pillar. The decal lettering and the camel are drawn
 * here as flat strokes and a traced outline, not copied artwork.
 */
const sandglow = new THREE.Color('#E0A12B');
export const camelLivery: Livery = { body: sandglow, roof: sandglow };
export const camelRim = sandglow.clone().multiplyScalar(0.9);

const ink = new THREE.Color('#1D1E1B'),
  black = new THREE.Color('#232926'),
  lensColour = new THREE.Color('#E6E3CC'),
  steel = new THREE.Color('#959B94');

type Stroke = ReadonlyArray<readonly [number, number]>;

/** Block capitals as polylines in a cell one unit high; `w` is the advance width. */
const FONT: Record<string, { w: number; strokes: Stroke[] }> = {
  A: {
    w: 0.8,
    strokes: [
      [
        [0, 0],
        [0.4, 1],
        [0.8, 0],
      ],
      [
        [0.17, 0.38],
        [0.63, 0.38],
      ],
    ],
  },
  C: {
    w: 0.8,
    strokes: [
      [
        [0.8, 0.82],
        [0.62, 1],
        [0.18, 1],
        [0, 0.82],
        [0, 0.18],
        [0.18, 0],
        [0.62, 0],
        [0.8, 0.18],
      ],
    ],
  },
  E: {
    w: 0.72,
    strokes: [
      [
        [0.72, 1],
        [0, 1],
        [0, 0],
        [0.72, 0],
      ],
      [
        [0, 0.5],
        [0.56, 0.5],
      ],
    ],
  },
  H: {
    w: 0.8,
    strokes: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0.8, 0],
        [0.8, 1],
      ],
      [
        [0, 0.5],
        [0.8, 0.5],
      ],
    ],
  },
  I: {
    w: 0.2,
    strokes: [
      [
        [0.1, 0],
        [0.1, 1],
      ],
    ],
  },
  L: {
    w: 0.7,
    strokes: [
      [
        [0, 1],
        [0, 0],
        [0.7, 0],
      ],
    ],
  },
  M: {
    w: 0.95,
    strokes: [
      [
        [0, 0],
        [0, 1],
        [0.475, 0.42],
        [0.95, 1],
        [0.95, 0],
      ],
    ],
  },
  O: {
    w: 0.82,
    strokes: [
      [
        [0.2, 0],
        [0.62, 0],
        [0.82, 0.2],
        [0.82, 0.8],
        [0.62, 1],
        [0.2, 1],
        [0, 0.8],
        [0, 0.2],
        [0.2, 0],
      ],
    ],
  },
  P: {
    w: 0.76,
    strokes: [
      [
        [0, 0],
        [0, 1],
        [0.58, 1],
        [0.76, 0.84],
        [0.76, 0.62],
        [0.58, 0.46],
        [0, 0.46],
      ],
    ],
  },
  R: {
    w: 0.78,
    strokes: [
      [
        [0, 0],
        [0, 1],
        [0.58, 1],
        [0.76, 0.84],
        [0.76, 0.64],
        [0.58, 0.48],
        [0, 0.48],
      ],
      [
        [0.42, 0.48],
        [0.78, 0],
      ],
    ],
  },
  S: {
    w: 0.78,
    strokes: [
      [
        [0.78, 0.84],
        [0.6, 1],
        [0.18, 1],
        [0, 0.84],
        [0, 0.66],
        [0.18, 0.52],
        [0.6, 0.48],
        [0.78, 0.34],
        [0.78, 0.16],
        [0.6, 0],
        [0.18, 0],
        [0, 0.16],
      ],
    ],
  },
  T: {
    w: 0.8,
    strokes: [
      [
        [0, 1],
        [0.8, 1],
      ],
      [
        [0.4, 1],
        [0.4, 0],
      ],
    ],
  },
  U: {
    w: 0.8,
    strokes: [
      [
        [0, 1],
        [0, 0.2],
        [0.2, 0],
        [0.6, 0],
        [0.8, 0.2],
        [0.8, 1],
      ],
    ],
  },
  Y: {
    w: 0.8,
    strokes: [
      [
        [0, 1],
        [0.4, 0.5],
        [0.8, 1],
      ],
      [
        [0.4, 0.5],
        [0.4, 0],
      ],
    ],
  },
  ' ': { w: 0.45, strokes: [] },
};

/** Width of `text` at cap height `h`, with `gap` (a share of h) between letters. */
export function textWidth(text: string, h: number, gap = 0.28): number {
  let w = 0;
  for (const ch of text) w += (FONT[ch]?.w ?? 0.6) * h + gap * h;
  return w - gap * h;
}

/**
 * Flat lettering centred on the builder's origin in its local x–y plane, facing +z.
 * Each segment is a quad with square ends, so joints fill in.
 */
export function letter(b: VehicleBuilder, text: string, h: number, weight = 0.17, gap = 0.28): void {
  const hw = (weight * h) / 2;
  let x = -textWidth(text, h, gap) / 2;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`No decal glyph for "${ch}"`);
    for (const stroke of glyph.strokes)
      for (let i = 0; i + 1 < stroke.length; i++) {
        const [ax, ay] = stroke[i],
          [bx, by] = stroke[i + 1];
        const p0 = { x: x + ax * h, y: (ay - 0.5) * h },
          p1 = { x: x + bx * h, y: (by - 0.5) * h };
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const ux = (p1.x - p0.x) / len,
          uy = (p1.y - p0.y) / len;
        const a = { x: p0.x - ux * hw, y: p0.y - uy * hw },
          c = { x: p1.x + ux * hw, y: p1.y + uy * hw };
        // Left of the direction of travel is (-uy, ux).
        b.quad(
          { x: a.x + uy * hw, y: a.y - ux * hw, z: 0 },
          { x: c.x + uy * hw, y: c.y - ux * hw, z: 0 },
          { x: c.x - uy * hw, y: c.y + ux * hw, z: 0 },
          { x: a.x - uy * hw, y: a.y + ux * hw, z: 0 },
          ink,
        );
      }
    x += (glyph.w + gap) * h;
  }
}

/** A one-humped camel walking towards +x, traced in a box 1 wide and about 0.72 high. */
const CAMEL: ReadonlyArray<readonly [number, number]> = [
  [0.08, 0.5],
  [0.13, 0.57],
  [0.25, 0.65],
  [0.36, 0.72],
  [0.46, 0.7],
  [0.56, 0.6],
  [0.66, 0.55],
  [0.73, 0.5],
  [0.79, 0.53],
  [0.83, 0.62],
  [0.87, 0.67],
  [0.87, 0.71],
  [0.9, 0.68],
  [0.97, 0.62],
  [0.98, 0.58],
  [0.9, 0.57],
  [0.85, 0.52],
  [0.8, 0.44],
  [0.72, 0.41],
  [0.67, 0.36],
  [0.68, 0.16],
  [0.7, 0],
  [0.65, 0],
  [0.63, 0.15],
  [0.62, 0.3],
  [0.59, 0.3],
  [0.57, 0.14],
  [0.58, 0],
  [0.53, 0],
  [0.53, 0.14],
  [0.54, 0.32],
  [0.42, 0.34],
  [0.29, 0.33],
  [0.27, 0.15],
  [0.29, 0],
  [0.24, 0],
  [0.22, 0.14],
  [0.21, 0.28],
  [0.19, 0.28],
  [0.17, 0.14],
  [0.17, 0],
  [0.12, 0],
  [0.12, 0.15],
  [0.11, 0.33],
  [0.08, 0.42],
  [0.05, 0.36],
  [0.06, 0.44],
];

/** The camel `width` wide, its feet on the builder's local y = 0, facing +x (or -x). */
export function camel(b: VehicleBuilder, width: number, facing: 1 | -1 = 1): void {
  const pts = CAMEL.map(([x, y]) => new THREE.Vector2((x - 0.52) * width * facing, y * width));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(pts, [])) {
    const p = pts[i];
    let [q, r] = [pts[j], pts[k]];
    // Wind every triangle anticlockwise so it faces +z.
    if ((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) < 0) [q, r] = [r, q];
    b.tri({ x: p.x, y: p.y, z: 0 }, { x: q.x, y: q.y, z: 0 }, { x: r.x, y: r.y, z: 0 }, ink);
  }
}

/** Door, bonnet and side decals, laid 2–3 mm proud of the panels they sit on. */
function decals(b: VehicleBuilder): void {
  b.slot = M.Paint;
  for (const side of [-1, 1] as const) {
    b.tag = Z.Sides;
    // Local x runs the way the lettering reads from outside; the camel walks forwards.
    b.push()
      .translate(side * 0.8275, 0, -0.16)
      .rotate(0, (side * Math.PI) / 2, 0);
    b.push().translate(0, 0.47, 0);
    camel(b, 0.32, side === 1 ? 1 : -1);
    b.pop();
    b.push().translate(0, 0.405, 0);
    letter(b, 'CAMEL', 0.085);
    b.pop();
    b.push().translate(0, 0.3, 0);
    letter(b, 'TROPHY', 0.052, 0.19, 0.42);
    b.pop();
    // The event's name along the rear quarter, above the wheel arch; that panel sits
    // 1.5 cm further in than the door.
    b.tag = Z.Rear;
    b.push().translate(-side * 1.31, 0.72, -0.015);
    letter(b, 'AUSTRALIA', 0.06, 0.17, 0.3);
    b.pop();
    b.pop();
  }
  // Bonnet: the camel and the name read from in front of the car.
  b.tag = Z.Front;
  b.push()
    .translate(0, 0.9275, -1.22)
    .rotate(Math.PI / 2, Math.PI, 0);
  b.push().translate(0, -0.04, 0);
  camel(b, 0.42, 1);
  b.pop();
  b.push().translate(0, -0.15, 0);
  letter(b, 'CAMEL TROPHY', 0.055, 0.18, 0.3);
  b.pop();
  b.pop();
}

/** Raised air intake: a riser from the left wing up the windscreen pillar to a ram head. */
function snorkel(b: VehicleBuilder): void {
  const base = new THREE.Vector3(-0.84, 0.79, -0.8),
    bend = new THREE.Vector3(-0.875, 1.4, -0.66);
  b.block(base.x, base.y + 0.02, base.z, 0.14, 0.04, 0.16, black, M.Rubber, Z.Front, 0.01);
  b.rod(base, bend, 0.046, black, M.Rubber, Z.Front);
  b.rod(bend, { x: bend.x, y: 1.5, z: bend.z }, 0.046, black, M.Rubber, Z.Front);
  // Ram head facing forwards, with a slotted mouth.
  b.block(-0.875, 1.53, -0.7, 0.11, 0.11, 0.15, black, M.Rubber, Z.Front, 0.03);
  for (let i = 0; i < 4; i++)
    b.block(-0.875, 1.497 + i * 0.022, -0.778, 0.085, 0.008, 0.006, steel, M.Metal, Z.Front);
  // Brackets to the windscreen pillar, which leans back about 0.19 m per metre.
  for (const y of [1.1, 1.32]) {
    const on = base.clone().lerp(bend, (y - base.y) / (bend.y - base.y));
    b.rod(on, { x: -0.76, y, z: -0.585 + (y - 1.205) * 0.19 }, 0.01, steel, M.Metal, Z.Front);
  }
}

/** Four round driving lamps on a bar across the front of the roof rack. */
function roofLamps(b: VehicleBuilder): void {
  b.rod({ x: -0.66, y: 1.985, z: -0.43 }, { x: 0.66, y: 1.985, z: -0.43 }, 0.018, black, M.Metal, Z.Roof);
  for (const x of [-0.5, -0.17, 0.17, 0.5]) {
    b.rod({ x, y: 1.985, z: -0.43 }, { x, y: 2.04, z: -0.46 }, 0.012, black, M.Metal, Z.Roof);
    b.slot = M.Rubber;
    b.tag = Z.Roof;
    b.push()
      .translate(x, 2.07, -0.48)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(0.085, 0.07, 0.09, 24), black);
    b.pop();
    b.ring(x, 2.07, -0.527, 0.078, 0.009, steel, M.Metal, 'z', Z.Roof);
    b.slot = M.Lamp;
    b.push().translate(x, 2.07, -0.53).scale(1, 1, 0.25);
    b.geometry(new THREE.SphereGeometry(0.07, 20, 10), lensColour);
    b.pop();
  }
}

/** Everything the Camel Trophy car carries on top of the plain short-wheelbase body. */
export function addCamelTrophyKit(b: VehicleBuilder): void {
  decals(b);
  snorkel(b);
  roofLamps(b);
}
