import { describe, expect, it } from 'vitest';
import { DETAIL_SIZE, detailTextureData } from '../src/render/detailTexture';

/** The ground's and the rocks' detail texture (v0.26): grain, pebbles, clods, pebble tone. */
const N = DETAIL_SIZE;
const data = detailTextureData();
const at = (x: number, y: number, c: number) => data[(((y + N) % N) * N + ((x + N) % N)) * 4 + c];
/** Mean step in a channel from each column (or row) to the next; the last entry is the step across the wrap. */
function steps(c: number, across: 'x' | 'y'): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const [a, b] = across === 'x' ? [at(i, k, c), at(i + 1, k, c)] : [at(k, i, c), at(k, i + 1, c)];
      sum += Math.abs(a - b);
    }
    out.push(sum / N);
  }
  return out;
}

describe('the detail texture', () => {
  it('is 256 px square, four channels, and the same every time', () => {
    expect(data.length).toBe(N * N * 4);
    expect([...detailTextureData().subarray(0, 4000)]).toEqual([...data.subarray(0, 4000)]);
  });

  it('tiles: no channel steps more across its edge than it does somewhere inside', () => {
    for (const c of [0, 1, 2, 3])
      for (const across of ['x', 'y'] as const) {
        const all = steps(c, across);
        const wrap = all.pop()!;
        expect(wrap, `channel ${c} across ${across}`).toBeLessThanOrEqual(Math.max(...all) * 1.1);
      }
  });

  it('has fine grain everywhere, pebbles with bare ground between them, and cracks between clods', () => {
    let grainMin = 255,
      grainMax = 0,
      bare = 0,
      pebbleMax = 0,
      cracks = 0,
      clodTops = 0;
    for (let i = 0; i < N * N; i++) {
      const [r, g, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      grainMin = Math.min(grainMin, r);
      grainMax = Math.max(grainMax, r);
      if (g === 0) bare++;
      pebbleMax = Math.max(pebbleMax, g);
      if (b < 40) cracks++;
      if (b > 240) clodTops++;
    }
    // Grain: a spread of heights, neither flat nor clipped.
    expect(grainMax - grainMin).toBeGreaterThan(110);
    expect(grainMin).toBeGreaterThan(5);
    expect(grainMax).toBeLessThan(250);
    // Pebbles: full-height stones, and between a third and four fifths of the ground bare.
    expect(pebbleMax).toBeGreaterThan(230);
    expect(bare / (N * N)).toBeGreaterThan(0.33);
    expect(bare / (N * N)).toBeLessThan(0.8);
    // Clods: mostly flat tops, with thin cracks between them.
    expect(clodTops / (N * N)).toBeGreaterThan(0.4);
    expect(cracks / (N * N)).toBeGreaterThan(0.02);
    expect(cracks / (N * N)).toBeLessThan(0.25);
  });

  it('gives each pebble one tone across its cell', () => {
    // Where a pebble stands, its neighbours a pixel away on the same stone share its tone.
    let same = 0,
      stones = 0;
    for (let y = 0; y < N; y += 3)
      for (let x = 0; x < N; x += 3)
        if (at(x, y, 1) > 120 && at(x + 1, y, 1) > 120) {
          stones++;
          if (at(x, y, 3) === at(x + 1, y, 3)) same++;
        }
    expect(stones).toBeGreaterThan(200);
    expect(same / stones).toBeGreaterThan(0.97);
  });
});
