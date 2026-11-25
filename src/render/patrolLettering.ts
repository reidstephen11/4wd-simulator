import * as THREE from 'three';
import { VehicleBuilder, VehicleMaterial as M, BodyZone as Z } from './vehicleGeometry';
const glyphs: Record<string, number[][]> = {
  G: [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0.5],
    [1, 0.5, 0.55, 0.5],
  ],
  Q: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0.6, 0.3, 1.15, -0.1],
  ],
  '0': [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  '6': [
    [1, 1, 0, 1],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0.5],
    [1, 0.5, 0, 0.5],
  ],
  '-': [[0.15, 0.5, 0.85, 0.5]],
  P: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0, 0.5],
  ],
  A: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [0, 0.5, 1, 0.5],
  ],
  T: [
    [0, 1, 1, 1],
    [0.5, 1, 0.5, 0],
  ],
  R: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0.5],
    [1, 0.5, 0, 0.5],
    [0.4, 0.5, 1, 0],
  ],
  O: [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
  ],
  L: [
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  '4': [
    [0, 1, 0, 0.5],
    [0, 0.5, 1, 0.5],
    [1, 1, 1, 0],
  ],
  X: [
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ],
};
/**
 * A badge in stroke capitals on a body panel: `text` centred at `at`, each letter `h` tall,
 * advancing along (`dx`, `dz`), which is the reader's left to right. A space leaves a gap.
 */
export function badgeText(
  b: VehicleBuilder,
  text: string,
  at: { x: number; y: number; z: number },
  dx: number,
  dz: number,
  h: number,
  color: THREE.Color,
  zone: number,
): void {
  const w = h * 0.55,
    pitch = h * 0.82;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    const start = (i - (text.length - 1) / 2) * pitch;
    for (const [ax, ay, bx, by] of glyphs[text[i]]) {
      const u0 = start + (ax - 0.5) * w,
        u1 = start + (bx - 0.5) * w;
      b.rod(
        { x: at.x + dx * u0, y: at.y + (ay - 0.5) * h, z: at.z + dz * u0 },
        { x: at.x + dx * u1, y: at.y + (by - 0.5) * h, z: at.z + dz * u1 },
        h * 0.07,
        color,
        M.Rubber,
        zone,
      );
    }
  }
}
export function plateText(
  b: VehicleBuilder,
  text: string,
  x: number,
  y: number,
  z: number,
  facing: -1 | 1,
): void {
  const color = new THREE.Color('#202326'),
    w = 0.029,
    h = 0.057,
    pitch = 0.045;
  for (let i = 0; i < text.length; i++)
    for (const [ax, ay, bx, by] of glyphs[text[i]]) {
      const start = (i - (text.length - 1) / 2) * pitch;
      b.rod(
        { x: x + facing * (start + (ax - 0.5) * w), y: y + (ay - 0.5) * h, z },
        { x: x + facing * (start + (bx - 0.5) * w), y: y + (by - 0.5) * h, z },
        0.0027,
        color,
        M.Rubber,
        facing < 0 ? Z.Front : Z.Rear,
      );
    }
}
