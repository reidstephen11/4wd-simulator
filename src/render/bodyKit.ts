/**
 * Small parts drawn the same way on several bodies: stroke lettering, the white number plate
 * and the pressed-steel jerry can. Each copy was moved here unchanged (v1.59), so the bodies
 * build the same triangles as before.
 */
import * as THREE from 'three';
import {
  BodyZone as Z,
  VehicleBuilder,
  VehicleMaterial as M,
  type VehicleMaterialId,
} from './vehicleGeometry';

/** Stroke characters in a unit box (x right, y up): one segment per [x0, y0, x1, y1]. */
export const GLYPHS: Record<string, number[][]> = {
  '0': [
    [0, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [0, 1, 0, 0],
  ],
  '1': [
    [0.55, 0, 0.55, 1],
    [0.2, 0.75, 0.55, 1],
  ],
  '3': [
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0.25, 0.5, 1, 0.5],
  ],
  '4': [
    [0.75, 0, 0.75, 1],
    [0.75, 1, 0, 0.35],
    [0, 0.35, 1, 0.35],
  ],
  '5': [
    [1, 1, 0, 1],
    [0, 1, 0, 0.5],
    [0, 0.5, 1, 0.5],
    [1, 0.5, 1, 0],
    [1, 0, 0, 0],
  ],
  '6': [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0.5],
    [1, 0.5, 0, 0.5],
  ],
  '7': [
    [0, 1, 1, 1],
    [1, 1, 0.3, 0],
  ],
  '8': [
    [0, 0, 1, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0.5, 1, 0.5],
  ],
  '9': [
    [1, 0.5, 0, 0.5],
    [0, 0.5, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  '-': [[0.15, 0.5, 0.85, 0.5]],
  A: [
    [0, 0, 0.5, 1],
    [0.5, 1, 1, 0],
    [0.2, 0.42, 0.8, 0.42],
  ],
  C: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  F: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0.5, 0.75, 0.5],
  ],
  D: [
    [0, 0, 0, 1],
    [0, 1, 0.7, 1],
    [0.7, 1, 1, 0.7],
    [1, 0.7, 1, 0.3],
    [1, 0.3, 0.7, 0],
    [0.7, 0, 0, 0],
  ],
  H: [
    [0, 0, 0, 1],
    [1, 0, 1, 1],
    [0, 0.5, 1, 0.5],
  ],
  J: [
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0.3],
  ],
  N: [
    [0, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 1, 1],
  ],
  O: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  R: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0, 0.5],
    [0.35, 0.5, 1, 0],
  ],
  T: [
    [0, 1, 1, 1],
    [0.5, 1, 0.5, 0],
  ],
  V: [
    [0, 1, 0.5, 0],
    [0.5, 0, 1, 1],
  ],
  Y: [
    [0, 1, 0.5, 0.5],
    [1, 1, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0],
  ],
  Z: [
    [0, 1, 1, 1],
    [1, 1, 0, 0],
    [0, 0, 1, 0],
  ],
};

/** The stroke font with the letters a LAND CRUISER badge needs as well (the LC79's guards, the Troop Carrier's stripe). */
export const BADGE_GLYPHS: typeof GLYPHS = {
  ...GLYPHS,
  ' ': [],
  L: [
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  U: [
    [0, 1, 0, 0.15],
    [0, 0.15, 0.3, 0],
    [0.3, 0, 0.7, 0],
    [0.7, 0, 1, 0.15],
    [1, 0.15, 1, 1],
  ],
  I: [[0.5, 0, 0.5, 1]],
  S: [
    [1, 1, 0, 1],
    [0, 1, 0, 0.5],
    [0, 0.5, 1, 0.5],
    [1, 0.5, 1, 0],
    [1, 0, 0, 0],
  ],
  E: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0.5, 0.8, 0.5],
  ],
};

export interface StrokeOpts {
  /** Character width and height, and the spacing from one character to the next. */
  w: number;
  h: number;
  pitch: number;
  /** Stroke radius. */
  radius: number;
  colour: THREE.Color;
  slot: VehicleMaterialId;
  zone: number;
  z: number;
  /**
   * The first character's corner (left of the box when `dir` is 1, right when -1) and its
   * bottom, with the text running along x in `dir`. Leave x out to centre the text on
   * x = y = 0, running towards -x, as on a plate whose face looks along -z.
   */
  x?: number;
  y?: number;
  dir?: 1 | -1;
  /** A table to use in place of GLYPHS, for a body whose letter differs. */
  glyphs?: Record<string, number[][]>;
}

/** Draws `text` in rods, one per glyph segment. */
export function strokeText(b: VehicleBuilder, text: string, o: StrokeOpts): void {
  const glyphs = o.glyphs ?? GLYPHS;
  const { w, h, pitch, z } = o;
  const at =
    o.x === undefined
      ? (i: number, gx: number, gy: number) => {
          const x0 = (i - (text.length - 1) / 2) * pitch;
          return { x: -(x0 + (gx - 0.5) * w), y: (gy - 0.5) * h, z };
        }
      : (i: number, gx: number, gy: number) => {
          const x = o.x as number,
            y = o.y ?? 0;
          return o.dir === 1
            ? { x: x + i * pitch + gx * w, y: y + gy * h, z }
            : { x: x - i * pitch - gx * w, y: y + gy * h, z };
        };
  for (let i = 0; i < text.length; i++)
    for (const [ax, ay, bx, by] of glyphs[text[i]])
      b.rod(at(i, ax, ay), at(i, bx, by), o.radius, o.colour, o.slot, o.zone);
}

/** The white of the plates and of the stroke badges on the Toyota grilles. */
export const PLATE_WHITE = new THREE.Color('#E9E7DD');

/** White number plate with `text` in `ink` (the plate faces -z before `facing` turns it). */
export function numberPlate(
  b: VehicleBuilder,
  x: number,
  y: number,
  z: number,
  facing: 1 | -1,
  text: string,
  ink: THREE.Color,
): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing > 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.36, 0.12, 0.012, PLATE_WHITE, M.Lamp, Z.Trim, 0.006);
  strokeText(b, text, {
    w: 0.032,
    h: 0.058,
    pitch: 0.05,
    radius: 0.0034,
    colour: ink,
    slot: M.Rubber,
    zone: Z.Trim,
    z: -0.009,
  });
  b.pop();
}

export interface JerryCanOpts {
  colour: THREE.Color;
  zone: number;
  /** Thickness across x (the body is 0.47 high and 0.34 long). */
  width: number;
  /** Where the two pressed diagonal ribs sit, as an x offset from the centre. */
  ribX: number;
}

/**
 * Pressed-steel jerry can standing upright, its long side along z: body, the two diagonal
 * ribs on one face, the handle on top and the spout cap. Holders and straps are the caller's.
 */
export function jerryCan(b: VehicleBuilder, x: number, y: number, z: number, o: JerryCanOpts): void {
  const { colour: can, zone } = o;
  b.block(x, y, z, o.width, 0.47, 0.34, can, M.Paint, zone, 0.02);
  for (const k of [-1, 1])
    b.rod(
      { x: x + o.ribX, y: y - 0.18, z: z - 0.12 * k },
      { x: x + o.ribX, y: y + 0.18, z: z + 0.12 * k },
      0.008,
      can,
      M.Paint,
      zone,
    );
  b.block(x, y + 0.26, z - 0.08, 0.03, 0.05, 0.12, can, M.Paint, zone, 0.01);
  b.block(x, y + 0.255, z + 0.1, 0.06, 0.04, 0.06, can, M.Paint, zone, 0.01);
}

const armyBlack = new THREE.Color('#1F2320'),
  armyWhite = new THREE.Color('#E8E6DC');

/**
 * Black Army plate with white digits, "48-001" unless told otherwise (the plate faces -z
 * before `facing` turns it), on the Perentie and the Unimog.
 */
export function armyPlate(
  b: VehicleBuilder,
  x: number,
  y: number,
  z: number,
  facing: 1 | -1,
  text = '48-001',
): void {
  b.push()
    .translate(x, y, z)
    .rotate(0, facing > 0 ? Math.PI : 0, 0);
  b.block(0, 0, 0, 0.34, 0.11, 0.012, armyBlack, M.Rubber, Z.Trim, 0.006);
  strokeText(b, text, {
    w: 0.03,
    h: 0.055,
    pitch: 0.047,
    radius: 0.0032,
    colour: armyWhite,
    slot: M.Lamp,
    zone: Z.Trim,
    z: -0.009,
  });
  b.pop();
}
