import * as THREE from 'three';

/**
 * Free-fly debug camera (SPEC §10): drag with the mouse to look, WASD to move,
 * R/F to rise/sink, Shift to go faster, scroll to change speed.
 */
export class FreeCamera {
  enabled = false;
  private yaw = 0;
  private pitch = -0.2;
  private speed = 30;
  private readonly keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.enabled) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.004;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - (e.clientY - this.lastY) * 0.004));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.speed = Math.max(2, Math.min(400, this.speed * (e.deltaY > 0 ? 0.85 : 1.18)));
      },
      { passive: true },
    );
  }

  /** Place the camera at `pos` looking at `target`. */
  set(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(pos);
    const d = target.clone().sub(pos).normalize();
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    this.apply();
  }

  /** Take over from wherever the camera currently is. */
  syncFromCamera(): void {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  }

  private apply(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const fwd = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const v = new THREE.Vector3();
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) v.add(fwd);
    if (k.has('KeyS') || k.has('ArrowDown')) v.sub(fwd);
    if (k.has('KeyD') || k.has('ArrowRight')) v.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) v.sub(right);
    if (k.has('KeyR')) v.y += 1;
    if (k.has('KeyF')) v.y -= 1;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    if (v.lengthSq() > 0) this.camera.position.addScaledVector(v.normalize(), this.speed * boost * dt);
    this.apply();
  }
}
