import type { PropDef, PropKind } from './mapTypes';
import type { Terrain } from './terrain';

/** Collision shape in a prop's local frame (y measured from the ground at the prop origin; -z = front). */
export type PropShape =
  | { type: 'box'; x: number; y: number; z: number; hx: number; hy: number; hz: number }
  | { type: 'cylinder'; x: number; y: number; z: number; r: number; hh: number; axis?: 'x'; sides?: number };

/** Prop dimensions shared by colliders and render models. */
export const propDims = {
  hut: { w: 6, d: 4.6, wall: 2.4, ridge: 3.9 },
  waterTank: { r: 1.15, h: 2.1 },
  fireTower: { spread: 1.7, height: 9, cabin: 3.4, cabinH: 2.5 },
  oldUte: { w: 1.75, l: 4.5, h: 1.5 },
  mine: { width: 2.6, height: 2.6 },
  signpost: { h: 2.1 },
  logSeat: { l: 2.2, r: 0.22, y: 0.2, sides: 7 },
  cattleGrid: { w: 5, d: 2.4 },
} as const;

const shapes: Record<PropKind, PropShape[]> = {
  hut: [{ type: 'box', x: 0, y: 1.95, z: 0, hx: 3, hy: 1.95, hz: 2.3 }],
  waterTank: [{ type: 'cylinder', x: 0, y: 1.05, z: 0, r: 1.15, hh: 1.05 }],
  fireRing: [],
  logSeat: [
    {
      type: 'cylinder',
      x: 0,
      y: propDims.logSeat.y,
      z: 0,
      hh: propDims.logSeat.l / 2,
      r: propDims.logSeat.r,
      axis: 'x',
      sides: propDims.logSeat.sides,
    },
  ],
  signpost: [{ type: 'box', x: 0, y: 1.05, z: 0, hx: 0.08, hy: 1.05, hz: 0.08 }],
  fireTower: [
    { type: 'box', x: -1.7, y: 4.5, z: -1.7, hx: 0.16, hy: 4.5, hz: 0.16 },
    { type: 'box', x: 1.7, y: 4.5, z: -1.7, hx: 0.16, hy: 4.5, hz: 0.16 },
    { type: 'box', x: -1.7, y: 4.5, z: 1.7, hx: 0.16, hy: 4.5, hz: 0.16 },
    { type: 'box', x: 1.7, y: 4.5, z: 1.7, hx: 0.16, hy: 4.5, hz: 0.16 },
    { type: 'box', x: 0, y: 10.25, z: 0, hx: 1.7, hy: 1.25, hz: 1.7 },
  ],
  oldUte: [{ type: 'box', x: 0, y: 0.72, z: 0, hx: 0.88, hy: 0.62, hz: 2.25 }],
  mineEntrance: [
    { type: 'box', x: -1.4, y: 1.3, z: 0, hx: 0.14, hy: 1.3, hz: 0.14 },
    { type: 'box', x: 1.4, y: 1.3, z: 0, hx: 0.14, hy: 1.3, hz: 0.14 },
    { type: 'box', x: 0, y: 1.5, z: 2.2, hx: 1.6, hy: 1.6, hz: 1.6 },
  ],
  cattleGrid: [
    { type: 'box', x: -2.9, y: 0.6, z: 0, hx: 0.12, hy: 0.6, hz: 1.3 },
    { type: 'box', x: 2.9, y: 0.6, z: 0, hx: 0.12, hy: 0.6, hz: 1.3 },
  ],
};

export interface PlacedShape {
  shape: PropShape;
  /** World position of the shape centre. */
  x: number;
  y: number;
  z: number;
  /** Rotation about +y (radians). */
  yaw: number;
}

/** Yaw for a prop whose front (-z) faces compass `headingDeg`. */
export function propYaw(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}

/** Ground height used as a prop's base: lowest point under its footprint so nothing floats. */
export function propBase(p: PropDef, terrain: Terrain): number {
  let min = terrain.heightAt(p.x, p.z);
  for (const [dx, dz] of [
    [1.5, 1.5],
    [-1.5, 1.5],
    [1.5, -1.5],
    [-1.5, -1.5],
  ])
    min = Math.min(min, terrain.heightAt(p.x + dx, p.z + dz));
  return min;
}

export function placedPropShapes(p: PropDef, terrain: Terrain): PlacedShape[] {
  const yaw = propYaw(p.headingDeg);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const base = propBase(p, terrain);
  return shapes[p.kind].map((shape) => ({
    shape,
    x: p.x + shape.x * c + shape.z * s,
    y: base + shape.y,
    z: p.z - shape.x * s + shape.z * c,
    yaw,
  }));
}
