import type { CrawlTrailDef } from './mapTypes';
import type { TrackInfo, StaticBox } from './features';
import { pointAt, segmentDistance } from './polyline';
import type { Terrain } from './terrain';

export function trailPoint(track: TrackInfo, at: number, lateral = 0) {
  const p = pointAt(track.poly, at);
  return {
    x: p.x - p.dz * lateral,
    z: p.z + p.dx * lateral,
    headingDeg: (Math.atan2(p.dx, -p.dz) * 180) / Math.PI,
  };
}

export function trailProgress(track: TrackInfo, x: number, z: number) {
  const p = track.poly;
  let distance = Infinity,
    along = 0;
  for (let i = 0; i < p.count - 1; i++) {
    const hit = segmentDistance(x, z, p.xs[i], p.zs[i], p.xs[i + 1], p.zs[i + 1]);
    if (hit.d < distance) {
      distance = hit.d;
      along = p.s[i] + (p.s[i + 1] - p.s[i]) * hit.t;
    }
  }
  return { distance, along };
}

export function trailObstacles(
  trail: CrawlTrailDef,
  tracks: readonly TrackInfo[],
  terrain: Terrain,
): StaticBox[] {
  const track = tracks.find((t) => t.def.id === trail.trackId);
  if (!track) throw new Error(`Missing crawl trail track ${trail.trackId}`);
  return trail.sections.flatMap((section) =>
    section.rocks.map((rock) => {
      const p = trailPoint(track, rock.at, rock.lateral);
      const buried = 0.35;
      return {
        kind: 'ledge' as const,
        x: p.x,
        z: p.z,
        y: terrain.heightAt(p.x, p.z) + (rock.height - buried) / 2,
        hx: rock.width / 2,
        hy: (rock.height + buried) / 2,
        hz: rock.length / 2,
        yaw: (-p.headingDeg * Math.PI) / 180,
        roll: ((rock.rollDeg ?? 0) * Math.PI) / 180,
        bevel: 0.1,
      };
    }),
  );
}
