import { describe, expect, it } from 'vitest';
import { highCountryMap } from '../src/data/map';
import { SurfaceId } from '../src/data/surfaces';
import { generateTerrain } from '../src/sim/world/terrainGen';
import { Noise2D } from '../src/sim/world/noise';
import { testWorld } from './world';

function checksum(a: Float32Array): number {
  let h = 0;
  for (let i = 0; i < a.length; i += 97) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
  return h;
}

describe('terrain generation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = testWorld().terrain;
    const b = generateTerrain(highCountryMap).terrain;
    expect(checksum(b.heights)).toBe(checksum(a.heights));
    expect(b.surface.length).toBe(a.surface.length);
  });

  it('noise is seeded', () => {
    const n1 = new Noise2D(5);
    const n2 = new Noise2D(5);
    const n3 = new Noise2D(6);
    expect(n1.noise(1.3, 2.7)).toBe(n2.noise(1.3, 2.7));
    expect(n1.noise(1.3, 2.7)).not.toBe(n3.noise(1.3, 2.7));
  });

  it('heightAt matches grid samples and interpolates within triangles', () => {
    const t = testWorld().terrain;
    expect(t.heightAt(10, 20)).toBeCloseTo(t.sample(10 + t.half, 20 + t.half), 4);
    const h00 = t.sample(t.half, t.half);
    const h11 = t.sample(t.half + 1, t.half + 1);
    expect(t.heightAt(0.5, 0.5)).toBeCloseTo((h00 + h11) / 2, 4);
  });

  it('has a creek with water and dry campsites', () => {
    const w = testWorld();
    const t = w.terrain;
    const ford = w.pois.find((p) => p.id === 'gravel-ford')!;
    const fordDepth = t.waterDepthAt(ford.x, ford.z);
    expect(fordDepth).toBeGreaterThan(0.1);
    expect(fordDepth).toBeLessThanOrEqual(0.4);
    for (const p of w.pois.filter((q) => q.kind === 'campsite')) {
      expect(t.waterDepthAt(p.x, p.z)).toBe(0);
      expect(t.slopeDegAt(p.x, p.z)).toBeLessThan(6);
    }
  });

  it('puts the deep channel at the Deep Crossing', () => {
    const w = testWorld();
    const p = w.pois.find((q) => q.id === 'deep-crossing')!;
    let deepest = 0;
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++)
        deepest = Math.max(deepest, w.terrain.waterDepthAt(p.x + dx, p.z + dz));
    expect(deepest).toBeGreaterThan(0.95);
    expect(deepest).toBeLessThan(1.25);
  });

  it('keeps every POI inside the playable area', () => {
    const w = testWorld();
    for (const p of w.pois) {
      expect(Math.abs(p.x)).toBeLessThan(w.map.wallHalfExtent - 20);
      expect(Math.abs(p.z)).toBeLessThan(w.map.wallHalfExtent - 20);
    }
  });

  it('marks surfaces from map features', () => {
    const w = testWorld();
    const bog = w.map.bogs[0];
    expect(w.terrain.surfaceAt(bog.x, bog.z)).toBe(SurfaceId.Mud);
    const main = w.features.tracks.find((t) => t.def.id === 'main-track')!;
    const k = Math.floor(main.poly.count / 3);
    expect(w.terrain.surfaceAt(main.poly.xs[k], main.poly.zs[k])).toBe(SurfaceId.Dirt);
  });
});
