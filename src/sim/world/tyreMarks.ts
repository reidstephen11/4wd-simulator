import { SurfaceId } from '../../data/surfaces';
import type { RutDepth } from './rutDepth';

/**
 * Tyre marks (v0.25): the lines the car's own wheels leave on the ground it drives over, kept
 * for the rest of the drive (the oldest go once `capacity` pieces are laid). Each wheel lays a
 * trail of short pieces end to end; a piece is four corners on the ground with how strongly it
 * shows at each end. Soft ground marks most, hard ground not at all, and tyres that have just
 * come out of mud or water carry it a little way onto rock. Only drawn (src/render/tyreMarks.ts):
 * the ground under a mark is the same as beside it. No Three.js here, so it can be tested.
 */

/** What colour a mark is: the ground it was pressed into. */
export const MarkTone = { Earth: 0, Clay: 1, Mud: 2, Sand: 3, Gravel: 4, Wet: 5, Grass: 6 } as const;
export type MarkTone = (typeof MarkTone)[keyof typeof MarkTone];

interface Marking {
  /** How strongly a rolling tyre shows (0 = not at all, 1 = fully). */
  strength: number;
  /** How much more it shows on soaked ground (added share of `strength`). */
  wet: number;
  tone: MarkTone;
}

/** How each surface takes a tyre. Rock, timber and a creek bed take none of their own. */
const markings: Partial<Record<SurfaceId, Marking>> = {
  // A track's edge strip is mud too, and dry on a clear day: it prints fully only when wet.
  [SurfaceId.Mud]: { strength: 0.65, wet: 0.5, tone: MarkTone.Mud },
  // A bog's floor never dries out.
  [SurfaceId.BlackSoil]: { strength: 0.85, wet: 0.15, tone: MarkTone.Mud },
  [SurfaceId.Clay]: { strength: 0.6, wet: 0.5, tone: MarkTone.Clay },
  [SurfaceId.Sand]: { strength: 0.8, wet: 0, tone: MarkTone.Sand },
  [SurfaceId.Dirt]: { strength: 0.5, wet: 0.5, tone: MarkTone.Earth },
  // Grass is pressed flat, not printed: fainter, and its own darker green (v0.26).
  [SurfaceId.Grass]: { strength: 0.26, wet: 1, tone: MarkTone.Grass },
  [SurfaceId.Gravel]: { strength: 0.3, wet: 0.3, tone: MarkTone.Gravel },
};

/** Surfaces that load the tyres with something to carry onto hard ground, and how much. */
const carries: Partial<Record<SurfaceId, number>> = {
  [SurfaceId.Mud]: 1,
  [SurfaceId.BlackSoil]: 1,
  [SurfaceId.Clay]: 0.5,
};

export const tyreMarkTuning = {
  /** A piece is laid each time the wheel has gone this far (m). */
  step: 0.3,
  /** A jump longer than this breaks the trail (a teleport, a restart from camp). */
  maxGap: 4,
  /** Marks weaker than this aren't laid. */
  minStrength: 0.06,
  /** Water deeper than this over the wheel's contact hides the ground: no mark. */
  maxWater: 0.03,
  /** How much a fully spinning wheel adds, and a fully locked, skidding one. */
  spinGain: 0.45,
  skidGain: 0.5,
  /** Skid speed (m/s) at which a locked wheel marks fully. */
  skidFull: 4,
  /** Wet or muddy tyres mark hard ground this strongly at first, fading over `carryMetres`. */
  carryStrength: 0.55,
  carryMetres: 18,
  /** The wheel counts as standing on the terrain (not a rock, plank or bridge) within this height (m). */
  onGround: 0.12,
  /** Pieces kept at once (all wheels together). */
  capacity: 20000,
};

/** What a wheel is doing where it touches down. */
export interface WheelMarkInput {
  contact: boolean;
  surface: SurfaceId;
  /** Where the tyre meets the ground. */
  x: number;
  y: number;
  z: number;
  /** 0..1 spinning beyond grip. */
  spin: number;
  /** Speed of a locked wheel's skid (m/s). */
  skid: number;
  /** Water over the contact (m). */
  water: number;
}

/**
 * How strongly a wheel marks the ground it is on, and in what tone. `wetness` is the ground's
 * (0 dry, 1 soaked); `carry` is what the tyre has picked up (0..1, see `TyreTrail`).
 */
export function markFor(
  w: WheelMarkInput,
  wetness: number,
  carry: number,
): { strength: number; tone: MarkTone } {
  const t = tyreMarkTuning;
  if (!w.contact || w.water > t.maxWater) return { strength: 0, tone: MarkTone.Earth };
  const effort =
    t.spinGain * Math.min(1, Math.max(0, w.spin)) + t.skidGain * Math.min(1, w.skid / t.skidFull);
  const m = markings[w.surface];
  const carried = t.carryStrength * carry;
  if (m) {
    const own = Math.min(1, m.strength * (1 + m.wet * Math.min(1, Math.max(0, wetness))) + effort);
    // Out of the creek onto gravel or dry dirt: the wet off the tyres shows more than the print.
    return carried > own ? { strength: carried, tone: MarkTone.Wet } : { strength: own, tone: m.tone };
  }
  // Hard ground: only what the tyres carry on, or rubber left by a skid.
  return { strength: Math.min(1, carried + 0.6 * effort), tone: MarkTone.Wet };
}

/**
 * Floats kept per piece: four corners (x, y, z), distance along the trail at each end, strength
 * at each end, tone, and how deep a rut it lies in at each end (0 to 1, v0.30).
 */
export const MARK_FLOATS = 19;
/** Where in a piece the rut depth at its near end is; the far end's is the next float. */
export const MARK_RUT = 17;

/**
 * Which wall of a piece's rut catches the sun (v0.30): above 0 the wall along its left edge,
 * below 0 the right, by how squarely the sun stands across the rut and how low it is. 0 with
 * the sun along the rut, overhead or down. `sun` points towards the sun.
 */
export function rutLit(
  data: ArrayLike<number>,
  offset: number,
  sun: { x: number; y: number; z: number },
): number {
  if (sun.y <= 0) return 0;
  // From the near left corner to the near right one: across the rut.
  const ax = data[offset + 3] - data[offset];
  const az = data[offset + 5] - data[offset + 2];
  const across = Math.hypot(ax, az);
  const len = Math.hypot(sun.x, sun.y, sun.z);
  if (across < 1e-6 || len < 1e-6) return 0;
  // The left wall faces right, across the rut: lit when the sun is on that side.
  return (ax * sun.x + az * sun.z) / (across * len);
}

/** The pieces laid so far, oldest overwritten first. */
export class TyreMarkStore {
  readonly data: Float32Array;
  /** Pieces ever laid: piece n is in slot n % capacity. */
  laid = 0;

  constructor(readonly capacity = tyreMarkTuning.capacity) {
    this.data = new Float32Array(capacity * MARK_FLOATS);
  }

  /** Pieces held now. */
  get count(): number {
    return Math.min(this.laid, this.capacity);
  }

  add(piece: ArrayLike<number>): void {
    this.data.set(piece, (this.laid % this.capacity) * MARK_FLOATS);
    this.laid++;
  }

  clear(): void {
    this.laid = 0;
  }
}

/** One wheel's trail: turns the wheel's contact, frame by frame, into pieces in the store. */
export class TyreTrail {
  /** The last point a piece ended at: its two edge corners, distance along and strength. */
  private last: {
    x: number;
    z: number;
    lx: number;
    ly: number;
    lz: number;
    rx: number;
    ry: number;
    rz: number;
    s: number;
    v: number;
    /** How deep the rut is here (0 to 1). */
    rut: number;
  } | null = null;
  /** Where the trail would start: a first contact, with no direction yet. */
  private start: { x: number; y: number; z: number; s: number } | null = null;
  /** Mud or water on the tyre (0..1), wearing off with distance. */
  carry = 0;
  /** Where the wheel last touched down, for the distance rolled since. */
  private rolled: { x: number; z: number } | null = null;
  private readonly piece = new Float32Array(MARK_FLOATS);
  /** The rut cell this wheel pressed last, so one pass presses each cell once. */
  private pressed = -1;

  constructor(
    private readonly store: TyreMarkStore,
    /** Tyre width on the ground (m). */
    private readonly width: number,
    private readonly heightAt: (x: number, z: number) => number,
    /** Where the ground is pressed in (v0.30). Without it the marks lie flat. */
    private readonly ruts?: RutDepth,
  ) {}

  /** One wheel pass over a spot: press its rut cell, once, and say how deep it is now. */
  private press(x: number, z: number, surface: SurfaceId, wetness: number): number {
    const r = this.ruts;
    if (!r) return 0;
    const k = r.key(x, z);
    if (k === this.pressed) return r.depthAt(x, z);
    this.pressed = k;
    return r.press(x, z, surface, wetness);
  }

  /** Break the trail: the next contact starts a new one. */
  lift(): void {
    this.last = null;
    this.start = null;
    this.pressed = -1;
  }

  /** The wheel's contact this frame, with the ground's wetness (0..1). */
  update(w: WheelMarkInput, wetness: number): void {
    const t = tyreMarkTuning;
    if (!w.contact) return this.lift();
    // What the tyre carries wears off with every metre rolled, marking or not.
    if (this.rolled) {
      const moved = Math.hypot(w.x - this.rolled.x, w.z - this.rolled.z);
      if (moved < t.maxGap) this.carry = Math.max(0, this.carry - moved / t.carryMetres);
    }
    this.rolled = { x: w.x, z: w.z };
    // Wet in the creek or loaded with mud: the tyre carries it on.
    const picked =
      w.water > t.maxWater ? 1 : (carries[w.surface] ?? 0) * (0.5 + 0.5 * Math.min(1, wetness + w.spin));
    if (picked > this.carry) this.carry = picked;
    const { strength, tone } = markFor(w, wetness, this.carry);
    const from = this.last ?? this.start;
    if (!from) {
      if (strength >= t.minStrength) this.start = { x: w.x, y: w.y, z: w.z, s: strength };
      return;
    }
    const dx = w.x - from.x;
    const dz = w.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > t.maxGap) {
      this.lift();
      if (strength >= t.minStrength) this.start = { x: w.x, y: w.y, z: w.z, s: strength };
      return;
    }
    if (d < t.step) return;
    // Too faint here: the trail ends at the last piece.
    if (strength < t.minStrength) return this.lift();
    // The two edges at this point, square across the way the wheel came.
    const px = (-dz / d) * (this.width / 2);
    const pz = (dx / d) * (this.width / 2);
    const onTerrain = Math.abs(w.y - this.heightAt(w.x, w.z)) < t.onGround;
    // Press the ground under this piece: half-way along it and at its far end (a piece is a
    // little longer than a rut cell). On a rock, a plank or a bridge there is nothing to press.
    let rut = 0;
    if (onTerrain) {
      this.press((from.x + w.x) / 2, (from.z + w.z) / 2, w.surface, wetness);
      rut = this.press(w.x, w.z, w.surface, wetness);
    }
    const edgeY = (x: number, z: number) => (onTerrain ? this.heightAt(x, z) : w.y);
    const here = {
      x: w.x,
      z: w.z,
      lx: w.x - px,
      ly: edgeY(w.x - px, w.z - pz),
      lz: w.z - pz,
      rx: w.x + px,
      ry: edgeY(w.x + px, w.z + pz),
      rz: w.z + pz,
      s: strength,
      v: (this.last?.v ?? 0) + d,
      rut,
    };
    // A trail's first piece starts square across the same way.
    const a =
      this.last ??
      (() => {
        const s = this.start!;
        return {
          x: s.x,
          z: s.z,
          lx: s.x - px,
          ly: onTerrain ? this.heightAt(s.x - px, s.z - pz) : s.y,
          lz: s.z - pz,
          rx: s.x + px,
          ry: onTerrain ? this.heightAt(s.x + px, s.z + pz) : s.y,
          rz: s.z + pz,
          s: s.s,
          v: 0,
          rut: onTerrain ? (this.ruts?.depthAt(s.x, s.z) ?? 0) : 0,
        };
      })();
    const p = this.piece;
    p.set([
      a.lx,
      a.ly,
      a.lz,
      a.rx,
      a.ry,
      a.rz,
      here.lx,
      here.ly,
      here.lz,
      here.rx,
      here.ry,
      here.rz,
      a.v,
      here.v,
      a.s,
      here.s,
      tone,
      a.rut,
      here.rut,
    ]);
    this.store.add(p);
    this.last = here;
    this.start = null;
  }
}

/** A vehicle's wheel, as much of it as the trails need. */
export interface TrailWheel {
  contact: boolean;
  surface: SurfaceId;
  contactPoint: { x: number; y: number; z: number };
  spin: number;
  skid: number;
  water: number;
}

/**
 * Lay each wheel's contact into its trail, one trail a wheel in the same order. The game does
 * this every frame; the scripted drives do it every step, so the ruts they drive in are the
 * ones a player's wheels would press (v0.31).
 */
export function trailWheels(
  trails: readonly TyreTrail[],
  wheels: readonly TrailWheel[],
  wetness: number,
): void {
  wheels.forEach((w, i) =>
    trails[i]?.update(
      {
        contact: w.contact,
        surface: w.surface,
        x: w.contactPoint.x,
        y: w.contactPoint.y,
        z: w.contactPoint.z,
        spin: w.spin,
        skid: w.skid,
        water: w.water,
      },
      wetness,
    ),
  );
}
