import * as THREE from 'three';
import { BodyZone as Z, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';
import { unimogColors } from './unimogPaint';
import { continuousTube, ROUND_BEND } from './bodyRefinement';
import { surface } from './unimogSurface';
import { TRAY } from './unimogLayout';
const { canvas, bar } = unimogColors,
  edge = canvas.clone().multiplyScalar(0.76);
/** The tilt sits on the tray's dropsides, just inside its ends (unimogLayout.ts). */
const FRONT = TRAY.front + 0.03,
  BACK = TRAY.back - 0.03,
  HALF = 1.16,
  TOP = 2.26,
  HEM = TRAY.top - 0.04;
export const TILT_BOWS = Array.from({ length: 5 }, (_, i) => FRONT + 0.1 + (i * (BACK - FRONT - 0.2)) / 4);
export const BOARD_Z = (FRONT + BACK) / 2,
  BOARD_Y = 2.36;
export const BOARD_STRAPS = [TILT_BOWS[1], TILT_BOWS[3]];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export function tiltY(x: number, z: number): number {
  const u = Math.abs(x) / HALF;
  let sag = 0;
  for (let i = 0; i < TILT_BOWS.length - 1; i++)
    if (z >= TILT_BOWS[i] && z <= TILT_BOWS[i + 1]) {
      const t = (z - TILT_BOWS[i]) / (TILT_BOWS[i + 1] - TILT_BOWS[i]);
      sag = -0.014 * Math.sin(Math.PI * t) ** 2;
      break;
    }
  return TOP - 0.025 * u * u - 0.16 * u ** 8 + sag;
}
export function addCargoCanvas(b: VehicleBuilder): void {
  surface(
    b,
    16,
    30,
    (u, t) => {
      const x = (2 * u - 1) * HALF,
        z = FRONT + t * (BACK - FRONT);
      return v(x, tiltY(x, z), z);
    },
    v(0, 1, 0),
    canvas,
    M.Fabric,
    Z.Roof,
    0.008,
  );
  for (const side of [-1, 1]) {
    surface(
      b,
      24,
      6,
      (u, t) => {
        const z = FRONT + u * (BACK - FRONT),
          fold = 0.006 * Math.sin(u * Math.PI * 12) * Math.sin(Math.PI * t);
        return v(side * (HALF + fold), HEM + t * (tiltY(HALF, z) - HEM), z);
      },
      v(side, 0, 0),
      canvas,
      M.Fabric,
      Z.Sides,
      0.008,
    );
    b.rod(
      v(side * (HALF + 0.004), HEM + 0.01, FRONT + 0.02),
      v(side * (HALF + 0.004), HEM + 0.01, BACK - 0.02),
      0.005,
      edge,
      M.Fabric,
      Z.Sides,
    );
    for (let z = FRONT + 0.17; z < BACK - 0.1; z += 0.44) {
      b.ring(side * (HALF + 0.008), HEM + 0.014, z, 0.008, 0.002, bar, M.Metal, 'x', Z.Sides);
      b.block(side * 1.157, HEM - 0.04, z, 0.025, 0.024, 0.045, bar, M.Metal, Z.Sides, 0.003);
      b.rod(
        v(side * (HALF + 0.012), HEM + 0.012, z - 0.01),
        v(side * 1.174, HEM - 0.04, z),
        0.0035,
        edge,
        M.Fabric,
        Z.Sides,
      );
      b.rod(
        v(side * 1.174, HEM - 0.04, z),
        v(side * (HALF + 0.012), HEM + 0.012, z + 0.01),
        0.0035,
        edge,
        M.Fabric,
        Z.Sides,
      );
    }
  }
  for (const [z, normal, zone] of [
    [FRONT, -1, Z.Sides],
    [BACK, 1, Z.Rear],
  ] as const) {
    surface(
      b,
      16,
      6,
      (u, t) => {
        const x = (u * 2 - 1) * HALF;
        return v(x, HEM + t * (tiltY(x, z) - HEM), z);
      },
      v(0, 0, normal),
      canvas,
      M.Fabric,
      zone,
      0.008,
    );
  }
  for (const z of TILT_BOWS) {
    b.chain(
      Array.from({ length: 33 }, (_, i) => {
        const x = -HALF + (i * HALF) / 16;
        return v(x, tiltY(x, z) + 0.002, z);
      }),
      0.0025,
      edge,
      M.Fabric,
      Z.Roof,
    );
    for (const side of [-1, 1])
      b.rod(
        v(side * (HALF + 0.008), HEM + 0.01, z),
        v(side * (HALF + 0.008), tiltY(HALF, z) - 0.004, z),
        0.0025,
        edge,
        M.Fabric,
        Z.Sides,
      );
  }
  for (const x of [-0.68, 0, 0.68]) {
    b.block(x, 1.44, BACK + 0.01, 0.034, 0.6, 0.008, edge, M.Fabric, Z.Rear);
    b.block(x, 1.17, BACK + 0.02, 0.05, 0.05, 0.012, bar, M.Metal, Z.Rear, 0.003);
    b.block(x, 1.17, BACK + 0.028, 0.03, 0.03, 0.006, canvas, M.Fabric, Z.Rear);
  }
  for (const x of [-1.01, 1.01])
    b.rod(
      v(x, HEM, BACK + 0.012),
      v(x, tiltY(x, BACK) - 0.025, BACK + 0.012),
      0.0035,
      edge,
      M.Fabric,
      Z.Rear,
    );
  b.rod(v(-1.14, HEM + 0.007, BACK + 0.01), v(1.14, HEM + 0.007, BACK + 0.01), 0.005, edge, M.Fabric, Z.Rear);
}
export function addCargoBows(b: VehicleBuilder): void {
  for (const z of TILT_BOWS) {
    const points = [v(-1.11, HEM + 0.04, z), v(-1.11, tiltY(-1.11, z) - 0.04, z)];
    for (let i = 0; i <= 20; i++) {
      const x = -1.09 + i * 0.109;
      points.push(v(x, tiltY(x, z) - 0.035, z));
    }
    points.push(v(1.11, tiltY(1.11, z) - 0.04, z), v(1.11, HEM + 0.04, z));
    continuousTube(b, points, 0.015, bar, Z.Trim, M.Metal, ROUND_BEND);
  }
}
export function addBoardSupports(b: VehicleBuilder): void {
  for (const z of BOARD_STRAPS) {
    b.block(0, 2.32, z, 2.02, 0.03, 0.05, bar, M.Metal, Z.Roof, 0.004);
    for (const side of [-1, 1]) {
      const bottom = tiltY(side * 0.99, z) - 0.025;
      b.block(side * 0.99, (bottom + 2.32) / 2, z, 0.04, 2.32 - bottom, 0.055, bar, M.Metal, Z.Roof, 0.004);
      b.block(side * 0.99, bottom, z, 0.08, 0.04, 0.11, bar, M.Metal, Z.Roof, 0.005);
    }
  }
  for (const x of [-0.64, 0.64]) b.block(x, 2.32, BOARD_Z, 0.035, 0.03, 1.62, bar, M.Metal, Z.Roof, 0.004);
}
