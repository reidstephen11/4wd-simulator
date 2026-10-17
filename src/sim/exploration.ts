import type { PoiDef } from './world/mapTypes';

/** Serializable exploration progress for one player. */
export interface ExplorationState {
  discovered: string[];
  lastCampsite: string;
}

/**
 * POI discovery (SPEC §5, §9): entering a POI's radius for the first time discovers it;
 * entering a campsite's radius makes it the "last campsite".
 */
export class Exploration {
  readonly discovered = new Set<string>();
  lastCampsite: string;

  constructor(
    private readonly pois: readonly PoiDef[],
    initial: ExplorationState,
  ) {
    for (const id of initial.discovered) if (pois.some((p) => p.id === id)) this.discovered.add(id);
    this.lastCampsite = pois.some((p) => p.id === initial.lastCampsite && p.kind === 'campsite')
      ? initial.lastCampsite
      : (pois.find((p) => p.kind === 'campsite')?.id ?? '');
  }

  /** Check a position; returns newly discovered POIs and a campsite id if one was entered. */
  check(x: number, z: number): { discovered: PoiDef[]; campsite: string | null } {
    const found: PoiDef[] = [];
    let campsite: string | null = null;
    for (const p of this.pois) {
      const inside = Math.hypot(p.x - x, p.z - z) <= p.radius;
      if (!inside) continue;
      if (!this.discovered.has(p.id)) {
        this.discovered.add(p.id);
        found.push(p);
      }
      if (p.kind === 'campsite' && this.lastCampsite !== p.id) {
        this.lastCampsite = p.id;
        campsite = p.id;
      }
    }
    return { discovered: found, campsite };
  }

  state(): ExplorationState {
    return { discovered: [...this.discovered], lastCampsite: this.lastCampsite };
  }
}
