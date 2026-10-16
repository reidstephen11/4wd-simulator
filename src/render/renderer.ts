import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import type { QualityPreset } from '../data/quality';
import type { World } from '../sim/world/world';
import { applyFogEnvironment } from './fog';
import { Lighting } from './lighting';
import { Sky, createBackdrop } from './sky';
import { TerrainMesh } from './terrainMesh';
import { WaterMesh } from './water';

/** Owns the Three.js renderer, scene and camera, and the static world meshes. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: Lighting;
  readonly sky: Sky;
  readonly terrainMesh: TerrainMesh;
  readonly water: WaterMesh;
  private quality: QualityPreset;
  private firstFrame = true;
  /** Point the shadow camera follows (the vehicle). */
  readonly focus = new THREE.Vector3();

  constructor(
    readonly container: HTMLElement,
    readonly world: World,
    private env: EnvironmentConfig,
    quality: QualityPreset,
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
    this.scene.add(createBackdrop(world.map.seed));

    this.terrainMesh = new TerrainMesh(world.terrain, world.map.seed);
    this.scene.add(this.terrainMesh.group);
    this.water = new WaterMesh(world.terrain, world.map.seed, env.waterLevelOffset);
    this.scene.add(this.water.group);

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
    applyFogEnvironment(this.scene, this.env, q.drawDistance);
    this.resize();
  }

  setEnvironment(env: EnvironmentConfig): void {
    this.env = env;
    this.lighting.setEnvironment(env);
    this.sky.setEnvironment(env);
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

  render(): void {
    this.terrainMesh.update(this.camera.position, this.firstFrame);
    this.firstFrame = false;
    this.lighting.follow(this.focus);
    this.sky.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
