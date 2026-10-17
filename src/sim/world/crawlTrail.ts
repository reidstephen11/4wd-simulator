import type { CrawlTrailDef } from './mapTypes';
import type { TrackInfo, StaticBox, StaticLog } from './features';
import { StaticMeshBatcher } from './staticMesh';
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

export function trailLogs(trail: CrawlTrailDef, tracks: readonly TrackInfo[], terrain: Terrain): StaticLog[] {
  const track = tracks.find((t) => t.def.id === trail.trackId);
  if (!track) throw new Error(`Missing crawl trail track ${trail.trackId}`);
  return trail.sections.flatMap((section) =>
    (section.logs ?? []).map((log) => {
      const centre = trailPoint(track, log.at, log.lateral);
      const yaw = ((-centre.headingDeg + (log.angleDeg ?? 0)) * Math.PI) / 180;
      const dx = (Math.cos(yaw) * log.length) / 2,
        dz = (-Math.sin(yaw) * log.length) / 2;
      const end = (side: number): [number, number, number] => {
        const x = centre.x + dx * side,
          z = centre.z + dz * side;
        return [x, terrain.heightAt(x, z) + log.radius * 0.7, z];
      };
      return { a: end(-1), b: end(1), radius: log.radius };
    }),
  );
}

/** Rendering and collision use this exact capped nine-sided log mesh. */
export function staticLogMesh(log: StaticLog) {
  const batcher = new StaticMeshBatcher(256);
  batcher.prism('wood', log.a, log.b, log.radius, 9, -Math.PI / 2);
  return batcher.batches.values().next().value!;
}
