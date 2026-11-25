import type { Vehicle } from './vehicle/vehicle';
import type { FindDef } from './world/mapTypes';

/** Slower than this (m/s) counts as stopped beside a find. */
export const FIND_STOP_SPEED = 0.6;
/** The HUD says what's there from this far beyond a find's reach (m). */
const FIND_HINT = 18;

/**
 * Things to load off the main line (SPEC §3): stop within a find's reach and what it
 * holds goes on board, once. Which have been taken is kept in camp checkpoints, so
 * restarting from a camp puts back the ones taken after you got there.
 */
export class Finds {
  readonly taken = new Set<string>();

  constructor(
    readonly defs: readonly FindDef[],
    taken: Iterable<string> = [],
  ) {
    this.reset(taken);
  }

  /** Back to a checkpoint's list. */
  reset(taken: Iterable<string>): void {
    this.taken.clear();
    for (const id of taken) if (this.defs.some((f) => f.id === id)) this.taken.add(id);
  }

  /** The nearest find not yet taken within hint range, and whether it is in reach. */
  near(x: number, z: number): { find: FindDef; inReach: boolean } | null {
    let best: { find: FindDef; d: number } | null = null;
    for (const f of this.defs) {
      if (this.taken.has(f.id)) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d <= f.radius + FIND_HINT && (!best || d < best.d)) best = { find: f, d };
    }
    return best && { find: best.find, inReach: best.d <= best.find.radius };
  }

  /** Load a find the vehicle has stopped beside. Returns it when one was taken. */
  update(v: Vehicle): FindDef | null {
    if (Math.abs(v.speed) > FIND_STOP_SPEED) return null;
    const p = v.body.translation();
    const n = this.near(p.x, p.z);
    if (!n?.inReach) return null;
    const c = v.condition;
    const g = n.find.gives;
    c.jerryCans += g.jerryCans ?? 0;
    c.spares += g.spares ?? 0;
    c.plugs += g.plugs ?? 0;
    this.taken.add(n.find.id);
    return n.find;
  }
}
