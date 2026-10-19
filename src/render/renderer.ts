import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import type { QualityPreset } from '../data/quality';
import type { World } from '../sim/world/world';
import { applyFogEnvironment } from './fog';
import { groundUniforms } from './groundMaterial';
import { Lighting } from './lighting';
import { Sky, createBackdrop } from './sky';
import { TerrainMesh } from './terrainMesh';
import { WaterMesh } from './water';
import { Vegetation } from './vegetation';
import { WorldProps } from './worldProps';
import { TrackRuts } from './tracks';
import { Particles } from './particles';
import { Rain } from './rain';
import type { DynamicObject } from '../sim/sim';

/** Owns the Three.js renderer, scene and camera, and the static world meshes. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: Lighting;
  readonly sky: Sky;
  readonly terrainMesh: TerrainMesh;
  readonly water: WaterMesh;
  readonly vegetation: Vegetation;
  readonly props: WorldProps;
  readonly ruts: TrackRuts;
  readonly particles: Particles;
  /** Falling rain, when it is raining. */
  readonly rain: Rain | null;
  /** The vehicle's world matrix: it shelters the rain. */
  readonly shelter = new THREE.Matrix4();
  private quality: QualityPreset;
  private lastFrame = performance.now();
  private firstFrame = true;
  private reflectionMap: THREE.WebGLRenderTarget | null = null;
  /** Point the shadow camera follows (the vehicle). */
  readonly focus = new THREE.Vector3();

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
    this.scene.add(createBackdrop(world.map.seed));

    this.terrainMesh = new TerrainMesh(world.terrain, world.map.seed);
    this.scene.add(this.terrainMesh.group);
    this.water = new WaterMesh(
      world.terrain,
      world.map.seed,
      env.waterLevelOffset,
      world.features.creekDistance,
    );
    this.scene.add(this.water.group);
    this.vegetation = new Vegetation(world, quality);
    this.scene.add(this.vegetation.group);
    this.props = new WorldProps(world, dynamics);
    this.scene.add(this.props.group);
    this.ruts = new TrackRuts(world);
    this.scene.add(this.ruts.group);
    this.particles = new Particles(world.terrain, quality, env.waterLevelOffset);
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
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.lighting.setQuality(q);
    this.camera.far = q.drawDistance;
    this.camera.updateProjectionMatrix();
    this.terrainMesh.setLodDistances(q.terrainLod);
    this.vegetation?.setQuality(q);
    this.particles?.setQuality(q);
    applyFogEnvironment(this.scene, this.env, q.drawDistance);
    this.resize();
  }

  private updateReflections(env: EnvironmentConfig): void {
    // A filtered sky supplies coherent highlights on paint, glass and water.
    const scene = new THREE.Scene();
    const sky = new Sky(env);
    scene.add(sky.mesh);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const next = pmrem.fromScene(scene, 0.04, 0.1, 200, { size: 128 });
    this.scene.environment = next.texture;
    this.scene.environmentIntensity = 0.45;
    this.reflectionMap?.dispose();
    this.reflectionMap = next;
    sky.mesh.geometry.dispose();
    (sky.mesh.material as THREE.Material).dispose();
    pmrem.dispose();
  }

  setEnvironment(env: EnvironmentConfig): void {
    this.env = env;
    this.lighting.setEnvironment(env);
    this.sky.setEnvironment(env);
    this.updateReflections(env);
    this.renderer.toneMapping =
      env.toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = env.exposure;
    this.particles.setWetness(env.wetness);
    groundUniforms.groundWetness.value = env.wetness;
    applyFogEnvironment(this.scene, env, this.quality.drawDistance);
  }

  resize(): void {
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

  render(): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.terrainMesh.update(this.camera.position, this.firstFrame);
    this.vegetation.update(this.camera.position, this.firstFrame ? 1 : dt);
    this.props.update();
    this.ruts.update(this.camera.position, 420);
    this.firstFrame = false;
    this.lighting.follow(this.focus);
    this.sky.update(this.camera);
    this.water.update(dt);
    this.rain?.update(this.camera.position, this.shelter, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
