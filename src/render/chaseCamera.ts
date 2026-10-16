import * as THREE from 'three';
import { cameraTuning as C } from '../data/camera';

export interface ChaseTarget {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  /** Signed speed along the heading (m/s). */
  speed: number;
  /** Ground slope under the vehicle (degrees). */
  slopeDeg: number;
}

/** Returns the clear distance from `from` along unit `dir` up to `max`. */
export type Blocker = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number;

/**
 * Chase camera (SPEC §8): follows heading with lag (never the vehicle's roll, so the
 * horizon stays level), pulls back with speed and on slopes, comes closer when
 * crawling, and pushes forward along the view line instead of clipping into terrain.
 */
export class ChaseCamera {
  distance = C.distance;
  /** Look down at the ground ahead (plank placement, picking an anchor). */
  toolView = false;
  private toolBlend = 0;
  private yaw = 0;
  private initialised = false;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private slopeSmoothed = 0;
  private speedSmoothed = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly blocker: Blocker,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * C.zoomStep, C.minDistance, C.maxDistance);
  }

  /** Jump straight to the follow position (after teleports). */
  reset(): void {
    this.initialised = false;
  }

  update(dt: number, t: ChaseTarget): void {
    const fx = t.forward.x;
    const fz = t.forward.z;
    const flat = Math.hypot(fx, fz);
    const targetYaw = flat > 0.15 ? Math.atan2(fx, fz) : this.yaw;
    if (!this.initialised) {
      this.yaw = targetYaw;
      this.slopeSmoothed = t.slopeDeg;
      this.speedSmoothed = Math.abs(t.speed);
    }
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * C.yawRate);
    const k = Math.min(1, dt * 1.5);
    this.slopeSmoothed += (t.slopeDeg - this.slopeSmoothed) * k;
    this.speedSmoothed += (Math.abs(t.speed) - this.speedSmoothed) * k;

    this.toolBlend += ((this.toolView ? 1 : 0) - this.toolBlend) * Math.min(1, dt * 3);
    const speedF = Math.min(1, this.speedSmoothed / C.speedRef);
    let dist = this.distance * (1 + C.speedPullback * speedF);
    if (this.speedSmoothed < C.crawlSpeed)
      dist *= C.crawlCloser + (1 - C.crawlCloser) * (this.speedSmoothed / C.crawlSpeed);
    let height = C.height * (dist / C.distance) ** 0.8 + C.slopeLift * Math.min(1, this.slopeSmoothed / 30);
    height += this.toolBlend * 4.5;
    dist += this.toolBlend * 1.5;

    const back = this.tmp.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.look.copy(t.position).addScaledVector(t.forward, C.lookAhead + this.toolBlend * 3.5);
    this.look.y = t.position.y + C.targetHeight;
    const desired = new THREE.Vector3().copy(this.look).addScaledVector(back, dist);
    desired.y += height;

    if (!this.initialised) {
      this.pos.copy(desired);
      this.initialised = true;
    } else this.pos.lerp(desired, Math.min(1, dt * C.positionRate));

    // Keep the view line clear: push the camera towards the target if anything is in the way.
    const camPos = this.pos.clone();
    this.dir.copy(camPos).sub(this.look);
    const full = this.dir.length();
    if (full > 1e-3) {
      this.dir.divideScalar(full);
      const clear = this.blocker(this.look, this.dir, full);
      if (clear < full) camPos.copy(this.look).addScaledVector(this.dir, Math.max(0.8, clear - C.clearance));
    }
    const ground = this.groundAt(camPos.x, camPos.z) + C.groundClearance;
    if (camPos.y < ground) camPos.y = ground;

    this.camera.position.copy(camPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}
