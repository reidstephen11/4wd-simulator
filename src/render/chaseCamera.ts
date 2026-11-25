import * as THREE from 'three';
import {
  cameraTuning as C,
  cameraPresets,
  cameraPresetOrder,
  cockpit,
  headMotion as H,
  type CameraPreset,
} from '../data/camera';
import { vehicles, type CabinLayout } from '../data/vehicles';
import { CockpitHeadMotion } from './cockpitHeadMotion';

export interface ChaseTarget {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  /** Signed speed along the heading (m/s). */
  speed: number;
  /** Ground slope under the vehicle (degrees). */
  slopeDeg: number;
  /** Vehicle orientation (for the driver's-seat view). */
  rotation?: THREE.Quaternion;
  /** Interpolation between physics steps, shared with the vehicle model. */
  alpha?: number;
}

/** Returns the clear distance from `from` along unit `dir` up to `max`. */
export type Blocker = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number;

/**
 * Chase camera (SPEC §8): follows heading with lag (never the vehicle's roll, so the
 * horizon stays level), pulls back with speed and on slopes, comes closer when
 * crawling, and pushes forward along the view line instead of clipping into terrain.
 */
export class ChaseCamera {
  readonly headMotion = new CockpitHeadMotion();
  headMotionEnabled = true;
  distance = C.distance;
  preset: CameraPreset = 'follow';
  private followDistance = C.distance;
  /** Look down at the ground ahead (plank placement, picking an anchor). */
  toolView = false;
  /** Driver's eye in the vehicle frame and its resting downward look (from the vehicle's cabin). */
  seat: Pick<CabinLayout, 'eye' | 'pitch'> = vehicles.shortie.cabin;
  /** Vehicle size: the outside views stand back and look higher by this much (1 = short 4WD). */
  scale = 1;
  /** A trailer on the back: the outside views stand further back and higher to show it. */
  towing = false;
  private towBlend = 0;
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
  private readonly desired = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
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

  private readonly headQ = new THREE.Quaternion();
  private readonly lookQ = new THREE.Quaternion();
  private readonly motionQ = new THREE.Quaternion();
  private readonly headOffset = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /** Driver's seat: moves and tilts with the body; the head turns with the orbit input. */
  private updateCockpit(dt: number, t: ChaseTarget): void {
    const k = Math.min(1, dt * C.orbitRate);
    this.viewYaw += (this.orbitYaw - this.viewYaw) * k;
    this.viewPitch += (this.orbitPitch - this.viewPitch) * k;
    const q = t.rotation as THREE.Quaternion;
    const eye = this.seat.eye;
    if (this.headMotionEnabled) this.headMotion.sample(t.alpha ?? 1, this.headOffset);
    else this.headOffset.set(0, 0, 0);
    this.tmp.copy(eye).add(this.headOffset).applyQuaternion(q).add(t.position);
    this.camera.position.copy(this.tmp);
    this.euler.set(this.seat.pitch + this.viewPitch, -this.viewYaw, 0);
    this.lookQ.setFromEuler(this.euler);
    this.euler.set(this.headOffset.z * H.pitchPerMetre, 0, -this.headOffset.x * H.rollPerMetre);
    this.motionQ.setFromEuler(this.euler);
    this.headQ.copy(q).multiply(this.motionQ).multiply(this.lookQ);
    this.camera.quaternion.copy(this.headQ);
    // Leaving the seat starts the follow camera from scratch.
    this.initialised = false;
  }

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * C.zoomStep, C.minDistance, C.maxDistance);
  }

  /** Keep the chosen angle relative to the vehicle until explicitly recentered. */
  orbit(yaw: number, pitch: number): void {
    if (yaw === 0 && pitch === 0) return;
    if (this.preset === 'cockpit') {
      // Turn your head: limited, and it stays where you leave it until recentred.
      this.orbitYaw = THREE.MathUtils.clamp(this.orbitYaw + yaw, -cockpit.maxYaw, cockpit.maxYaw);
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - pitch, -cockpit.maxPitch, cockpit.maxPitch);
      return;
    }
    this.orbitYaw = Math.atan2(Math.sin(this.orbitYaw + yaw), Math.cos(this.orbitYaw + yaw));
    const profile = cameraPresets[this.preset];
    const base = Math.atan2(profile.height, profile.distance);
    this.orbitPitch = THREE.MathUtils.clamp(
      this.orbitPitch + pitch,
      C.minElevation - base,
      C.maxElevation - base,
    );
    this.manualView = true;
  }

  /** Ease back behind the vehicle, keeping the selected zoom distance. */
  recenter(): void {
    this.headMotion.reset();
    if (this.preset !== 'follow') {
      this.preset = 'follow';
      this.distance = this.followDistance;
    }
    this.orbitYaw = this.orbitPitch = 0;
    this.manualView = false;
  }

  selectPreset(preset: CameraPreset): void {
    this.headMotion.reset();
    if (this.preset === 'follow') this.followDistance = this.distance;
    this.preset = preset;
    this.distance = preset === 'follow' ? this.followDistance : cameraPresets[preset].distance;
    this.orbitYaw = cameraPresets[preset].yaw;
    this.orbitPitch = 0;
    this.manualView = preset !== 'follow';
  }

  cyclePreset(): void {
    this.selectPreset(
      cameraPresetOrder[(cameraPresetOrder.indexOf(this.preset) + 1) % cameraPresetOrder.length],
    );
  }

  /** Jump straight to the follow position (after teleports). */
  reset(): void {
    this.initialised = false;
    this.recenter();
    this.viewYaw = this.viewPitch = this.manualBlend = 0;
  }

  update(dt: number, t: ChaseTarget): void {
    const near = this.preset === 'cockpit' ? cockpit.near : C.near;
    const fov = viewFov(this.camera.aspect);
    if (this.camera.near !== near || this.camera.fov !== fov) {
      this.camera.near = near;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.preset === 'cockpit' && t.rotation) {
      this.updateCockpit(dt, t);
      return;
    }
    const profile = cameraPresets[this.preset];
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
    this.towBlend += ((this.towing ? 1 : 0) - this.towBlend) * Math.min(1, dt * 2);
    const scale = this.scale * (1 + C.towScale * this.towBlend);
    const speedF = Math.min(1, this.speedSmoothed / C.speedRef);
    let dist = this.distance * scale * (1 + C.speedPullback * speedF);
    if (this.speedSmoothed < C.crawlSpeed)
      dist *= C.crawlCloser + (1 - C.crawlCloser) * (this.speedSmoothed / C.crawlSpeed);
    let height =
      profile.height * (dist / (profile.distance * scale)) ** 0.8 * scale +
      C.slopeLift * Math.min(1, this.slopeSmoothed / 30) * (this.preset === 'follow' ? 1 : 0.25);
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
      .addScaledVector(
        t.forward,
        this.preset === 'follow'
          ? (C.lookAhead + this.toolBlend * 3.5) * (1 - this.manualBlend)
          : profile.lookAhead,
      );
    this.targetY += (t.position.y - this.targetY) * Math.min(1, dt * C.targetHeightRate);
    // Never let the smoothed target fall far behind (big drops, jack, teleports).
    this.targetY = THREE.MathUtils.clamp(this.targetY, t.position.y - 0.6, t.position.y + 0.6);
    this.look.y = this.targetY + profile.targetHeight * scale;
    const desired = this.desired.copy(this.look).addScaledVector(back, radius * Math.cos(elevation));
    desired.y += radius * Math.sin(elevation);

    const first = !this.initialised;
    if (first) {
      this.pos.copy(desired);
      this.initialised = true;
    } else this.pos.lerp(desired, Math.min(1, dt * C.positionRate));

    // Keep the view line clear: push the camera towards the target if anything is in the
    // way (straight away), then ease back out once it clears so it doesn't pop.
    const camPos = this.camPos.copy(this.pos);
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

/**
 * Vertical field of view (degrees) for a screen of this width / height: `fov`, widened on
 * a narrow screen so the view is at least `minHorizontalFov` across, up to `maxFov`.
 */
export function viewFov(aspect: number): number {
  const rad = THREE.MathUtils.DEG2RAD;
  const needed = (2 * Math.atan(Math.tan((C.minHorizontalFov * rad) / 2) / aspect)) / rad;
  return Math.min(C.maxFov, Math.max(C.fov, needed));
}
