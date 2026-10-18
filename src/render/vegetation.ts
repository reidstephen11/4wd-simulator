import * as THREE from 'three';
import { groundCover, treeSpecies, type TreeSpecies } from '../data/vegetation';
import type { QualityPreset } from '../data/quality';
import { SurfaceId } from '../data/surfaces';
import type { World } from '../sim/world/world';
import { GroundTint } from '../sim/world/terrain';
import { hash2, mulberry32 } from '../sim/world/rng';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';
import { createFoliageMaterials } from './foliage';
import { Meadow } from './meadow';

const SPECIES: TreeSpecies[] = ['ash', 'candlebark', 'snowgum', 'dead'];
/** Nominal model heights; instances scale to their own height. */
/** Tree LOD value for "not drawn". */
const HIDDEN = 3;

const NOMINAL: Record<TreeSpecies, number> = { ash: 28, candlebark: 17, snowgum: 7.5, dead: 13 };

function canopyColor(rand: () => number, dark: boolean): THREE.Color {
  const c = dark ? pal('foliageDark').clone().lerp(pal('foliage'), 0.4) : pal('foliage').clone();
  return c.lerp(pal('grassSage'), 0.1 + rand() * 0.2);
}

/** Canopy centre height, horizontal radius and vertical radius (fractions of height) for the distant model. */
const FAR_CANOPY: Record<TreeSpecies, [number, number, number] | null> = {
  ash: [0.78, 0.2, 0.15],
  candlebark: [0.8, 0.28, 0.16],
  snowgum: [0.72, 0.5, 0.2],
  dead: null,
};

/**
 * Build one tree model (local origin at the trunk base). `lod` 0 = near, 1 = mid,
 * 2 = distant (a three-sided trunk and one eight-sided canopy, ~14 triangles).
 */
export function buildTree(species: TreeSpecies, variant: number, lod: number): THREE.BufferGeometry {
  const H = NOMINAL[species];
  const def = treeSpecies[species];
  if (lod === 2) return buildFarTree(species, variant);
  const seed = SPECIES.indexOf(species) * 100 + variant * 10 + lod;
  const rand = mulberry32(seed + 17);
  const b = new MeshBuilder(seed);
  const trunkR = (def.trunkRadius[0] + def.trunkRadius[1]) / 2;
  const bark = species === 'dead' ? pal('barkPale').clone().multiplyScalar(0.85) : pal('barkPale');
  const ochre = pal('barkOchre');
  const sides = lod === 0 ? 10 : 6;
  const blob = (x: number, y: number, z: number, r: number, dark: boolean, squash = 0.75) => {
    b.push().translate(x, y, z);
    const color = canopyColor(rand, dark);
    const count = lod === 0 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      b.push().rotate((rand() - 0.5) * 1.7, (i / count) * Math.PI + rand() * 0.3, (rand() - 0.5) * 0.6);
      b.foliageCard(r * 2.5, r * 2.2 * squash, color);
      b.pop();
    }
    b.pop();
  };
  const limb = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    r0: number,
    r1: number,
  ) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize(),
    );
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    b.push(m);
    b.cylinder(r1, r0, len, sides, rand() < 0.3 ? ochre : bark, false);
    b.pop();
  };

  if (species === 'ash') {
    // Tall straight trunk, ochre peeling bark low down, canopy clumped near the top.
    b.push().translate(0, H * 0.18, 0);
    b.cylinder(trunkR * 0.85, trunkR, H * 0.36, sides, bark.clone().lerp(ochre, 0.55), false);
    b.pop();
    limb(0, H * 0.35, 0, 0.3, H * 0.8, 0.2, trunkR * 0.85, trunkR * 0.35);
    const n = lod === 0 ? 5 + variant : 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      const rr = H * (0.07 + rand() * 0.06);
      blob(
        Math.cos(a) * rr,
        H * (0.66 + rand() * 0.24),
        Math.sin(a) * rr,
        H * (0.12 + rand() * 0.05),
        i % 2 === 0,
      );
    }
  } else if (species === 'candlebark') {
    limb(0, -0.3, 0, 0, H * 0.45, 0, trunkR, trunkR * 0.75);
    const branches = lod === 0 ? 3 : 2;
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + variant;
      const ex = Math.cos(a) * H * 0.18;
      const ez = Math.sin(a) * H * 0.18;
      const ey = H * (0.72 + rand() * 0.12);
      limb(0, H * 0.43, 0, ex, ey, ez, trunkR * 0.6, trunkR * 0.25);
      blob(ex, ey + H * 0.04, ez, H * (0.13 + rand() * 0.04), i % 2 === 1);
    }
    if (lod === 0) blob(0, H * 0.9, 0, H * 0.12, false);
  } else if (species === 'snowgum') {
    // Short, crooked, multi-stemmed, with a wide canopy.
    const lean = (variant ? -1 : 1) * 0.6;
    limb(0, -0.2, 0, lean, H * 0.35, 0.2, trunkR, trunkR * 0.8);
    const branches = lod === 0 ? 4 : 2;
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + variant * 0.7;
      const ex = lean + Math.cos(a) * H * 0.32;
      const ez = 0.2 + Math.sin(a) * H * 0.32;
      const ey = H * (0.62 + rand() * 0.15);
      limb(lean, H * 0.33, 0.2, ex, ey, ez, trunkR * 0.7, trunkR * 0.3);
      blob(ex, ey + H * 0.05, ez, H * (0.2 + rand() * 0.06), i % 2 === 0, 0.6);
    }
    if (lod === 0) blob(lean, H * 0.85, 0.2, H * 0.22, false, 0.55);
  } else {
    // Dead stag: pale trunk and bare limbs.
    limb(0, -0.3, 0, 0, H * 0.75, 0, trunkR, trunkR * 0.5);
    const limbs = lod === 0 ? 3 : 1;
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + variant;
      const y0 = H * (0.45 + i * 0.12);
      limb(
        0,
        y0,
        0,
        Math.cos(a) * H * 0.2,
        y0 + H * 0.22,
        Math.sin(a) * H * 0.2,
        trunkR * 0.4,
        trunkR * 0.12,
      );
    }
  }
  return b.build();
}

function buildFarTree(species: TreeSpecies, variant: number): THREE.BufferGeometry {
  const H = NOMINAL[species];
  const def = treeSpecies[species];
  const b = new MeshBuilder(SPECIES.indexOf(species) * 100 + variant * 10 + 2);
  const rand = mulberry32(SPECIES.indexOf(species) * 100 + variant * 10 + 19);
  const trunkR = (def.trunkRadius[0] + def.trunkRadius[1]) / 2;
  const canopy = FAR_CANOPY[species];
  const trunkH = canopy ? H * canopy[0] : H * 0.8;
  b.push().translate(0, trunkH / 2 - 0.3, 0);
  b.cylinder(trunkR * 0.5, trunkR, trunkH, 3, pal('barkPale'), false);
  b.pop();
  if (canopy) {
    const [cy, rx, ry] = canopy;
    const c = canopyColor(rand, false).lerp(pal('foliageDark'), 0.25);
    for (let i = 0; i < 2; i++) {
      b.push()
        .translate(0, H * cy, 0)
        .rotate(0, variant + (i * Math.PI) / 2, 0);
      b.foliageCard(H * rx * 2.6, H * ry * 3, c);
      b.pop();
    }
  }
  return b.build();
}

function buildRock(variant: number, detail: number): THREE.BufferGeometry {
  const b = new MeshBuilder(900 + variant);
  const rand = mulberry32(variant + 31);
  const c = pal('rock')
    .clone()
    .lerp(pal('rockDark'), rand() * 0.45);
  b.blob(1, c, 0.22, detail, 1);
  return b.build();
}

/** Ring bolt and paint mark on top of a marked anchor boulder (unit radius). */
function buildAnchorMark(): THREE.BufferGeometry {
  const b = new MeshBuilder(77);
  b.vary = false;
  const steel = pal('vehicleTrim');
  const paint = pal('vehicleRoof');
  b.push().translate(0, 0.98, 0);
  b.cylinder(0.32, 0.32, 0.04, 8, paint, true, paint);
  b.pop();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.push()
      .translate(Math.cos(a) * 0.12, 1.08 + Math.sin(a) * 0.12, 0)
      .rotate(0, 0, a);
    b.box(0.05, 0.07, 0.05, steel);
    b.pop();
  }
  return b.build();
}

function buildLog(): THREE.BufferGeometry {
  const b = new MeshBuilder(55);
  const bark = pal('barkOchre').clone().lerp(pal('rockDark'), 0.35);
  b.push().rotate(Math.PI / 2, 0, 0);
  b.cylinder(1, 1, 1, 7, bark, true, pal('barkPale'));
  b.pop();
  return b.build();
}

function buildTussock(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(300 + variant);
  const rand = mulberry32(variant + 7);
  const blades = 15;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rand();
    const lean = 0.25 + rand() * 0.3;
    const h = 0.45 + rand() * 0.35;
    const col = (variant % 2 ? pal('grassDry') : pal('grassSage'))
      .clone()
      .lerp(pal('grassDry'), rand() * 0.5);
    const tip = { x: Math.cos(a) * lean, y: h, z: Math.sin(a) * lean };
    const w = 0.025 + rand() * 0.025;
    const p0 = { x: Math.cos(a + 1.6) * w, y: 0, z: Math.sin(a + 1.6) * w };
    const p1 = { x: Math.cos(a - 1.6) * w, y: 0, z: Math.sin(a - 1.6) * w };
    b.tri(p0, tip, p1, col);
    b.tri(p1, tip, p0, col.clone().multiplyScalar(0.85));
  }
  return b.build();
}

function buildShrub(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(400 + variant);
  const rand = mulberry32(variant + 13);
  for (let i = 0; i < 3; i++) {
    b.push().translate((rand() - 0.5) * 0.9, 0.35 + rand() * 0.3, (rand() - 0.5) * 0.9);
    b.blob(
      0.45 + rand() * 0.25,
      pal('foliage')
        .clone()
        .lerp(pal('grassSage'), rand() * 0.5),
      0.15,
      1,
      0.8,
    );
    b.pop();
  }
  return b.build();
}

function geometrySize(geos: THREE.BufferGeometry[]): number {
  return geos.reduce((n, g) => n + g.getAttribute('position').count, 0);
}

/** Ground-cover placement attempts per tile. */
export function coverTries(q: QualityPreset): number {
  const tile = groundCover.tile;
  return Math.round(
    ((tile * tile) / 100) * (groundCover.tussockDensity + groundCover.shrubDensity) * q.vegetationDensity,
  );
}

/**
 * Most ground-cover instances a quality level can place: every attempt succeeding in
 * every tile within reach (tile centres within grassDistance + 0.7 tiles of the eye).
 */
export function coverCapacity(q: QualityPreset): number {
  const reach = q.grassDistance / groundCover.tile + 0.7 + Math.SQRT1_2;
  return Math.ceil(Math.PI * reach * reach) * coverTries(q);
}

/**
 * Trees, rocks, logs (from the sim scatter) and decorative ground cover. Trees switch
 * between near and far models per instance; ground cover is generated in tiles around
 * the camera and only drawn close up.
 */
export class Vegetation {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private readonly trees: THREE.BatchedMesh;
  private readonly meadow: Meadow;
  private readonly treeGeo: number[][] = [];
  private readonly treeIds: number[] = [];
  private readonly treeLod: Uint8Array;
  private readonly cover: THREE.BatchedMesh;
  private readonly coverGeo: number[] = [];
  private readonly coverTiles = new Map<string, number[]>();
  private lodTimer = 0;
  private quality: QualityPreset;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();

  constructor(
    private readonly world: World,
    quality: QualityPreset,
  ) {
    this.quality = quality;
    this.material = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.name = 'vegetation';
    this.meadow = new Meadow(world, quality);
    this.group.add(this.meadow.mesh);

    // --- Trees ---
    const foliage = createFoliageMaterials();
    const geos: THREE.BufferGeometry[][] = SPECIES.map((s) =>
      [0, 1].flatMap((v) => [buildTree(s, v, 0), buildTree(s, v, 1), buildTree(s, v, 2)]),
    );
    const all = geos.flat();
    const list = world.scatter.trees;
    this.trees = new THREE.BatchedMesh(list.length, geometrySize(all), 0, foliage.material);
    this.trees.customDepthMaterial = foliage.depth;
    this.trees.castShadow = true;
    this.trees.receiveShadow = true;
    this.trees.sortObjects = false;
    for (const g of geos) this.treeGeo.push(g.map((geo) => this.trees.addGeometry(geo)));
    this.treeLod = new Uint8Array(list.length).fill(1);
    for (const t of list) {
      const si = SPECIES.indexOf(t.species);
      const variant = t.seed < 0.5 ? 0 : 1;
      const id = this.trees.addInstance(this.treeGeo[si][variant * 3 + 1]);
      const s = t.height / NOMINAL[t.species];
      this.tmpE.set(t.leanX, t.yaw, t.leanZ);
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpM.compose(this.tmpV.set(t.x, t.y, t.z), this.tmpQ, this.tmpS.set(s, s, s));
      this.trees.setMatrixAt(id, this.tmpM);
      const tint = 0.9 + t.seed * 0.2;
      this.trees.setColorAt(id, this.tmpC.setRGB(tint, tint, tint * (0.97 + t.seed * 0.06)));
      this.treeIds.push(id);
    }
    this.group.add(this.trees);

    // --- Rocks and logs ---
    const rockGeos = [0, 1, 2, 3].map((v) => buildRock(v, 0)).concat([4, 5, 6].map((v) => buildRock(v, 1)));
    const mark = buildAnchorMark();
    const log = buildLog();
    const rocks = world.scatter.rocks;
    const logs = world.scatter.logs;
    const anchorCount = rocks.filter((r) => r.anchor).length;
    const extras = [...rockGeos, mark, log];
    const rockMesh = new THREE.BatchedMesh(
      rocks.length + anchorCount + logs.length,
      geometrySize(extras),
      0,
      this.material,
    );
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    const rockIds = rockGeos.map((g) => rockMesh.addGeometry(g));
    const markId = rockMesh.addGeometry(mark);
    const logId = rockMesh.addGeometry(log);
    for (const r of rocks) {
      const big = r.radius > 1.2;
      const gi = big ? rockIds[4 + Math.floor(r.seed * 3)] : rockIds[Math.floor(r.seed * 4)];
      const id = rockMesh.addInstance(gi);
      this.tmpQ.setFromEuler(this.tmpE.set(0, r.yaw, 0));
      this.tmpM.compose(
        this.tmpV.set(r.x, r.y, r.z),
        this.tmpQ,
        this.tmpS.set(r.radius, r.radius * r.squash, r.radius),
      );
      rockMesh.setMatrixAt(id, this.tmpM);
      const k = 0.92 + r.seed * 0.16;
      rockMesh.setColorAt(id, this.tmpC.setRGB(k, k, k));
      if (r.anchor) {
        const mid = rockMesh.addInstance(markId);
        rockMesh.setMatrixAt(mid, this.tmpM);
        rockMesh.setColorAt(mid, this.tmpC.setRGB(1, 1, 1));
      }
    }
    for (const l of logs) {
      const id = rockMesh.addInstance(logId);
      this.tmpQ.setFromEuler(this.tmpE.set(0, l.yaw, 0));
      this.tmpM.compose(this.tmpV.set(l.x, l.y, l.z), this.tmpQ, this.tmpS.set(l.radius, l.radius, l.length));
      rockMesh.setMatrixAt(id, this.tmpM);
      rockMesh.setColorAt(id, this.tmpC.setRGB(1, 1, 1));
    }
    this.group.add(rockMesh);

    // --- Ground cover (filled in around the camera) ---
    const coverGeos = [buildTussock(0), buildTussock(1), buildTussock(2), buildShrub(0), buildShrub(1)];
    this.cover = new THREE.BatchedMesh(coverCapacity(quality), geometrySize(coverGeos), 0, this.material);
    this.cover.name = 'ground-cover';
    this.cover.castShadow = false;
    this.cover.receiveShadow = true;
    for (const g of coverGeos) this.coverGeo.push(this.cover.addGeometry(g));
    this.group.add(this.cover);
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    this.meadow.setQuality(q);
    for (const ids of this.coverTiles.values()) for (const id of ids) this.cover.deleteInstance(id);
    this.coverTiles.clear();
    this.cover.setInstanceCount(coverCapacity(q));
  }

  update(eye: THREE.Vector3, dt: number): void {
    this.meadow.update(eye, dt);
    this.lodTimer -= dt;
    if (this.lodTimer > 0) return;
    this.lodTimer = 0.2;
    const near2 = this.quality.treeLodDistance ** 2;
    const mid2 = this.quality.treeFarDistance ** 2;
    const far2 = (this.quality.drawDistance * 0.9) ** 2;
    const list = this.world.scatter.trees;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const dx = t.x - eye.x;
      const dz = t.z - eye.z;
      const d2 = dx * dx + dz * dz;
      const lod = d2 < near2 ? 0 : d2 < mid2 ? 1 : d2 < far2 ? 2 : HIDDEN;
      if (lod === this.treeLod[i]) continue;
      const id = this.treeIds[i];
      if (lod === HIDDEN) this.trees.setVisibleAt(id, false);
      else {
        if (this.treeLod[i] === HIDDEN) this.trees.setVisibleAt(id, true);
        const si = SPECIES.indexOf(t.species);
        const variant = t.seed < 0.5 ? 0 : 1;
        this.trees.setGeometryIdAt(id, this.treeGeo[si][variant * 3 + lod]);
      }
      this.treeLod[i] = lod;
    }
    this.updateCover(eye);
  }

  private updateCover(eye: THREE.Vector3): void {
    const tile = groundCover.tile;
    const R = this.quality.grassDistance;
    const inReach = (tx: number, tz: number) =>
      Math.hypot((tx + 0.5) * tile - eye.x, (tz + 0.5) * tile - eye.z) <= R + tile * 0.7;
    let changed = false;
    // Free tiles that fell out of reach before filling new ones, so the batch never runs out.
    for (const [key, ids] of this.coverTiles) {
      const [tx, tz] = key.split(',').map(Number);
      if (inReach(tx, tz)) continue;
      for (const id of ids) this.cover.deleteInstance(id);
      this.coverTiles.delete(key);
      changed = true;
    }
    const t0x = Math.floor((eye.x - R) / tile);
    const t1x = Math.floor((eye.x + R) / tile);
    const t0z = Math.floor((eye.z - R) / tile);
    const t1z = Math.floor((eye.z + R) / tile);
    for (let tz = t0z; tz <= t1z; tz++)
      for (let tx = t0x; tx <= t1x; tx++) {
        const key = `${tx},${tz}`;
        if (!inReach(tx, tz) || this.coverTiles.has(key)) continue;
        this.coverTiles.set(key, this.fillTile(tx, tz));
        changed = true;
      }
    // three.js keeps the batch's first bounding sphere; without this the whole batch is
    // culled once the camera leaves the area it was first drawn in.
    if (changed) this.cover.computeBoundingSphere();
  }

  private fillTile(tx: number, tz: number): number[] {
    const t = this.world.terrain;
    const f = this.world.features;
    const tile = groundCover.tile;
    const rand = mulberry32(Math.floor(hash2(tx, tz, this.world.map.seed + 77) * 1e9));
    const ids: number[] = [];
    const tries = coverTries(this.quality);
    const shrubShare = groundCover.shrubDensity / (groundCover.tussockDensity + groundCover.shrubDensity);
    for (let k = 0; k < tries; k++) {
      const x = (tx + rand()) * tile;
      const z = (tz + rand()) * tile;
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      if (!t.inBounds(x, z)) continue;
      const res = t.res;
      const i = Math.round(z + t.half) * res + Math.round(x + t.half);
      const tint = t.tint[i];
      const surf = t.surface[i];
      if (surf !== SurfaceId.Grass) continue;
      if (f.trackDistance[i] < 1 || f.creekDistance[i] < 1) continue;
      const forest = tint === GroundTint.ForestFloor;
      const shrub = r1 < (forest ? shrubShare * 4 : shrubShare * 0.35);
      if (!shrub && forest && r2 < 0.6) continue;
      if (this.cover.instanceCount >= this.cover.maxInstanceCount) break;
      const geo = shrub ? this.coverGeo[3 + Math.floor(r2 * 2)] : this.coverGeo[Math.floor(r2 * 3)];
      const id = this.cover.addInstance(geo);
      const s = shrub ? 0.8 + r3 * 0.9 : 0.7 + r3 * 0.6;
      this.tmpQ.setFromEuler(this.tmpE.set(0, r3 * Math.PI * 2, 0));
      this.tmpM.compose(
        this.tmpV.set(x, t.heightAt(x, z) - 0.05, z),
        this.tmpQ,
        this.tmpS.set(s, s * (0.8 + r2 * 0.4), s),
      );
      this.cover.setMatrixAt(id, this.tmpM);
      const k2 = 0.9 + r1 * 0.2;
      this.cover.setColorAt(id, this.tmpC.setRGB(k2, k2, k2));
      ids.push(id);
    }
    return ids;
  }
}
