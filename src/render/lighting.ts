import * as THREE from 'three';
import type { EnvironmentConfig } from '../data/environment';
import type { QualityPreset } from '../data/quality';
import { sunDirection } from './sky';

/**
 * Sun and hemisphere light (SPEC §4). The sun's shadow camera follows a focus point
 * (the vehicle) and snaps to shadow-map texels so shadows don't shimmer.
 */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly sunDir = new THREE.Vector3();
  private extent = 55;
  private mapSize = 2048;

  constructor(scene: THREE.Scene, env: EnvironmentConfig) {
    this.sun = new THREE.DirectionalLight();
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.hemi = new THREE.HemisphereLight();
    scene.add(this.sun, this.sun.target, this.hemi);
    this.setEnvironment(env);
  }

  setEnvironment(env: EnvironmentConfig): void {
    this.sun.color.set(env.sun.color);
    this.sun.intensity = env.sun.intensity;
    this.sun.shadow.radius = env.sun.shadowRadius;
    this.hemi.color.set(env.hemisphere.sky);
    this.hemi.groundColor.set(env.hemisphere.ground);
    this.hemi.intensity = env.hemisphere.intensity;
    sunDirection(env, this.sunDir);
  }

  setQuality(q: QualityPreset): void {
    this.extent = q.shadowExtent;
    this.mapSize = q.shadowMapSize;
    this.sun.castShadow = q.shadows;
    const s = this.sun.shadow;
    if (s.mapSize.x !== this.mapSize) {
      s.mapSize.set(this.mapSize, this.mapSize);
      s.map?.dispose();
      s.map = null;
    }
    const cam = s.camera;
    cam.left = -this.extent;
    cam.right = this.extent;
    cam.top = this.extent;
    cam.bottom = -this.extent;
    cam.near = 1;
    cam.far = 900;
    cam.updateProjectionMatrix();
  }

  private readonly lightSpace = new THREE.Matrix4();
  private readonly invLightSpace = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();

  /** Centre the shadow area on `focus`. */
  follow(focus: THREE.Vector3): void {
    // Snap the focus to whole shadow texels in light space.
    this.lightSpace.lookAt(
      new THREE.Vector3(0, 0, 0),
      this.sunDir.clone().negate(),
      new THREE.Vector3(0, 1, 0),
    );
    this.invLightSpace.copy(this.lightSpace).invert();
    const texel = (this.extent * 2) / this.mapSize;
    this.tmp.copy(focus).applyMatrix4(this.invLightSpace);
    this.tmp.x = Math.round(this.tmp.x / texel) * texel;
    this.tmp.y = Math.round(this.tmp.y / texel) * texel;
    this.tmp.applyMatrix4(this.lightSpace);
    this.sun.target.position.copy(this.tmp);
    this.sun.position.copy(this.tmp).addScaledVector(this.sunDir, 450);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }
}
