import type { CrawlTrailDef, TrailStoneDef } from './mapTypes';
import type { TrackInfo, StaticBox, StaticLog, StaticRock } from './features';
import { StaticMeshBatcher } from './staticMesh';
import { pointAt, segmentDistance } from './polyline';
import type { Terrain } from './terrain';
import { boulderPoints, orientPoints, ridgePoints, rockShape, stoneMesh } from './rockShape';
import { mulberry32 } from './rng';

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

/**
 * Stone points relative to its placement. `ground(s)` gives the ground height s metres
 * along the travel direction, relative to the stone's centre; ridges follow it.
 */
export function stonePoints(
  stone: TrailStoneDef,
  headingDeg: number,
  ground: (s: number) => number = () => 0,
): number[] {
  const seed = stone.seed ?? Math.round(stone.at * 97 + stone.lateral * 13 + stone.width * 7);
  const hw = stone.width / 2,
    hl = stone.length / 2;
  const deg = Math.PI / 180;
  // Tilted rock is buried deeper so its raised edge never lifts off the ground.
  const tiltDepth =
    hw * Math.abs(Math.sin((stone.rollDeg ?? 0) * deg)) +
    hl * Math.abs(Math.sin((stone.pitchDeg ?? 0) * deg));
  let pts: number[];
  if (stone.shape === 'boulder') {
    const ry = stone.height * 0.85;
    pts = boulderPoints(hw, ry, hl, seed);
    for (let i = 1; i < pts.length; i += 3) pts[i] += stone.height - ry;
  } else if (stone.shape === 'ridge') {
    // Local -z faces along the track, so profile distances flip sign.
    const profile = stone.profile ?? [
      [-hl, 0],
      [0, stone.height],
      [hl, 0],
    ];
    pts = ridgePoints(
      hw,
      profile.map(([s, h, slope]) => [-s, h, slope, ground(s)] as const),
      0.45,
      seed,
      stone.rollDeg ?? 0,
    );
    return orientPoints(pts, (-headingDeg + (stone.yawDeg ?? 0)) * deg, 0, 0);
  } else {
    const buried = 0.35 + tiltDepth;
    const hy = (stone.height + buried) / 2;
    pts = Array.from(rockShape(hw, hy, hl, 0.1).vertices);
    const rand = mulberry32(seed);
    for (let i = 0; i < pts.length; i += 3) {
      pts[i + 1] += (stone.height - buried) / 2;
      if (pts[i + 1] > stone.height - 0.15) pts[i + 1] += (rand() - 0.5) * 0.04;
    }
  }
  return orientPoints(
    pts,
    (-headingDeg + (stone.yawDeg ?? 0)) * deg,
    (stone.pitchDeg ?? 0) * deg,
    (stone.rollDeg ?? 0) * deg,
  );
}

export function trailStones(
  trail: CrawlTrailDef,
  tracks: readonly TrackInfo[],
  terrain: Terrain,
): StaticRock[] {
  const track = tracks.find((t) => t.def.id === trail.trackId);
  if (!track) throw new Error(`Missing crawl trail track ${trail.trackId}`);
  return trail.sections.flatMap((section) =>
    (section.stones ?? []).map((stone) => {
      const p = trailPoint(track, stone.at, stone.lateral);
      const h = terrain.heightAt(p.x, p.z);
      const a = (p.headingDeg * Math.PI) / 180;
      const ground = (s: number) => terrain.heightAt(p.x + Math.sin(a) * s, p.z - Math.cos(a) * s) - h;
      return {
        x: p.x,
        y: h + (stone.base ?? 0),
        z: p.z,
        ...stoneMesh(stonePoints(stone, p.headingDeg, ground)),
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
      // A fallen trunk rests on the highest ground across the track, 30% sunk in: the
      // edge of the upper hull of that ground profile under its middle. Beyond the
      // track its ends run into the banks or hang free over a dip.
      const n = 16,
        span = Math.min(1, (track.def.width / 2 + 0.6) / (log.length / 2));
      const rest = Array.from({ length: n + 1 }, (_, i) => {
        const t = 0.5 + span * (i / n - 0.5);
        return [
          t,
          terrain.heightAt(centre.x + dx * (2 * t - 1), centre.z + dz * (2 * t - 1)) + log.radius * 0.7,
        ];
      });
      const hull: number[][] = [];
      for (const p of rest) {
        while (hull.length >= 2) {
          const [a, b] = hull.slice(-2);
          if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) break;
          hull.pop();
        }
        hull.push(p);
      }
      const k = hull.findIndex((p) => p[0] >= 0.5);
      const [p0, p1] = k <= 0 ? [hull[0], hull[1]] : [hull[k - 1], hull[k]];
      const y = (t: number) => p0[1] + ((p1[1] - p0[1]) * (t - p0[0])) / (p1[0] - p0[0]);
      return {
        a: [centre.x - dx, y(0), centre.z - dz] as [number, number, number],
        b: [centre.x + dx, y(1), centre.z + dz] as [number, number, number],
        radius: log.radius,
      };
    }),
  );
}

/** Rendering and collision use this exact capped nine-sided log mesh. */
export function staticLogMesh(log: StaticLog) {
  const batcher = new StaticMeshBatcher(256);
  batcher.prism('wood', log.a, log.b, log.radius, 9, -Math.PI / 2);
  return batcher.batches.values().next().value!;
}
