import { SurfaceId } from '../../data/surfaces';

/**
 * Ruts (v0.30): how far the ground is pressed in where wheels have gone, pass by pass. A grid
 * of small cells, each 0 (untouched) to 1 (as deep as a rut gets), holding only the cells a
 * wheel has pressed. Soft ground takes a rut; hard ground takes none; clay, dirt and grass
 * only when wet. No Three.js here, so it can be tested.
 *
 * Stage one draws it: a tyre mark laid in a rut is shaded to look pressed in
 * (src/render/tyreMarks.ts). The ground itself is not moved, and nothing a wheel feels changes.
 */
export const rutTuning = {
  /** The side of a cell (m): about a tyre's width, so the two wheel tracks stay apart. */
  cell: 0.25,
  /** A rut at depth 1 is this deep (m). */
  maxDepth: 0.08,
  /** The share of what is left to press that one wheel pass presses in, by surface. */
  press: {
    [SurfaceId.BlackSoil]: 0.34,
    [SurfaceId.Mud]: 0.3,
    [SurfaceId.Sand]: 0.16,
  } as Partial<Record<SurfaceId, number>>,
  /** The same for ground that ruts only when wet: the share at full wetness. */
  pressWet: {
    [SurfaceId.Clay]: 0.26,
    [SurfaceId.Dirt]: 0.12,
    [SurfaceId.Grass]: 0.07,
  } as Partial<Record<SurfaceId, number>>,
  /** Cells kept at once: the oldest are forgotten first. About 5 km of single wheel track. */
  maxCells: 20000,
};

export class RutDepth {
  private readonly cells = new Map<number, number>();

  constructor(private readonly maxCells = rutTuning.maxCells) {}

  /** Which cell a point is in. */
  key(x: number, z: number): number {
    const c = rutTuning.cell;
    // Up to 16 km either side of the origin.
    return (Math.floor(x / c) + 65536) * 131072 + Math.floor(z / c) + 65536;
  }

  /** Cells holding a rut. */
  get size(): number {
    return this.cells.size;
  }

  /** How deep the rut is here, 0 to 1. */
  depthAt(x: number, z: number): number {
    return this.cells.get(this.key(x, z)) ?? 0;
  }

  /** The same in metres. */
  metresAt(x: number, z: number): number {
    return this.depthAt(x, z) * rutTuning.maxDepth;
  }

  /**
   * One wheel pass over this spot on this surface, with the ground's wetness (0 dry, 1
   * soaked). Returns how deep the rut is now, 0 to 1.
   */
  press(x: number, z: number, surface: SurfaceId, wetness: number): number {
    const t = rutTuning;
    const share = t.press[surface] ?? (t.pressWet[surface] ?? 0) * Math.min(1, Math.max(0, wetness));
    const k = this.key(x, z);
    const was = this.cells.get(k) ?? 0;
    if (share <= 0) return was;
    const now = was + (1 - was) * share;
    if (was === 0 && this.cells.size >= this.maxCells) {
      // Forget the oldest cell (a Map keeps the order its keys were first set in).
      const oldest = this.cells.keys().next().value;
      if (oldest !== undefined) this.cells.delete(oldest);
    }
    this.cells.set(k, now);
    return now;
  }

  clear(): void {
    this.cells.clear();
  }
}
