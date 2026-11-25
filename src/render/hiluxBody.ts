import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { VehicleTuning } from '../data/vehicle';
import { plankTuning } from '../data/tools';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { addHiluxInterior } from './hiluxInterior';
import { hiluxColors } from './hiluxPaint';
import { hiluxBullBar } from './hiluxBullbar';
import { cleanGeometry } from './bodyRefinement';
import { mirrorHead, stalk } from './mirrors';
import { GLYPHS, PLATE_WHITE, jerryCan, numberPlate, strokeText } from './bodyKit';
import { mountSpare } from './spares';

/**
 * Early Toyota Hilux 4WD single cab (1979–83) with the factory styleside tub, in deep
 * red. The body is 1.61 m wide with the 4WD's wheel-arch flares standing out to 1.69 m. The
 * bonnet leaves the cowl nearly level and rolls down 0.21 m to the nose, where round
 * headlamps in square bezels sit either side of a black four-panel grille. The cab is low: 0.74 m of body under the
 * waist and 0.5 m of glass and roof above it, with a windscreen leaning back 35 degrees, a
 * vent window in each door and a black vent behind it. The tub's rail is level with the
 * waist; its tailgate carries TOYOTA across it between tall corner lamps, over a chrome step
 * bumper. Added for the game: a black bull bar with the winch inside it, and a ladder rack
 * over the tub that carries the two recovery boards. Ground is 0.52 m below the origin.
 * Photographs, and how the heights were measured: reference/vehicles/hilux-1979-83/SOURCES.md.
 */
const { paint, chrome, bar } = hiluxColors;
const black = new THREE.Color('#1E2120'),
  rubber = new THREE.Color('#262928'),
  steel = new THREE.Color('#8F938D');
const red = new THREE.Color('#B3271F'),
  amber = new THREE.Color('#E5992F'),
  lens = new THREE.Color('#E6E4D2');
const glass = new THREE.Color('#A2BAB6'),
  maroon = new THREE.Color('#6A1F2A');
const argent = new THREE.Color('#6F7472'),
  crease = paint.clone().multiplyScalar(0.82);

/** Body sides, wheel openings and the main heights and stations (vehicle frame). */
const SIDE = 0.805;
/** The 4WD's flares stand 40 mm out of the body sides. */
const FLARE = 0.845;
const FLARE_BAND = 0.085;
const SILL = 0;
const WAIST = 0.74;
const ARCH = { radius: 0.45, cy: -0.03 };
const FRONT_FACE = -2.15;
const NOSE_Z = -2.13;
const BONNET_BACK = -0.905;
const BONNET_HALF = 0.7;
/** The windscreen's foot, at the door's front edge, and its header. */
const COWL = { y: 0.76, z: -0.885 };
const SCREEN_TOP = { y: 1.175, z: -0.6 };
const DOOR = { front: -0.86, back: 0.22 };
const CAB_BACK = 0.36;
const ROOF = 1.24;
const TUB_FRONT = 0.43;
const TAIL = 2.43;
const TUB_FLOOR = 0.33;
const RACK_TOP = 1.31;
/** The rack's front frame, 7 cm behind the tub's front wall, and its rear frame. */
const RACK_Z = { front: TUB_FRONT + 0.07, rear: TAIL - 0.06 };
/** The rear chassis rails stand 0.155 m higher than the front ones: the frame kicks up over the axle. */
const KICK = 0.155;
const AXLE_Z = 1.4;
/** Headlamp centres, and the grille and lamp panel round them. */
const LAMP = { x: 0.58, y: 0.4 };
const PANEL = { top: LAMP.y + 0.1, bottom: LAMP.y - 0.1 };
/** The two pressed lines along the body: one under the door handles, one low on the doors. */
const UPPER_CREASE = 0.665;
const LOWER_CREASE = 0.24;
/** The cab leans in above the waist: 11% narrower at the drip rails. */
const TUMBLEHOME = { lean: 0.11, over: 0.44 };

/** How far the bonnet's shut line falls from the door to the nose, and how it curves. */
const BONNET_FALL = { drop: 0.21, curve: 1.45 };

/**
 * The top of each front guard's side, which is also the bonnet's shut line. It leaves the
 * waist at the door nearly level and rolls down towards the nose: 6 cm lower over the front
 * axle and 21 cm lower at the nose (front-34-left-rn35-2wd.jpg and front-34-left.jpg, measured
 * on the body's side plane). Until v2.10 it was a straight ramp that fell 28 cm, a wedge.
 */
function shoulder(z: number): number {
  const u = THREE.MathUtils.clamp((DOOR.front - 0.01 - z) / (DOOR.front - 0.01 - NOSE_Z), 0, 1);
  return WAIST - BONNET_FALL.drop * u ** BONNET_FALL.curve;
}

/** The bonnet's edge beside the guard, a little above the guard's shoulder. */
const bonnetEdge = (z: number) => shoulder(z) + 0.012;
/** The bonnet's height across the car: crowned, less so towards the windscreen. */
function bonnetY(x: number, z: number): number {
  const t = (z - NOSE_Z) / (BONNET_BACK - NOSE_Z);
  return bonnetEdge(z) + (0.024 - 0.01 * t) * (1 - (x / BONNET_HALF) ** 2);
}

/**
 * A side panel from `start` to `end` with a round wheel opening cut around `axle`: a
 * skin with a return edge, so the well can be looked into, the 4WD's flare round the
 * opening and a dark inner well (the front ones sit further in, clear of the wheels at
 * full lock). `top` is the panel's upper edge at each station.
 */
function archPanel(
  b: VehicleBuilder,
  side: number,
  start: number,
  end: number,
  axle: number,
  top: (z: number) => number,
  zone: number,
  wellX: number,
): void {
  const outer = side * SIDE,
    inner = side * (axle > 0 ? 0.69 : SIDE - 0.045);
  const steps = 36;
  const low = (z: number) =>
    Math.max(SILL, Math.sqrt(Math.max(0, ARCH.radius ** 2 - (z - axle) ** 2)) + ARCH.cy);
  b.slot = M.Paint;
  b.tag = zone;
  for (let i = 0; i < steps; i++) {
    const za = start + ((end - start) * i) / steps,
      zb = start + ((end - start) * (i + 1)) / steps;
    const ya = low(za),
      yb = low(zb);
    const a = { x: outer, y: ya, z: za },
      c = { x: outer, y: top(zb), z: zb };
    const bb = { x: outer, y: yb, z: zb },
      d = { x: outer, y: top(za), z: za };
    const ai = { ...a, x: inner },
      bi = { ...bb, x: inner },
      ci = { ...c, x: inner },
      di = { ...d, x: inner };
    if (side > 0) b.quad(ai, bi, ci, di, paint);
    else b.quad(di, ci, bi, ai, paint);
    if (side > 0) b.quad(a, ai, bi, bb, paint);
    else b.quad(bb, bi, ai, a, paint);
    if (side > 0) b.quad(d, c, ci, di, paint);
    else b.quad(di, ci, c, d, paint);
  }
  const panelPos: number[] = [],
    panelIndex: number[] = [];
  for (let i = 0; i <= steps; i++)
    for (let row = 0; row <= 8; row++) {
      const z = start + ((end - start) * i) / steps,
        t = row / 8,
        y = low(z) + (top(z) - low(z)) * t;
      panelPos.push(outer + side * 0.012 * Math.sin((Math.PI * (y - SILL)) / (top(z) - SILL)), y, z);
    }
  for (let i = 0; i < steps; i++)
    for (let row = 0; row < 8; row++) {
      const a = i * 9 + row,
        c = a + 9;
      if (side < 0) panelIndex.push(a, c, c + 1, a, c + 1, a + 1);
      else panelIndex.push(a, a + 1, c + 1, a, c + 1, c);
    }
  const panel = new THREE.BufferGeometry();
  panel.setAttribute('position', new THREE.Float32BufferAttribute(panelPos, 3));
  panel.setIndex(panelIndex);
  panel.computeVertexNormals();
  b.slot = M.Paint;
  b.tag = zone;
  b.geometry(panel, paint);
  flare(b, side, axle, zone);
  b.block(side * wellX, ARCH.cy + 0.22, axle, 0.03, 0.58, ARCH.radius * 2, black, M.Rubber, Z.Trim);
  // The well's roof stops at the inner skin, so it never shows through the outer one.
  b.block(
    (side * (wellX + SIDE - 0.05)) / 2,
    ARCH.cy + ARCH.radius + 0.057,
    axle,
    SIDE - 0.05 - wellX,
    0.03,
    ARCH.radius * 1.6,
    black,
    M.Rubber,
    Z.Trim,
  );
}

/**
 * The 4WD's wheel-arch flare: a band round the opening that swells out of the body side to a
 * lip 40 mm proud, then turns back into the opening. It fades into the side at each foot.
 */
function flare(b: VehicleBuilder, side: number, axle: number, zone: number): void {
  const R = ARCH.radius;
  // [distance from the opening's centre, how far out of the body side]
  const profile = [
    [R + FLARE_BAND, 0.004],
    [R + FLARE_BAND * 0.6, 0.02],
    [R + 0.014, FLARE - SIDE - 0.004],
    [R - 0.002, FLARE - SIDE],
    [R - 0.012, FLARE - SIDE - 0.014],
    [R - 0.012, -0.04],
  ];
  const foot = Math.asin((SILL - ARCH.cy) / R);
  const n = 44,
    m = profile.length;
  const pos: number[] = [],
    index: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = foot + ((Math.PI - 2 * foot) * i) / n;
    const fade = THREE.MathUtils.clamp(Math.min(a - foot, Math.PI - foot - a) / 0.35, 0.12, 1);
    for (const [r, out] of profile)
      pos.push(
        side * (SIDE + (out > 0 ? out * fade : out)),
        Math.max(SILL, ARCH.cy + r * Math.sin(a)),
        axle - r * Math.cos(a),
      );
  }
  for (let i = 0; i < n; i++)
    for (let k = 0; k < m - 1; k++) {
      const p = i * m + k,
        q = p + m;
      if (side > 0) index.push(p, q, p + 1, p + 1, q, q + 1);
      else index.push(p, p + 1, q, p + 1, q + 1, q);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  b.slot = M.Paint;
  b.tag = zone;
  b.geometry(g, paint);
}

/** Crowned, closed bonnet panel that falls from the cowl to the nose. */
function bonnet(b: VehicleBuilder): void {
  const nx = 32,
    nz = 20,
    pos: number[] = [],
    indices: number[] = [];
  for (let layer = 0; layer < 2; layer++)
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = (i / nx) * 2 - 1,
          z = NOSE_Z + (BONNET_BACK - NOSE_Z) * (j / nz);
        pos.push(u * BONNET_HALF, bonnetY(u * BONNET_HALF, z) - layer * 0.018, z);
      }
  const N = (nx + 1) * (nz + 1);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        c = a + nx + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1, a + N, a + 1 + N, c + N, a + 1 + N, c + 1 + N, c + N);
    }
  const edge = (a: number, c: number) => indices.push(a, a + N, c, c, a + N, c + N);
  for (let i = 0; i < nx; i++) {
    edge(i + 1, i);
    edge(nz * (nx + 1) + i, nz * (nx + 1) + i + 1);
  }
  for (let j = 0; j < nz; j++) {
    edge(j * (nx + 1), (j + 1) * (nx + 1));
    edge((j + 1) * (nx + 1) + nx, j * (nx + 1) + nx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  b.slot = M.Paint;
  b.tag = Z.Front;
  b.geometry(g, paint);
  // Wing crowns close the volume between the bonnet seam and the guard's side.
  for (const side of [-1, 1]) {
    const p: number[] = [],
      idx: number[] = [];
    for (let j = 0; j <= 20; j++)
      for (let i = 0; i <= 8; i++) {
        const z = NOSE_Z + (BONNET_BACK - NOSE_Z) * (j / 20),
          u = i / 8,
          x = (BONNET_HALF + 0.008) * (1 - u) + SIDE * u;
        p.push(side * x, bonnetEdge(z) * (1 - u) + shoulder(z) * u + 0.008 * Math.sin(Math.PI * u), z);
      }
    for (let j = 0; j < 20; j++)
      for (let i = 0; i < 8; i++) {
        const a = j * 9 + i,
          c = a + 9;
        if (side > 0) idx.push(a, c, a + 1, a + 1, c, c + 1);
        else idx.push(a, a + 1, c, a + 1, c + 1, c);
      }
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    wing.setIndex(idx);
    wing.computeVertexNormals();
    b.geometry(wing, paint);
    // The two pressed lines that set off the bonnet's raised centre.
    b.chain(
      Array.from({ length: 13 }, (_, i) => {
        const z = NOSE_Z + 0.03 + ((BONNET_BACK - NOSE_Z - 0.06) * i) / 12;
        return { x: side * 0.34, y: bonnetY(0.34, z) + 0.001, z };
      }),
      0.004,
      crease,
      M.Paint,
      Z.Front,
    );
  }
}

/** Stroke letters the shared table lacks. */
const LETTERS: Record<string, number[][]> = {
  ...GLYPHS,
  W: [
    [0, 1, 0.25, 0],
    [0.25, 0, 0.5, 0.6],
    [0.5, 0.6, 0.75, 0],
    [0.75, 0, 1, 1],
  ],
};

/** Stroke letters on a body side, read from outside: `h` tall, centred at (`y`, `z`). */
function sideText(
  b: VehicleBuilder,
  text: string,
  side: number,
  y: number,
  z: number,
  h: number,
  colour: THREE.Color,
): void {
  const w = h * 0.6,
    pitch = h * 0.85,
    x = side * (SIDE + 0.016);
  // Reading the left side the front of the car is on the reader's left; on the right, the back.
  const dir = side < 0 ? 1 : -1;
  for (let i = 0; i < text.length; i++) {
    const start = (i - (text.length - 1) / 2) * pitch;
    for (const [ax, ay, bx, by] of LETTERS[text[i]])
      b.rod(
        { x, y: y + (ay - 0.5) * h, z: z + dir * (start + (ax - 0.5) * w) },
        { x, y: y + (by - 0.5) * h, z: z + dir * (start + (bx - 0.5) * w) },
        h * 0.07,
        colour,
        M.Metal,
        Z.Sides,
      );
  }
}

function frontEnd(b: VehicleBuilder): void {
  const F = FRONT_FACE;
  bonnet(b);
  b.slot = M.Paint;
  b.tag = Z.Front;
  // The bonnet's front lip, down to the top of the grille panel.
  for (let i = 0; i < 32; i++) {
    const x0 = -BONNET_HALF + (i * 2 * BONNET_HALF) / 32,
      x1 = x0 + (2 * BONNET_HALF) / 32;
    b.quad(
      { x: x0, y: PANEL.top - 0.012, z: F + 0.006 },
      { x: x0, y: bonnetY(x0, NOSE_Z) - 0.003, z: NOSE_Z + 0.002 },
      { x: x1, y: bonnetY(x1, NOSE_Z) - 0.003, z: NOSE_Z + 0.002 },
      { x: x1, y: PANEL.top - 0.012, z: F + 0.006 },
      paint,
    );
  }
  // The same lip under each wing's top, out to the guard's corner: with the nose 6 cm higher
  // (v2.10) the corner was open between the grille panel and the wing.
  const wingFront = (x: number) => {
    const u = THREE.MathUtils.clamp((x - BONNET_HALF - 0.008) / (SIDE - BONNET_HALF - 0.008), 0, 1);
    return bonnetEdge(NOSE_Z) * (1 - u) + shoulder(NOSE_Z) * u + 0.008 * Math.sin(Math.PI * u);
  };
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const span = SIDE - BONNET_HALF;
      const a = BONNET_HALF + (span * i) / 4,
        c = a + span / 4;
      // Keep the front face's winding: x rising from the first corner to the last.
      const [x0, x1] = side > 0 ? [a, c] : [-c, -a];
      b.quad(
        { x: x0, y: PANEL.top - 0.012, z: F + 0.006 },
        { x: x0, y: wingFront(Math.abs(x0)), z: NOSE_Z },
        { x: x1, y: wingFront(Math.abs(x1)), z: NOSE_Z },
        { x: x1, y: PANEL.top - 0.012, z: F + 0.006 },
        paint,
      );
    }
  // Scuttle under the windscreen with its air intake slots.
  b.block(0, COWL.y - 0.02, BONNET_BACK, 1.4, 0.035, 0.08, paint, M.Paint, Z.Front, 0.012);
  for (let i = 0; i < 13; i++)
    b.block(
      -0.48 + i * 0.08,
      COWL.y + 0.001,
      BONNET_BACK,
      0.042,
      0.004,
      0.044,
      black,
      M.Rubber,
      Z.Front,
      0.002,
    );
  // Body-colour front panel, with the black grille recessed between the two lamp bezels
  // (front-34-1980-brochure.jpg, side-1980-4wd.jpg, front-34-right.jpg).
  const gw = 0.94,
    gh = PANEL.top - PANEL.bottom - 0.02;
  b.block(
    0,
    LAMP.y,
    F + 0.015,
    2 * SIDE - 0.02,
    PANEL.top - PANEL.bottom,
    0.055,
    paint,
    M.Paint,
    Z.Front,
    0.02,
  );
  b.block(0, LAMP.y, F - 0.018, gw, gh, 0.022, black, M.Rubber, Z.Front, 0.012);
  for (const side of [-1, 1]) {
    archPanel(b, side, F, DOOR.front - 0.01, -1.4, shoulder, Z.Front, 0.4);

    // Round headlamp in its own square bezel, outboard of the grille.
    const hx = side * LAMP.x;
    b.block(hx, LAMP.y, F - 0.036, 0.2, 0.19, 0.018, argent, M.Metal, Z.Front, 0.02);
    b.block(hx, LAMP.y, F - 0.047, 0.18, 0.17, 0.012, black, M.Rubber, Z.Front, 0.024);
    b.ring(hx, LAMP.y, F - 0.059, 0.086, 0.007, chrome, M.Metal, 'z', Z.Front);
    // Shallow lens with an inset reflector; fine pressed-glass flutes catch the light.
    b.slot = M.Headlamp;
    b.tag = Z.Front;
    b.push()
      .translate(hx, LAMP.y, F - 0.058)
      .scale(1, 1, 0.16);
    b.geometry(new THREE.SphereGeometry(0.08, 20, 8), lens);
    b.pop();
    for (let i = -5; i <= 5; i++) {
      const x = i * 0.013,
        h = Math.sqrt(0.077 ** 2 - x * x);
      b.rod(
        { x: hx + x, y: LAMP.y - h, z: F - 0.073 },
        { x: hx + x, y: LAMP.y + h, z: F - 0.073 },
        0.0009,
        new THREE.Color('#B9C7C6'),
        M.Metal,
        Z.Front,
      );
    }
    // Tall clear parking lamp at the corner, wrapping round onto the guard.
    b.block(side * 0.725, LAMP.y, F - 0.03, 0.07, 0.19, 0.02, argent, M.Metal, Z.Front, 0.008);
    b.block(side * 0.725, LAMP.y, F - 0.04, 0.052, 0.17, 0.01, lens, M.Lamp, Z.Front, 0.005);
    b.block(side * (SIDE + 0.011), LAMP.y, F + 0.05, 0.012, 0.17, 0.08, lens, M.Lamp, Z.Front, 0.005);
    // Amber side lamp on the guard ahead of the wheel opening.
    b.block(side * (SIDE + 0.008), LAMP.y + 0.02, -1.99, 0.014, 0.05, 0.11, black, M.Rubber, Z.Front, 0.008);
    b.block(side * (SIDE + 0.016), LAMP.y + 0.02, -1.99, 0.009, 0.036, 0.092, amber, M.Amber, Z.Front, 0.007);
    // 4WD badge on the guard behind the wheel opening.
    sideText(b, '4WD', side, 0.5, -1.0, 0.055, chrome);
    // The upper pressed line, falling with the guard's shoulder to the nose.
    b.chain(
      Array.from({ length: 9 }, (_, i) => {
        const t = i / 8,
          z = F + 0.2 + (DOOR.front - 0.03 - F - 0.2) * t;
        return { x: side * (SIDE + 0.011), y: shoulder(z) - 0.075 + 0.045 * (1 - t), z };
      }),
      0.004,
      crease,
      M.Paint,
      Z.Sides,
    );
  }
  // Four black panels of slats between three uprights, with the maker's name in the left one.
  for (const x of [-0.235, 0, 0.235])
    b.block(x, LAMP.y, F - 0.036, 0.016, gh - 0.01, 0.016, argent, M.Rubber, Z.Front, 0.004);
  const slat = new THREE.Color('#3A3E3D');
  for (let i = 0; i < 5; i++)
    b.block(
      0,
      LAMP.y - 0.064 + i * 0.032,
      F - 0.032,
      gw - 0.03,
      0.012,
      0.012,
      slat,
      M.Rubber,
      Z.Front,
      0.003,
    );
  const bx = -0.352;
  b.block(bx, LAMP.y, F - 0.044, 0.19, 0.05, 0.012, black, M.Rubber, Z.Front, 0.004);
  strokeText(b, 'TOYOTA', {
    w: 0.017,
    h: 0.026,
    pitch: 0.027,
    radius: 0.0022,
    colour: PLATE_WHITE,
    slot: M.Lamp,
    zone: Z.Front,
    z: F - 0.052,
    x: bx + 0.077,
    y: LAMP.y - 0.013,
    dir: -1,
  });
  // The valance under the grille, the bar's brackets and the sump guard.
  b.block(0, 0.215, F + 0.02, 2 * SIDE - 0.03, 0.18, 0.05, paint, M.Paint, Z.Front, 0.018);
  for (const x of [-0.42, 0.42]) b.block(x, 0.04, F + 0.05, 0.06, 0.06, 0.14, black, M.Metal, Z.Trim);
  b.block(0, -0.05, -1.72, 0.4, 0.15, 0.46, black, M.Metal, Z.Trim, 0.02);
}

function windscreen(b: VehicleBuilder): void {
  const dy = SCREEN_TOP.y - COWL.y,
    dz = SCREEN_TOP.z - COWL.z;
  const lean = Math.atan2(dz, dy),
    L = Math.hypot(dy, dz);
  const pillar = SIDE - 0.06;
  b.push().translate(0, COWL.y, COWL.z).rotate(lean, 0, 0);
  // Glass in a black rubber surround between the body-colour pillars.
  b.block(0, L / 2, 0, 2 * (pillar - 0.055), L - 0.05, 0.008, glass, M.Glass, Z.Glass);
  for (const y of [0.015, L - 0.015])
    b.block(0, y, 0.002, 2 * (pillar - 0.035), 0.026, 0.02, rubber, M.Rubber, Z.Front);
  for (const x of [-pillar + 0.045, pillar - 0.045])
    b.block(x, L / 2, 0.002, 0.026, L, 0.02, rubber, M.Rubber, Z.Front);
  for (const x of [-pillar, pillar])
    b.block(x, L / 2 - 0.02, 0.01, 0.07, L + 0.06, 0.05, paint, M.Paint, Z.Front, 0.012);
  // Wipers parked along the bottom of the screen.
  for (const x of [0.5, -0.12]) {
    b.rod({ x, y: 0.05, z: -0.02 }, { x: x - 0.42, y: 0.08, z: -0.02 }, 0.006, black, M.Rubber, Z.Front);
    b.rod({ x, y: 0.055, z: -0.026 }, { x: x - 0.38, y: 0.085, z: -0.026 }, 0.004, black, M.Rubber, Z.Front);
    // Each arm comes up from a spindle on the scuttle.
    b.rod({ x, y: 0.05, z: -0.02 }, { x: x + 0.025, y: -0.014, z: -0.03 }, 0.006, black, M.Rubber, Z.Front);
    b.block(x + 0.025, -0.014, -0.03, 0.03, 0.02, 0.03, black, M.Rubber, Z.Front, 0.006);
  }
  // Rear-view mirror inside the top of the screen, on a stem from the header.
  b.block(0, L - 0.085, 0.05, 0.2, 0.06, 0.02, black, M.Rubber, Z.Trim, 0.01);
  b.block(0, L - 0.085, 0.061, 0.18, 0.04, 0.002, new THREE.Color('#B4C2C6'), M.Mirror, Z.Trim);
  b.rod({ x: 0, y: L - 0.06, z: 0.045 }, { x: 0, y: L - 0.012, z: 0.012 }, 0.006, black, M.Rubber, Z.Trim);
  b.pop();
}

function cab(b: VehicleBuilder): void {
  // Roof with drip rails, B-pillars and the back wall round its rear window.
  const roofFront = SCREEN_TOP.z - 0.025,
    roofLen = CAB_BACK - roofFront;
  {
    const g = new RoundedBoxGeometry(2 * (SIDE + 0.01), 0.055, roofLen, 3, 0.026);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i);
      const crown =
        0.018 * Math.max(0, 1 - (x / (SIDE + 0.01)) ** 2) * Math.max(0, 1 - (z / (roofLen / 2)) ** 4);
      pos.setY(i, pos.getY(i) + crown);
    }
    g.computeVertexNormals();
    b.slot = M.Paint;
    b.tag = Z.Roof;
    b.push().translate(0, ROOF - 0.035, (roofFront + CAB_BACK) / 2);
    b.geometry(g, paint);
    b.pop();
  }
  const pillarX = SIDE - 0.045;
  for (const side of [-1, 1]) {
    b.rod(
      { x: side * (SIDE + 0.006), y: ROOF - 0.05, z: roofFront + 0.01 },
      { x: side * (SIDE + 0.006), y: ROOF - 0.05, z: CAB_BACK - 0.01 },
      0.008,
      paint,
      M.Paint,
      Z.Roof,
    );
    b.block(
      side * pillarX,
      (WAIST + ROOF - 0.03) / 2,
      (DOOR.back + CAB_BACK) / 2 + 0.01,
      0.07,
      ROOF - WAIST - 0.03,
      CAB_BACK - DOOR.back,
      paint,
      M.Paint,
      Z.Sides,
      0.012,
    );
  }
  const backZ = CAB_BACK - 0.01;
  const wy0 = 0.83,
    wy1 = 1.12,
    wx = 0.56,
    wallW = 2 * (SIDE - 0.025);
  b.block(0, (SILL + wy0) / 2, backZ, wallW, wy0 - SILL, 0.025, paint, M.Paint, Z.Rear);
  b.block(0, (wy1 + ROOF - 0.02) / 2, backZ, wallW - 0.06, ROOF - 0.02 - wy1, 0.025, paint, M.Paint, Z.Rear);
  for (const side of [-1, 1])
    b.block(
      (side * (wx + wallW / 2)) / 2,
      (wy0 + wy1) / 2,
      backZ,
      wallW / 2 - wx,
      wy1 - wy0,
      0.025,
      paint,
      M.Paint,
      Z.Rear,
    );
  b.block(0, (wy0 + wy1) / 2, backZ, wx * 2, wy1 - wy0, 0.008, glass, M.Glass, Z.Glass);
  for (const y of [wy0, wy1])
    b.block(0, y, backZ + 0.014, wx * 2 + 0.02, 0.02, 0.012, rubber, M.Rubber, Z.Rear);
  for (const side of [-1, 1])
    b.block(side * wx, (wy0 + wy1) / 2, backZ + 0.014, 0.02, wy1 - wy0, 0.012, rubber, M.Rubber, Z.Rear);

  const pillarZ = (y: number) => COWL.z + ((y - COWL.y) * (SCREEN_TOP.z - COWL.z)) / (SCREEN_TOP.y - COWL.y);
  const DOOR_FOOT = 0.045;
  for (const side of [-1, 1]) {
    const x = side * (SIDE - 0.015);
    // Door skin below the waist, its seams, a chrome pull handle and the lock.
    {
      const g = new THREE.BoxGeometry(0.03, WAIST - DOOR_FOOT, DOOR.back - DOOR.front, 2, 16, 12);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) + (WAIST - DOOR_FOOT) / 2) / (WAIST - DOOR_FOOT);
        pos.setX(i, pos.getX(i) + side * 0.012 * Math.sin(t * Math.PI));
      }
      g.computeVertexNormals();
      b.slot = M.Paint;
      b.tag = Z.Sides;
      b.push().translate(x, (DOOR_FOOT + WAIST) / 2, (DOOR.front + DOOR.back) / 2);
      b.geometry(g, paint);
      b.pop();
    }
    // The sill under the door.
    b.block(
      side * (SIDE - 0.02),
      DOOR_FOOT / 2 - 0.002,
      (DOOR.front + CAB_BACK) / 2,
      0.04,
      DOOR_FOOT,
      CAB_BACK - DOOR.front + 0.01,
      paint,
      M.Paint,
      Z.Sides,
      0.008,
    );
    for (const z of [DOOR.front - 0.006, DOOR.back + 0.006])
      b.block(
        side * (SIDE + 0.002),
        (DOOR_FOOT + WAIST) / 2,
        z,
        0.006,
        WAIST - DOOR_FOOT,
        0.007,
        black,
        M.Rubber,
        Z.Sides,
      );
    const handleY = UPPER_CREASE + 0.012;
    b.block(
      side * (SIDE + 0.014),
      handleY,
      DOOR.back - 0.13,
      0.02,
      0.035,
      0.14,
      chrome,
      M.Metal,
      Z.Sides,
      0.01,
    );
    b.slot = M.Metal;
    b.tag = Z.Sides;
    b.push()
      .translate(side * (SIDE + 0.01), handleY - 0.1, DOOR.back - 0.06)
      .rotate(0, 0, Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), chrome);
    b.pop();
    // Cab corner behind the door, with the black cab vent just under the waist.
    b.block(
      x,
      (SILL + WAIST) / 2,
      (DOOR.back + CAB_BACK) / 2 + 0.008,
      0.03,
      WAIST - SILL,
      CAB_BACK - DOOR.back - 0.01,
      paint,
      M.Paint,
      Z.Sides,
      0.008,
    );
    const ventZ = (DOOR.back + CAB_BACK) / 2 + 0.012;
    b.block(
      side * (SIDE + 0.002),
      WAIST - 0.065,
      ventZ,
      0.008,
      0.095,
      0.075,
      black,
      M.Rubber,
      Z.Sides,
      0.003,
    );
    for (let i = 0; i < 4; i++)
      b.block(
        side * (SIDE + 0.007),
        WAIST - 0.098 + i * 0.022,
        ventZ,
        0.004,
        0.008,
        0.066,
        argent,
        M.Rubber,
        Z.Sides,
      );
    // Door glass with a vent window at the front, in the door's painted frame.
    const gx = side * (SIDE - 0.03);
    const top = SCREEN_TOP.y - 0.012;
    const vent = -0.625;
    b.slot = M.Glass;
    b.tag = Z.Glass;
    const g0 = { x: gx, y: WAIST + 0.01, z: pillarZ(WAIST + 0.01) + 0.03 },
      g1 = { x: gx, y: WAIST + 0.01, z: DOOR.back - 0.02 },
      g2 = { x: gx, y: top, z: DOOR.back - 0.02 },
      g3 = { x: gx, y: top, z: SCREEN_TOP.z + 0.03 };
    b.quad(g0, g1, g2, g3, glass);
    // The divider runs up to where it meets the windscreen pillar.
    const ventTop = COWL.y + ((vent - COWL.z) * (SCREEN_TOP.y - COWL.y)) / (SCREEN_TOP.z - COWL.z) - 0.035;
    const fx = gx + side * 0.004;
    b.rod(
      { x: fx, y: WAIST + 0.01, z: vent },
      { x: fx, y: ventTop, z: vent },
      0.007,
      black,
      M.Rubber,
      Z.Sides,
    );
    // The frame: along the pillar, across the top and down the back.
    b.rod(
      { x: fx, y: WAIST - 0.02, z: pillarZ(WAIST - 0.02) + 0.022 },
      { x: fx, y: top + 0.004, z: SCREEN_TOP.z + 0.022 },
      0.013,
      paint,
      M.Paint,
      Z.Sides,
    );
    b.rod(
      { x: fx, y: top + 0.004, z: SCREEN_TOP.z + 0.02 },
      { x: fx, y: top + 0.004, z: DOOR.back - 0.01 },
      0.013,
      paint,
      M.Paint,
      Z.Sides,
    );
    b.rod(
      { x: fx, y: WAIST, z: DOOR.back - 0.012 },
      { x: fx, y: top + 0.004, z: DOOR.back - 0.012 },
      0.013,
      paint,
      M.Paint,
      Z.Sides,
    );
    // Weatherstrip along the waist under the glass.
    b.rod(
      { x: side * (SIDE - 0.012), y: WAIST + 0.004, z: DOOR.front + 0.01 },
      { x: side * (SIDE - 0.012), y: WAIST + 0.004, z: DOOR.back - 0.005 },
      0.008,
      black,
      M.Rubber,
      Z.Sides,
    );
    // Black door mirror: a foot on the door under the vent window, a short arm, and a
    // rectangular head (front-34-utility.jpg, front-utility-2wd.jpg).
    const mz = DOOR.front + 0.2;
    b.block(side * (SIDE + 0.012), WAIST - 0.035, mz, 0.022, 0.05, 0.08, black, M.Rubber, Z.Sides, 0.008);
    stalk(
      b,
      [
        { x: side * (SIDE + 0.02), y: WAIST - 0.03, z: mz },
        { x: side * (SIDE + 0.075), y: WAIST + 0.04, z: mz - 0.01 },
      ],
      0.011,
      black,
    );
    mirrorHead(
      b,
      side,
      { x: side * (SIDE + 0.135), y: WAIST + 0.085, z: mz - 0.005 },
      0.15,
      0.115,
      0.045,
      black,
    );
    // The two pressed lines, broken at the door and cab gaps.
    for (const [y, runs] of [
      [
        UPPER_CREASE,
        [
          [DOOR.front + 0.018, DOOR.back - 0.21],
          [TUB_FRONT + 0.02, TAIL - 0.06],
        ],
      ],
      [
        LOWER_CREASE,
        [
          [DOOR.front + 0.018, DOOR.back - 0.018],
          [DOOR.back + 0.03, CAB_BACK - 0.012],
          [TUB_FRONT + 0.02, AXLE_Z - ARCH.radius - FLARE_BAND - 0.03],
          [AXLE_Z + ARCH.radius + FLARE_BAND + 0.03, TAIL - 0.06],
        ],
      ],
    ] as const)
      for (const [start, end] of runs)
        b.block(
          side * (SIDE + (y === UPPER_CREASE ? 0.006 : 0.011)),
          y,
          (start + end) / 2,
          0.006,
          0.008,
          end - start,
          crease,
          M.Paint,
          Z.Sides,
          0.002,
        );
  }
}

function tub(b: VehicleBuilder): void {
  for (const side of [-1, 1]) {
    archPanel(b, side, TUB_FRONT, TAIL, AXLE_Z, () => WAIST, Z.Rear, 0.492);
    // Capping rail along the top of each side with its rolled outer lip, and the rope hooks
    // under the lip (rear-34-right.jpg, rear-utility-2wd.jpg).
    b.block(
      side * (SIDE - 0.045),
      WAIST + 0.012,
      (TUB_FRONT + TAIL) / 2,
      0.12,
      0.025,
      TAIL - TUB_FRONT,
      paint,
      M.Paint,
      Z.Sides,
      0.008,
    );
    b.rod(
      { x: side * (SIDE + 0.012), y: WAIST + 0.004, z: TUB_FRONT + 0.02 },
      { x: side * (SIDE + 0.012), y: WAIST + 0.004, z: TAIL - 0.01 },
      0.015,
      paint,
      M.Paint,
      Z.Sides,
    );
    for (const z of [TUB_FRONT + 0.14, TUB_FRONT + 0.7, AXLE_Z + 0.32, TAIL - 0.2]) {
      b.block(side * (SIDE + 0.016), WAIST - 0.04, z, 0.012, 0.03, 0.03, paint, M.Paint, Z.Sides, 0.004);
      b.rod(
        { x: side * (SIDE + 0.026), y: WAIST - 0.05, z: z - 0.02 },
        { x: side * (SIDE + 0.026), y: WAIST - 0.05, z: z + 0.02 },
        0.005,
        paint,
        M.Paint,
        Z.Sides,
      );
    }
    // The rear corner post with the tall lamp: amber over clear over red.
    b.block(
      side * (SIDE - 0.05),
      (SILL + WAIST) / 2,
      TAIL - 0.02,
      0.1,
      WAIST - SILL,
      0.05,
      paint,
      M.Paint,
      Z.Rear,
      0.01,
    );
    const lx = side * (SIDE - 0.05);
    b.block(lx, 0.42, TAIL + 0.008, 0.085, 0.41, 0.02, black, M.Rubber, Z.Rear, 0.008);
    b.block(lx, 0.555, TAIL + 0.02, 0.07, 0.12, 0.012, amber, M.Amber, Z.Rear, 0.006);
    b.block(lx, 0.455, TAIL + 0.02, 0.07, 0.065, 0.012, lens, M.Metal, Z.Rear, 0.006);
    b.block(lx, 0.325, TAIL + 0.02, 0.07, 0.18, 0.012, red, M.Red, Z.Rear, 0.006);
    // Hollow wheel housing: roof, inboard wall and end walls, open underneath. The inboard wall
    // stands inside the dark well wall, so the tub shows paint and the wheel opening shows dark.
    const innerPaint = paint.clone().multiplyScalar(0.8);
    const HOUSING = { in: 0.4575, out: SIDE - 0.015, top: 0.5 };
    const hx = (HOUSING.in + HOUSING.out) / 2,
      hw = HOUSING.out - HOUSING.in,
      hy = (TUB_FLOOR + HOUSING.top) / 2,
      hh = HOUSING.top - TUB_FLOOR;
    b.block(side * hx, HOUSING.top, AXLE_Z, hw, 0.025, 1.0, innerPaint, M.Paint, Z.Trim);
    b.block(side * (HOUSING.in + 0.0125), hy, AXLE_Z, 0.025, hh, 1.0, innerPaint, M.Paint, Z.Trim);
    for (const dz of [-0.4875, 0.4875])
      b.block(side * hx, hy, AXLE_Z + dz, hw, hh, 0.025, innerPaint, M.Paint, Z.Trim);
  }
  // A mud flap behind each rear wheel, hung from a strip under the tub's edge
  // (rear-utility-2wd.jpg, front-34-left.jpg): its foot is 0.27 m off the ground.
  for (const side of [-1, 1]) {
    const fz = AXLE_Z + ARCH.radius + 0.075;
    b.block(side * 0.69, SILL - 0.008, fz, 0.25, 0.016, 0.03, black, M.Metal, Z.Trim);
    b.block(side * 0.69, SILL - 0.13, fz, 0.24, 0.24, 0.012, rubber, M.Rubber, Z.Trim, 0.004);
  }
  // Square fuel flap on the right side, ahead of the wheel opening.
  b.block(SIDE + 0.011, 0.54, TUB_FRONT + 0.27, 0.006, 0.14, 0.14, black, M.Rubber, Z.Sides, 0.002);
  b.block(SIDE + 0.015, 0.54, TUB_FRONT + 0.27, 0.006, 0.126, 0.126, paint, M.Paint, Z.Sides, 0.002);
  // Front wall behind the cab, the ribbed floor and its underside.
  const inside = paint.clone().multiplyScalar(0.8);
  const wallW = 2 * (SIDE - 0.025);
  b.block(
    0,
    (TUB_FLOOR + WAIST) / 2,
    TUB_FRONT + 0.015,
    wallW,
    WAIST - TUB_FLOOR + 0.02,
    0.03,
    paint,
    M.Paint,
    Z.Rear,
  );
  b.block(
    0,
    (SILL + TUB_FLOOR) / 2,
    TUB_FRONT + 0.015,
    wallW,
    TUB_FLOOR - SILL,
    0.03,
    paint,
    M.Paint,
    Z.Rear,
  );
  // The bed floor has real openings beneath both wheel housings.
  b.block(0, TUB_FLOOR, (TUB_FRONT + TAIL) / 2, 1.0, 0.025, TAIL - TUB_FRONT, inside, M.Paint, Z.Trim);
  for (const side of [-1, 1])
    for (const [from, to] of [
      [TUB_FRONT, AXLE_Z - 0.5],
      [AXLE_Z + 0.5, TAIL],
    ])
      b.block(side * 0.64, TUB_FLOOR, (from + to) / 2, 0.28, 0.025, to - from, inside, M.Paint, Z.Trim);
  for (let i = 0; i < 9; i++) {
    const x = -0.64 + i * 0.16;
    for (const [from, to] of Math.abs(x) < 0.49
      ? [[TUB_FRONT + 0.03, TAIL - 0.03]]
      : [
          [TUB_FRONT + 0.03, AXLE_Z - 0.5],
          [AXLE_Z + 0.5, TAIL - 0.03],
        ])
      b.block(
        x,
        TUB_FLOOR + 0.016,
        (from + to) / 2,
        0.035,
        0.012,
        to - from,
        inside.clone().multiplyScalar(1.1),
        M.Paint,
        Z.Trim,
      );
  }
  // Drop-down tailgate with the maker's name pressed across it, latches at its top corners
  // and its stays (rear-utility-2wd.jpg, rear-34-right.jpg).
  const gateFoot = TUB_FLOOR - 0.05,
    gateW = 2 * (SIDE - 0.1);
  b.block(0, (gateFoot + WAIST) / 2, TAIL, gateW, WAIST - gateFoot, 0.045, paint, M.Paint, Z.Rear, 0.012);
  b.block(0, WAIST - 0.035, TAIL + 0.024, gateW - 0.1, 0.012, 0.008, crease, M.Paint, Z.Rear, 0.003);
  strokeText(b, 'TOYOTA', {
    w: 0.105,
    h: 0.15,
    pitch: 0.2,
    radius: 0.011,
    colour: PLATE_WHITE,
    slot: M.Paint,
    zone: Z.Rear,
    z: TAIL + 0.027,
    x: -(5 * 0.2 + 0.105) / 2,
    y: (gateFoot + WAIST) / 2 - 0.085,
    dir: 1,
  });
  // The rear valance under the tailgate; the bumper's brackets pass under it.
  b.block(
    0,
    (0.15 + gateFoot) / 2,
    TAIL - 0.005,
    gateW + 0.02,
    gateFoot - 0.15,
    0.03,
    paint,
    M.Paint,
    Z.Rear,
    0.008,
  );
  for (const side of [-1, 1]) {
    b.block(
      side * (gateW / 2 - 0.06),
      WAIST - 0.06,
      TAIL + 0.028,
      0.08,
      0.035,
      0.014,
      chrome,
      M.Metal,
      Z.Rear,
      0.008,
    );
    b.rod(
      { x: side * (gateW / 2 - 0.02), y: WAIST - 0.02, z: TAIL - 0.04 },
      { x: side * (SIDE - 0.06), y: WAIST - 0.12, z: TAIL - 0.04 },
      0.006,
      steel,
      M.Metal,
      Z.Rear,
    );
  }
  // Chrome step bumper with a rubber tread, its brackets and the rear plate.
  b.block(0, 0.1, 2.5, 2 * SIDE - 0.02, 0.11, 0.1, chrome, M.Metal, Z.Rear, 0.025);
  b.block(0, 0.158, 2.49, 0.5, 0.012, 0.08, rubber, M.Rubber, Z.Rear, 0.004);
  for (const x of [-0.42, 0.42]) b.block(x, 0.1, 2.42, 0.06, 0.07, 0.14, black, M.Metal, Z.Trim);
  numberPlate(b, 0, 0.1, 2.556, 1, 'RN-036', maroon);
  // A jerry can strapped against the front wall, and a steel toolbox.
  strappedCan(b, -0.55, TUB_FLOOR + 0.25);
  b.block(
    0.4,
    TUB_FLOOR + 0.13,
    TUB_FRONT + 0.2,
    0.62,
    0.24,
    0.3,
    new THREE.Color('#5E625C'),
    M.Metal,
    Z.Trim,
    0.012,
  );
  b.block(
    0.4,
    TUB_FLOOR + 0.255,
    TUB_FRONT + 0.2,
    0.64,
    0.02,
    0.32,
    new THREE.Color('#5E625C'),
    M.Metal,
    Z.Trim,
    0.006,
  );
  b.block(0.4, TUB_FLOOR + 0.2, TUB_FRONT + 0.355, 0.08, 0.03, 0.012, chrome, M.Metal, Z.Trim, 0.004);
}

/** Pressed-steel jerry can, standing upright, with its handles and cap, and a strap round it. */
/**
 * It stands on the floor just behind the rack's headboard, and the strap goes round the can and
 * the headboard's lower rail (the rail used to pass through the can).
 */
function strappedCan(b: VehicleBuilder, x: number, y: number): void {
  const railY = WAIST + 0.03,
    z = RACK_Z.front + 0.2,
    front = RACK_Z.front - 0.024,
    back = z + 0.175;
  jerryCan(b, x, y, z, { colour: new THREE.Color('#5E6A43'), zone: Z.Trim, width: 0.17, ribX: 0.087 });
  b.block(x, railY, (front + back) / 2, 0.19, 0.035, back - front, black, M.Rubber, Z.Trim);
}

function rack(b: VehicleBuilder): void {
  const r = 0.022;
  const fz = RACK_Z.front,
    rz = RACK_Z.rear,
    x = SIDE - 0.045,
    mid = (WAIST + RACK_TOP) / 2;
  // Headboard frame behind the cab (with bars guarding the rear window) and the rear frame.
  for (const z of [fz, rz]) {
    for (const side of [-1, 1])
      b.rod({ x: side * x, y: WAIST + 0.01, z }, { x: side * x, y: RACK_TOP, z }, r, bar, M.Metal, Z.Roof);
    b.rod({ x: -x, y: RACK_TOP, z }, { x, y: RACK_TOP, z }, r, bar, M.Metal, Z.Roof);
  }
  b.rod({ x: -x, y: WAIST + 0.03, z: fz }, { x, y: WAIST + 0.03, z: fz }, 0.018, bar, M.Metal, Z.Roof);
  b.rod({ x: -x, y: mid, z: fz }, { x, y: mid, z: fz }, 0.018, bar, M.Metal, Z.Roof);
  for (const bx of [-0.36, -0.12, 0.12, 0.36])
    b.rod({ x: bx, y: WAIST + 0.03, z: fz }, { x: bx, y: RACK_TOP, z: fz }, 0.012, bar, M.Metal, Z.Roof);
  // Side rails and a middle crossbar the boards lie on.
  for (const side of [-1, 1])
    b.rod({ x: side * x, y: RACK_TOP, z: fz }, { x: side * x, y: RACK_TOP, z: rz }, r, bar, M.Metal, Z.Roof);
  b.rod(
    { x: -x, y: RACK_TOP, z: (fz + rz) / 2 },
    { x, y: RACK_TOP, z: (fz + rz) / 2 },
    r,
    bar,
    M.Metal,
    Z.Roof,
  );
  // Feet clamped to the capping rails.
  for (const z of [fz, rz])
    for (const side of [-1, 1])
      b.block(side * x, WAIST + 0.02, z, 0.08, 0.025, 0.1, bar, M.Metal, Z.Roof, 0.006);
}

function chassisAndRecovery(b: VehicleBuilder, tuning: VehicleTuning, wheel: THREE.BufferGeometry): void {
  // Ladder frame, crossmembers, gearbox and transfer case, propshafts, tank and exhaust. Behind
  // the cab each rail kicks up over the rear axle (KICK), which lifts the spare with it.
  const RAIL = { y: -0.02, h: 0.15, kickFrom: 0.62, kickTo: 0.9, end: 2.35 };
  for (const side of [-1, 1]) {
    const stations = [
      [-1.99, 0.35],
      [-0.8, 0.35],
      [-0.5, 0.42],
      [RAIL.kickFrom + 0.04, 0.42],
    ];
    const profile = new THREE.Shape();
    const points = [
      ...stations.map(([z, x]) => [side * x - 0.045, z]),
      ...[...stations].reverse().map(([z, x]) => [side * x + 0.045, z]),
    ];
    points.forEach(([x, z], i) => (i ? profile.lineTo(x, z) : profile.moveTo(x, z)));
    profile.closePath();
    const rail = new THREE.ExtrudeGeometry(profile, {
      depth: RAIL.h,
      bevelEnabled: false,
    });
    rail.rotateX(Math.PI / 2);
    rail.translate(0, RAIL.y + RAIL.h / 2, 0);
    b.slot = M.Metal;
    b.tag = Z.Trim;
    b.geometry(rail, black);
    // The kick-up and the raised rear length.
    const run = RAIL.kickTo - RAIL.kickFrom;
    b.slot = M.Metal;
    b.push()
      .translate(side * 0.42, RAIL.y + KICK / 2, (RAIL.kickFrom + RAIL.kickTo) / 2)
      .rotate(-Math.atan2(KICK, run), 0, 0);
    b.box(0.09, RAIL.h, Math.hypot(KICK, run) + 0.05, black);
    b.pop();
    b.block(
      side * 0.42,
      RAIL.y + KICK,
      (RAIL.kickTo + RAIL.end) / 2,
      0.09,
      RAIL.h,
      RAIL.end - RAIL.kickTo + 0.04,
      black,
      M.Metal,
      Z.Trim,
    );
  }
  for (const z of [-2.0, -0.85, 0.42]) b.block(0, RAIL.y, z, 0.84, 0.08, 0.08, black, M.Metal, Z.Trim);
  // An outrigger from each front rail to each front spring hanger, which the shared suspension
  // draws 0.48 m out and 0.12 m up: the rails are 0.35 m out there, so the hangers' tops stood
  // in the air. The rear rails are 0.42 m out and raised, and the rear hangers lie against them.
  for (const side of [-1, 1])
    for (const z of [-AXLE_Z - 0.46, -AXLE_Z + 0.46])
      b.block(side * 0.4275, 0.085, z, 0.165, 0.09, 0.06, black, M.Metal, Z.Trim);
  const REAR_CROSS = [1.63, 2.37];
  for (const z of REAR_CROSS) b.block(0, RAIL.y + KICK + 0.03, z, 0.84, 0.06, 0.08, black, M.Metal, Z.Trim);
  b.block(0.04, -0.04, -0.32, 0.38, 0.16, 0.62, black, M.Metal, Z.Trim, 0.03);
  const shaft = steel.clone().multiplyScalar(0.6);
  b.rod({ x: 0.1, y: -0.08, z: -0.6 }, { x: 0.08, y: -0.11, z: -1.27 }, 0.03, shaft);
  b.rod({ x: 0.0, y: -0.07, z: 0.0 }, { x: 0.05, y: -0.1, z: 1.28 }, 0.034, shaft);
  // Tank and shield sit between the chassis rails, clear of the rear tyre sweep.
  b.block(-0.12, 0.06, 0.6, 0.26, 0.24, 0.66, black, M.Metal, Z.Trim);
  b.block(-0.12, -0.075, 0.6, 0.32, 0.02, 0.72, steel.clone().multiplyScalar(0.45), M.Metal, Z.Trim);
  b.rod({ x: 0.3, y: -0.06, z: -1.3 }, { x: 0.3, y: -0.08, z: 0.3 }, 0.026, steel);
  b.slot = M.Metal;
  b.tag = Z.Trim;
  b.push()
    .translate(0.3, -0.07, 0.62)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 12), shaft);
  b.pop();
  // The tailpipe climbs over the rear axle inside the frame, crosses over the right-hand rail
  // under the tub's floor, and comes down behind the wheel and its mud flap. It used to run
  // straight back at axle height, through the rail.
  b.chain(
    [
      { x: 0.3, y: -0.07, z: 0.86 },
      { x: 0.3, y: 0.07, z: 1.12 },
      { x: 0.3, y: 0.07, z: 1.36 },
      { x: 0.31, y: 0.255, z: 1.5 },
      { x: 0.34, y: 0.255, z: 1.86 },
      { x: 0.56, y: 0.255, z: 2.02 },
      { x: 0.62, y: 0.0, z: 2.14 },
      { x: 0.64, y: -0.03, z: 2.3 },
    ],
    0.024,
    steel,
    M.Metal,
    Z.Trim,
  );
  // The spare wheel slung flat under the back of the tub, against the underside of the raised
  // rails, on two cradle bars hung from the two rear crossmembers. Its cradle is 0.35 m off the
  // ground; until v2.09 the rails ran straight and it hung 0.19 m off the ground, below the axle.
  const railFoot = RAIL.y + KICK - RAIL.h / 2;
  const spareY = railFoot - tuning.wheelWidth / 2 - 0.01,
    cradleY = spareY - tuning.wheelWidth / 2 - 0.015;
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: 0, y: spareY, z: 2.02 }, 'down', black);
  for (const x of [-0.24, 0.24]) {
    b.block(x, cradleY, 2.02, 0.05, 0.03, 0.8, black, M.Metal, Z.Trim);
    // A hanger at each end of each bar, up to a crossmember, clear of the tyre.
    for (const z of REAR_CROSS)
      b.rod({ x, y: cradleY, z }, { x, y: RAIL.y + KICK + 0.03, z }, 0.008, black, M.Metal, Z.Trim);
  }
  // The second spare lies flat on the tub floor between the wheel housings, with two ratchet
  // straps over it, one each side of the hub, down to the floor.
  const sy = TUB_FLOOR + 0.03 + tuning.wheelWidth * 0.53,
    sz = 1.75,
    strapY = sy + tuning.wheelWidth * 0.53 + 0.006;
  const orangeStrap = new THREE.Color('#C9762C');
  b.tag = Z.Rear;
  mountSpare(b, wheel, { x: 0, y: sy, z: sz }, 'up', black);
  for (const dz of [-0.17, 0.17]) {
    const reach = Math.sqrt(tuning.wheelRadius ** 2 - dz ** 2) - 0.02;
    b.block(0, strapY, sz + dz, 2 * reach, 0.008, 0.05, orangeStrap, M.Fabric, Z.Rear);
    for (const side of [-1, 1])
      b.rod(
        { x: side * reach, y: strapY, z: sz + dz },
        { x: side * (reach + 0.06), y: TUB_FLOOR + 0.03, z: sz + dz },
        0.01,
        orangeStrap,
        M.Fabric,
        Z.Rear,
      );
  }

  // Steel bar in place of the bumper: a heavy beam with a hoop over the grille and a branch
  // out over each headlamp. It covers the factory bumper lamps, so the amber park and
  // indicator lamps sit in the beam's ends, as bar makers fitted them.
  // The beam's front face is at z -2.32 with an 8 mm bevel, so the lamps and plate sit on it.
  const face = -2.328;
  hiluxBullBar(b, bar);
  for (const side of [-1, 1]) {
    b.block(side * 0.62, 0.1, face - 0.004, 0.15, 0.06, 0.012, black, M.Rubber, Z.Front, 0.006);
    b.block(side * 0.62, 0.1, face - 0.012, 0.13, 0.044, 0.01, amber, M.Amber, Z.Front, 0.005);
  }
  numberPlate(b, -0.36, 0.1, face - 0.012, -1, 'RN-036', maroon);
  // The winch is inside the beam, as in any winch bar: what shows is its control box on the
  // beam's top between the hoop's legs and the roller fairlead in the face. Until v2.09 its
  // drum stood on the beam in front of the grille.
  b.block(0, 0.215, -2.25, 0.2, 0.06, 0.09, black, M.Rubber, Z.Front, 0.012);
  const mount = { ...tuning.winchMount, z: -2.38 };
  b.block(mount.x, mount.y, face - 0.004, 0.32, 0.12, 0.012, steel, M.Metal, Z.Front, 0.005);
  b.block(mount.x, mount.y, face - 0.012, 0.2, 0.05, 0.012, black, M.Rubber, Z.Front);
  for (const y of [mount.y - 0.035, mount.y + 0.035])
    b.rod(
      { x: -0.12, y, z: mount.z + 0.02 },
      { x: 0.12, y, z: mount.z + 0.02 },
      0.014,
      steel,
      M.Metal,
      Z.Front,
    );
  for (const x of [-0.13, 0.13])
    b.rod(
      { x, y: mount.y - 0.04, z: mount.z + 0.02 },
      { x, y: mount.y + 0.04, z: mount.z + 0.02 },
      0.014,
      steel,
      M.Metal,
      Z.Front,
    );
  // Whip aerial on the right front wing.
  const aerialY = shoulder(-1.06) + 0.01;
  b.block(0.755, aerialY, -1.06, 0.05, 0.04, 0.05, black, M.Rubber, Z.Front);
  b.rod({ x: 0.755, y: aerialY, z: -1.06 }, { x: 0.775, y: 1.7, z: -1.02 }, 0.004, black, M.Rubber, Z.Roof);
}

export function buildHiluxBody(tuning: VehicleTuning, wheel: THREE.BufferGeometry): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  frontEnd(b);
  windscreen(b);
  cab(b);
  tub(b);
  rack(b);
  chassisAndRecovery(b, tuning, wheel);
  addHiluxInterior(b, tuning.engine.redlineRpm);
  // The factory bench has two adjustable head restraints.
  for (const x of [-0.43, 0.43]) {
    for (const dx of [-0.065, 0.065])
      b.rod(
        { x: x + dx, y: 0.81, z: 0.245 },
        { x: x + dx, y: 0.94, z: 0.245 },
        0.007,
        steel,
        M.Metal,
        Z.Trim,
      );
    b.block(x, 0.955, 0.245, 0.245, 0.16, 0.09, hiluxColors.vinyl, M.Fabric, Z.Trim, 0.025);
  }
  const g = b.build();
  const pos = g.getAttribute('position');
  // The cab leans in above the waist (TUMBLEHOME); the door mirrors stand outside it.
  const inCab = (x: number, y: number, z: number) =>
    z > BONNET_BACK - 0.02 && z < CAB_BACK + 0.02 && y > WAIST && Math.abs(x) < SIDE + 0.016;
  const lean = (y: number) => 1 - TUMBLEHOME.lean * Math.min(1, (y - WAIST) / TUMBLEHOME.over);
  // Retain the builder's smooth normals on tubes/lenses; adjust only the shaped cab.
  const normals = g.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    if (!inCab(x, y, z)) continue;
    pos.setX(i, x * lean(y));
    n.set(normals.getX(i) / lean(y), normals.getY(i), normals.getZ(i)).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  return cleanGeometry(g);
}

/** A 7.00-16 light-truck tyre with a block tread, on a pale steel wheel with six studs. */
export function buildHiluxWheel(tuning: VehicleTuning): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = tuning.wheelRadius,
    w = tuning.wheelWidth;
  const tyre = new THREE.Color('#232624');
  const rim = hiluxColors.wheel;
  const rimR = 0.205;
  b.slot = M.Rubber;
  b.tag = Z.Trim;
  b.push().rotate(0, 0, -Math.PI / 2);
  const profile = [
    [rimR - 0.01, -w * 0.47],
    [r * 0.7, -w * 0.53],
    [r * 0.9, -w * 0.49],
    [r * 0.965, -w * 0.38],
    [r * 0.965, w * 0.38],
    [r * 0.9, w * 0.49],
    [r * 0.7, w * 0.53],
    [rimR - 0.01, w * 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.geometry(new THREE.LatheGeometry(profile, 48), tyre);
  b.pop();
  // Two staggered rows of shoulder blocks and a broken centre rib.
  const blocks = 16;
  for (let i = 0; i < blocks; i++) {
    for (const side of [-1, 1]) {
      const angle = ((i + (side > 0 ? 0.5 : 0)) / blocks) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * w * 0.27, Math.cos(angle) * r * 0.965, Math.sin(angle) * r * 0.965)
        .rotate(angle, side * 0.12, 0);
      b.box(w * 0.38, 0.032, 0.065, tyre);
      b.pop();
    }
    const angle = ((i + 0.25) / blocks) * Math.PI * 2;
    b.push()
      .translate(0, Math.cos(angle) * r * 0.968, Math.sin(angle) * r * 0.968)
      .rotate(angle, 0, 0);
    b.box(w * 0.16, 0.03, 0.055, tyre);
    b.pop();
  }
  for (const side of [-1, 1]) {
    b.ring(side * w * 0.5, 0, 0, r * 0.72, 0.004, tyre.clone().multiplyScalar(1.4), M.Rubber, 'x');
    // Rim flange, the dished centre with round vents, the hub and six wheel nuts.
    b.ring(side * (w * 0.5 - 0.005), 0, 0, rimR, 0.013, rim, M.Paint, 'x');
    b.slot = M.Paint;
    b.push()
      .translate(side * (w * 0.5 - 0.03), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(
      new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, 0.02, 24),
      rim.clone().multiplyScalar(0.88),
    );
    b.pop();
    b.push()
      .translate(side * (w * 0.5 - 0.012), 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.geometry(new THREE.CylinderGeometry(0.115, 0.13, 0.03, 16), rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) / 6) * Math.PI * 2;
      b.slot = M.Rubber;
      b.push()
        .translate(side * (w * 0.5 - 0.016), Math.cos(a) * 0.16, Math.sin(a) * 0.16)
        .rotate(0, 0, -Math.PI / 2);
      b.geometry(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 14), black);
      b.pop();
    }
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
    b.geometry(new THREE.CylinderGeometry(0.046, 0.054, 0.05, 12), steel.clone().multiplyScalar(0.9));
    b.pop();
  }
  return b.build();
}

/** A recovery board strapped on the ladder rack over the tub (index 0 on the left). */
export function buildHiluxPlank(index: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const wood = new THREE.Color('#A9824F');
  const x = index === 0 ? -0.36 : 0.36,
    y = RACK_TOP + 0.05,
    z = 1.36;
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
  for (const dz of [RACK_Z.front - z, RACK_Z.rear - z]) {
    b.block(x, y + 0.03, z + dz, W + 0.01, 0.012, 0.045, black, M.Rubber, Z.Roof);
    b.block(x, RACK_TOP - 0.028, z + dz, W + 0.02, 0.012, 0.045, black, M.Rubber, Z.Roof);
    for (const s of [-1, 1])
      b.block(
        x + (s * (W + 0.02)) / 2,
        (y + 0.03 + RACK_TOP - 0.028) / 2,
        z + dz,
        0.012,
        y + 0.03 - (RACK_TOP - 0.028),
        0.045,
        black,
        M.Rubber,
        Z.Roof,
      );
  }
  return b.build();
}
