import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import type { HorizonDef, HorizonHillDef, MapDef, XZ } from '../sim/world/mapTypes';
import type { Terrain } from '../sim/world/terrain';
import { hillValue } from '../sim/world/terrainGen';
import { Noise2D, clamp, smoothstep } from '../sim/world/noise';
import { densify } from '../sim/world/polyline';
import { pal } from './colors';
import { patchFog } from './fog';

/** Rings of the far land, metres out from the map's edge: close near the edge, far apart near the horizon. */
export const HORIZON_RINGS = [
  0, 15, 35, 60, 90, 130, 180, 240, 310, 400, 500, 620, 760, 920, 1100, 1300, 1550, 1850, 2200, 2600, 3100,
  3700, 4400, 5200, 6200, 7500, 9000, 11000, 14000, 18000, 24000, 32000,
];
/** Spacing of the far land's vertices along the map's edges (m). */
const EDGE_STEP = 48;
/** Vertices round each rounded corner of a ring. */
const CORNER_STEPS = 10;
/** Over this distance out from the edge the map's own ground gives way to the far landforms. */
const EDGE_BLEND = 500;
/** Height of the canopy above the ground (m): the far land is drawn as the top of the forest. */
const CANOPY = { rainforest: 22, mangrove: 7, woodland: 9 };
/** The canopy rises over this distance out from the edge, where the map's own trees stand in for it. */
const CANOPY_IN = 60;

/** A valley cuts into the land no farther than this beyond its floor (m), so the peaks either side keep their height. */
const VALLEY_SIDES = 450;

/** Rolling forested hills all round, for a map that doesn't describe its surroundings. */
const DEFAULT_HORIZON: HorizonDef = {
  base: 50,
  relief: 35,
  hills: [],
  ridges: [],
  valleys: [],
  woodland: [],
};

/** What the far land is at one spot. Cover shares add up to 1. */
export interface FarSample {
  /** Ground height (m); below 0 is under the sea. */
  ground: number;
  /** Height of the canopy over the ground (m). */
  canopy: number;
  /** Distance out to sea from the coast (m; negative inland). */
  offshore: number;
  sea: number;
  river: number;
  rock: number;
  cleared: number;
  mangrove: number;
  woodland: number;
  rainforest: number;
  granite: 'grey' | 'black';
}

interface Line {
  xs: Float64Array;
  zs: Float64Array;
  u: Float64Array;
  count: number;
  /** Each segment's bounds, to skip the ones farther than the nearest found so far. */
  box: Float64Array;
  /** The segment nearest the last point asked about: neighbouring vertices start from it. */
  last: number;
}

interface Nearest {
  d: number;
  /** Fractional index into the authored points. */
  u: number;
  /** Positive to the right of the line's direction. */
  side: number;
}

function line(points: readonly XZ[], step: number): Line {
  const p = densify(points, step);
  const box = new Float64Array(Math.max(0, p.count - 1) * 4);
  for (let k = 0; k < p.count - 1; k++) {
    box[k * 4] = Math.min(p.xs[k], p.xs[k + 1]);
    box[k * 4 + 1] = Math.max(p.xs[k], p.xs[k + 1]);
    box[k * 4 + 2] = Math.min(p.zs[k], p.zs[k + 1]);
    box[k * 4 + 3] = Math.max(p.zs[k], p.zs[k + 1]);
  }
  return { xs: p.xs, zs: p.zs, u: p.u, count: p.count, box, last: 0 };
}

function nearest(l: Line, x: number, z: number, out: Nearest): Nearest {
  out.d = Infinity;
  const n = l.count - 1;
  const start = l.last;
  for (let j = 0; j < n; j++) {
    const k = (start + j) % n;
    const bx = Math.max(l.box[k * 4] - x, 0, x - l.box[k * 4 + 1]);
    const bz = Math.max(l.box[k * 4 + 2] - z, 0, z - l.box[k * 4 + 3]);
    if (bx * bx + bz * bz >= out.d * out.d) continue;
    const ax = l.xs[k];
    const az = l.zs[k];
    const vx = l.xs[k + 1] - ax;
    const vz = l.zs[k + 1] - az;
    const wx = x - ax;
    const wz = z - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? clamp((wx * vx + wz * vz) / len2, 0, 1) : 0;
    const d = Math.hypot(wx - vx * t, wz - vz * t);
    if (d < out.d) {
      l.last = k;
      out.d = d;
      out.u = l.u[k] + (l.u[k + 1] - l.u[k]) * t;
      out.side = vx * wz - vz * wx;
    }
  }
  return out;
}

/** Linear lookup of a per-point value at fractional index `u`. */
function along(values: readonly number[], u: number): number {
  const i = Math.min(values.length - 2, Math.max(0, Math.floor(u)));
  return values[i] + (values[i + 1] - values[i]) * clamp(u - i, 0, 1);
}

/** The landforms round a map: ground height and what covers it, anywhere outside the map. */
export class FarLand {
  private readonly noise: Noise2D;
  private readonly noise2: Noise2D;
  private readonly coast: Line | null;
  private readonly ridges: ReadonlyArray<{ line: Line; height: number; width: number }>;
  private readonly valleys: ReadonlyArray<{
    line: Line;
    levels: number[];
    def: HorizonDef['valleys'][number];
  }>;
  private readonly near: Nearest = { d: 0, u: 0, side: 0 };

  constructor(
    readonly def: HorizonDef,
    seed: number,
  ) {
    this.noise = new Noise2D(seed + 404);
    this.noise2 = new Noise2D(seed + 505);
    this.coast = def.coast ? line(def.coast, 150) : null;
    this.ridges = def.ridges.map((r) => ({ line: line(r.points, 80), height: r.height, width: r.width }));
    this.valleys = def.valleys.map((v) => ({
      line: line(
        v.points.map((p) => [p.x, p.z] as const),
        30,
      ),
      levels: v.points.map((p) => p.level),
      def: v,
    }));
  }

  sample(x: number, z: number): FarSample {
    const { def, near } = this;
    let h =
      def.base * (0.55 + 0.45 * this.noise.fbm(x / 1600, z / 1600, 3)) +
      def.relief * (0.5 + 0.5 * this.noise2.fbm(x / 420, z / 420, 3));
    for (const r of this.ridges) {
      nearest(r.line, x, z, near);
      const sigma = r.width * 0.4;
      if (near.d < r.width) h += r.height * Math.exp(-(near.d * near.d) / (sigma * sigma));
    }
    // The land falls to a low coastal plain and the sea floor shelves away offshore.
    let offshore = -Infinity;
    if (this.coast) {
      nearest(this.coast, x, z, near);
      offshore = near.side > 0 ? near.d : -near.d;
      const plain = def.coastPlain ?? 600;
      h = offshore > 0 ? -(2 + offshore * 0.02) : 1.5 + (h - 1.5) * smoothstep(0, plain, -offshore);
    }
    // Hills go on after the coast so a headland or an island stands out of the sea.
    let rock = 0;
    let granite: FarSample['granite'] = 'grey';
    for (const hill of def.hills) {
      const c = hillValue(hill, x, z);
      if (c <= 0) continue;
      h += c;
      const bare = bareShare(hill, c);
      if (bare > rock) {
        rock = bare;
        granite = hill.granite ?? 'grey';
      }
    }
    // Bare granite is heaped boulders, not a smooth dome.
    h += rock * 12 * (0.5 + 0.5 * this.noise2.noise(x / 60, z / 60));
    let river = 0;
    let cleared = 0;
    for (const v of this.valleys) {
      nearest(v.line, x, z, near);
      const level = along(v.levels, near.u);
      const cap = level + Math.max(0, near.d - v.def.floor) * v.def.slope;
      const carve = 1 - smoothstep(v.def.floor + VALLEY_SIDES / 2, v.def.floor + VALLEY_SIDES, near.d);
      if (cap < h) h += (cap - h) * carve;
      const r = 1 - smoothstep(v.def.channel * 0.6, v.def.channel * 1.4, near.d);
      if (r > river) {
        river = r;
        h += (level - h) * r;
      }
      if (v.def.cleared) cleared = Math.max(cleared, 1 - smoothstep(2, 7, h - level));
    }
    let woodland = 0;
    for (const w of def.woodland)
      woodland = Math.max(woodland, 1 - smoothstep(w.radius * 0.67, w.radius, Math.hypot(x - w.x, z - w.z)));
    const sea = this.coast ? 1 - smoothstep(-0.6, 0.2, h) : 0;
    const mangrove = this.coast ? (1 - smoothstep(2, 5, h)) * (1 - smoothstep(300, 700, -offshore)) : 0;
    // Each cover takes its share of what the ones before it left.
    let left = 1;
    const take = (w: number) => {
      const t = left * clamp(w, 0, 1);
      left -= t;
      return t;
    };
    const s: FarSample = {
      ground: h,
      canopy: 0,
      offshore,
      sea: take(sea),
      river: take(river),
      rock: take(rock),
      cleared: take(cleared),
      mangrove: take(mangrove),
      woodland: take(woodland),
      rainforest: 0,
      granite,
    };
    s.rainforest = left;
    s.canopy = s.rainforest * CANOPY.rainforest + s.mangrove * CANOPY.mangrove + s.woodland * CANOPY.woodland;
    return s;
  }
}

/** How bare a hill is where it adds `c` metres: rock above its `bare` share of its height. */
function bareShare(hill: HorizonHillDef, c: number): number {
  if (hill.bare === undefined) return 0;
  const lo = hill.bare * hill.height;
  return smoothstep(lo, lo + 0.08 * hill.height, c);
}

/**
 * Points round the map's edge, each with the outward direction its ring vertices move
 * along: east edge south to north, then north, west and south, with a quarter turn at
 * each corner. [x, z, outX, outZ].
 */
function perimeter(hx: number, hz: number): Array<readonly [number, number, number, number]> {
  const out: Array<readonly [number, number, number, number]> = [];
  const edge = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / EDGE_STEP);
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, nx, nz]);
  };
  const corner = (cx: number, cz: number, from: number) => {
    for (let i = 0; i < CORNER_STEPS; i++) {
      const a = from - (i / CORNER_STEPS) * (Math.PI / 2);
      out.push([cx, cz, Math.cos(a), Math.sin(a)]);
    }
  };
  edge(hx, hz, hx, -hz, 1, 0);
  corner(hx, -hz, 0);
  edge(hx, -hz, -hx, -hz, 0, -1);
  corner(-hx, -hz, -Math.PI / 2);
  edge(-hx, -hz, -hx, hz, -1, 0);
  corner(-hx, hz, -Math.PI);
  edge(-hx, hz, hx, hz, 0, 1);
  corner(hx, hz, (-3 * Math.PI) / 2);
  return out;
}

const PROJECT_VERTEX = /* glsl */ `
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
// Land beyond the draw distance is drawn along the same line of sight, just inside it.
gl_Position = projectionMatrix * vec4( mvPosition.xyz * min( 1.0, horizonReach / length( mvPosition.xyz ) ), 1.0 );
`;

/**
 * Past where the world's haze levels off, land fades on into the sky's own horizon colour,
 * so far ranges pale with distance and the sea meets the sky without a hard line.
 */
const FAR_HAZE = /* glsl */ `
#ifdef USE_FOG
  float farHaze = 1.0 - exp( -max( 0.0, vFogDepth - 2500.0 ) / 11000.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, horizonSky, farHaze );
#endif
`;

/**
 * The land and sea round the map out to the horizon. Drawn before everything else and
 * without depth, in rings from the horizon in to the map's edge, so nearer land covers
 * farther land from anywhere inside the map and the map itself covers it all. Land
 * beyond the draw distance is pulled in along the line of sight, so it shows on every
 * graphics preset.
 */
export class Horizon {
  readonly mesh: THREE.Mesh;
  private readonly reach = { value: 1000 };
  /** The sky's horizon colour as it shows on screen (the sky isn't tone-mapped). */
  private readonly sky = { value: new THREE.Color() };

  constructor(map: MapDef, terrain: Terrain, env: EnvironmentConfig) {
    const def = map.horizon ?? DEFAULT_HORIZON;
    const land = new FarLand(def, map.seed);
    const hx = map.width / 2;
    const hz = map.length / 2;
    const rim = perimeter(hx, hz);
    const n = rim.length;
    const edgeHeights = rim.map(([x, z]) => terrain.heightAt(x, z));
    // The first ring starts just under the map's edge, so no gap shows between them where
    // the edge dips between this ring's vertices.
    const seam = rim.map(([x, z, nx, nz]) => {
      let low = Infinity;
      for (let t = -EDGE_STEP; t <= EDGE_STEP; t++)
        low = Math.min(low, terrain.heightAt(x - nz * t, z + nx * t));
      return low - 1;
    });
    // Without a coast the far land sits on the map's own ground rather than on sea level.
    const datum = def.coast ? 0 : edgeHeights.reduce((a, b) => a + b, 0) / n;
    const mottle = new Noise2D(map.seed + 606);
    const positions = new Float32Array(HORIZON_RINGS.length * n * 3);
    const colors = new Float32Array(HORIZON_RINGS.length * n * 3);
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    const shallow = pal('waterShallow');
    const deepSea = pal('sea');
    const blackRock = pal('rockDark').clone().multiplyScalar(0.45);
    /** Add a cover's colour by its share. */
    const add = (col: THREE.Color, w: number) => {
      c.r += col.r * w;
      c.g += col.g * w;
      c.b += col.b * w;
    };
    HORIZON_RINGS.forEach((o, k) => {
      for (let i = 0; i < n; i++) {
        const [bx, bz, nx, nz] = rim[i];
        const x = bx + nx * o;
        const z = bz + nz * o;
        const s = land.sample(x, z);
        const ground =
          o === 0
            ? seam[i]
            : edgeHeights[i] + (datum + s.ground - edgeHeights[i]) * smoothstep(0, EDGE_BLEND, o);
        const y = (def.coast ? Math.max(ground, 0) : ground) + s.canopy * smoothstep(0, CANOPY_IN, o);
        const v = (k * n + i) * 3;
        positions[v] = x;
        positions[v + 1] = y;
        positions[v + 2] = z;
        const m = mottle.fbm(x / 90, z / 90, 2);
        c.setRGB(0, 0, 0);
        add(
          tmp
            .copy(pal('rainforestDark'))
            .lerp(pal('rainforest'), 0.3 + 0.25 * m)
            .multiplyScalar(0.9 + 0.2 * m),
          s.rainforest,
        );
        add(tmp.copy(pal('foliage')).lerp(pal('grassDry'), 0.35 + 0.2 * m), s.woodland);
        add(tmp.copy(pal('rainforestDark')).lerp(pal('foliage'), 0.4), s.mangrove);
        add(tmp.copy(pal('grassSage')).lerp(pal('grassDry'), 0.5 + 0.3 * m), s.cleared);
        add(s.granite === 'black' ? blackRock : pal('rock'), s.rock);
        add(pal('waterDeep'), s.river);
        add(tmp.copy(shallow).lerp(deepSea, smoothstep(0, 900, s.offshore)), s.sea);
        colors[v] = c.r;
        colors[v + 1] = c.g;
        colors[v + 2] = c.b;
      }
    });
    // Outermost band first: the painter's order that lets nearer land cover farther land.
    const index: number[] = [];
    for (let k = HORIZON_RINGS.length - 2; k >= 0; k--)
      for (let i = 0; i < n; i++) {
        const a = k * n + i;
        const b = k * n + ((i + 1) % n);
        const cc = a + n;
        const d = b + n;
        index.push(a, d, b, a, cc, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.horizonReach = this.reach;
      shader.uniforms.horizonSky = this.sky;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float horizonReach;')
        .replace('#include <project_vertex>', PROJECT_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 horizonSky;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>\n${FAR_HAZE}`);
    };
    this.mesh = new THREE.Mesh(geo, patchFog(material, 'horizon'));
    this.mesh.name = 'horizon';
    this.mesh.frustumCulled = false;
    // After the sky, before everything else.
    this.mesh.renderOrder = -999;
    this.setEnvironment(env);
  }

  setEnvironment(env: EnvironmentConfig): void {
    // Fog is mixed in after the output colour space, so the sky colour goes in unconverted.
    this.sky.value.setStyle(env.sky.horizon, THREE.LinearSRGBColorSpace);
  }

  /** Draw land no farther than this from the camera (inside the camera's far plane). */
  setReach(metres: number): void {
    this.reach.value = metres;
  }
}
