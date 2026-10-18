import { crawlScoring as S } from '../data/challenges';
import type { CrawlTrailDef } from './world/mapTypes';
import type { TrackInfo } from './world/features';
import { trailProgress } from './world/crawlTrail';

/** A finished (or abandoned) scored run through one crawl trail. */
export interface CrawlRunResult {
  trailId: string;
  name: string;
  seconds: number;
  reverses: number;
  knocks: number;
  winches: number;
  points: number;
  /** Why the run ended early: drove off the line or rolled the car. */
  dnf?: 'left' | 'rolled';
}

/** Best result per trail: fewest penalty points, then the quickest time. */
export type CrawlBests = Record<string, { points: number; seconds: number }>;

export interface CrawlRun {
  trail: CrawlTrailDef;
  track: TrackInfo;
  /** 1 = driving from the trail's start to its end, -1 = the other way. */
  dir: 1 | -1;
  seconds: number;
  reverses: number;
  knocks: number;
  winches: number;
  /** Distance along the run (m). */
  progress: number;
  readonly length: number;
}

/** What a run needs from the vehicle each step. */
export interface CrawlRunInput {
  x: number;
  z: number;
  tiltDeg: number;
  /** The chassis knocked a rock this step. */
  knock: boolean;
  winchAttached: boolean;
  dt: number;
}

export type CrawlRunEvent =
  | { type: 'started'; run: CrawlRun }
  | { type: 'finished'; result: CrawlRunResult; best: boolean }
  | { type: 'failed'; result: CrawlRunResult };

export function penaltyPoints(r: Pick<CrawlRunResult, 'reverses' | 'knocks' | 'winches'>): number {
  return r.reverses * S.reverse + r.knocks * S.knock + r.winches * S.winch;
}

/** Is `a` a better result than `b` (fewer points, then faster)? */
export function betterRun(
  a: { points: number; seconds: number },
  b?: { points: number; seconds: number },
): boolean {
  return !b || a.points < b.points || (a.points === b.points && a.seconds < b.seconds);
}

/**
 * Optional competition-style scoring on the crawl trails, like a rock-crawling event:
 * driving into either end of a trail's technical line starts the clock; each time the
 * car backs up, the chassis knocks a rock or the winch is hooked on costs penalty
 * points; reaching the far end finishes. Leaving the line or rolling ends the run.
 */
export class CrawlRuns {
  run: CrawlRun | null = null;
  readonly bests: CrawlBests;
  /** Trail just finished or abandoned: it can't restart until the car leaves its ends. */
  private resting: string | null = null;
  private best = 0;
  private low = 0;
  private armed = true;
  private sinceKnock = Infinity;
  private winchWas = false;

  constructor(
    private readonly trails: readonly CrawlTrailDef[],
    private readonly tracks: readonly TrackInfo[],
    bests: CrawlBests = {},
  ) {
    this.bests = { ...bests };
  }

  /** Abandon the run without a result (teleport, return to camp). */
  cancel(): void {
    this.run = null;
  }

  update(i: CrawlRunInput): CrawlRunEvent | null {
    if (!this.run) return this.tryStart(i);
    const r = this.run;
    const p = trailProgress(r.track, i.x, i.z);
    const along = r.dir > 0 ? p.along : r.length - p.along;
    r.seconds += i.dt;
    r.progress = along;
    this.sinceKnock += i.dt;
    if (i.knock && this.sinceKnock > S.knockSpacing) {
      r.knocks++;
      this.sinceKnock = 0;
    }
    if (i.winchAttached && !this.winchWas) r.winches++;
    this.winchWas = i.winchAttached;
    // Backing up: dropping back from the furthest point counts once, until it moves on again.
    if (this.armed) {
      this.best = Math.max(this.best, along);
      if (along < this.best - S.reverseDistance) {
        r.reverses++;
        this.armed = false;
        this.low = along;
      }
    } else {
      this.low = Math.min(this.low, along);
      if (along > this.low + S.rearmDistance) {
        this.armed = true;
        this.best = along;
      }
    }

    if (i.tiltDeg > S.rolledTiltDeg) return this.end('rolled');
    const off = p.distance > r.track.def.width / 2 + S.offLine;
    if (off || along < -S.offLine) {
      // Turning away before really starting isn't a failed run.
      if (r.seconds < S.falseStartSeconds && along < S.startZone + 1) {
        this.run = null;
        this.resting = r.trail.id;
        return null;
      }
      return this.end('left');
    }
    if (along > r.length - S.finishZone) return this.end();
    return null;
  }

  private tryStart(i: CrawlRunInput): CrawlRunEvent | null {
    // Where one trail ends and another begins, the car is nearest the line it is on.
    let start: { trail: CrawlTrailDef; track: TrackInfo; along: number; distance: number } | null = null;
    for (const trail of this.trails) {
      const track = this.tracks.find((t) => t.def.id === trail.trackId);
      if (!track) continue;
      const p = trailProgress(track, i.x, i.z);
      const length = track.poly.length;
      const onLine = p.distance < track.def.width / 2;
      const inZone = p.along < S.startZone || p.along > length - S.startZone;
      if (this.resting === trail.id) {
        if (!onLine || !inZone) this.resting = null;
        continue;
      }
      if (onLine && inZone && (!start || p.distance < start.distance)) start = { trail, track, ...p };
    }
    if (!start) return null;
    const { trail, track } = start;
    const length = track.poly.length;
    const dir = start.along < S.startZone ? 1 : -1;
    this.run = { trail, track, dir, seconds: 0, reverses: 0, knocks: 0, winches: 0, progress: 0, length };
    const along = dir > 0 ? start.along : length - start.along;
    this.best = this.low = along;
    this.armed = true;
    this.sinceKnock = Infinity;
    this.winchWas = i.winchAttached;
    return { type: 'started', run: this.run };
  }

  private end(dnf?: CrawlRunResult['dnf']): CrawlRunEvent {
    const r = this.run as CrawlRun;
    this.run = null;
    this.resting = r.trail.id;
    const result: CrawlRunResult = {
      trailId: r.trail.id,
      name: r.trail.name,
      seconds: r.seconds,
      reverses: r.reverses,
      knocks: r.knocks,
      winches: r.winches,
      points: penaltyPoints(r),
      ...(dnf ? { dnf } : {}),
    };
    if (dnf) return { type: 'failed', result };
    const best = betterRun(result, this.bests[r.trail.id]);
    if (best) this.bests[r.trail.id] = { points: result.points, seconds: result.seconds };
    return { type: 'finished', result, best };
  }
}
