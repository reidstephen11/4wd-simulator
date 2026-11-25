import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import type { QualityPreset } from '../data/quality';
import type { World } from '../sim/world/world';
import { applyFogEnvironment } from './fog';
import { groundUniforms } from './groundMaterial';
import { Lighting } from './lighting';
import { Horizon } from './horizon';
import { Sky } from './sky';
import { TerrainMesh } from './terrainMesh';
import { WaterMesh } from './water';
import { RenderScale } from './renderScale';
import { WaterCurrent } from '../sim/world/current';
import { Vegetation } from './vegetation';
import { WorldProps } from './worldProps';
import { TrackRuts } from './tracks';
import { GateMarkers } from './gates';
import { Particles } from './particles';
import { Rain } from './rain';
import type { DynamicObject } from '../sim/sim';
import { WorkingMirrors } from './workingMirrors';
import { canopyUniforms, setCanopyShade, shadowShift } from './shadowReach';

/**
 * How much of the sun the tree cover takes from the ground beyond the shadow map: set so a
 * road under the ridge's forest is as dark far off as the drawn shadows make it near the car
 * (scripts/reach-check.ts).
 */
const FAR_SHADE = 0.9;

/** Owns the Three.js renderer, scene and camera, and the static world meshes. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly mirrors = new WorkingMirrors();
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: Lighting;
  readonly sky: Sky;
  /** Land and sea round the map out to the horizon. */
  readonly horizon: Horizon;
  readonly terrainMesh: TerrainMesh;
  readonly water: WaterMesh;
  readonly vegetation: Vegetation;
  readonly props: WorldProps;
  readonly ruts: TrackRuts;
  readonly gates: GateMarkers;
  readonly particles: Particles;
  /** Falling rain, when it is raining. */
  rain: Rain | null;
  /** The vehicle's world matrix: it shelters the rain. */
  readonly shelter = new THREE.Matrix4();
  private quality: QualityPreset;
  private renderScale = new RenderScale(1);
  private lastFrame = performance.now();
  private firstFrame = true;
  /** The typical height (m) of the crowns that shade the ground: sets how far their shadows fall. */
  private crownHeight = 0;
  private reflectionMap: THREE.WebGLRenderTarget | null = null;
  /** The sky the reflections are filtered from, and the filter. */
  private reflection: { scene: THREE.Scene; sky: Sky; pmrem: THREE.PMREMGenerator } | null = null;
  /** Point the shadow camera follows (the vehicle). */
  readonly focus = new THREE.Vector3();
  /** Where the viewer is in the world (the camera rides in a rig while a headset is on). */
  private readonly eye = new THREE.Vector3();
  /** The headset's eye as a plain world-space camera, for the mirrors to reflect (v1.98). */
  private readonly headsetEye = new THREE.PerspectiveCamera(90, 1, 0.05, 180);

  constructor(
    readonly container: HTMLElement,
    readonly world: World,
    private env: EnvironmentConfig,
    quality: QualityPreset,
    dynamics: Iterable<DynamicObject> = [],
  ) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping =
      env.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = env.exposure;
    this.renderer.shadowMap.enabled = true;
    // PCF with a sampling radius: three r186 folded PCFSoft into PCF (see docs/DECISIONS.md).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.25, quality.drawDistance);
    this.scene.add(this.camera);

    this.lighting = new Lighting(this.scene, env);
    this.sky = new Sky(env);
    this.scene.add(this.sky.mesh);
    this.updateReflections(env);
    this.horizon = new Horizon(world.map, world.terrain, env);
    this.scene.add(this.horizon.mesh);

    this.terrainMesh = new TerrainMesh(world.terrain, world.map.seed);
    this.scene.add(this.terrainMesh.group);
    this.water = new WaterMesh(
      world.terrain,
      world.map.seed,
      env.waterLevelOffset,
      world.features.creekDistance,
      new WaterCurrent(world.features.creeks),
      world.features.creekRise,
      world.features.creekClear,
    );
    this.water.setSky(env);
    this.scene.add(this.water.group);
    this.vegetation = new Vegetation(world, quality);
    this.scene.add(this.vegetation.group);
    this.crownHeight = setCanopyShade(world.terrain.sizeX, world.terrain.sizeZ, world.scatter.trees);
    this.shadeUnderTrees();
    this.props = new WorldProps(world, dynamics);
    this.scene.add(this.props.group);
    this.ruts = new TrackRuts(world);
    this.scene.add(this.ruts.group);
    this.gates = new GateMarkers(world);
    this.scene.add(this.gates.group);
    this.particles = new Particles(world.terrain, quality, env.waterLevelOffset);
    this.particles.riseShare = world.features.creekRise ?? null;
    this.particles.setWetness(env.wetness);
    groundUniforms.groundWetness.value = env.wetness;
    this.scene.add(this.particles.group);
    this.rain = env.rain > 0 ? new Rain(env.rain, quality.particles) : null;
    if (this.rain) this.scene.add(this.rain.mesh);

    this.setQuality(quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: QualityPreset): void {
    const particlesBefore = this.quality.particles;
    this.quality = q;
    this.mirrors.setQuality(q);
    this.renderScale = new RenderScale(q.minRenderScale);
    if (!this.renderer.xr.isPresenting)
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.lighting.setQuality(q);
    this.camera.far = q.drawDistance;
    this.horizon.setReach(q.drawDistance * 0.9);
    // While a headset is on, it supplies the projection each frame.
    if (!this.renderer.xr.isPresenting) this.camera.updateProjectionMatrix();
    this.terrainMesh.setLodDistances(q.terrainLod);
    this.vegetation?.setQuality(q);
    this.particles?.setQuality(q);
    applyFogEnvironment(this.scene, this.env, q.drawDistance);
    // The rain's drop count is fixed when it is built: build it again for the new preset.
    if (this.rain && q.particles !== particlesBefore) {
      this.scene.remove(this.rain.mesh);
      this.rain.dispose();
      this.rain = new Rain(this.env.rain, q.particles);
      this.scene.add(this.rain.mesh);
    }
    this.resize();
  }

  private updateReflections(env: EnvironmentConfig): void {
    // A filtered sky supplies coherent highlights on paint, glass and water. The sky and
    // the filter are kept between updates: making new ones compiled their shaders again,
    // a pause in play every time the light changed.
    if (!this.reflection) {
      const scene = new THREE.Scene();
      const sky = new Sky(env);
      scene.add(sky.mesh);
      this.reflection = { scene, sky, pmrem: new THREE.PMREMGenerator(this.renderer) };
    }
    const { scene, sky, pmrem } = this.reflection;
    sky.setEnvironment(env);
    const next = pmrem.fromScene(scene, 0.04, 0.1, 200, { size: 128 });
    this.scene.environment = next.texture;
    this.scene.environmentIntensity = 0.45;
    this.reflectionMap?.dispose();
    this.reflectionMap = next;
  }

  /** Lay the tree cover's far shade where the shadows fall with the sun where it is. */
  private shadeUnderTrees(): void {
    shadowShift(this.lighting.sunDir, this.crownHeight, canopyUniforms.canopyShift.value);
    canopyUniforms.canopyStrength.value = FAR_SHADE;
  }

  setEnvironment(env: EnvironmentConfig): void {
    this.env = env;
    this.lighting.setEnvironment(env);
    this.shadeUnderTrees();
    this.sky.setEnvironment(env);
    this.horizon.setEnvironment(env);
    this.updateReflections(env);
    this.water.setSky(env);
    this.renderer.toneMapping =
      env.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = env.exposure;
    this.particles.setWetness(env.wetness);
    groundUniforms.groundWetness.value = env.wetness;
    applyFogEnvironment(this.scene, env, this.quality.drawDistance);
    // A storm brings the rain in (and takes it away again).
    if (env.rain > 0 && !this.rain) {
      this.rain = new Rain(env.rain, this.quality.particles);
      this.scene.add(this.rain.mesh);
    }
    this.rain?.setAmount(env.rain);
  }

  /** Creeks risen by a storm (m above their own level) and running faster. */
  setCreeks(rise: number, flowScale: number): void {
    this.water.setCreeks(rise, flowScale);
    this.particles.creekRise = rise;
  }

  /** Share of the quality preset's resolution being drawn now (see adaptResolution). */
  get resolutionScale(): number {
    return this.renderScale.scale;
  }

  /**
   * Lower the resolution while frames are slow and the graphics are the cause, and raise it
   * again when they keep up (frameDt in s, cpuMs the game's own code per frame).
   */
  adaptResolution(frameDt: number, cpuMs: number): void {
    if (this.renderer.xr.isPresenting) return;
    if (!this.renderScale.update(frameDt, cpuMs)) return;
    const base = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(base * this.renderScale.scale);
    this.resize();
  }

  /** The phone test (src/debug/bench.ts): draw at this share of the preset's resolution. */
  benchResolution(scale: number): void {
    const base = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(base * scale);
    this.resize();
  }

  resize(): void {
    // A headset sets its own size; Three.js refuses (and warns) while one is on.
    if (this.renderer.xr.isPresenting) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Build all detail around the camera now (after teleports and camera jumps). */
  snap(): void {
    this.firstFrame = true;
    this.particles.clear();
  }

  /**
   * Build the ground and trees round the camera and compile every shader the scene needs,
   * in parallel where the browser offers it (KHR_parallel_shader_compile), so that the first
   * frame after Drive does not stall on them (v1.46).
   */
  async precompile(): Promise<void> {
    this.terrainMesh.update(this.camera.position, true);
    this.vegetation.update(this.camera.position, 1);
    this.props.update(1);
    this.ruts.update(this.camera.position, 420);
    this.lighting.follow(this.focus);
    this.sky.update(this.camera);
    this.firstFrame = false;
    await this.renderer.compileAsync(this.scene, this.camera);
    // One frame drawn under the loading screen: it links whatever a browser without the
    // parallel compile left for first use, and the shadow map's own shaders.
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Show `lights`, just added to the scene, without the stall of every lit material
   * compiling again for the new number of lights (v1.46). The programs for the new count are
   * compiled while the frames are still drawn without the lights (three.js counts only
   * visible lights), and the lights show once those programs are linked. Returns false if
   * `isCurrent` says the lights were replaced or taken away meanwhile.
   */
  async showLights(lights: THREE.Object3D, isCurrent: () => boolean): Promise<boolean> {
    lights.visible = true;
    const materials = this.renderer.compile(this.scene, this.camera);
    const programs: { isReady(): boolean }[] = [];
    for (const m of materials) {
      const program = (this.renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } })
        .currentProgram;
      if (program) programs.push(program);
    }
    lights.visible = false;
    // Without the parallel compile extension isReady() is true at once and the first frame
    // with the lights links them, as before.
    while (programs.some((p) => !p.isReady())) {
      await new Promise((r) => setTimeout(r, 16));
      if (!isCurrent()) return false;
    }
    if (!isCurrent()) return false;
    lights.visible = true;
    return true;
  }

  /**
   * The eye the mirrors reflect: the camera, or with a headset on (the camera then rides in
   * the seat rig and the headset sets its projection) the head's pose in the world.
   */
  private mirrorEye(): THREE.PerspectiveCamera {
    if (!this.renderer.xr.isPresenting) return this.camera;
    const e = this.headsetEye;
    this.camera.matrixWorld.decompose(e.position, e.quaternion, e.scale);
    e.near = this.camera.near;
    e.updateProjectionMatrix();
    e.updateMatrixWorld();
    return e;
  }

  /** Draw a frame; `alpha` places moving bodies between physics steps (0 = before the last, 1 = after). */
  render(alpha = 1, mirrors = false): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const eye = this.camera.getWorldPosition(this.eye);
    this.terrainMesh.update(eye, this.firstFrame);
    this.vegetation.update(eye, this.firstFrame ? 1 : dt);
    this.props.update(alpha);
    this.ruts.update(eye, 420);
    this.firstFrame = false;
    this.lighting.follow(this.focus);
    this.sky.update(this.camera);
    this.water.update(dt);
    this.rain?.update(eye, this.shelter, dt);
    this.mirrors.update(this.renderer, this.scene, this.mirrorEye(), mirrors, now);
    this.renderer.render(this.scene, this.camera);
  }
}
