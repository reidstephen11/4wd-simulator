import { describe, expect, it } from 'vitest';
import { coverCapacity, coverTries } from '../src/render/vegetation';
import { groundCover } from '../src/data/vegetation';
import { qualityPresets } from '../src/data/quality';

describe('ground cover', () => {
  it('holds every tile in reach on each quality level, wherever the camera is', () => {
    const tile = groundCover.tile;
    for (const q of Object.values(qualityPresets)) {
      const R = q.grassDistance;
      let most = 0;
      for (let ox = 0; ox < 1; ox += 1 / 8)
        for (let oz = 0; oz < 1; oz += 1 / 8) {
          const ex = (100 + ox) * tile,
            ez = (-40 + oz) * tile;
          let tiles = 0;
          for (let tz = Math.floor((ez - R) / tile); tz <= Math.floor((ez + R) / tile); tz++)
            for (let tx = Math.floor((ex - R) / tile); tx <= Math.floor((ex + R) / tile); tx++)
              if (Math.hypot((tx + 0.5) * tile - ex, (tz + 0.5) * tile - ez) <= R + tile * 0.7) tiles++;
          most = Math.max(most, tiles);
        }
      expect(coverCapacity(q)).toBeGreaterThanOrEqual(most * coverTries(q));
    }
  });
});
