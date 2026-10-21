import { puddleTuning as P, type EnvironmentConfig } from '../../data/environment';
import { SurfaceId } from '../../data/surfaces';
import { trailPoint, trailProgress } from './crawlTrail';
import { mulberry32 } from './rng';
import { GroundTint } from './terrain';
import type { World } from './world';

export interface Puddle {
  x: number;
  z: number;
  /** Water surface height (m) before the weather's creek offset. */
  level: number;
  /** Deepest water (m). */
  depth: number;
}

/**
 * After rain and in rain, press shallow dips into the flat stretches of the dirt and
 * gravel tracks and fill them with water: they are drawn, splashed through and heard
 * like the creek, and the muddy bottom is as slippery as a creek bed. Call before the
 * physics and the renderer are built (it changes the ground they read). Obstacle lines
 * (and where tracks meet them) and tracks with fine ground detail are left alone. Returns the puddles made.
 */
export function addPuddles(world: World, env: EnvironmentConfig): Puddle[] {
  if (env.wetness <= 0) return [];
  const t = world.terrain;
  const f = world.features;
  const cfg = env.rain > 0 ? P.rain : P.wet;
  const rand = mulberry32(world.map.seed * 7919 + 13);
  const lineIds = new Set((world.map.crawlTrails ?? []).map((trail) => trail.trackId));
  const obstacleLines = f.tracks.filter((track) => lineIds.has(track.def.id));
  const puddles: Puddle[] = [];
  const index = (ix: number, iz: number) => iz * t.res + ix;
  for (const track of f.tracks) {
    const d = track.def;
    if (d.faint || d.surface === 'rock' || d.surface === 'mud' || lineIds.has(d.id)) continue;
    if (d.humps?.length || d.erosion?.length || d.steps?.length || d.rockySteps?.length) continue;
    const L = track.poly.length;
    for (
      let s = P.clearEnds + rand() * cfg.spacing;
      s < L - P.clearEnds;
      s += cfg.spacing * (0.7 + 0.6 * rand())
    ) {
      if (rand() > cfg.chance) continue;
      const lateral = (rand() - 0.5) * d.width * 0.4;
      const c = trailPoint(track, s, lateral);
      // Only on flat stretches, away from the creek.
      const a = trailPoint(track, s - 2),
        b = trailPoint(track, s + 2);
      if (Math.abs(t.heightAt(b.x, b.z) - t.heightAt(a.x, a.z)) / 4 > P.maxGrade) continue;
      const ci = index(Math.round(c.x + t.half), Math.round(c.z + t.half));
      if (f.creekDistance[ci] < P.clearCreek) continue;
      // Nor where the track meets an obstacle line.
      if (
        obstacleLines.some(
          (line) => trailProgress(line, c.x, c.z).distance < line.def.width / 2 + P.clearLines,
        )
      )
        continue;
      const length = P.length[0] + rand() * (P.length[1] - P.length[0]);
      const width = Math.min(d.width * 0.95, P.width[0] + rand() * (P.width[1] - P.width[0]));
      const yaw = (c.headingDeg * Math.PI) / 180;
      // Along the track (u) and across it (v), in world x/z.
      const ux = Math.sin(yaw),
        uz = -Math.cos(yaw);
      const reach = Math.ceil(length / 2 + 1);
      const cells: Array<{ i: number; r: number }> = [];
      for (let iz = Math.round(c.z + t.half) - reach; iz <= Math.round(c.z + t.half) + reach; iz++)
        for (let ix = Math.round(c.x + t.half) - reach; ix <= Math.round(c.x + t.half) + reach; ix++) {
          if (ix < 1 || iz < 1 || ix >= t.res - 1 || iz >= t.res - 1) continue;
          const dx = ix - t.half - c.x,
            dz = iz - t.half - c.z;
          const u = (dx * ux + dz * uz) / (length / 2),
            v = (-dx * uz + dz * ux) / (width / 2);
          const r = Math.sqrt(u * u + v * v);
          if (r < 1.25) cells.push({ i: index(ix, iz), r });
        }
      // A bowl, deepest in the middle; the water stands at the lowest point of its rim.
      let rim = Infinity;
      for (const { i, r } of cells) {
        if (r < 1) t.heights[i] -= cfg.depth * (1 - r * r) * (1 - r * r * 0.3);
        else rim = Math.min(rim, t.heights[i]);
      }
      let bottom = Infinity;
      for (const { i, r } of cells) if (r < 1) bottom = Math.min(bottom, t.heights[i]);
      const level = rim - 0.02;
      // A bowl too small for the 1 m grid (no rim or no floor sample) holds no water.
      if (!Number.isFinite(rim) || !Number.isFinite(bottom) || !(level > bottom + 0.02)) continue;
      for (const { i, r } of cells) {
        if (r > 1.15) continue;
        t.water[i] = level - env.waterLevelOffset;
        if (t.heights[i] < level) {
          t.surface[i] = SurfaceId.Water;
          t.tint[i] = GroundTint.Mud;
        }
      }
      puddles.push({ x: c.x, z: c.z, level, depth: level - bottom });
    }
  }
  return puddles;
}
