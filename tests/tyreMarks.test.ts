import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import {
  MARK_FLOATS,
  MarkTone,
  TyreMarkStore,
  TyreTrail,
  markFor,
  tyreMarkTuning,
  type WheelMarkInput,
} from '../src/sim/world/tyreMarks';

/** Tyre marks (v0.25): what marks, how strongly, and how a wheel's trail is laid. */
const wheel = (over: Partial<WheelMarkInput> = {}): WheelMarkInput => ({
  contact: true,
  surface: SurfaceId.Dirt,
  x: 0,
  y: 0,
  z: 0,
  spin: 0,
  skid: 0,
  water: 0,
  ...over,
});
const on = (surface: SurfaceId, wetness = 0, over: Partial<WheelMarkInput> = {}) =>
  markFor(wheel({ surface, ...over }), wetness, 0).strength;
const flat = () => 0;
/** Roll a trail in a straight line east, `step` metres a frame. */
function roll(
  trail: TyreTrail,
  from: number,
  to: number,
  over: Partial<WheelMarkInput> = {},
  step = 0.1,
  wet = 0,
) {
  for (let x = from; x <= to + 1e-9; x += step) trail.update(wheel({ x, ...over }), wet);
}
const piece = (store: TyreMarkStore, k: number) => [
  ...store.data.subarray(k * MARK_FLOATS, (k + 1) * MARK_FLOATS),
];

describe('tyre marks: what the ground takes', () => {
  it('marks soft ground most and hard ground not at all', () => {
    expect(on(SurfaceId.Mud)).toBeGreaterThan(on(SurfaceId.Clay));
    expect(on(SurfaceId.Clay)).toBeGreaterThan(on(SurfaceId.Dirt));
    expect(on(SurfaceId.Dirt)).toBeGreaterThan(on(SurfaceId.Grass));
    expect(on(SurfaceId.Grass)).toBeGreaterThan(on(SurfaceId.Gravel));
    expect(on(SurfaceId.Gravel)).toBeGreaterThan(tyreMarkTuning.minStrength);
    for (const hard of [SurfaceId.Rock, SurfaceId.Wood, SurfaceId.Water]) expect(on(hard)).toBe(0);
  });

  it('marks wet clay, dirt and grass more than dry, and nothing under water', () => {
    for (const s of [SurfaceId.Clay, SurfaceId.Dirt, SurfaceId.Grass])
      expect(on(s, 1)).toBeGreaterThan(on(s, 0) * 1.3);
    expect(on(SurfaceId.Mud, 0, { water: 0.2 })).toBe(0);
    expect(on(SurfaceId.Dirt, 0, { contact: false })).toBe(0);
  });

  it('shows a spinning wheel darker, and leaves a skid on rock', () => {
    expect(on(SurfaceId.Dirt, 0, { spin: 1 })).toBeGreaterThan(on(SurfaceId.Dirt) + 0.3);
    expect(on(SurfaceId.Rock, 0, { skid: tyreMarkTuning.skidFull })).toBeGreaterThan(0.2);
    expect(on(SurfaceId.Mud, 1, { spin: 1 })).toBeLessThanOrEqual(1);
  });

  it('tones the mark for the ground', () => {
    const tone = (surface: SurfaceId) => markFor(wheel({ surface }), 0, 1).tone;
    expect(tone(SurfaceId.Clay)).toBe(MarkTone.Clay);
    expect(tone(SurfaceId.BlackSoil)).toBe(MarkTone.Mud);
    expect(tone(SurfaceId.Sand)).toBe(MarkTone.Sand);
    expect(tone(SurfaceId.Rock)).toBe(MarkTone.Wet);
  });
});

describe("tyre marks: a wheel's trail", () => {
  it('lays pieces end to end, a tyre wide, every 0.3 m', () => {
    const store = new TyreMarkStore(100);
    const trail = new TyreTrail(store, 0.24, flat);
    roll(trail, 0, 3);
    expect(store.count).toBeGreaterThanOrEqual(9);
    expect(store.count).toBeLessThanOrEqual(10);
    for (let k = 0; k < store.count; k++) {
      const p = piece(store, k);
      // Left and right corners 0.24 m apart, square across the way it rolled (east: across is z).
      expect(Math.abs(p[2] - p[5])).toBeCloseTo(0.24, 5);
      expect(Math.abs(p[8] - p[11])).toBeCloseTo(0.24, 5);
      expect(p[6] - p[0]).toBeGreaterThanOrEqual(tyreMarkTuning.step - 1e-6);
      // Each piece starts where the last ended, in place and in distance along the trail.
      if (k > 0) {
        const q = piece(store, k - 1);
        expect(p.slice(0, 6)).toEqual(q.slice(6, 12));
        expect(p[12]).toBe(q[13]);
      }
      expect(p[13]).toBeGreaterThan(p[12]);
      expect(p[16]).toBe(MarkTone.Earth);
    }
  });

  it('breaks the trail when the wheel leaves the ground or jumps, and starts another', () => {
    const store = new TyreMarkStore(100);
    const trail = new TyreTrail(store, 0.24, flat);
    roll(trail, 0, 1);
    const first = store.count;
    trail.update(wheel({ contact: false, x: 1.1 }), 0);
    roll(trail, 1.2, 2.2);
    // The new trail starts where the wheel came down, not where the old one ended.
    expect(piece(store, first)[0]).toBeGreaterThan(1.15);
    expect(piece(store, first)[12]).toBe(0);
    // A teleport: no piece is drawn across the jump.
    const before = store.count;
    trail.update(wheel({ x: 60 }), 0);
    roll(trail, 60.1, 61);
    for (let k = before; k < store.count; k++) expect(piece(store, k)[0]).toBeGreaterThan(59);
  });

  it('follows the ground under each edge, and a rock or plank at the height of the contact', () => {
    const slope = (_x: number, z: number) => z * 0.5;
    const store = new TyreMarkStore(100);
    const trail = new TyreTrail(store, 0.4, slope);
    roll(trail, 0, 1, { y: 0 });
    const p = piece(store, 0);
    // Rolling east, the left edge is at z = -0.2 and the right at z = +0.2, each on the slope.
    expect(p[1]).toBeCloseTo(-0.1, 5);
    expect(p[4]).toBeCloseTo(0.1, 5);
    // Half a metre above the terrain (a plank): both edges at the contact's height.
    const store2 = new TyreMarkStore(100);
    const up = new TyreTrail(store2, 0.4, slope);
    roll(up, 0, 1, { y: 0.5, surface: SurfaceId.Wood, skid: 4 });
    expect(piece(store2, 0)[1]).toBe(0.5);
    expect(piece(store2, 0)[4]).toBe(0.5);
  });

  it('carries mud onto rock for a few metres, fading to nothing', () => {
    const store = new TyreMarkStore(400);
    const trail = new TyreTrail(store, 0.24, flat);
    roll(trail, 0, 2, { surface: SurfaceId.Mud }, 0.1, 1);
    // Fully loaded (less the little worn off since the last piece was laid).
    expect(trail.carry).toBeGreaterThan(0.95);
    const mud = store.count;
    roll(trail, 2.1, 40, { surface: SurfaceId.Rock });
    const wet = Array.from({ length: store.count - mud }, (_, k) => piece(store, mud + k));
    expect(wet.length).toBeGreaterThan(20);
    expect(wet[0][16]).toBe(MarkTone.Wet);
    // Weaker piece by piece, and gone within the carry distance.
    for (let k = 1; k < wet.length; k++) expect(wet[k][15]).toBeLessThan(wet[k - 1][15]);
    expect(wet[wet.length - 1][6]).toBeLessThan(2 + tyreMarkTuning.carryMetres);
    expect(trail.carry).toBe(0);
    // Dry tyres on rock leave nothing.
    const store2 = new TyreMarkStore(50);
    roll(new TyreTrail(store2, 0.24, flat), 0, 10, { surface: SurfaceId.Rock });
    expect(store2.count).toBe(0);
  });

  it("leaves wet tracks out of the creek onto gravel, then the gravel's own fainter print", () => {
    const store = new TyreMarkStore(400);
    const trail = new TyreTrail(store, 0.24, flat);
    // In the water: nothing is laid, and the tyre comes out wet.
    roll(trail, 0, 2, { surface: SurfaceId.Water, water: 0.4 });
    expect(store.count).toBe(0);
    roll(trail, 2.1, 40, { surface: SurfaceId.Gravel });
    const first = piece(store, 0);
    const last = piece(store, store.count - 1);
    expect(first[16]).toBe(MarkTone.Wet);
    expect(first[15]).toBeGreaterThan(0.45);
    expect(last[16]).toBe(MarkTone.Gravel);
    expect(last[15]).toBeCloseTo(0.3, 5);
    // The trail does not break where the wet gives way to the print.
    for (let k = 1; k < store.count; k++)
      expect(piece(store, k).slice(0, 6)).toEqual(piece(store, k - 1).slice(6, 12));
  });

  it('keeps the newest pieces once the store is full', () => {
    const store = new TyreMarkStore(8);
    roll(new TyreTrail(store, 0.24, flat), 0, 10);
    expect(store.count).toBe(8);
    expect(store.laid).toBeGreaterThan(20);
    // Slot (laid - 1) % 8 holds the newest piece, which ends nearest 10 m.
    expect(piece(store, (store.laid - 1) % 8)[6]).toBeGreaterThan(9.6);
  });
});
