import type RAPIER from '@dimforge/rapier3d-compat';
import { DRUM, DIESEL_DRUM_MASS } from '../data/trailers';
import { Groups, groups, type Physics } from './physics';
import { rotate, v3, type Quat, type Vec3 } from './vehicle/math';
import { snapshotPose, type PosedBody } from './bodyPose';
import { waterForce } from './trailerWater';

/** A sealed delivery drum dropped from a trailer. It rolls on land and floats in water. */
export class CargoDrum implements PosedBody {
  readonly body: RAPIER.RigidBody;
  readonly prevPosition = v3();
  readonly prevRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  constructor(
    readonly id: string,
    readonly physics: Physics,
    position: Vec3,
    rotation: Quat,
  ) {
    const R = physics.R;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setLinearDamping(0.12)
        .setAngularDamping(0.3)
        .setCcdEnabled(true),
    );
    physics.world.createCollider(
      R.ColliderDesc.cylinder(DRUM.height / 2, DRUM.radius)
        .setMass(DIESEL_DRUM_MASS)
        .setFriction(0.65)
        .setRestitution(0.05)
        .setCollisionGroups(groups(Groups.DYNAMIC, 0xffff)),
      this.body,
    );
    snapshotPose(this);
  }

  step(dt: number, levelOffset: number): void {
    const up = rotate(this.body.rotation(), 0, 1, 0);
    const halfHeight = (Math.abs(up.y) * DRUM.height) / 2 + Math.hypot(up.x, up.z) * DRUM.radius;
    waterForce(
      this.physics,
      this.body,
      this.body.translation(),
      halfHeight,
      Math.PI * DRUM.radius ** 2 * DRUM.height,
      0.5,
      levelOffset,
      dt,
    );
  }

  remove(): void {
    this.physics.world.removeRigidBody(this.body);
  }
}
