import { SAVE_KEY } from '../core/config';
import { isVehicleId } from '../data/vehicles';
import type { VehicleId } from '../data/vehicle';
import type { KeyValueStore } from './save/save';

/** Seconds of driving between two recorded poses. */
export const GHOST_STEP = 0.25;
/** Numbers per pose: x, y, z, the rotation's x, y, z, w, and the wheels' mean suspension travel. */
const STRIDE = 8;

/** A pose of the car, for the ghost to draw. */
export interface GhostPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Mean suspension travel of the four wheels (m). */
  suspension: number;
}

/** The best run's path: one pose every GHOST_STEP seconds of driving, from the start. */
export interface GhostTrace {
  version: 1;
  vehicle: VehicleId;
  /** The run's driving time, in seconds. */
  seconds: number;
  /** Poses, STRIDE numbers each, the n-th at n × GHOST_STEP seconds. */
  poses: number[];
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * Records this run's path. Only a run driven from the start makes a whole trace: one resumed
 * from a saved camp after a reload has no record of the driving before it.
 */
export class GhostRecorder {
  private poses: number[] = [];
  readonly complete: boolean;

  constructor(startElapsed: number) {
    this.complete = startElapsed < GHOST_STEP;
  }

  get count(): number {
    return this.poses.length / STRIDE;
  }

  /** Called every step with the run's driving time. */
  record(elapsed: number, pose: GhostPose): void {
    if (!this.complete) return;
    while (this.count * GHOST_STEP <= elapsed) {
      const p = pose;
      this.poses.push(r2(p.x), r2(p.y), r2(p.z), r3(p.qx), r3(p.qy), r3(p.qz), r3(p.qw), r2(p.suspension));
    }
  }

  /** Back to a camp: forget the driving after `elapsed`. */
  rewind(elapsed: number): void {
    const keep = Math.floor(elapsed / GHOST_STEP) + 1;
    this.poses.length = Math.min(this.poses.length, keep * STRIDE);
  }

  trace(vehicle: VehicleId, seconds: number): GhostTrace | null {
    if (!this.complete || this.count < 2) return null;
    return { version: 1, vehicle, seconds, poses: [...this.poses] };
  }
}

/** Where the ghost is `t` seconds into its run (it waits at the end once it has finished). */
export function ghostPoseAt(trace: GhostTrace, t: number, out: GhostPose): GhostPose {
  const n = trace.poses.length / STRIDE;
  const f = Math.min(Math.max(t / GHOST_STEP, 0), n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const k = f - i;
  const a = i * STRIDE;
  const b = a + STRIDE;
  const P = trace.poses;
  const lerp = (j: number): number => P[a + j] + (P[b + j] - P[a + j]) * k;
  out.x = lerp(0);
  out.y = lerp(1);
  out.z = lerp(2);
  // Shortest way round, then normalise: close enough to a slerp for poses a quarter second apart.
  const s =
    P[a + 3] * P[b + 3] + P[a + 4] * P[b + 4] + P[a + 5] * P[b + 5] + P[a + 6] * P[b + 6] < 0 ? -1 : 1;
  const q = [3, 4, 5, 6].map((j) => P[a + j] + (s * P[b + j] - P[a + j]) * k);
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  out.qx = q[0] / len;
  out.qy = q[1] / len;
  out.qz = q[2] / len;
  out.qw = q[3] / len;
  out.suspension = lerp(7);
  return out;
}

/** Each episode keeps its ghost under its own key, apart from the main save, as a trace is large. */
export const ghostKey = (episode: string): string => `${SAVE_KEY}.ghost.${episode}`;

function store(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The saved ghost for an episode; any problem gives null. */
export function loadGhost(episode: string, s: KeyValueStore | null = store()): GhostTrace | null {
  try {
    const raw = s?.getItem(ghostKey(episode));
    if (!raw) return null;
    const g = JSON.parse(raw) as Partial<GhostTrace>;
    if (g.version !== 1 || !isVehicleId(g.vehicle) || typeof g.seconds !== 'number') return null;
    const poses = g.poses;
    if (!Array.isArray(poses) || poses.length < STRIDE * 2 || poses.length % STRIDE !== 0) return null;
    if (!poses.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
    return { version: 1, vehicle: g.vehicle, seconds: g.seconds, poses };
  } catch {
    return null;
  }
}

/** Keep a ghost. Returns false (and never throws) if storage is unavailable or full. */
export function saveGhost(episode: string, trace: GhostTrace, s: KeyValueStore | null = store()): boolean {
  try {
    if (!s) return false;
    s.setItem(ghostKey(episode), JSON.stringify(trace));
    return true;
  } catch {
    return false;
  }
}

/**
 * How far behind (+) or ahead (−) of the ghost the car is, in seconds: this run's time against
 * the ghost's at the nearest point of its path. Follows the car along the path from the start.
 */
export class GhostGap {
  private index = 0;
  /** Search the whole path next time (after a jump back to a camp, or a run resumed from one). */
  private lost: boolean;

  constructor(
    private readonly trace: GhostTrace,
    startElapsed = 0,
  ) {
    this.lost = startElapsed > 0;
  }

  /** Back to a camp: look for the car along the whole path again. */
  reset(): void {
    this.lost = true;
  }

  update(x: number, z: number, elapsed: number): number {
    const P = this.trace.poses;
    const n = P.length / STRIDE;
    const from = this.lost ? 0 : Math.max(0, this.index - 40);
    const to = this.lost ? n : Math.min(n, this.index + 240);
    this.lost = false;
    let best = Infinity;
    for (let i = from; i < to; i++) {
      const d = (P[i * STRIDE] - x) ** 2 + (P[i * STRIDE + 2] - z) ** 2;
      if (d < best) {
        best = d;
        this.index = i;
      }
    }
    return elapsed - this.index * GHOST_STEP;
  }
}

/** Whole seconds as minutes and seconds, e.g. 754 → "12:34". */
export function minSec(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
