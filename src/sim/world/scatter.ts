import {
  scatterTuning as S,
  treeSpecies,
  tropicalFlora as TF,
  type TreeSpecies,
} from '../../data/vegetation';
import { SurfaceId } from '../../data/surfaces';
import type { MapDef } from './mapTypes';
import type { TerrainFeatures } from './features';
import { Noise2D, smoothstep } from './noise';
import { mulberry32 } from './rng';
import { GroundTint, type Terrain } from './terrain';

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  species: TreeSpecies;
  height: number;
  trunkRadius: number;
  yaw: number;
  /** Small lean (radians) about x and z. */
  leanX: number;
  leanZ: number;
  /** 0..1 used to pick a model variant and colour. */
  seed: number;
  /** Inside the playable area (has a collider, can be an anchor). */
  solid: boolean;
}

export interface RockInstance {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Vertical squash (1 = round). */
  squash: number;
  yaw: number;
  anchor: boolean;
  /** The anchor's name in the winch chooser, where the map gives one. */
  label?: string;
  seed: number;
  solid: boolean;
  /** A termite mound: an earth spire, drawn as one but colliding like a rock. */
  mound?: boolean;
}

export interface LogInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  radius: number;
}

export interface Scatter {
  trees: TreeInstance[];
  rocks: RockInstance[];
  logs: LogInstance[];
}

/** Uniform grid over the map for fast "what's near here" queries. */
export class SpatialGrid<T extends { x: number; z: number }> {
  private readonly cells = new Map<number, T[]>();

  constructor(
    private readonly cell: number,
    items: Iterable<T>,
  ) {
    for (const it of items) this.insert(it);
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  insert(it: T): void {
    const k = this.key(Math.floor(it.x / this.cell), Math.floor(it.z / this.cell));
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(it);
  }

  /** Items within `r` of (x, z). */
  near(x: number, z: number, r: number, out: T[] = []): T[] {
    const c0x = Math.floor((x - r) / this.cell);
    const c1x = Math.floor((x + r) / this.cell);
    const c0z = Math.floor((z - r) / this.cell);
    const c1z = Math.floor((z + r) / this.cell);
    const r2 = r * r;
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const it of list) {
          const dx = it.x - x;
          const dz = it.z - z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    return out;
  }
}

/**
 * Seeded scatter of trees, boulders, tors and fallen logs (SPEC §5 step 3). Avoids
 * tracks, water, clearings, POIs and props. Same seed → same result.
 */
export function generateScatter(map: MapDef, terrain: Terrain, features: TerrainFeatures): Scatter {
  const rand = mulberry32(map.seed + 5000);
  const noise = new Noise2D(map.seed + 303);
  const { halfX, halfZ } = terrain;
  const veg = map.vegetation;
  const [wallX, wallZ] = map.wall;
  const nearIdx = (x: number, z: number) => terrain.index(x, z);
  const inClearing = (x: number, z: number, pad = 0) => {
    for (const c of veg.clearings) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius + pad) return true;
    }
    return false;
  };
  const nearProp = (x: number, z: number, r: number) =>
    map.props.some((p) => Math.hypot(p.x - x, p.z - z) < r) ||
    map.fallenTrees.some((f) => Math.hypot(f.x - x, f.z - z) < f.length * 0.7 + 2) ||
    map.gullies.some((g) => {
      const a = (g.headingDeg * Math.PI) / 180;
      const dx = x - g.x;
      const dz = z - g.z;
      const along = dx * Math.sin(a) - dz * Math.cos(a);
      const lat = Math.abs(dx * Math.cos(a) + dz * Math.sin(a));
      return Math.abs(along) < g.length / 2 + 4 && lat < 6;
    }) ||
    features.boxes.some((b) => b.kind === 'ledge' && Math.hypot(b.x - x, b.z - z) < 6) ||
    features.rocks.some((rock) => Math.hypot(rock.x - x, rock.z - z) < 6) ||
    features.timbers.some((t) => Math.hypot(t.x - x, t.z - z) < 5) ||
    features.gates.some(
      (g) => Math.hypot(g.left.x - x, g.left.z - z) < 3 || Math.hypot(g.right.x - x, g.right.z - z) < 3,
    );
  const blocked = (x: number, z: number, clearance: number) => {
    const i = nearIdx(x, z);
    if (features.trackDistance[i] < clearance) return true;
    if (features.creekDistance[i] < S.creekClearance) return true;
    if (terrain.water[i] > -1e5) return true;
    // Nothing grows in a river's dry sand bed.
    if (terrain.surface[i] === SurfaceId.Sand) return true;
    return false;
  };
  const edgeDist = (x: number, z: number) => Math.min(halfX - Math.abs(x), halfZ - Math.abs(z));
  const tropical = veg.flora === 'tropical';
  /** 1 deep in a woodland area, 0 in the rainforest, blending over the edge. */
  const woodlandAt = (x: number, z: number) => {
    let w = 0;
    for (const c of veg.woodland ?? [])
      w = Math.max(w, smoothstep(c.radius + 30, c.radius - 10, Math.hypot(x - c.x, z - c.z)));
    return w;
  };

  // --- Trees ---
  const trees: TreeInstance[] = [];
  const cell = S.treeCell;
  for (let gz = -halfZ; gz < halfZ; gz += cell) {
    for (let gx = -halfX; gx < halfX; gx += cell) {
      const x = gx + rand() * cell;
      const z = gz + rand() * cell;
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const r4 = rand();
      const h = terrain.heightAt(x, z);
      const slope = terrain.slopeDegAt(x, z);
      const edge = edgeDist(x, z);
      let dens: number;
      const nearCreek = features.creekDistance[nearIdx(x, z)];
      // Rainforest unless the noise below says otherwise; woodland reads its own field.
      const rainforest = tropical && r2 > woodlandAt(x, z);
      if (edge < map.border.width)
        dens = 0.55 + 0.45 * smoothstep(map.border.width, map.border.width * 0.3, edge);
      else if (rainforest) dens = 0.75 * TF.rainforestDensity * (veg.rainforestScale ?? 1);
      else if (tropical) dens = 0.45;
      else if (h > veg.snowGumAbove) dens = 0.24;
      else if (h > veg.ashBelow) dens = 0.62;
      else dens = 0.7;
      if (!tropical && nearCreek < 30 && h < veg.ashBelow) dens *= 0.35 + 0.65 * smoothstep(8, 30, nearCreek);
      dens *= smoothstep(-0.38, 0.32, noise.fbm(x / veg.patchScale, z / veg.patchScale, 3));
      dens *= 1 - smoothstep(32, 42, slope);
      if (dens <= 0.01) continue;
      const p = dens * veg.maxTreeDensity * ((cell * cell) / 100);
      if (r1 > p) continue;
      if (
        edge > -40 &&
        (inClearing(x, z) || blocked(x, z, veg.trackClearance) || nearProp(x, z, S.propClearance))
      )
        continue;
      if (edge < -60) continue;
      let species: TreeSpecies;
      if (rainforest) {
        const fern = nearCreek < TF.creekReach ? TF.fernNearCreek : TF.fernShare;
        species = r3 < fern ? 'treefern' : r3 < fern + TF.palmShare ? 'fanpalm' : 'rainforest';
      } else if (tropical) species = r3 < 0.04 ? 'dead' : r3 < 0.7 ? 'candlebark' : 'ash';
      else if (r2 < S.deadShare) species = 'dead';
      else if (h > veg.snowGumAbove) species = r3 < 0.85 ? 'snowgum' : 'candlebark';
      else if (h > veg.ashBelow) species = r3 < 0.7 ? 'candlebark' : r3 < 0.85 ? 'ash' : 'snowgum';
      else species = r3 < 0.6 ? 'ash' : 'candlebark';
      const def = treeSpecies[species];
      const s = r4;
      const height = def.height[0] + (def.height[1] - def.height[0]) * s;
      const trunkRadius = def.trunkRadius[0] + (def.trunkRadius[1] - def.trunkRadius[0]) * s;
      const lean = species === 'snowgum' || species === 'treefern' ? 0.18 : 0.05;
      trees.push({
        x,
        y: h - 0.3,
        z,
        species,
        height,
        trunkRadius,
        yaw: rand() * Math.PI * 2,
        leanX: (rand() - 0.5) * lean,
        leanZ: (rand() - 0.5) * lean,
        seed: rand(),
        solid: Math.abs(x) < wallX + 2 && Math.abs(z) < wallZ + 2,
      });
    }
  }

  // A tree beside either end of each deep or long bog (and its middle, if long), so a
  // vehicle bogged in it has something to winch from, ahead whichever way it came.
  for (const b of features.mudHoles) {
    if (!b.winchTrees) continue;
    const a = (b.rotationDeg * Math.PI) / 180;
    // Along the bog (its local z) and across it.
    const [ux, uz] = [-Math.sin(a), Math.cos(a)];
    const [vx, vz] = [Math.cos(a), Math.sin(a)];
    const spots = b.radiusZ > 10 ? [-1, 0, 1] : [-1, 1];
    for (const end of spots) {
      const along = end * (b.radiusZ + 5);
      const spot = [4, -4, 6, -6, 8, -8]
        .map((side) => side + Math.sign(side) * b.radiusX)
        .map((lateral) => [b.x + ux * along + vx * lateral, b.z + uz * along + vz * lateral] as const)
        .find(([x, z]) => {
          if (!terrain.inBounds(x, z) || terrain.slopeDegAt(x, z) > 30) return false;
          const i = nearIdx(x, z);
          return features.trackDistance[i] >= 2 && terrain.water[i] <= -1e5;
        });
      if (!spot) continue;
      const [x, z] = spot;
      if (trees.some((t) => t.solid && Math.hypot(t.x - x, t.z - z) < 4)) continue;
      const species: TreeSpecies = tropical ? (woodlandAt(x, z) > 0.5 ? 'ash' : 'rainforest') : 'candlebark';
      const def = treeSpecies[species];
      trees.push({
        x,
        y: terrain.heightAt(x, z) - 0.3,
        z,
        species,
        height: (def.height[0] + def.height[1]) / 2,
        trunkRadius: def.trunkRadius[1],
        yaw: rand() * Math.PI * 2,
        leanX: 0,
        leanZ: 0,
        seed: rand(),
        solid: Math.abs(x) < wallX + 2 && Math.abs(z) < wallZ + 2,
      });
    }
  }

  // --- Rocks: hand-placed, tors, then scattered ---
  const rocks: RockInstance[] = [];
  const addRock = (
    x: number,
    z: number,
    radius: number,
    anchor: boolean,
    sink = 0.35,
    squash = 0.8,
    label?: string,
  ) => {
    // Seat on the lowest ground under the inner footprint so a boulder on a slope has no
    // gap beneath its downhill side.
    let ground = terrain.heightAt(x, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ground = Math.min(
        ground,
        terrain.heightAt(x + Math.cos(a) * radius * 0.6, z + Math.sin(a) * radius * 0.6),
      );
    }
    const y = ground + radius * squash * (1 - 2 * sink);
    rocks.push({
      x,
      y,
      z,
      radius,
      squash,
      yaw: rand() * Math.PI * 2,
      anchor,
      ...(label ? { label } : {}),
      seed: rand(),
      solid: Math.abs(x) < wallX + 2 && Math.abs(z) < wallZ + 2,
    });
  };
  for (const b of map.boulders) addRock(b.x, b.z, b.radius, !!b.anchor, b.sink ?? 0.3, 0.85, b.label);
  for (const t of map.tors) {
    for (let k = 0; k < t.count; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * t.radius;
      const r = 1.6 + rand() * 2.8;
      addRock(
        t.x + Math.cos(a) * d,
        t.z + Math.sin(a) * d,
        r,
        k === 0,
        0.2 + rand() * 0.2,
        0.75 + rand() * 0.3,
      );
    }
    // A couple of perched boulders on top.
    for (let k = 0; k < Math.floor(t.count / 3); k++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * t.radius * 0.5;
      const x = t.x + Math.cos(a) * d;
      const z = t.z + Math.sin(a) * d;
      const r = 1.2 + rand() * 1.5;
      rocks.push({
        x,
        y: terrain.heightAt(x, z) + 2.4 + rand() * 1.5,
        z,
        radius: r,
        squash: 0.8,
        yaw: rand() * Math.PI * 2,
        anchor: false,
        seed: rand(),
        solid: true,
      });
    }
  }
  const rcell = S.rockCell;
  for (let gz = -halfZ; gz < halfZ; gz += rcell) {
    for (let gx = -halfX; gx < halfX; gx += rcell) {
      const x = gx + rand() * rcell;
      const z = gz + rand() * rcell;
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const i = nearIdx(x, z);
      const slope = terrain.slopeDegAt(x, z);
      let f = 1;
      if (slope > 14) f *= 2.5;
      if (terrain.surface[i] === SurfaceId.Rock) f *= 4;
      if (terrain.heightAt(x, z) > veg.snowGumAbove) f *= 1.8;
      if (edgeDist(x, z) < map.border.width) f *= 1.5;
      const p = veg.boulderDensity * f * ((rcell * rcell) / 100);
      if (r1 > p) continue;
      if (inClearing(x, z, -8) || blocked(x, z, 1.5) || nearProp(x, z, 6)) continue;
      const radius = 0.35 + r2 * r2 * 1.6;
      const anchor = radius >= S.anchorRockRadius && r3 < S.markedShare;
      addRock(x, z, radius, anchor, 0.3 + rand() * 0.15, 0.6 + rand() * 0.35);
    }
  }

  // --- Decorative fallen logs in the forest ---
  const logs: LogInstance[] = [];
  const lcell = S.logCell;
  for (let gz = -halfZ; gz < halfZ; gz += lcell) {
    for (let gx = -halfX; gx < halfX; gx += lcell) {
      const x = gx + rand() * lcell;
      const z = gz + rand() * lcell;
      const r1 = rand();
      if (Math.abs(x) > wallX - 5 || Math.abs(z) > wallZ - 5) continue;
      if (terrain.heightAt(x, z) > veg.snowGumAbove + 10 || r1 > 0.12) continue;
      if (terrain.slopeDegAt(x, z) > 22) continue;
      const length = 4 + rand() * 6;
      const yaw = rand() * Math.PI;
      const ex = Math.sin(yaw) * length * 0.5;
      const ez = Math.cos(yaw) * length * 0.5;
      if (
        inClearing(x, z, 5) ||
        blocked(x, z, 4) ||
        blocked(x + ex, z + ez, 3) ||
        blocked(x - ex, z - ez, 3) ||
        nearProp(x, z, 12)
      )
        continue;
      const radius = 0.18 + rand() * 0.16;
      const y =
        Math.min(terrain.heightAt(x + ex, z + ez), terrain.heightAt(x - ex, z - ez), terrain.heightAt(x, z)) +
        radius * 0.7;
      logs.push({ x, y, z, yaw, length, radius });
    }
  }

  // --- Termite mounds: earth spires on the open, gentler grassland ---
  const mcell = 20;
  const moundChance = ((veg.termiteMounds ?? 0) * mcell * mcell) / 10000;
  if (moundChance > 0) {
    const treeGrid = new SpatialGrid(8, trees);
    for (let gz = -halfZ; gz < halfZ; gz += mcell) {
      for (let gx = -halfX; gx < halfX; gx += mcell) {
        const x = gx + rand() * mcell;
        const z = gz + rand() * mcell;
        const r1 = rand();
        const r2 = rand();
        const r3 = rand();
        if (r1 > moundChance || terrain.slopeDegAt(x, z) > 14) continue;
        if (terrain.surface[nearIdx(x, z)] !== SurfaceId.Grass) continue;
        if (inClearing(x, z, -4) || blocked(x, z, 3) || nearProp(x, z, 8)) continue;
        if (treeGrid.near(x, z, 1.6).length > 0) continue;
        // Most come to the knee or the waist; a few stand taller than a person.
        const height = 0.5 + r2 * r2 * 2.2 + (r3 < 0.08 ? 1.6 : 0);
        const radius = 0.32 + height * 0.15;
        let ground = terrain.heightAt(x, z);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ground = Math.min(ground, terrain.heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius));
        }
        rocks.push({
          x,
          y: ground + height / 2 - 0.12,
          z,
          radius,
          squash: height / (2 * radius),
          yaw: rand() * Math.PI * 2,
          anchor: false,
          seed: rand(),
          solid: Math.abs(x) < wallX + 2 && Math.abs(z) < wallZ + 2,
          mound: true,
        });
      }
    }
  }

  // Forest floor shows under canopies (render tint only).
  for (const t of trees) {
    if (t.species === 'dead') continue;
    const r = Math.max(2, t.height * treeSpecies[t.species].canopy * 0.6);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const i = nearIdx(t.x + dx, t.z + dz);
        const tint = terrain.tint[i];
        if (tint === GroundTint.GrassDry || tint === GroundTint.GrassSage)
          terrain.tint[i] = GroundTint.ForestFloor;
      }
  }

  return { trees, rocks, logs };
}
