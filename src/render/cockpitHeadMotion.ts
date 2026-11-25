import * as THREE from 'three';
import { headMotion as H } from '../data/camera';

export interface HeadMotionInput {
  /** World velocity at the driver's seat, including the body's angular movement. */
  velocity: THREE.Vector3Like;
  position: THREE.Vector3Like;
  rotation: THREE.Quaternion;
}

/** Inertial seat-relative movement, without an idle oscillation or random shake. */
export class CockpitHeadMotion {
  readonly offset = new THREE.Vector3();
  readonly previous = new THREE.Vector3();
  private readonly springVelocity = new THREE.Vector3();
  private readonly acceleration = new THREE.Vector3();
  private readonly lastVelocity = new THREE.Vector3();
  private readonly lastPosition = new THREE.Vector3();
  private readonly lastRotation = new THREE.Quaternion();
  private readonly inverse = new THREE.Quaternion();
  private readonly force = new THREE.Vector3();
  private initialised = false;

  reset(): void {
    this.initialised = false;
    this.offset.set(0, 0, 0);
    this.previous.set(0, 0, 0);
    this.springVelocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
  }

  step(dt: number, input: HeadMotionInput): void {
    if (!(dt > 0)) return;
    const p = input.position,
      v = input.velocity,
      q = input.rotation;
    const finite = Number.isFinite(p.x + p.y + p.z + v.x + v.y + v.z + q.x + q.y + q.z + q.w);
    if (!finite) {
      this.reset();
      return;
    }
    const discontinuity =
      dt > 0.1 ||
      this.lastPosition.distanceTo(input.position) > 3 ||
      this.lastRotation.angleTo(input.rotation) > 0.5;
    if (!this.initialised || discontinuity) {
      this.reset();
      this.lastVelocity.copy(input.velocity);
      this.lastPosition.copy(input.position);
      this.lastRotation.copy(input.rotation);
      this.initialised = true;
      return;
    }
    this.previous.copy(this.offset);
    this.force.copy(input.velocity).sub(this.lastVelocity).divideScalar(dt);
    // Smooth in world space, then express the load in the vehicle's frame. Turning the
    // driver's head never changes which way braking or cornering moves it.
    this.force.clampLength(0, H.maxAcceleration);
    this.acceleration.lerp(this.force, 1 - Math.exp(-H.accelerationRate * dt));
    this.inverse.copy(input.rotation).invert();
    this.force.copy(this.acceleration).applyQuaternion(this.inverse);
    const decay = Math.exp(-H.springRate * dt);
    for (const axis of ['x', 'y', 'z'] as const) {
      const target = THREE.MathUtils.clamp(
        -this.force[axis] * H.gain[axis],
        -H.maxOffset[axis],
        H.maxOffset[axis],
      );
      // Exact critically damped response for a constant target during this step.
      const delta = this.offset[axis] - target;
      const travel = (this.springVelocity[axis] + H.springRate * delta) * dt;
      this.offset[axis] = THREE.MathUtils.clamp(
        target + (delta + travel) * decay,
        -H.maxOffset[axis],
        H.maxOffset[axis],
      );
      this.springVelocity[axis] = (this.springVelocity[axis] - H.springRate * travel) * decay;
    }
    this.lastVelocity.copy(input.velocity);
    this.lastPosition.copy(input.position);
    this.lastRotation.copy(input.rotation);
  }

  /** Same interpolation as the body, so high-refresh screens don't see physics-step jumps. */
  sample(alpha: number, into: THREE.Vector3): THREE.Vector3 {
    return into.lerpVectors(this.previous, this.offset, THREE.MathUtils.clamp(alpha, 0, 1));
  }
}
