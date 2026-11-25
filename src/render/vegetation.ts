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
import { createFoliageMaterials, leafQuadrant } from './foliage';
import { Meadow } from './meadow';
import { cullTreesBySphere } from './treeCulling';

const SPECIES: TreeSpecies[] = ['ash', 'candlebark', 'snowgum', 'dead', 'rainforest', 'fanpalm', 'treefern'];
/** Nominal model heights; instances scale to their own height. */
/** Tree LOD value for "not drawn". */
const HIDDEN = 3;
/** Size (m) of the map tiles the trees are batched in. */
const TREE_TILE = 384;
/** Seconds for one pass over every tree's detail level. */
const LOD_PASS = 0.2;

const NOMINAL: Record<TreeSpecies, number> = {
  ash: 28,
  candlebark: 17,
  snowgum: 7.5,
  dead: 13,
  rainforest: 26,
  fanpalm: 6.5,
  treefern: 4.5,
};

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
  rainforest: [0.76, 0.34, 0.17],
  fanpalm: [0.9, 0.3, 0.14],
  treefern: [0.92, 0.48, 0.16],
};

/** Rainforest greens: glossy canopy, palms and ferns each a little different. */
function tropicalColor(species: TreeSpecies, rand: () => number, dark: boolean): THREE.Color {
  const base =
    species === 'fanpalm' ? pal('palmLeaf') : species === 'treefern' ? pal('fernLeaf') : pal('rainforest');
  const c = base.clone();
  if (dark) c.lerp(pal('rainforestDark'), 0.55);
  return c.lerp(pal('grassSage'), rand() * 0.12);
}

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
  // Eucalypts have pale bark peeling to ochre; rainforest trees, palms and ferns don't.
  const tropical = species === 'rainforest' || species === 'fanpalm' || species === 'treefern';
  const bark = tropical
    ? pal('barkGrey')
    : species === 'dead'
      ? pal('barkPale').clone().multiplyScalar(0.85)
      : pal('barkPale');
  const ochre = tropical ? pal('barkGrey').clone().multiplyScalar(0.85) : pal('barkOchre');
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

  if (species === 'rainforest') {
    // Straight grey trunk standing on buttress roots, branching high into a broad crown.
    const grey = pal('barkGrey');
    b.push().translate(0, H * 0.3 - 0.3, 0);
    b.cylinder(trunkR * 0.7, trunkR, H * 0.6, sides, grey, false);
    b.pop();
    const fins = lod === 0 ? 4 : 3;
    for (let i = 0; i < fins; i++) {
      const a = (i / fins) * Math.PI * 2 + variant;
      const reach = trunkR * (3.2 + rand());
      const tall = H * (0.08 + rand() * 0.04);
      const out = { x: Math.cos(a) * reach, y: -0.3, z: Math.sin(a) * reach };
      const col = grey.clone().multiplyScalar(0.9);
      // A thin wedge from the trunk out along the ground, both faces.
      b.tri({ x: 0, y: tall, z: 0 }, out, { x: 0, y: -0.3, z: 0 }, col);
      b.tri({ x: 0, y: -0.3, z: 0 }, out, { x: 0, y: tall, z: 0 }, col);
    }
    const branches = lod === 0 ? 4 : 3;
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + variant * 0.9 + rand() * 0.4;
      const ex = Math.cos(a) * H * 0.22;
      const ez = Math.sin(a) * H * 0.22;
      const ey = H * (0.74 + rand() * 0.08);
      limb(0, H * 0.56, 0, ex, ey, ez, trunkR * 0.55, trunkR * 0.22);
    }
    const n = lod === 0 ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const rr = H * (i === 0 ? 0 : 0.14 + rand() * 0.14);
      const r = H * (0.15 + rand() * 0.05);
      b.push().translate(Math.cos(a) * rr, H * (0.76 + rand() * 0.14), Math.sin(a) * rr);
      const count = lod === 0 ? 4 : 3;
      for (let k = 0; k < count; k++) {
        b.push().rotate((rand() - 0.5) * 1.4, (k / count) * Math.PI + rand() * 0.3, (rand() - 0.5) * 0.5);
        b.foliageCard(r * 2.6, r * 1.7, tropicalColor(species, rand, k % 2 === 1), leafQuadrant.broad);
        b.pop();
      }
      b.pop();
    }
  } else if (species === 'fanpalm') {
    // A slender trunk and a crown of round fans on long stalks.
    const top = { x: (variant - 0.5) * 0.3, y: H * 0.62, z: 0.1 };
    limb(0, -0.3, 0, top.x, top.y, top.z, trunkR, trunkR * 0.8);
    const leaves = lod === 0 ? 12 : 6;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + rand() * 0.4;
      // Upper leaves stand up, lower ones splay out.
      const rise = 0.35 + (i % 3) * 0.3 + rand() * 0.15;
      const stalk = H * (0.22 + rand() * 0.12);
      const end = {
        x: top.x + Math.cos(a) * Math.cos(rise) * stalk,
        y: top.y + Math.sin(rise) * stalk,
        z: top.z + Math.sin(a) * Math.cos(rise) * stalk,
      };
      if (lod === 0) limb(top.x, top.y, top.z, end.x, end.y, end.z, 0.025, 0.015);
      const size = H * (0.3 + rand() * 0.08);
      // The fan faces outward and up, tilted back from its stalk.
      b.push()
        .translate(end.x, end.y, end.z)
        .rotate(0, -a + Math.PI / 2, 0)
        .rotate(-(Math.PI / 2 - rise) * 0.8 - 0.25, 0, (rand() - 0.5) * 0.3);
      b.foliageCard(size, size, tropicalColor(species, rand, i % 2 === 1), leafQuadrant.fan);
      b.pop();
    }
  } else if (species === 'treefern') {
    // A thick fibrous trunk and a shuttlecock of arching fronds.
    const brown = pal('barkOchre').clone().lerp(pal('rockDark'), 0.6);
    const top = { x: (variant - 0.5) * 0.4, y: H * 0.82, z: 0 };
    limb(0, -0.3, 0, top.x, top.y, top.z, trunkR, trunkR * 0.85);
    const fronds = lod === 0 ? 10 : 6;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + rand() * 0.3;
      const len = H * (0.55 + rand() * 0.15);
      const col = tropicalColor(species, rand, i % 2 === 1);
      // Inner half rises steeply, outer half arches over and droops.
      b.push()
        .translate(top.x, top.y, top.z)
        .rotate(0, -a, 0)
        .rotate(0, 0, -0.55 - rand() * 0.2);
      b.foliageCard(len * 0.45, len * 0.55, col, leafQuadrant.frond, 'base');
      b.translate(0, len * 0.52, 0).rotate(0, 0, -0.75);
      b.foliageCard(len * 0.4, len * 0.5, col.clone().multiplyScalar(0.92), leafQuadrant.frond, 'base');
      b.pop();
    }
    if (lod === 0) {
      // Old dead fronds hang as a skirt under the crown.
      for (let i = 0; i < 6; i++) {
        b.push()
          .translate(top.x, top.y - 0.2, top.z)
          .rotate(0, (-i / 6) * Math.PI * 2, 0)
          .rotate(0, 0, 2.6);
        b.foliageCard(0.5, H * 0.3, brown, leafQuadrant.frond, 'base');
        b.pop();
      }
    }
  } else if (species === 'ash') {
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
  const tropical = species === 'rainforest' || species === 'fanpalm' || species === 'treefern';
  b.push().translate(0, trunkH / 2 - 0.3, 0);
  b.cylinder(trunkR * 0.5, trunkR, trunkH, 3, tropical ? pal('barkGrey') : pal('barkPale'), false);
  b.pop();
  if (canopy) {
    const [cy, rx, ry] = canopy;
    const c = tropical
      ? tropicalColor(species, rand, true)
      : canopyColor(rand, false).lerp(pal('foliageDark'), 0.25);
    const leaf =
      species === 'fanpalm'
        ? leafQuadrant.fan
        : species === 'treefern'
          ? leafQuadrant.frond
          : species === 'rainforest'
            ? leafQuadrant.broad
            : leafQuadrant.gum;
    for (let i = 0; i < 2; i++) {
      b.push()
        .translate(0, H * cy, 0)
        .rotate(0, variant + (i * Math.PI) / 2, 0);
      b.foliageCard(H * rx * 2.6, H * ry * 3, c, leaf);
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

/**
 * A termite mound, unit radius and half-height: a knobbly earth spire, broad at the foot
 * and narrowing in lumps to a rounded top.
 */
function buildMound(variant: number): THREE.BufferGeometry {
  const b = new MeshBuilder(700 + variant);
  const rand = mulberry32(variant + 71);
  const earth = pal('dirtTrack')
    .clone()
    .lerp(pal('mud'), 0.25 + rand() * 0.2);
  for (const [y, r, squash] of [
    [-0.55, 1, 0.5],
    [0.05, 0.78, 0.55],
    [0.55, 0.52, 0.6],
    [0.85, 0.3, 0.7],
  ]) {
    b.push().translate((rand() - 0.5) * 0.15, y, (rand() - 0.5) * 0.15);
    b.blob(r, earth.clone().multiplyScalar(0.92 + rand() * 0.14), 0.18, 1, squash);
    b.pop();
  }
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
  /** The tree tiles' batches. */
  private readonly trees = new THREE.Group();
  private readonly treeTiles: THREE.BatchedMesh[] = [];
  /** Trees drawn in each tile: a tile with none is hidden. */
  private readonly treeShown: number[] = [];
  private readonly meadow: Meadow;
  private readonly treeGeo: number[][] = [];
  /** Each tree's tile and its instance id in that tile's batch. */
  private readonly treeTile: Uint16Array;
  private readonly treeIds: number[];
  private readonly treeLod: Uint8Array;
  private readonly cover: THREE.BatchedMesh;
  /** Each ground-cover instance's world bounding sphere (x, y, z, radius by instance id). */
  private coverSpheres: Float32Array;
  /** Each cover geometry's own bounding sphere: radius, centre height and centre off its axis. */
  private readonly coverBounds: { r: number; y: number; off: number }[] = [];
  private readonly coverGeo: number[] = [];
  private readonly coverTiles = new Map<string, number[]>();
  private lodTimer = 0;
  /** The next tree to check for a change of detail. */
  private lodNext = 0;
  private quality: QualityPreset;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly tmpSphere = new THREE.Sphere();

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
    // One batch per map tile, so three.js skips a whole tile out of view (or out of the
    // shadow area) instead of testing each of the map's trees, twice a frame.
    const foliage = createFoliageMaterials();
    const geos: THREE.BufferGeometry[][] = SPECIES.map((s) =>
      [0, 1].flatMap((v) => [buildTree(s, v, 0), buildTree(s, v, 1), buildTree(s, v, 2)]),
    );
    const all = geos.flat();
    const list = world.scatter.trees;
    this.trees.name = 'trees';
    const tileOf = new Map<string, number>();
    const members: number[][] = [];
    this.treeTile = new Uint16Array(list.length);
    list.forEach((t, i) => {
      const key = `${Math.floor(t.x / TREE_TILE)},${Math.floor(t.z / TREE_TILE)}`;
      let tile = tileOf.get(key);
      if (tile === undefined) {
        tile = members.length;
        tileOf.set(key, tile);
        members.push([]);
      }
      members[tile].push(i);
      this.treeTile[i] = tile;
    });
    this.treeLod = new Uint8Array(list.length).fill(1);
    this.treeIds = new Array<number>(list.length);
    for (const tileTrees of members) {
      const batch = new THREE.BatchedMesh(tileTrees.length, geometrySize(all), 0, foliage.material);
      batch.customDepthMaterial = foliage.depth;
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.sortObjects = false;
      // Every tile adds the same geometries in the same order, so the ids match.
      const ids = geos.map((g) => g.map((geo) => batch.addGeometry(geo)));
      if (this.treeGeo.length === 0) this.treeGeo.push(...ids);
      for (const i of tileTrees) {
        const t = list[i];
        const si = SPECIES.indexOf(t.species);
        const variant = t.seed < 0.5 ? 0 : 1;
        const id = batch.addInstance(this.treeGeo[si][variant * 3 + 1]);
        const s = t.height / NOMINAL[t.species];
        this.tmpE.set(t.leanX, t.yaw, t.leanZ);
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpM.compose(this.tmpV.set(t.x, t.y, t.z), this.tmpQ, this.tmpS.set(s, s, s));
        batch.setMatrixAt(id, this.tmpM);
        const tint = 0.9 + t.seed * 0.2;
        batch.setColorAt(id, this.tmpC.setRGB(tint, tint, tint * (0.97 + t.seed * 0.06)));
        this.treeIds[i] = id;
      }
      // Each tree's bounds, worked out once: its sphere at middle detail with room for the
      // other two.
      const spheres = new Float32Array(tileTrees.length * 4);
      for (const i of tileTrees) {
        const id = this.treeIds[i];
        batch.getMatrixAt(id, this.tmpM);
        batch.getBoundingSphereAt(batch.getGeometryIdAt(id), this.tmpSphere)!.applyMatrix4(this.tmpM);
        spheres.set(
          [
            this.tmpSphere.center.x,
            this.tmpSphere.center.y,
            this.tmpSphere.center.z,
            this.tmpSphere.radius * 1.2,
          ],
          id * 4,
        );
      }
      cullTreesBySphere(batch, spheres);
      // The sphere is taken from the middle detail; the others are near enough its size.
      batch.computeBoundingSphere();
      batch.boundingSphere!.radius += 5;
      this.treeTiles.push(batch);
      this.treeShown.push(tileTrees.length);
      this.trees.add(batch);
    }
    this.group.add(this.trees);

    // --- Rocks and logs ---
    const rockGeos = [0, 1, 2, 3].map((v) => buildRock(v, 0)).concat([4, 5, 6].map((v) => buildRock(v, 1)));
    const moundGeos = [0, 1, 2].map((v) => buildMound(v));
    const mark = buildAnchorMark();
    const log = buildLog();
    const rocks = world.scatter.rocks;
    const logs = world.scatter.logs;
    const anchorCount = rocks.filter((r) => r.anchor).length;
    const extras = [...rockGeos, ...moundGeos, mark, log];
    const rockMesh = new THREE.BatchedMesh(
      rocks.length + anchorCount + logs.length,
      geometrySize(extras),
      0,
      this.material,
    );
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    // Opaque, so three's depth sort of the instances every draw was wasted.
    rockMesh.sortObjects = false;
    const rockIds = rockGeos.map((g) => rockMesh.addGeometry(g));
    const moundIds = moundGeos.map((g) => rockMesh.addGeometry(g));
    const markId = rockMesh.addGeometry(mark);
    const logId = rockMesh.addGeometry(log);
    for (const r of rocks) {
      const big = r.radius > 1.2;
      const gi = r.mound
        ? moundIds[Math.floor(r.seed * 3)]
        : big
          ? rockIds[4 + Math.floor(r.seed * 3)]
          : rockIds[Math.floor(r.seed * 4)];
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
    // Rocks and logs don't move either: their spheres are worked out once, as the trees' are,
    // instead of three rebuilding every one from its matrix on each draw and the shadow pass.
    const rockSpheres = new Float32Array(rockMesh.instanceCount * 4);
    for (let id = 0; id < rockMesh.instanceCount; id++) {
      rockMesh.getMatrixAt(id, this.tmpM);
      rockMesh.getBoundingSphereAt(rockMesh.getGeometryIdAt(id), this.tmpSphere)!.applyMatrix4(this.tmpM);
      rockSpheres.set(
        [this.tmpSphere.center.x, this.tmpSphere.center.y, this.tmpSphere.center.z, this.tmpSphere.radius],
        id * 4,
      );
    }
    cullTreesBySphere(rockMesh, rockSpheres);
    rockMesh.computeBoundingSphere();
    this.group.add(rockMesh);

    // --- Ground cover (filled in around the camera) ---
    const coverGeos = [buildTussock(0), buildTussock(1), buildTussock(2), buildShrub(0), buildShrub(1)];
    this.cover = new THREE.BatchedMesh(coverCapacity(quality), geometrySize(coverGeos), 0, this.material);
    this.cover.name = 'ground-cover';
    this.cover.castShadow = false;
    this.cover.receiveShadow = true;
    // No depth sort of up to 23,000 opaque instances every draw. Culled from spheres written
    // as each tile is filled (v1.49), not three's own per-instance culling, which rebuilt
    // every instance's sphere from its matrix each draw.
    this.cover.sortObjects = false;
    for (const g of coverGeos) {
      this.coverGeo.push(this.cover.addGeometry(g));
      g.computeBoundingSphere();
      const c = g.boundingSphere!.center;
      this.coverBounds.push({ r: g.boundingSphere!.radius, y: c.y, off: Math.hypot(c.x, c.z) });
    }
    this.coverSpheres = new Float32Array(this.cover.maxInstanceCount * 4);
    cullTreesBySphere(this.cover, this.coverSpheres);
    this.group.add(this.cover);
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    this.meadow.setQuality(q);
    for (const ids of this.coverTiles.values()) for (const id of ids) this.cover.deleteInstance(id);
    this.coverTiles.clear();
    this.cover.setInstanceCount(coverCapacity(q));
    if (this.coverSpheres.length < this.cover.maxInstanceCount * 4)
      this.coverSpheres = new Float32Array(this.cover.maxInstanceCount * 4);
    cullTreesBySphere(this.cover, this.coverSpheres);
  }

  update(eye: THREE.Vector3, dt: number): void {
    this.meadow.update(eye, dt);
    // Trees change detail in slices, a whole pass every LOD_PASS seconds, rather than all
    // 45,000 at once: checking them all in one frame was a hitch five times a second on a
    // phone. A jump (dt of a second or more) does them all now.
    const list = this.world.scatter.trees;
    const count = dt >= 1 ? list.length : Math.min(list.length, Math.ceil((list.length * dt) / LOD_PASS));
    const near2 = this.quality.treeLodDistance ** 2;
    const mid2 = this.quality.treeFarDistance ** 2;
    const far2 = (this.quality.drawDistance * 0.9) ** 2;
    for (let n = 0; n < count; n++) {
      const i = this.lodNext;
      this.lodNext = i + 1 < list.length ? i + 1 : 0;
      const t = list[i];
      const dx = t.x - eye.x;
      const dz = t.z - eye.z;
      const d2 = dx * dx + dz * dz;
      const lod = d2 < near2 ? 0 : d2 < mid2 ? 1 : d2 < far2 ? 2 : HIDDEN;
      if (lod === this.treeLod[i]) continue;
      const id = this.treeIds[i];
      const tile = this.treeTile[i];
      const batch = this.treeTiles[tile];
      if (lod === HIDDEN) {
        batch.setVisibleAt(id, false);
        this.treeShown[tile]--;
      } else {
        if (this.treeLod[i] === HIDDEN) {
          batch.setVisibleAt(id, true);
          this.treeShown[tile]++;
        }
        const si = SPECIES.indexOf(t.species);
        const variant = t.seed < 0.5 ? 0 : 1;
        batch.setGeometryIdAt(id, this.treeGeo[si][variant * 3 + lod]);
      }
      this.treeLod[i] = lod;
    }
    for (let k = 0; k < this.treeTiles.length; k++) this.treeTiles[k].visible = this.treeShown[k] > 0;
    this.lodTimer -= dt;
    if (this.lodTimer > 0) return;
    this.lodTimer = LOD_PASS;
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

  /** Is (x, z) within the shrub-free space around a campsite's start position? */
  private nearSpawn(x: number, z: number): boolean {
    const r = groundCover.spawnClearance;
    return this.world.pois.some((p) => p.reset && Math.hypot(p.reset.x - x, p.reset.z - z) < r);
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
      const i = t.index(x, z);
      const tint = t.tint[i];
      const surf = t.surface[i];
      if (surf !== SurfaceId.Grass && surf !== SurfaceId.BlackSoil) continue;
      if (f.trackDistance[i] < 1 || f.creekDistance[i] < 1) continue;
      const forest = tint === GroundTint.ForestFloor;
      const shrub = r1 < (forest ? shrubShare * 4 : shrubShare * 0.35);
      if (!shrub && forest && r2 < 0.6) continue;
      if (shrub && this.nearSpawn(x, z)) continue;
      if (this.cover.instanceCount >= this.cover.maxInstanceCount) break;
      const kind = shrub ? 3 + Math.floor(r2 * 2) : Math.floor(r2 * 3);
      const id = this.cover.addInstance(this.coverGeo[kind]);
      const s = shrub ? 0.8 + r3 * 0.9 : 0.7 + r3 * 0.6;
      const sy = s * (0.8 + r2 * 0.4);
      const y = t.heightAt(x, z) - 0.05;
      this.tmpQ.setFromEuler(this.tmpE.set(0, r3 * Math.PI * 2, 0));
      this.tmpM.compose(this.tmpV.set(x, y, z), this.tmpQ, this.tmpS.set(s, sy, s));
      this.cover.setMatrixAt(id, this.tmpM);
      // The geometry's sphere, moved and scaled (by the larger scale, so it still holds), kept
      // on the instance's axis and grown by how far off it the centre was, so any turn fits.
      const bounds = this.coverBounds[kind];
      const sp = this.coverSpheres;
      sp[id * 4] = x;
      sp[id * 4 + 1] = y + bounds.y * sy;
      sp[id * 4 + 2] = z;
      sp[id * 4 + 3] = bounds.r * Math.max(s, sy) + bounds.off * s;
      const k2 = 0.9 + r1 * 0.2;
      this.cover.setColorAt(id, this.tmpC.setRGB(k2, k2, k2));
      ids.push(id);
    }
    return ids;
  }
}
