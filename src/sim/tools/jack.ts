import type RAPIER from '@dimforge/rapier3d-compat';
import { jackTuning as J } from '../../data/tools';
import type { Vehicle } from '../vehicle/vehicle';
import { headingOf, headingToYaw, rotate, slerp, yawQuat, type Quat, type Vec3 } from '../vehicle/math';

export type JackState = 'idle' | 'available' | 'righting';

/**
 * Jack (SPEC §7.3): once the car has been tipped past 60° and nearly still for 2 s,
 * holding J for 1.5 s plays a short animation that sets it back on its wheels beside
 * where it lay.
 */
export class Jack {
  state: JackState = 'idle';
  /** Seconds tipped and still. */
  waitTime = 0;
  /** Seconds J has been held (0..holdTime). */
  holdTime = 0;
  private anim = 0;
  private readonly fromPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly toPos: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly fromRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private toRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly tmpQ: Quat = { x: 0, y: 0, z: 0, w: 1 };

  get holdProgress(): number {
    return Math.min(1, this.holdTime / J.holdTime);
  }

  /** Called every step before physics. `groundAt` gives terrain height. */
  step(
    v: Vehicle,
    holding: boolean,
    dt: number,
    R: typeof RAPIER,
    groundAt: (x: number, z: number) => number,
  ): void {
    if (this.state === 'righting') {
      this.anim += dt;
      const t = Math.min(1, this.anim / J.animTime);
      const e = t * t * (3 - 2 * t);
      // Lift up, then settle down.
      const lift = Math.sin(Math.PI * e) * 0.8;
      v.body.setNextKinematicTranslation({
        x: this.fromPos.x + (this.toPos.x - this.fromPos.x) * e,
        y: this.fromPos.y + (this.toPos.y - this.fromPos.y) * e + lift,
        z: this.fromPos.z + (this.toPos.z - this.fromPos.z) * e,
      });
      v.body.setNextKinematicRotation(slerp(this.fromRot, this.toRot, e, this.tmpQ));
      if (t >= 1) {
        v.body.setBodyType(R.RigidBodyType.Dynamic, true);
        v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.state = 'idle';
        this.waitTime = 0;
        this.holdTime = 0;
      }
      return;
    }
    const lv = v.body.linvel();
    const still = Math.hypot(lv.x, lv.y, lv.z) < J.stillSpeed;
    if (v.tiltDeg() > J.tiltDeg && still) this.waitTime += dt;
    else this.waitTime = 0;
    this.state = this.waitTime >= J.waitTime ? 'available' : 'idle';
    if (this.state !== 'available') {
      this.holdTime = 0;
      return;
    }
    this.holdTime = holding ? this.holdTime + dt : 0;
    if (this.holdTime >= J.holdTime) this.begin(v, R, groundAt);
  }

  private begin(v: Vehicle, R: typeof RAPIER, groundAt: (x: number, z: number) => number): void {
    const p = v.body.translation();
    const q = v.body.rotation();
    this.fromPos.x = p.x;
    this.fromPos.y = p.y;
    this.fromPos.z = p.z;
    this.fromRot.x = q.x;
    this.fromRot.y = q.y;
    this.fromRot.z = q.z;
    this.fromRot.w = q.w;
    // Keep the heading the nose points along (or along the roof if it points straight up).
    const f = rotate(q, 0, 0, -1);
    const u = rotate(q, 0, 1, 0);
    const heading = Math.hypot(f.x, f.z) > 0.2 ? headingOf(f.x, f.z) : headingOf(-u.x, -u.z);
    // Roll back towards where the roof points, i.e. onto the wheels beside it.
    const ul = Math.hypot(u.x, u.z) || 1;
    const x = p.x + (u.x / ul) * J.sideOffset;
    const z = p.z + (u.z / ul) * J.sideOffset;
    this.toPos.x = x;
    this.toPos.z = z;
    this.toPos.y = groundAt(x, z) + v.tuning.wheelRadius + 0.25;
    this.toRot = yawQuat(headingToYaw(heading));
    this.anim = 0;
    this.state = 'righting';
    v.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
  }
}
