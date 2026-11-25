import type { DensePolyline } from './world/polyline';

/**
 * Times the named climbs and descents of an episode (Big Red, Bob's Hill, the concrete).
 * A section runs between the two ends of its track: the clock starts on leaving one end
 * and stops on reaching the other, whichever way it's driven. Coming back to the end it
 * started from, leaving the track (a shortcut), wandering well away from the far end, or
 * taking longer than `maxSeconds` abandons the attempt.
 */
export interface TimedSection {
  id: string;
  name: string;
  a: { x: number; z: number };
  b: { x: number; z: number };
  /** The track's centreline between the ends; without it only the ends count. */
  line?: readonly (readonly [number, number])[];
  /** The track's width (m), for how far off the line still counts as on it. */
  width?: number;
}

/** The timed sections of an episode, one per id that names a generated track. */
export function timedSections(
  ids: readonly string[],
  tracks: readonly { def: { id: string; name?: string; width: number }; poly: DensePolyline }[],
): TimedSection[] {
  return ids.flatMap((id) => {
    const t = tracks.find((tr) => tr.def.id === id);
    if (!t || t.poly.count < 2) return [];
    const line = Array.from({ length: t.poly.count }, (_, k) => [t.poly.xs[k], t.poly.zs[k]] as const);
    const [a, b] = [line[0], line[line.length - 1]];
    return [
      {
        id,
        name: t.def.name ?? id,
        a: { x: a[0], z: a[1] },
        b: { x: b[0], z: b[1] },
        line,
        width: t.def.width,
      },
    ];
  });
}

/** How far off the track's centreline, beyond its half width, still counts as driving it (m). */
const OFF_LINE = 10;

/** Distance from (x, z) to the nearest point of the line. */
function offLine(x: number, z: number, line: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

export interface SectionTime {
  id: string;
  name: string;
  seconds: number;
  /** Previous best, or null if this was the first. */
  best: number | null;
}

const RADIUS = 10;
const maxSeconds = 900;

export class SectionTimes {
  /** Best seconds per section id. */
  readonly bests: Record<string, number>;
  /** This run's times, in the order they were driven. */
  readonly times: SectionTime[] = [];
  private active: { section: TimedSection; from: 'a' | 'b'; seconds: number; left: boolean } | null = null;

  constructor(
    private readonly sections: readonly TimedSection[],
    bests: Record<string, number>,
  ) {
    this.bests = { ...bests };
  }

  /** Back to the start of the run: no attempt under way and no times kept (the bests stay). */
  reset(): void {
    this.active = null;
    this.times.length = 0;
  }

  /** Call every frame; returns a finished time when a section is completed. */
  update(x: number, z: number, dt: number): SectionTime | null {
    const near = (p: { x: number; z: number }) => Math.hypot(x - p.x, z - p.z) <= RADIUS;
    const run = this.active;
    if (run) {
      run.seconds += dt;
      const start = run.section[run.from];
      const end = run.section[run.from === 'a' ? 'b' : 'a'];
      if (!near(start)) run.left = true;
      // The clock starts on leaving the end, not on arriving at it.
      if (!run.left) run.seconds = 0;
      if (near(end)) {
        this.active = null;
        const best = this.bests[run.section.id] ?? null;
        const result = { id: run.section.id, name: run.section.name, seconds: run.seconds, best };
        if (best === null || run.seconds < best) this.bests[run.section.id] = run.seconds;
        this.times.push(result);
        return result;
      }
      // Heading away from the far end (driving on past a section just finished, say) drops it.
      const span = Math.hypot(end.x - start.x, end.z - start.z);
      const away = Math.hypot(x - end.x, z - end.z) > Math.max(span * 1.5, span + 40);
      // So does leaving the track: a shortcut down the spur isn't a time for the concrete.
      const { line, width = 0 } = run.section;
      const off = line !== undefined && offLine(x, z, line) > width / 2 + OFF_LINE;
      if ((run.left && near(start)) || away || off || run.seconds > maxSeconds) this.active = null;
      else return null;
    }
    for (const section of this.sections) {
      if (near(section.a)) this.active = { section, from: 'a', seconds: 0, left: false };
      else if (near(section.b)) this.active = { section, from: 'b', seconds: 0, left: false };
      if (this.active) break;
    }
    return null;
  }
}
