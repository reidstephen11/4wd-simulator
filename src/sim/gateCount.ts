import type { GateInfo } from './world/features';

/** Further than this in one update (m) is a teleport. */
const MAX_STEP = 5;

export type GateEvent =
  | { type: 'passed'; n: number }
  /** Gates skipped on the way to gate `n`, in order. */
  | { type: 'missed'; gates: number[]; n: number }
  | { type: 'finished'; passed: number; missed: number };

/**
 * Counts the gates of a gate trail as they are driven, like a marshal on an RC crawler
 * course: driving between a gate's flags in its direction of travel passes it. A gate
 * further on than the next one passes it too, and every gate skipped on the way counts
 * as missed. The count starts at the first gate driven through (so joining the trail
 * part way round misses nothing), and passing the last gate finishes the lap; the next
 * gate driven through after that starts a new one.
 */
export class GateCount {
  /** The next gate to drive through (0 until the first gate is passed). */
  next = 0;
  passed = 0;
  missed = 0;
  readonly total: number;
  private readonly gates: readonly GateInfo[];
  private lastX = NaN;
  private lastZ = NaN;

  constructor(gates: readonly GateInfo[]) {
    this.gates = [...gates].sort((a, b) => a.n - b.n);
    this.total = this.gates.length ? this.gates[this.gates.length - 1].n : 0;
  }

  reset(): void {
    this.next = 0;
    this.passed = 0;
    this.missed = 0;
    this.lastX = this.lastZ = NaN;
  }

  /** The car's centre is now at (x, z). */
  update(x: number, z: number): GateEvent[] {
    const x0 = this.lastX,
      z0 = this.lastZ;
    this.lastX = x;
    this.lastZ = z;
    // A jump of metres in one step is a teleport or a campsite return, not a drive.
    const moved = Math.hypot(x - x0, z - z0);
    if (!this.total || !(moved > 0 && moved < MAX_STEP)) return [];
    const gate = this.gates.find((g) => crosses(g, x0, z0, x, z));
    if (!gate) return [];
    const events: GateEvent[] = [];
    if (this.next === 0 || this.next > this.total) {
      // A new lap starts at whichever gate is driven through first.
      this.passed = 0;
      this.missed = 0;
    } else if (gate.n < this.next) return [];
    else if (gate.n > this.next) {
      const skipped = this.gates.filter((g) => g.n >= this.next && g.n < gate.n).map((g) => g.n);
      this.missed += skipped.length;
      events.push({ type: 'missed', gates: skipped, n: gate.n });
    }
    this.passed++;
    this.next = gate.n + 1;
    events.push({ type: 'passed', n: gate.n });
    if (gate.n === this.total) events.push({ type: 'finished', passed: this.passed, missed: this.missed });
    return events;
  }
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
