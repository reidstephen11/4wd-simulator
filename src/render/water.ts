import * as THREE from 'three';
import { NO_WATER, type Terrain } from '../sim/world/terrain';
import { CREEK_MARGIN } from '../sim/world/flood';
import type { WaterCurrent } from '../sim/world/current';
import type { EnvironmentConfig } from '../data/environment';
import { pal } from './colors';
import { patchFog } from './fog';
import { sunDirection } from './sky';

const TILE = 128;

/**
 * Clear water (`CreekDef.clear`, v2.25): how deep it goes on darkening to (m), and the depths
 * between which the shallows show the bed and break into ripples (fully by `shallowFull`,
 * not at all from `shallowNone`).
 */
export const clearWater = { deepAt: 1.1, shallowFull: 0.65, shallowNone: 1 } as const;

/** How far water of this depth (m) counts as shallows, 1 to 0: the bed shows and the surface breaks. */
export function shallowsOf(depth: number): number {
  const { shallowFull, shallowNone } = clearWater;
  return Math.min(1, Math.max(0, (shallowNone - depth) / (shallowNone - shallowFull)));
}

/** How far from the shallow colour to the deep one water of this depth (m) is drawn, 0 to 1. */
export function depthTone(depth: number, clear: boolean): number {
  return Math.min(1, Math.max(0, (depth - 0.2) / ((clear ? clearWater.deepAt : 0.8) - 0.2)));
}

/**
 * Creek water surface built from the terrain's water grid: reflective, animated and translucent,
 * coloured from shallow to deep, with pale foam where the surface is steep (the Falls). Ripples
 * and flecks of foam run downstream with the current. Puddles on the tracks are tinted a muddy
 * brown.
 */
export class WaterMesh {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  /** Puddles are drawn without the creek's depth offset, so their edges follow the ground. */
  readonly puddleMaterial: THREE.MeshStandardMaterial;
  private readonly time = { value: 0 };
  /** A storm's creek rise (m) and current (a multiple of their own), each creek by its share. */
  private readonly rise = { value: 0 };
  private readonly flowScale = { value: 1 };
  /** The sky's colours, for the water's reflection of it (see createMaterial). */
  private readonly sky = {
    waterSkyHorizon: { value: new THREE.Color() },
    waterSkyZenith: { value: new THREE.Color() },
    waterSkyGround: { value: new THREE.Color() },
    waterSunGlow: { value: new THREE.Color() },
    waterSunDir: { value: new THREE.Vector3(0, 1, 0) },
    waterGlowSize: { value: 0.1 },
    waterCloudLight: { value: 1 },
  };

  /**
   * creekDistance (metres to the creek, per cell) tells puddles from the creek; without it all
   * water is creek. `current` gives the creek water's velocity at each vertex, and `riseShare`
   * each sample's share of a storm's creek rise (features.creekRise). `creekClear` marks the
   * samples of creeks drawn as clear water (features.creekClear).
   */
  constructor(
    terrain: Terrain,
    _seed: number,
    levelOffset = 0,
    creekDistance?: Uint8Array,
    current?: WaterCurrent,
    riseShare?: Float32Array,
    creekClear?: Uint8Array,
  ) {
    this.material = this.createMaterial(true);
    this.puddleMaterial = this.createMaterial(false);
    this.group.name = 'water';
    const { resX: res, halfX, halfZ } = terrain;
    const W = terrain.water;
    const H = terrain.heights;
    const shallow = pal('waterShallow');
    const deep = pal('waterDeep');
    const foam = pal('barkPale');
    const muddy = new THREE.Color('#6B5A44');
    const tmp = new THREE.Color();
    const tilesX = terrain.sizeX / TILE;
    const tilesZ = terrain.sizeZ / TILE;
    // The current at each water vertex, looked up once (vertex index → [x, z]).
    const flows = new Map<number, readonly [number, number]>();
    const still = [0, 0] as const;
    const at = { x: 0, z: 0 };
    const flowAt = (i: number): readonly [number, number] => {
      if (!current) return still;
      let f = flows.get(i);
      if (!f) {
        current.at((i % res) - halfX, Math.floor(i / res) - halfZ, at);
        flows.set(i, (f = [at.x, at.z]));
      }
      return f;
    };
    for (let tz = 0; tz < tilesZ; tz++)
      for (let tx = 0; tx < tilesX; tx++) {
        // Creek cells and puddle cells go into separate meshes with their own material.
        const creek = {
          pos: [] as number[],
          col: [] as number[],
          flow: [] as number[],
          rise: [] as number[],
          shallows: [] as number[],
        };
        const puddle = {
          pos: [] as number[],
          col: [] as number[],
          flow: [] as number[],
          rise: [] as number[],
          shallows: [] as number[],
        };
        for (let iz = tz * TILE; iz < (tz + 1) * TILE; iz++)
          for (let ix = tx * TILE; ix < (tx + 1) * TILE; ix++) {
            const i00 = iz * res + ix;
            const i10 = i00 + 1;
            const i01 = i00 + res;
            const i11 = i01 + 1;
            const w = [W[i00], W[i10], W[i01], W[i11]];
            let maxW = NO_WATER;
            for (const x of w) if (x > maxW) maxW = x;
            if (maxW <= NO_WATER) continue;
            for (let k = 0; k < 4; k++) if (w[k] <= NO_WATER) w[k] = maxW;
            const [w00, w10, w01, w11] = w.map((x) => x + levelOffset);
            const bed = (H[i00] + H[i10] + H[i01] + H[i11]) / 4;
            const depth = (w00 + w10 + w01 + w11) / 4 - bed;
            const steep = Math.max(Math.abs(w10 - w00), Math.abs(w01 - w00), Math.abs(w11 - w00));
            // Creek water lies on the creek line; puddles are kept well clear of it.
            const isPuddle = creekDistance !== undefined && creekDistance[i00] > CREEK_MARGIN;
            // Clear water is coloured corner by corner from its own depth, so a shelf's edge
            // follows the bed and not the 1 m squares.
            const clear = !isPuddle && creekClear?.[i00] === 1;
            const tone = (d: number) => {
              tmp.copy(shallow).lerp(deep, depthTone(d, clear));
              if (steep > 0.35) tmp.lerp(foam, Math.min(0.85, (steep - 0.35) * 0.6));
              if (isPuddle) tmp.lerp(muddy, 0.75);
            };
            tone(depth);
            const out = isPuddle ? puddle : creek;
            const x0 = ix - halfX;
            const z0 = iz - halfZ;
            const vertex = (p: number[], i: number) => {
              out.pos.push(...p);
              const here = p[1] - H[i];
              if (clear) tone(here);
              out.col.push(tmp.r, tmp.g, tmp.b);
              out.flow.push(...(isPuddle ? still : flowAt(i)));
              out.rise.push(isPuddle ? 0 : (riseShare?.[i] ?? 0));
              out.shallows.push(clear ? shallowsOf(here) : 0);
            };
            const p00 = [x0, w00, z0];
            const p10 = [x0 + 1, w10, z0];
            const p01 = [x0, w01, z0 + 1];
            const p11 = [x0 + 1, w11, z0 + 1];
            vertex(p00, i00);
            vertex(p11, i11);
            vertex(p10, i10);
            vertex(p00, i00);
            vertex(p01, i01);
            vertex(p11, i11);
          }
        this.addMesh(creek, this.material);
        this.addMesh(puddle, this.puddleMaterial);
      }
  }

  /**
   * Creeks risen by a storm (m above their own level) and running faster: each creek's water
   * rises by its share, its ripples run faster and it turns muddier the higher it is.
   */
  setCreeks(rise: number, flowScale: number): void {
    this.rise.value = rise;
    this.flowScale.value = flowScale;
  }

  /** The sky the water reflects: the same colours the sky dome is drawn with. */
  setSky(env: EnvironmentConfig): void {
    const u = this.sky;
    u.waterSkyHorizon.value.set(env.sky.horizon);
    u.waterSkyZenith.value.set(env.sky.zenith);
    u.waterSkyGround.value.set(env.sky.groundColor);
    u.waterSunGlow.value.set(env.sky.sunGlow);
    u.waterGlowSize.value = env.sky.sunGlowSize;
    u.waterCloudLight.value = env.cloudLight;
    sunDirection(env, u.waterSunDir.value);
  }

  private addMesh(
    m: { pos: number[]; col: number[]; flow: number[]; rise: number[]; shallows: number[] },
    material: THREE.Material,
  ): void {
    if (m.pos.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    geo.setAttribute('waterFlow', new THREE.Float32BufferAttribute(m.flow, 2));
    geo.setAttribute('waterRiseShare', new THREE.Float32BufferAttribute(m.rise, 1));
    geo.setAttribute('waterShallows', new THREE.Float32BufferAttribute(m.shallows, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    // Room for the water to rise in a storm.
    geo.boundingSphere!.radius += 0.5;
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 10;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
  }
  update(dt: number): void {
    this.time.value += dt;
  }

  private createMaterial(offset: boolean): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      roughness: 0.22,
      metalness: 0.12,
      polygonOffset: offset,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.time;
      shader.uniforms.waterRise = this.rise;
      shader.uniforms.waterFlowScale = this.flowScale;
      Object.assign(shader.uniforms, this.sky);
      shader.vertexShader =
        `attribute vec2 waterFlow; attribute float waterRiseShare; attribute float waterShallows; uniform float waterRise; uniform float waterFlowScale;
        varying vec3 vWaterPosition; varying vec2 vWaterFlow; varying float vWaterSilt; varying float vWaterShallows;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          // A storm raises each creek by its share, runs it faster and muddies it.
          transformed.y += waterRise * waterRiseShare;
          vWaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWaterFlow = waterFlow * (1.0 + (waterFlowScale - 1.0) * waterRiseShare);
          vWaterSilt = min(1.0, waterRise * waterRiseShare / 0.3);
          // Clear shallows (0 elsewhere). Floodwater is neither clear nor shallow.
          vWaterShallows = waterShallows * (1.0 - vWaterSilt);`,
        );
      shader.fragmentShader =
        `uniform float waterTime; varying vec3 vWaterPosition; varying vec2 vWaterFlow; varying float vWaterSilt; varying float vWaterShallows;
        // Ripples carried downstream: two copies of the pattern slide with the current,
        // each restarting while the other is in full view, so they never stretch.
        vec2 waterWaves(vec2 p) {
          return vec2(
            cos(p.x * 3.1 + p.y * 1.8 + waterTime * 1.3) * 0.045 + cos(p.x * 8.0 - p.y * 3.0 - waterTime * 2.1) * 0.018,
            sin(p.y * 4.2 - p.x * 1.2 + waterTime * 1.6) * 0.04);
        }
        // Flecks of foam drawn out into streaks along the current (dir: its direction).
        float waterFlecks(vec2 p, vec2 dir) {
          vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
          return smoothstep(0.7, 1.0, sin(q.x * 0.8 + sin(q.y * 1.7)) * sin(q.y * 3.4 + sin(q.x * 0.5)));
        }
        // Broken water over a shallow bar: close-set glints, drawn out a little along the current.
        float waterBroken(vec2 p, vec2 dir) {
          vec2 q = vec2(dot(p, dir) * 1.6, dot(p, vec2(-dir.y, dir.x)) * 3.2);
          return smoothstep(0.25, 0.8, sin(q.x * 1.9 + sin(q.y * 2.3)) * sin(q.y * 4.1 + sin(q.x * 1.3)));
        }
        uniform vec3 waterSkyHorizon; uniform vec3 waterSkyZenith; uniform vec3 waterSkyGround;
        uniform vec3 waterSunGlow; uniform vec3 waterSunDir; uniform float waterGlowSize; uniform float waterCloudLight;
        // The sky dome's colour in a world direction (src/render/sky.ts without its stars, and
        // with its clouds spread out evenly, as the blurred reflection map shows them).
        vec3 waterSky(vec3 d) {
          float up = d.y;
          vec3 col = mix(waterSkyHorizon, waterSkyZenith, pow(smoothstep(0.0, 1.0, up), 0.55));
          col = mix(col, mix(waterSkyHorizon, vec3(0.91, 0.93, 0.91) * waterCloudLight, 0.55), 0.06 * smoothstep(0.025, 0.17, up));
          col = mix(col, waterSkyGround, smoothstep(0.0, -0.08, up));
          float s = max(dot(d, waterSunDir), 0.0);
          return col + waterSunGlow * pow(s, 1.0 / waterGlowSize) * 0.55;
        }
        \n${shader.fragmentShader}`
          .replace(
            '#include <color_fragment>',
            `
          #include <color_fragment>
          // Floodwater carries mud: the creek turns brown as it rises.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.22), vWaterSilt * 0.55);
          float flowPhase = fract(waterTime * 0.4);
          float flowBlend = abs(1.0 - 2.0 * flowPhase);
          vec2 flowA = vWaterPosition.xz - vWaterFlow * flowPhase * 2.5;
          vec2 flowB = vWaterPosition.xz - vWaterFlow * fract(flowPhase + 0.5) * 2.5 + vec2(0.37, 0.71);
          float flowSpeed = length(vWaterFlow);
          vec2 flowDir = flowSpeed > 0.01 ? vWaterFlow / flowSpeed : vec2(1.0, 0.0);
          float flecks = mix(waterFlecks(flowA, flowDir), waterFlecks(flowB, flowDir), flowBlend);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.76), flecks * min(1.0, flowSpeed * 0.35) * 0.3);
          // Clear water running shallow over a bar breaks up: finer, brighter flecks and a
          // busier surface, where the deep water beside it lies smooth and dark.
          float riffle = vWaterShallows * min(1.0, flowSpeed * 2.5);
          float broken = mix(waterBroken(flowA, flowDir), waterBroken(flowB, flowDir), flowBlend);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.9), broken * riffle * 0.55);
        `,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `
          #include <normal_fragment_maps>
          vec2 wave = mix(waterWaves(flowA), waterWaves(flowB), flowBlend) * (1.0 + flowSpeed * 0.5 + riffle * 1.5);
          normal = normalize(normal + mat3(viewMatrix) * vec3(wave.x, 0.0, wave.y));
        `,
          )
          // Light from the sky, worked out from the sky's own colours rather than looked up in
          // the filtered sky map the other materials use: that lookup was over half the cost
          // of drawing the water, which fills much of a phone's screen at a crossing.
          .replace(
            '#include <lights_fragment_maps>',
            `
          #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
            iblIrradiance += PI * envMapIntensity * mix(waterSkyGround, mix(waterSkyHorizon, waterSkyZenith, 0.5),
              0.5 + 0.5 * inverseTransformDirection(geometryNormal, viewMatrix).y);
            vec3 skyRay = reflect(-geometryViewDir, geometryNormal);
            skyRay = normalize(mix(skyRay, geometryNormal, pow4(material.roughness)));
            radiance += envMapIntensity * waterSky(inverseTransformDirection(skyRay, viewMatrix));
          #endif
        `,
          )
          .replace(
            '#include <opaque_fragment>',
            `
          float fresnel = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
          // Clear shallows mirror less of the sky and let the bed show through.
          outgoingLight = mix(outgoingLight, vec3(0.39, 0.51, 0.52), fresnel * 0.35 * (1.0 - 0.6 * vWaterShallows));
          diffuseColor.a = mix(0.68 + fresnel * 0.29, 0.34 + fresnel * 0.3, vWaterShallows);
          #include <opaque_fragment>
        `,
          );
    };
    return patchFog(material, offset ? 'flowing-water-v5' : 'puddle-water-v5');
  }
}
