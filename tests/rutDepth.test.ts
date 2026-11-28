import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { rutFeel } from '../src/data/rutFeel';
import type { RutField } from '../src/sim/vehicle/vehicle';
import { RutDepth, rutTuning } from '../src/sim/world/rutDepth';
import {
  MARK_FLOATS,
  MARK_RUT,
  TyreMarkStore,
  TyreTrail,
  rutLit,
  type WheelMarkInput,
} from '../src/sim/world/tyreMarks';

/** Ruts that can be seen (v0.30): how deep the ground is pressed in, pass by pass. */
const wheel = (over: Partial<WheelMarkInput> = {}): WheelMarkInput => ({
  contact: true,
  surface: SurfaceId.Mud,
  x: 0,
  y: 0,
  z: 0,
  spin: 0,
  skid: 0,
  water: 0,
  ...over,
});
const flat = () => 0;
/** One wheel pass along a line going east. */
function pass(trail: TyreTrail, over: Partial<WheelMarkInput> = {}, wet = 0, from = 0, to = 6, step = 0.1) {
  trail.lift();
  for (let x = from; x <= to + 1e-9; x += step) trail.update(wheel({ x, ...over }), wet);
}
/** The rut depth (0..1) the pieces of a store carry at their far ends, in the order laid. */
const depths = (store: TyreMarkStore) =>
  Array.from({ length: store.count }, (_, k) => store.data[k * MARK_FLOATS + MARK_RUT + 1]);

describe('rut depth', () => {
  it('grows with each wheel pass on soft ground, less each time, up to a limit', () => {
    const ruts = new RutDepth();
    const d: number[] = [];
    for (let k = 0; k < 12; k++) d.push(ruts.press(3, 4, SurfaceId.Mud, 0));
    for (let k = 1; k < d.length; k++) expect(d[k]).toBeGreaterThan(d[k - 1]);
    expect(d[1] - d[0]).toBeGreaterThan(d[11] - d[10]);
    expect(d[11]).toBeLessThanOrEqual(1);
    expect(d[11]).toBeGreaterThan(0.9);
    // A car's two axles over the same line five times against once: clearly deeper.
    expect(d[9]).toBeGreaterThan(d[1] * 1.6);
    expect(ruts.depthAt(3, 4)).toBe(d[11]);
    // In metres, the deepest rut is the tuning's limit.
    expect(ruts.metresAt(3, 4)).toBeCloseTo(d[11] * rutTuning.maxDepth, 6);
  });

  it('does not grow on hard ground, and on clay, dirt and grass only when they are wet', () => {
    const ruts = new RutDepth();
    for (const hard of [SurfaceId.Rock, SurfaceId.Gravel, SurfaceId.Wood, SurfaceId.Water])
      for (let k = 0; k < 5; k++) expect(ruts.press(0, 0, hard, 1)).toBe(0);
    for (const s of [SurfaceId.Clay, SurfaceId.Dirt, SurfaceId.Grass]) {
      const dry = new RutDepth();
      const wet = new RutDepth();
      for (let k = 0; k < 4; k++) {
        dry.press(0, 0, s, 0);
        wet.press(0, 0, s, 1);
      }
      expect(dry.depthAt(0, 0), `dry ${s}`).toBe(0);
      expect(wet.depthAt(0, 0), `wet ${s}`).toBeGreaterThan(0.1);
    }
    // Mud, black soil and sand take a rut wet or dry; mud and black soil the deepest.
    const after = (s: SurfaceId) => {
      const r = new RutDepth();
      for (let k = 0; k < 4; k++) r.press(0, 0, s, 0);
      return r.depthAt(0, 0);
    };
    expect(after(SurfaceId.Mud)).toBeGreaterThan(after(SurfaceId.Sand));
    expect(after(SurfaceId.BlackSoil)).toBeGreaterThanOrEqual(after(SurfaceId.Mud));
    expect(after(SurfaceId.Sand)).toBeGreaterThan(0.2);
  });

  it('is where the wheel went and nowhere else, and forgets the oldest cells past its limit', () => {
    const ruts = new RutDepth();
    ruts.press(10, 10, SurfaceId.Mud, 0);
    expect(ruts.depthAt(10, 10)).toBeGreaterThan(0);
    expect(ruts.depthAt(10 + rutTuning.cell * 1.5, 10)).toBe(0);
    expect(ruts.depthAt(10, 10 - rutTuning.cell * 1.5)).toBe(0);
    const small = new RutDepth(4);
    for (let k = 0; k < 6; k++) small.press(k, 0, SurfaceId.Mud, 0);
    expect(small.size).toBe(4);
    expect(small.depthAt(0, 0)).toBe(0);
    expect(small.depthAt(5, 0)).toBeGreaterThan(0);
    small.clear();
    expect(small.size).toBe(0);
  });
});

describe('tyre marks carry the rut they were pressed into', () => {
  it('deeper on each pass over the same line in mud', () => {
    const ruts = new RutDepth();
    const store = new TyreMarkStore(4000);
    const trail = new TyreTrail(store, 0.26, flat, ruts);
    pass(trail);
    const first = depths(store);
    expect(Math.min(...first)).toBeGreaterThan(0);
    pass(trail);
    const second = depths(store).slice(first.length);
    expect(second.length).toBe(first.length);
    for (let k = 0; k < second.length; k++) expect(second[k]).toBeGreaterThan(first[k]);
    for (let k = 0; k < 6; k++) pass(trail);
    const last = depths(store).slice(-first.length);
    expect(Math.min(...last)).toBeGreaterThan(Math.max(...first) * 1.5);
  });

  it('presses every cell it passes over, however long a frame is (v0.32)', () => {
    // At 30 frames a second and 15 m/s a wheel moves half a metre between frames, and a
    // frame hitch moves it further: a piece is laid that long, and each cell under it pressed.
    for (const step of [0.1, 0.5, 1.5, 3.5]) {
      const ruts = new RutDepth();
      const trail = new TyreTrail(new TyreMarkStore(4000), 0.26, flat, ruts);
      pass(trail, {}, 0, 0, 14, step);
      for (let x = 0.6; x < 13; x += rutTuning.cell)
        expect(ruts.depthAt(x, 0), `step ${step} m, x ${x.toFixed(2)}`).toBeGreaterThan(0);
      // Once per pass, however many times a long piece crosses the same cell.
      expect(ruts.depthAt(7, 0), `step ${step} m`).toBeCloseTo(rutTuning.press[SurfaceId.Mud]!, 6);
    }
  });

  it('none on gravel or rock, however often it is driven', () => {
    for (const surface of [SurfaceId.Gravel, SurfaceId.Rock]) {
      const ruts = new RutDepth();
      const store = new TyreMarkStore(4000);
      const trail = new TyreTrail(store, 0.26, flat, ruts);
      // Gravel takes a faint mark of its own; rock only from a skid.
      for (let k = 0; k < 5; k++) pass(trail, { surface, skid: surface === SurfaceId.Rock ? 4 : 0 });
      expect(store.count).toBeGreaterThan(0);
      expect(Math.max(...depths(store))).toBe(0);
    }
  });

  it('a trail with no rut store lays flat marks, as before v0.30', () => {
    const store = new TyreMarkStore(4000);
    const trail = new TyreTrail(store, 0.26, flat);
    pass(trail);
    expect(store.count).toBeGreaterThan(0);
    expect(Math.max(...depths(store))).toBe(0);
  });
});

describe('which wall of a rut catches the sun', () => {
  it('is the wall that faces it: the far wall, seen from the sun’s side', () => {
    // A piece laid going east (+x): its left edge is to the north (-z), its right to the south (+z).
    const piece = new Float32Array(MARK_FLOATS);
    piece.set([0, 0, -0.13, 0, 0, 0.13, 0.3, 0, -0.13, 0.3, 0, 0.13]);
    // Sun in the south: the left (north) wall faces it. Positive means the left wall is lit.
    expect(rutLit(piece, 0, { x: 0, y: 0.5, z: 1 })).toBeGreaterThan(0.5);
    // Sun in the north: the right wall is lit.
    expect(rutLit(piece, 0, { x: 0, y: 0.5, z: -1 })).toBeLessThan(-0.5);
    // Sun along the rut, or overhead: neither wall more than the other.
    expect(Math.abs(rutLit(piece, 0, { x: 1, y: 0.5, z: 0 }))).toBeLessThan(0.05);
    expect(Math.abs(rutLit(piece, 0, { x: 0, y: 1, z: 0 }))).toBeLessThan(0.05);
    // Sun below the horizon: nothing is lit.
    expect(rutLit(piece, 0, { x: 0, y: -0.2, z: 1 })).toBe(0);
  });
});

describe('ruts that are felt (v0.31)', () => {
  it('the rut store is what the vehicles feel, in the same metres', () => {
    // A full-depth rut in the store is a full-depth rut to the wheels.
    expect(rutTuning.maxDepth).toBe(rutFeel.fullDepth);
    const ruts = new RutDepth();
    const field: RutField = ruts;
    for (let k = 0; k < 20; k++) ruts.press(1, 1, SurfaceId.Mud, 0);
    expect(field.metresAt(1, 1)).toBeGreaterThan(rutFeel.fullDepth * 0.95);
    expect(field.metresAt(5, 5)).toBe(0);
  });

  it('Ironbark Creek asks for its ruts to be felt', () => {
    expect(ironbarkLevel.feltRuts).toBe(true);
  });
});
