import type { VehicleTuning } from '../data/vehicle';
import type { GateInfo } from './world/features';

/** Further than this in one update (m) is a teleport. */
const MAX_STEP = 5;
/** A flag stake's radius plus a little for the pennant (m). */
const FLAG_REACH = 0.06;

/** The car seen from above: its centre is the point passed to `update`. */
export interface CarFootprint {
  /** Heading as a unit vector on the ground. */
  fx: number;
  fz: number;
  halfLength: number;
  halfWidth: number;
}

/** Half the length and width of a vehicle's body and tyres, seen from above. */
export function footprintSize(t: VehicleTuning): { halfLength: number; halfWidth: number } {
  let halfLength = 0,
    halfWidth = 0;
  for (const b of t.bodyBoxes) {
    halfLength = Math.max(halfLength, Math.abs(b.cz) + b.hz);
    halfWidth = Math.max(halfWidth, Math.abs(b.cx) + b.hx);
  }
  for (const w of t.wheels) {
    halfLength = Math.max(halfLength, Math.abs(w.z) + t.wheelRadius);
    halfWidth = Math.max(halfWidth, Math.abs(w.x) + t.wheelWidth / 2);
  }
  return { halfLength, halfWidth };
}

export type GateEvent =
  | { type: 'passed'; n: number }
  /** Gates skipped on the way to gate `n`, in order. */
  | { type: 'missed'; gates: number[]; n: number }
  /** The car touched one of gate `n`'s flags (once per flag per lap). */
  | { type: 'flag'; n: number; side: 'left' | 'right' }
  | { type: 'finished'; passed: number; missed: number; flags: number };

/**
 * Counts the gates of a gate trail as they are driven, like a marshal on an RC crawler
 * course: driving between a gate's flags in its direction of travel passes it. A gate
 * further on than the next one passes it too, and every gate skipped on the way counts
 * as missed. The count starts at the first gate driven through (so joining the trail
 * part way round misses nothing), and passing the last gate finishes the lap; the next
 * gate driven through after that starts a new one. The lap's result comes once the car is
 * clear of the last gate's flags, so its tail can still touch them. Touching a flag with the car's body or
 * tyres counts once per flag per lap; a flag touched just before the gate that starts a
 * lap counts in that lap.
 */
export class GateCount {
  /** The next gate to drive through (0 until the first gate is passed). */
  next = 0;
  passed = 0;
  missed = 0;
  /** Flags touched this lap. */
  flags = 0;
  readonly total: number;
  private readonly gates: readonly GateInfo[];
  private lastX = NaN;
  private lastZ = NaN;
  /** Flags touched this lap, and those touched while no lap was on ("n:side"). */
  private touched = new Set<string>();
  private touchedBetweenLaps = new Set<string>();
  /** The last gate is passed but the car's tail may still be between its flags. */
  private finishing = false;

  constructor(gates: readonly GateInfo[]) {
    this.gates = [...gates].sort((a, b) => a.n - b.n);
    this.total = this.gates.length ? this.gates[this.gates.length - 1].n : 0;
  }

  reset(): void {
    this.next = 0;
    this.passed = 0;
    this.missed = 0;
    this.flags = 0;
    this.touched.clear();
    this.touchedBetweenLaps.clear();
    this.finishing = false;
    this.lastX = this.lastZ = NaN;
  }

  private get lapOn(): boolean {
    return this.next > 0 && (this.next <= this.total || this.finishing);
  }

  /** The car's centre is now at (x, z); with its footprint, flags it touches count too. */
  update(x: number, z: number, car?: CarFootprint): GateEvent[] {
    const x0 = this.lastX,
      z0 = this.lastZ;
    this.lastX = x;
    this.lastZ = z;
    // A jump of metres in one step is a teleport or a campsite return, not a drive.
    const moved = Math.hypot(x - x0, z - z0);
    if (!this.total || !(moved > 0 && moved < MAX_STEP)) return [];
    const events: GateEvent[] = car ? this.touchFlags(x, z, car) : [];
    const last = this.gates[this.gates.length - 1];
    // The lap ends once the whole car is clear of the last gate's flags.
    if (this.finishing && !(car && (touches(last.left, x, z, car) || touches(last.right, x, z, car)))) {
      this.finishing = false;
      events.push({ type: 'finished', passed: this.passed, missed: this.missed, flags: this.flags });
    }
    const gate = this.gates.find((g) => crosses(g, x0, z0, x, z));
    if (!gate) return events;
    if (!this.lapOn) {
      // A new lap starts at whichever gate is driven through first.
      this.passed = 0;
      this.missed = 0;
      this.touched.clear();
      for (const key of this.touchedBetweenLaps) if (key.startsWith(`${gate.n}:`)) this.touched.add(key);
      this.touchedBetweenLaps.clear();
      this.flags = this.touched.size;
    } else if (gate.n < this.next) return events;
    else if (gate.n > this.next) {
      const skipped = this.gates.filter((g) => g.n >= this.next && g.n < gate.n).map((g) => g.n);
      this.missed += skipped.length;
      events.push({ type: 'missed', gates: skipped, n: gate.n });
    }
    this.passed++;
    this.next = gate.n + 1;
    events.push({ type: 'passed', n: gate.n });
    if (gate.n === this.total) this.finishing = true;
    return events;
  }

  /** Flags inside the car's footprint that it hasn't touched before this lap. */
  private touchFlags(x: number, z: number, car: CarFootprint): GateEvent[] {
    const events: GateEvent[] = [];
    for (const g of this.gates)
      for (const side of ['left', 'right'] as const) {
        if (!touches(g[side], x, z, car)) continue;
        const key = `${g.n}:${side}`;
        const set = this.lapOn ? this.touched : this.touchedBetweenLaps;
        if (set.has(key)) continue;
        set.add(key);
        if (this.lapOn) this.flags++;
        events.push({ type: 'flag', n: g.n, side });
      }
    return events;
  }
}

/** Is the flag at `p` under the car (centre (x, z))? */
function touches(p: { x: number; z: number }, x: number, z: number, car: CarFootprint): boolean {
  const dx = p.x - x,
    dz = p.z - z;
  // Along the car and across it.
  const along = dx * car.fx + dz * car.fz,
    across = -dx * car.fz + dz * car.fx;
  return Math.abs(along) <= car.halfLength + FLAG_REACH && Math.abs(across) <= car.halfWidth + FLAG_REACH;
}

/** Did the move (x0, z0) → (x1, z1) go between the gate's flags, the way the gate faces? */
export function crosses(g: GateInfo, x0: number, z0: number, x1: number, z1: number): boolean {
  const h = (g.headingDeg * Math.PI) / 180;
  // Heading 0 = north (-z).
  const fx = Math.sin(h),
    fz = -Math.cos(h);
  if ((x1 - x0) * fx + (z1 - z0) * fz <= 0) return false;
  const ax = g.left.x,
    az = g.left.z,
    bx = g.right.x,
    bz = g.right.z;
  const side = (px: number, pz: number) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const s0 = side(x0, z0),
    s1 = side(x1, z1);
  // A point on the line counts as the far side, so touching it then leaving counts once.
  if (s0 < 0 === s1 < 0) return false;
  // Where the move meets the gate line, as a share of the way from the left flag to the right.
  const t = s0 / (s0 - s1);
  const cx = x0 + (x1 - x0) * t,
    cz = z0 + (z1 - z0) * t;
  const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
  const u = ((cx - ax) * (bx - ax) + (cz - az) * (bz - az)) / len2;
  return u >= 0 && u <= 1;
}
