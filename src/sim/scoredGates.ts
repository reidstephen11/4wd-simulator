import type { VehicleId } from '../data/vehicle';
import { betterRun, type CrawlBests } from './crawlRuns';
import { GateCount, type CarFootprint, type GateEvent } from './gateCount';
import type { TrackInfo } from './world/features';
import { trailProgress } from './world/crawlTrail';

export interface GateCourseDef {
  id: string;
  name: string;
  trackId: string;
}

export const gatePenalties = { flag: 25, missed: 100, reverse: 5, knock: 5, winch: 50 };
export const gateScore = (points: number): number => Math.max(0, 1000 - points);

export interface GateCourseResult {
  seconds: number;
  points: number;
  score: number;
  flags: number;
  missed: number;
  reverses: number;
  knocks: number;
  winches: number;
}

export type ScoredGateEvent =
  | { type: 'started' }
  | { type: 'gate'; event: GateEvent }
  | { type: 'finished'; result: GateCourseResult; best: boolean }
  | { type: 'failed'; reason: 'left the course' | 'rolled' | 'teleported' | 'changed vehicle' };

export interface GateCourseInput {
  x: number;
  z: number;
  car: CarFootprint;
  vehicle: VehicleId;
  tilt: number;
  knock: boolean;
  winch: boolean;
  dt: number;
}

/** A complete attempt starts at gate 1. Bests rank penalties first, then time. */
export class ScoredGates {
  active = false;
  seconds = 0;
  reverses = 0;
  knocks = 0;
  winches = 0;
  private vehicle: VehicleId = 'shortie';
  private lastX = NaN;
  private lastZ = NaN;
  private furthest = 0;
  private low = 0;
  private reversing = false;
  private knockWait = 0;
  private winchWas = false;

  constructor(
    readonly def: GateCourseDef,
    readonly gates: GateCount,
    private readonly track: TrackInfo,
    private readonly bests: CrawlBests,
  ) {}

  best(vehicle: VehicleId) {
    const b = this.bests[`gates/${this.def.id}/${vehicle}`];
    return b && Number.isFinite(b.points) && b.points >= 0 && Number.isFinite(b.seconds) && b.seconds >= 0
      ? b
      : undefined;
  }

  cancel(): void {
    this.active = false;
    this.gates.reset();
    this.lastX = this.lastZ = NaN;
  }

  get points(): number {
    const p = gatePenalties;
    return (
      this.gates.flags * p.flag +
      this.gates.missed * p.missed +
      this.reverses * p.reverse +
      this.knocks * p.knock +
      this.winches * p.winch
    );
  }

  hud() {
    return this.active
      ? {
          next: this.gates.next,
          total: this.gates.total,
          passed: this.gates.passed,
          missed: this.gates.missed,
          flags: this.gates.flags,
          course: { name: this.def.name, seconds: this.seconds, score: gateScore(this.points) },
        }
      : null;
  }

  update(i: GateCourseInput): ScoredGateEvent[] {
    const moved = Math.hypot(i.x - this.lastX, i.z - this.lastZ);
    this.lastX = i.x;
    this.lastZ = i.z;
    const p = trailProgress(this.track, i.x, i.z);
    const reason =
      moved >= 5
        ? 'teleported'
        : i.tilt >= 75
          ? 'rolled'
          : p.distance > this.track.def.width / 2 + 3
            ? 'left the course'
            : this.active && i.vehicle !== this.vehicle
              ? 'changed vehicle'
              : null;
    if (reason) {
      const was = this.active;
      this.cancel();
      return was ? [{ type: 'failed', reason }] : [];
    }
    const events = this.gates.update(i.x, i.z, i.car);
    const out: ScoredGateEvent[] = [];
    if (!this.active) {
      const passed = events.find((e) => e.type === 'passed');
      if (!passed) return [];
      if (passed.n !== 1) {
        this.gates.reset();
        return [];
      }
      this.active = true;
      this.vehicle = i.vehicle;
      this.seconds = 0;
      this.reverses = this.knocks = 0;
      this.winches = i.winch ? 1 : 0;
      this.winchWas = i.winch;
      this.knockWait = 0;
      this.furthest = this.low = p.along;
      this.reversing = false;
      out.push({ type: 'started' });
    } else {
      this.seconds += i.dt;
      this.knockWait = Math.max(0, this.knockWait - i.dt);
      if (i.knock && this.knockWait === 0) {
        this.knocks++;
        this.knockWait = 0.8;
      }
      if (i.winch && !this.winchWas) this.winches++;
      this.winchWas = i.winch;
      if (!this.reversing) {
        this.furthest = Math.max(this.furthest, p.along);
        if (p.along < this.furthest - 0.5) {
          this.reverses++;
          this.reversing = true;
          this.low = p.along;
        }
      } else {
        this.low = Math.min(this.low, p.along);
        if (p.along > this.low + 0.4) {
          this.reversing = false;
          this.furthest = p.along;
        }
      }
    }
    for (const event of events) {
      if (event.type !== 'finished') {
        out.push({ type: 'gate', event });
        continue;
      }
      const result: GateCourseResult = {
        seconds: this.seconds,
        points: this.points,
        score: gateScore(this.points),
        flags: this.gates.flags,
        missed: this.gates.missed,
        reverses: this.reverses,
        knocks: this.knocks,
        winches: this.winches,
      };
      const best = result.missed === 0 && betterRun(result, this.best(this.vehicle));
      if (best)
        this.bests[`gates/${this.def.id}/${this.vehicle}`] = {
          points: result.points,
          seconds: result.seconds,
        };
      this.active = false;
      out.push({ type: 'finished', result, best });
    }
    return out;
  }
}
