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
  private orbitYaw = 0;
  private orbitPitch = 0;
  private viewYaw = 0;
  private viewPitch = 0;
  private manualView = false;
  private manualBlend = 0;
  private initialised = false;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private slopeSmoothed = 0;
  private speedSmoothed = 0;
  /** Smoothed height of the look target. */
  private targetY = 0;
  /** Current distance from the look target along the view line (shrinks when blocked). */
  private viewDist = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly blocker: Blocker,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * C.zoomStep, C.minDistance, C.maxDistance);
  }

  /** Keep the chosen angle relative to the vehicle until explicitly recentered. */
  orbit(yaw: number, pitch: number): void {
    if (yaw === 0 && pitch === 0) return;
    this.orbitYaw = Math.atan2(Math.sin(this.orbitYaw + yaw), Math.cos(this.orbitYaw + yaw));
    const base = Math.atan2(C.height, C.distance);
    this.orbitPitch = THREE.MathUtils.clamp(
      this.orbitPitch + pitch,
      C.minElevation - base,
      C.maxElevation - base,
    );
    this.manualView = true;
  }

  /** Ease back behind the vehicle, keeping the selected zoom distance. */
  recenter(): void {
    this.orbitYaw = this.orbitPitch = 0;
    this.manualView = false;
  }

  /** Jump straight to the follow position (after teleports). */
  reset(): void {
    this.initialised = false;
    this.recenter();
    this.viewYaw = this.viewPitch = this.manualBlend = 0;
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
      this.targetY = t.position.y;
    }
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * C.yawRate);
    const k = Math.min(1, dt * 1.5);
    this.slopeSmoothed += (t.slopeDeg - this.slopeSmoothed) * k;
    this.speedSmoothed += (Math.abs(t.speed) - this.speedSmoothed) * k;

    const orbitK = Math.min(1, dt * C.orbitRate);
    const orbitDelta = this.orbitYaw - this.viewYaw;
    this.viewYaw += Math.atan2(Math.sin(orbitDelta), Math.cos(orbitDelta)) * orbitK;
    this.viewPitch += (this.orbitPitch - this.viewPitch) * orbitK;
    this.manualBlend += ((this.manualView ? 1 : 0) - this.manualBlend) * orbitK;

    this.toolBlend += ((this.toolView ? 1 : 0) - this.toolBlend) * Math.min(1, dt * 3);
    const speedF = Math.min(1, this.speedSmoothed / C.speedRef);
    let dist = this.distance * (1 + C.speedPullback * speedF);
    if (this.speedSmoothed < C.crawlSpeed)
      dist *= C.crawlCloser + (1 - C.crawlCloser) * (this.speedSmoothed / C.crawlSpeed);
    let height = C.height * (dist / C.distance) ** 0.8 + C.slopeLift * Math.min(1, this.slopeSmoothed / 30);
    const toolLift = this.toolBlend * (1 - this.manualBlend);
    height += toolLift * 4.5;
    dist += toolLift * 1.5;

    const elevation = THREE.MathUtils.clamp(
      Math.atan2(height, dist) + this.viewPitch,
      C.minElevation,
      C.maxElevation,
    );
    const radius = Math.hypot(dist, height);
    const back = this.tmp.set(-Math.sin(this.yaw + this.viewYaw), 0, -Math.cos(this.yaw + this.viewYaw));
    // Orbit around the vehicle itself so side/front views keep the wheels in frame.
    this.look
      .copy(t.position)
      .addScaledVector(t.forward, (C.lookAhead + this.toolBlend * 3.5) * (1 - this.manualBlend));
    this.targetY += (t.position.y - this.targetY) * Math.min(1, dt * C.targetHeightRate);
    // Never let the smoothed target fall far behind (big drops, jack, teleports).
    this.targetY = THREE.MathUtils.clamp(this.targetY, t.position.y - 0.6, t.position.y + 0.6);
    this.look.y = this.targetY + C.targetHeight;
    const desired = new THREE.Vector3().copy(this.look).addScaledVector(back, radius * Math.cos(elevation));
    desired.y += radius * Math.sin(elevation);

    const first = !this.initialised;
    if (first) {
      this.pos.copy(desired);
      this.initialised = true;
    } else this.pos.lerp(desired, Math.min(1, dt * C.positionRate));

    // Keep the view line clear: push the camera towards the target if anything is in the
    // way (straight away), then ease back out once it clears so it doesn't pop.
    const camPos = this.pos.clone();
    this.dir.copy(camPos).sub(this.look);
    const full = this.dir.length();
    if (full > 1e-3) {
      this.dir.divideScalar(full);
      const clear = this.blocker(this.look, this.dir, full);
      const allowed = clear < full ? Math.max(0.8, clear - C.clearance) : full;
      if (first || allowed < this.viewDist) this.viewDist = allowed;
      else
        this.viewDist = Math.min(
          allowed,
          this.viewDist + (allowed - this.viewDist) * Math.min(1, dt * C.unblockRate),
        );
      camPos.copy(this.look).addScaledVector(this.dir, this.viewDist);
    }
    const ground = this.groundAt(camPos.x, camPos.z) + C.groundClearance;
    if (camPos.y < ground) camPos.y = ground;

    this.camera.position.copy(camPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }
}
