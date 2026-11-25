import { puddleTuning as P, type EnvironmentConfig } from '../../data/environment';
import { SurfaceId } from '../../data/surfaces';
import { trailPoint, trailProgress } from './crawlTrail';
import { mulberry32 } from './rng';
import { GroundTint, NO_WATER } from './terrain';
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
 * After rain and in rain, fill the rough tracks' mud holes, and press shallow dips into
 * the flat stretches of the dirt and gravel tracks and fill them with water: they are drawn, splashed through and heard
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
  const index = (ix: number, iz: number) => iz * t.resX + ix;
  // The rough tracks' mud holes fill to their lowest rim, hiding how deep they are.
  for (const b of f.mudHoles) {
    const a = (b.rotationDeg * Math.PI) / 180;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const R = Math.ceil(Math.max(b.radiusX, b.radiusZ) * 1.3);
    const cells: Array<{ i: number; r: number }> = [];
    for (let iz = Math.round(b.z + t.halfZ) - R; iz <= Math.round(b.z + t.halfZ) + R; iz++)
      for (let ix = Math.round(b.x + t.halfX) - R; ix <= Math.round(b.x + t.halfX) + R; ix++) {
        if (ix < 1 || iz < 1 || ix >= t.resX - 1 || iz >= t.resZ - 1) continue;
        const x = ix - t.halfX - b.x,
          z = iz - t.halfZ - b.z;
        const r = Math.hypot((x * ca + z * sa) / b.radiusX, (-x * sa + z * ca) / b.radiusZ);
        if (r < 1.3) cells.push({ i: index(ix, iz), r });
      }
    let rim = Infinity;
    let bottom = Infinity;
    for (const { i, r } of cells)
      if (r >= 1.05) rim = Math.min(rim, t.heights[i]);
      else bottom = Math.min(bottom, t.heights[i]);
    const level = rim - 0.03;
    if (!Number.isFinite(rim) || !(level > bottom + 0.05)) continue;
    for (const { i, r } of cells)
      if (r < 1.15 && t.heights[i] < level + 0.1) t.water[i] = level - env.waterLevelOffset;
    puddles.push({ x: b.x, z: b.z, level, depth: level - bottom });
  }
  // Creek-bank bogs: a shallow puddle in the hollow, drawn as water, but the floor stays
  // sticky black soil. Filling to the rim and painting Water would make them a second creek.
  for (const b of world.map.bogs) {
    if (!b.id.includes('-creek-')) continue;
    const a = (b.rotationDeg * Math.PI) / 180;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const R = Math.ceil(Math.max(b.radiusX, b.radiusZ) * 1.2);
    const cells: Array<{ i: number; r: number }> = [];
    for (let iz = Math.round(b.z + t.halfZ) - R; iz <= Math.round(b.z + t.halfZ) + R; iz++)
      for (let ix = Math.round(b.x + t.halfX) - R; ix <= Math.round(b.x + t.halfX) + R; ix++) {
        if (ix < 1 || iz < 1 || ix >= t.resX - 1 || iz >= t.resZ - 1) continue;
        const x = ix - t.halfX - b.x,
          z = iz - t.halfZ - b.z;
        const r = Math.hypot((x * ca + z * sa) / b.radiusX, (-x * sa + z * ca) / b.radiusZ);
        if (r < 1.15) cells.push({ i: index(ix, iz), r });
      }
    // Water in the ruts, following the ground. A single pond level on a bank either
    // skips (the downhill rim sits below the floor) or becomes a second creek.
    let wet = 0;
    let low = Infinity;
    const stride = t.resX;
    for (const { i, r } of cells) {
      if (r > 0.88) continue;
      const h = t.heights[i];
      const avg = (t.heights[i - 1] + t.heights[i + 1] + t.heights[i - stride] + t.heights[i + stride]) / 4;
      if (!(h < avg - 0.02)) continue;
      const level = Math.min(avg - 0.01, h + 0.08);
      if (!(level > h + 0.02)) continue;
      if (t.water[i] <= NO_WATER) t.water[i] = level - env.waterLevelOffset;
      wet++;
      low = Math.min(low, h);
    }
    if (wet) puddles.push({ x: b.x, z: b.z, level: low + 0.08, depth: 0.08 });
  }
  for (const track of f.tracks) {
    const d = track.def;
    if (d.faint || d.surface === 'rock' || d.surface === 'concrete' || lineIds.has(d.id)) continue;
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
      const ci = index(Math.round(c.x + t.halfX), Math.round(c.z + t.halfZ));
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
      for (let iz = Math.round(c.z + t.halfZ) - reach; iz <= Math.round(c.z + t.halfZ) + reach; iz++)
        for (let ix = Math.round(c.x + t.halfX) - reach; ix <= Math.round(c.x + t.halfX) + reach; ix++) {
          if (ix < 1 || iz < 1 || ix >= t.resX - 1 || iz >= t.resZ - 1) continue;
          const dx = ix - t.halfX - c.x,
            dz = iz - t.halfZ - c.z;
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
