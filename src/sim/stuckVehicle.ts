import type RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceId } from '../data/surfaces';
import { Groups, groups, type Physics, type Rapier } from './physics';
import { v3, type Quat, type Vec3 } from './vehicle/math';
import { snapshotPose, type PosedBody } from './bodyPose';

/**
 * Someone else's vehicle bogged to its axles, waiting for a winch (an episode's `stranded` drivers).
 * It doesn't drive: it sits sunk in the mud until a winch line pulls on it harder than the
 * bog holds it, then comes out along the line, slowly, rising out of the mud as it comes.
 * Once it has come far enough it is free, and its driver keeps it where it stopped.
 */
export interface StuckVehicleDef {
  id: string;
  /** What it is, as the winch's target list shows it ("Stockman’s Land Cruiser"). */
  name: string;
  x: number;
  z: number;
  /** Which way its nose points (degrees, 0 = north, 90 = east). */
  headingDeg: number;
  /** How far its wheels are sunk in the mud (m). */
  sink: number;
  /** It is free once pulled this far (m). */
  freeAfter: number;
  /** The pull the bog holds against before it starts to move (N). */
  breakout: number;
  /** Extra pull per metre a second it comes out (N·s/m): the mud dragging at it. */
  drag: number;
}

/** It sits this high above the ground on its tyres (m): body origin over the wheels' contact. */
export const STUCK_RIDE_HEIGHT = 0.5;
/** Half its wheelbase (m), for following the ground under each axle. */
const HALF_BASE = 1.15;
/** Fastest it comes out of the mud (m/s). */
const MAX_SPEED = 1.2;

const SOLID = groups(Groups.DYNAMIC, 0xffff);

export class StuckVehicle implements PosedBody {
  readonly body: RAPIER.RigidBody;
  readonly prevPosition = v3();
  readonly prevRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** How far it has been pulled (m). */
  moved = 0;
  freed = false;
  /** Front of the bull bar, where a winch strap goes (body coordinates). */
  readonly hook: Vec3 = { x: 0, y: 0.25, z: -2.0 };
  /** Rated chassis recovery point, separate from a tow ball. */
  readonly rearHook: Vec3 = { x: 0, y: 0.25, z: 2.0 };
  /** Where it stands now (x, z). */
  private x: number;
  private z: number;
  private readonly fx: number;
  private readonly fz: number;

  constructor(
    R: Rapier,
    physics: Physics,
    private readonly heightAt: (x: number, z: number) => number,
    readonly def: StuckVehicleDef,
    freed = false,
  ) {
    const h = (def.headingDeg * Math.PI) / 180;
    this.fx = Math.sin(h);
    this.fz = -Math.cos(h);
    this.x = def.x;
    this.z = def.z;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    // The body and cab, from just above the wheels' bottoms to the roof.
    const c = physics.world.createCollider(
      R.ColliderDesc.cuboid(0.85, 0.85, 2.0)
        .setTranslation(0, 0.5, 0)
        .setFriction(0.5)
        .setCollisionGroups(SOLID),
      this.body,
    );
    physics.colliderSurface.set(c.handle, SurfaceId.Rock);
    this.reset(freed);
  }

  /** Back in the bog (a restart from before it was pulled out), or out where it was left. */
  reset(freed: boolean): void {
    this.freed = freed;
    this.moved = freed ? this.def.freeAfter : 0;
    // Pulled out, it stands where it was pulled to: straight ahead of where it was bogged.
    this.x = this.def.x + this.fx * this.moved;
    this.z = this.def.z + this.fz * this.moved;
    this.place(true);
    snapshotPose(this);
  }

  /**
   * A winch line pulling on it with `tension` (N) towards `from` for `dt` seconds. Returns
   * true on the step it comes free.
   */
  pull(tension: number, from: Vec3, dt: number): boolean {
    if (this.freed || tension <= this.def.breakout) return false;
    const dx = from.x - this.x;
    const dz = from.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return false;
    const speed = Math.min(MAX_SPEED, (tension - this.def.breakout) / this.def.drag);
    const step = speed * dt;
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    this.moved += step;
    if (this.moved >= this.def.freeAfter) this.freed = true;
    this.place(false);
    return this.freed;
  }

  /** How deep it sits in the mud now (m). */
  sinkNow(): number {
    return this.freed ? 0 : this.def.sink * Math.max(0, 1 - this.moved / this.def.freeAfter);
  }

  /** Sit it on the ground under its axles, sunk as far as it still is. */
  private place(teleport: boolean): void {
    const front = this.heightAt(this.x + this.fx * HALF_BASE, this.z + this.fz * HALF_BASE);
    const rear = this.heightAt(this.x - this.fx * HALF_BASE, this.z - this.fz * HALF_BASE);
    const y = (front + rear) / 2 + STUCK_RIDE_HEIGHT - this.sinkNow();
    // Nose up when the front axle stands higher; and down a little into the bog it dug.
    const pitch = Math.atan2(front - rear, 2 * HALF_BASE) - this.sinkNow() * 0.12;
    const yaw = (-this.def.headingDeg * Math.PI) / 180;
    const cy = Math.cos(yaw / 2);
    const sy = Math.sin(yaw / 2);
    const cp = Math.cos(pitch / 2);
    const sp = Math.sin(pitch / 2);
    const q = { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
    const p = { x: this.x, y, z: this.z };
    if (teleport) {
      this.body.setTranslation(p, true);
      this.body.setRotation(q, true);
    } else {
      this.body.setNextKinematicTranslation(p);
      this.body.setNextKinematicRotation(q);
    }
  }
}
