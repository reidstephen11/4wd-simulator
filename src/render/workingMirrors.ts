import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { QualityPreset } from '../data/quality';
import type { VehicleModel } from './vehicleModel';
import { mirrorSurfaces } from './mirrorSurfaces';

interface Mirror {
  mesh: Reflector;
  capture: Reflector['onBeforeRender'];
  last: number;
}

/** Crop the reflected view to the glass, so even the low preset uses its whole texture. */
export function fitMirrorView(
  camera: THREE.PerspectiveCamera,
  mesh: THREE.Mesh,
  eye: THREE.PerspectiveCamera,
): void {
  eye.copy(camera, false);
  eye.far = Math.min(camera.far, 180);
  eye.clearViewOffset();
  eye.updateProjectionMatrix();
  const point = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const reflected = eye.clone();
  reflected.position
    .copy(camera.position)
    .addScaledVector(normal, -2 * normal.dot(new THREE.Vector3().subVectors(camera.position, point)));
  const direction = camera.getWorldDirection(new THREE.Vector3()).reflect(normal);
  reflected.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(normal);
  reflected.lookAt(reflected.position.clone().add(direction));
  reflected.updateMatrixWorld();
  const positions = mesh.geometry.getAttribute('position');
  const bounds = new THREE.Box2();
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(reflected);
    bounds.expandByPoint(new THREE.Vector2(v.x, v.y));
  }
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  if (width <= 0 || height <= 0) return;
  // A two percent border keeps the edge covered despite floating-point clipping.
  bounds.expandByVector(new THREE.Vector2(width * 0.02, height * 0.02));
  eye.setViewOffset(
    2,
    2,
    bounds.min.x + 1,
    1 - bounds.max.y,
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
  );
  // setViewOffset assumes square pixels and changes aspect: retain the real driver's lens.
  eye.aspect = camera.aspect;
  eye.updateProjectionMatrix();
}

/** Player-only planar mirrors. No recursive reflections and at most one capture per frame. */
export class WorkingMirrors {
  private model: VehicleModel | null = null;
  private mirrors: Mirror[] = [];
  private size = 256;
  private interval = 1000 / 15;
  private readonly eye = new THREE.PerspectiveCamera();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  /** Cumulative captures for browser regression checks. */
  captures = 0;

  setVehicle(model: VehicleModel | null): void {
    this.clear();
    this.model = model;
  }

  setQuality(q: QualityPreset): void {
    const size = q.drawDistance <= 1800 ? 128 : q.drawDistance <= 2800 ? 256 : 512;
    this.interval = 1000 / (size === 128 ? 10 : size === 256 ? 15 : 24);
    if (size === this.size) return;
    this.clear();
    this.size = size;
  }

  get targetCount(): number {
    return this.mirrors.length;
  }

  private clear(): void {
    for (const { mesh } of this.mirrors) {
      mesh.removeFromParent();
      mesh.dispose();
      mesh.geometry.dispose();
    }
    this.mirrors = [];
  }

  update(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    enabled: boolean,
    now = performance.now(),
  ): void {
    for (const mirror of this.mirrors) mirror.mesh.visible = false;
    if (!enabled || !this.model) return;
    if (!this.mirrors.length) {
      for (const face of mirrorSurfaces(this.model.body.geometry)) {
        const mesh = new Reflector(face.geometry, {
          textureWidth: this.size,
          textureHeight: this.size,
          multisample: 0,
          color: 0xffffff,
        });
        mesh.name = 'working-mirror';
        mesh.position.copy(face.position);
        mesh.quaternion.copy(face.rotation);
        const capture = mesh.onBeforeRender;
        // Captures run here, never from shadow passes or another mirror's camera.
        mesh.onBeforeRender = () => {};
        mesh.visible = false;
        this.model.bodyGroup.add(mesh);
        this.mirrors.push({ mesh, capture, last: -Infinity });
      }
    }
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const visible = this.mirrors.filter(({ mesh }) => {
      this.position.setFromMatrixPosition(mesh.matrixWorld);
      this.normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
      return this.normal.dot(this.position.sub(camera.position)) < 0 && this.frustum.intersectsObject(mesh);
    });
    // Oldest first prevents a second visible head starving behind the driver's side.
    const due = visible.filter((m) => now - m.last >= this.interval).sort((a, b) => a.last - b.last)[0];
    if (due) {
      fitMirrorView(camera, due.mesh, this.eye);
      due.capture.call(
        due.mesh,
        renderer,
        scene,
        this.eye,
        due.mesh.geometry,
        due.mesh.material as THREE.Material,
        null!,
      );
      due.mesh.visible = false;
      due.last = now;
      this.captures++;
    }
    for (const mirror of visible) mirror.mesh.visible = Number.isFinite(mirror.last);
  }
}
