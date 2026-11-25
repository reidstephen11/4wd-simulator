import { describe, expect, it } from 'vitest';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { segmentDistance } from '../src/sim/world/polyline';
import { buildWorld } from '../src/sim/world/world';

describe('level signposts', () => {
  for (const map of [ironbarkMap])
    it(`stand beside the tracks on ${map.name}, not on them`, () => {
      const { features } = buildWorld(map);
      for (const sign of map.props.filter((p) => p.kind === 'signpost')) {
        // Distance from the post to the edge of the nearest driving surface.
        let near = { id: '', edge: Infinity };
        for (const t of features.tracks) {
          const p = t.poly;
          for (let i = 0; i < p.count - 1; i++) {
            const d = segmentDistance(sign.x, sign.z, p.xs[i], p.zs[i], p.xs[i + 1], p.zs[i + 1]).d;
            if (d - t.def.width / 2 < near.edge) near = { id: t.def.id, edge: d - t.def.width / 2 };
          }
        }
        expect(near.edge, `${sign.text} is ${near.edge.toFixed(1)} m from ${near.id}`).toBeGreaterThan(1.2);
      }
    }, 60_000);
});
