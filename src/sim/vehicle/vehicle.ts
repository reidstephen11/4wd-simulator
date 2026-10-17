import type RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceId, surfaceGrip, surfaces, waterDrag } from '../../data/surfaces';
import type { VehicleTuning } from '../../data/vehicle';
import { Groups, groups, type Physics } from '../physics';
import type { VehicleInput } from '../input/vehicleInput';
import {
  createCondition,
  enginePowerMultiplier,
  suspensionStiffnessMultiplier,
  tyreGripMultiplier,
} from './condition';
import { createDrivetrainState, engineBrakeForce, updateDrivetrain } from './drivetrain';
import { floodPower, updateFlood, type FloodEvent } from './flooding';
import { mulberry32 } from '../world/rng';
import { type Quat, type Vec3, dot, headingToYaw, rotate, v3, yawQuat } from './math';

/** How readily each surface lets a stuck wheel spin (visual, dirt and sound only). */
const LOOSENESS: Partial<Record<SurfaceId, number>> = {
  [SurfaceId.Mud]: 1,
  [SurfaceId.Gravel]: 0.6,
  [SurfaceId.Water]: 0.4,
  [SurfaceId.Grass]: 0.35,
  [SurfaceId.Dirt]: 0.25,
};

/** Rapier's positive steering turns left; our input is + = right. */
const STEER_SIGN = -1;

export interface WheelState {
  contact: boolean;
  surface: SurfaceId;
  /** Suspension length: hard point to wheel centre. */
  suspension: number;
  /** How fast the suspension is compressing (m/s, + = compressing). */
  compression: number;
  /** Accumulated spin (rad). */
  rotation: number;
  /** Steering angle (rad, + = right). */
  steer: number;
  /** 0..1 how much the wheel is spinning beyond grip. */
  spin: number;
  /** Sideways sliding speed at the contact (m/s). */
  slide: number;
  /** Mud sink (m). */
  sink: number;
  /** Normal load (N). */
  load: number;
  contactPoint: Vec3;
  /** Water depth at the wheel (m). */
  water: number;
}

export interface SpawnPose {
  x: number;
  y: number;
  z: number;
  headingDeg: number;
}

/** Environment values the vehicle reads each step. */
export interface VehicleEnv {
  wetness: number;
  waterLevelOffset: number;
}

const WHEEL_FILTER = groups(Groups.VEHICLE, Groups.TERRAIN | Groups.STATIC | Groups.DYNAMIC | Groups.VEHICLE);

/**
 * A drivable vehicle entity (SPEC §6): Rapier rigid body + ray-cast wheels, with our
 * own drivetrain, open-diff traction split, surfaces, brakes and resistances.
 */
export class Vehicle {
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly colliders: RAPIER.Collider[] = [];
  readonly drivetrain = createDrivetrainState();
  readonly condition = createCondition();
  readonly wheels: WheelState[];
  /** Speed along the heading (m/s, + forward). */
  speed = 0;
  throttle = 0;
  brake = 0;
  handbrake = false;
  horn = false;
  /** When true the hold brake stays off (e.g. while winching). */
  freeRoll = false;
  /** External pull this step (winch), for audio/UI. */
  externalLoad = 0;
  /** Set when flooding stalls or restarts the engine this step. */
  floodEvent: FloodEvent = null;
  /** Engine power multiplier applied this step (dips while flooding sputters). */
  enginePower = 1;
  /** Compression speed of each wheel that hit hard this step (0 = no hit). */
  readonly wheelImpacts = [0, 0, 0, 0];
  private readonly impactCooldown = [0.5, 0.5, 0.5, 0.5];
  /** World position of the air intake (updated each step). */
  readonly intakePos = v3();
  private sputterRand = 0;
  /** Seeded so the simulation stays deterministic. */
  private readonly rand: () => number;
  readonly prevPosition = v3();
  readonly prevRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** Biggest velocity change in the last step (m/s), for impacts/dents. */
  lastImpact = 0;
  readonly lastImpactDir = v3();
  private readonly lastVel = v3();
  private readonly tmpFwd = v3();
  private readonly tmpUp = v3();
  private readonly tmpRight = v3();
  private caps = [0, 0, 0, 0];
  private requests = [0, 0, 0, 0];
  private preload = [0, 0, 0, 0];

  constructor(
    readonly id: string,
    readonly physics: Physics,
    readonly tuning: VehicleTuning,
    spawn: SpawnPose,
    readonly env: VehicleEnv = { wetness: 0, waterLevelOffset: 0 },
  ) {
    const R = physics.R;
    const t = tuning;
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    this.rand = mulberry32(h);
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation(yawQuat(headingToYaw(spawn.headingDeg)))
      .setAdditionalMassProperties(t.mass, t.com, t.inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.02)
      .setAngularDamping(0.15)
      .setCanSleep(false)
      .setCcdEnabled(true);
    this.body = physics.world.createRigidBody(desc);
    const member = groups(Groups.VEHICLE, 0xffff);
    for (const b of t.bodyBoxes) {
      const c = physics.world.createCollider(
        R.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
          .setTranslation(b.cx, b.cy, b.cz)
          .setDensity(0)
          .setFriction(t.bodyFriction)
          .setRestitution(0.05)
          .setCollisionGroups(member),
        this.body,
      );
      this.colliders.push(c);
    }
    const minLen = t.suspensionRestLength - t.suspensionTravel;
    for (const w of t.wheels) {
      // Bump stops: a sphere where the wheel sits at full compression, so wheels can't
      // pass through walls, ledges or logs (the suspension itself is just a ray).
      const c = physics.world.createCollider(
        R.ColliderDesc.ball(t.bumpRadius)
          .setTranslation(w.x, w.y - minLen, w.z)
          .setDensity(0)
          .setFriction(0.35)
          .setRestitution(0)
          .setCollisionGroups(member),
        this.body,
      );
      this.colliders.push(c);
    }

    this.controller = physics.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    t.wheels.forEach((w) => {
      this.controller.addWheel(
        { x: w.x, y: w.y, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        t.suspensionRestLength,
        t.wheelRadius,
      );
    });
    this.applyTuning();
    this.wheels = t.wheels.map(() => ({
      contact: false,
      surface: SurfaceId.Dirt,
      suspension: t.suspensionRestLength,
      compression: 0,
      rotation: 0,
      steer: 0,
      spin: 0,
      slide: 0,
      sink: 0,
      load: 0,
      contactPoint: v3(),
      water: 0,
    }));
    this.snapshot();
  }

  /** Push tuning values that are set once into Rapier (call again after live edits). */
  applyTuning(): void {
    const t = this.tuning;
    for (let i = 0; i < t.wheels.length; i++) {
      this.controller.setWheelMaxSuspensionTravel(i, t.suspensionTravel);
      this.controller.setWheelSuspensionCompression(i, t.damperCompression);
      this.controller.setWheelSuspensionRelaxation(i, t.damperRelaxation);
      this.controller.setWheelMaxSuspensionForce(i, t.maxSuspensionForce);
      this.controller.setWheelSideFrictionStiffness(i, 1);
    }
    this.body.setAdditionalMassProperties(t.mass, t.com, t.inertia, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  get position(): Vec3 {
    return this.body.translation();
  }

  get rotation(): Quat {
    return this.body.rotation();
  }

  forward(out: Vec3 = v3()): Vec3 {
    return rotate(this.body.rotation(), 0, 0, -1, out);
  }

  up(out: Vec3 = v3()): Vec3 {
    return rotate(this.body.rotation(), 0, 1, 0, out);
  }

  /** Angle between the body's up axis and world up (degrees). */
  tiltDeg(): number {
    const u = this.up(this.tmpUp);
    return (Math.acos(Math.max(-1, Math.min(1, u.y))) * 180) / Math.PI;
  }

  /** World position of a local point. */
  localToWorld(x: number, y: number, z: number, out: Vec3 = v3()): Vec3 {
    const p = this.body.translation();
    rotate(this.body.rotation(), x, y, z, out);
    out.x += p.x;
    out.y += p.y;
    out.z += p.z;
    return out;
  }

  toggleRange(): boolean {
    if (Math.abs(this.speed) > 20 / 3.6) return false;
    this.drivetrain.range = this.drivetrain.range === 'high' ? 'low' : 'high';
    this.drivetrain.shiftTimer = Math.max(this.drivetrain.shiftTimer, 0.5);
    return true;
  }

  teleport(pose: SpawnPose): void {
    this.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.body.setRotation(yawQuat(headingToYaw(pose.headingDeg)), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) w.sink = 0;
    // Settling onto the ground after a teleport isn't a hit.
    this.impactCooldown.fill(0.5);
    this.drivetrain.gear = 0;
    this.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
    this.lastVel.x = this.lastVel.y = this.lastVel.z = 0;
    this.snapshot();
  }

  /** Remember the pose before a physics step (for render interpolation). */
  snapshot(): void {
    const p = this.body.translation();
    const q = this.body.rotation();
    this.prevPosition.x = p.x;
    this.prevPosition.y = p.y;
    this.prevPosition.z = p.z;
    this.prevRotation.x = q.x;
    this.prevRotation.y = q.y;
    this.prevRotation.z = q.z;
    this.prevRotation.w = q.w;
  }

  /** Apply one step of driver input. Call before the physics world steps. */
  step(input: VehicleInput, dt: number): void {
    this.snapshot();
    const t = this.tuning;
    const c = this.controller;
    const q = this.body.rotation();
    const fwd = rotate(q, 0, 0, -1, this.tmpFwd);
    const right = rotate(q, 1, 0, 0, this.tmpRight);
    const vel = this.body.linvel();
    this.speed = dot(vel, fwd);
    this.horn = input.horn;
    this.handbrake = input.handbrake;
    if (input.toggleRange) this.toggleRange();

    // Throttle / brake / reverse, automatic-style.
    let throttle = 0;
    let brake = 0;
    let reverse = this.drivetrain.gear < 0;
    const f = input.throttle;
    const b = input.brake;
    if (f > 0.02 && b > 0.02) brake = Math.max(f, b);
    else if (f > 0.02) {
      if (this.speed < -0.5) brake = f;
      else {
        throttle = f;
        reverse = false;
      }
    } else if (b > 0.02) {
      if (this.speed > 0.5) brake = b;
      else {
        throttle = b;
        reverse = true;
      }
    }
    this.throttle = throttle;
    this.brake = brake;

    // Engine flooding: is the air intake under the water surface?
    this.localToWorld(t.intake.x, t.intake.y, t.intake.z, this.intakePos);
    const ws = this.physics.ground.waterSurfaceAt(this.intakePos.x, this.intakePos.z);
    const submerged = ws !== null && this.intakePos.y < ws + this.env.waterLevelOffset;
    this.floodEvent = updateFlood(this.condition.flood, submerged, f, dt);
    this.drivetrain.engineRunning = !this.condition.flood.stalled;
    if (this.rand() < dt * 6) this.sputterRand = this.rand();
    this.enginePower =
      enginePowerMultiplier(this.condition) * floodPower(this.condition.flood, this.sputterRand);

    const drive = updateDrivetrain(
      t,
      this.drivetrain,
      { throttle, reverse, speed: this.speed, enginePower: this.enginePower },
      dt,
    );

    // Grip available at each wheel.
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const grip = surfaceGrip(w.surface, this.env.wetness) * tyreGripMultiplier(this.condition, i);
      this.caps[i] = w.contact ? t.longitudinalGrip * grip * w.load : 0;
      c.setWheelFrictionSlip(i, t.lateralGrip * grip);
      c.setWheelSideFrictionStiffness(i, input.handbrake && !t.wheels[i].front ? t.handbrakeSideGrip : 1);
    }

    // Open differentials: each axle can only push as hard as its weaker wheel allows,
    // plus a little leak. Torque then splits by available grip.
    const perAxle = drive / 2;
    for (const [i, j] of [
      [0, 1],
      [2, 3],
    ]) {
      const a = this.caps[i];
      const bb = this.caps[j];
      const lo = Math.min(a, bb);
      const hi = Math.max(a, bb);
      const axleCap = 2 * lo + t.openDiffLeak * (hi - lo);
      const deliver = Math.sign(perAxle) * Math.min(Math.abs(perAxle), axleCap);
      const sum = a + bb;
      this.requests[i] = sum > 0 ? (deliver * a) / sum : 0;
      this.requests[j] = sum > 0 ? (deliver * bb) / sum : 0;
      const want = Math.abs(perAxle) / 2;
      for (const k of [i, j]) {
        const got = Math.abs(this.requests[k]);
        let spin = want > 1 && throttle > 0.05 ? Math.max(0, 1 - got / want) : 0;
        // Bogged down on loose ground with the throttle in: the wheels dig and spin.
        const w = this.wheels[k];
        if (w.contact && throttle > 0.3 && Math.abs(this.speed) < 1.2) {
          const loose = LOOSENESS[w.surface] ?? 0;
          spin = Math.max(spin, loose * throttle * (1 - Math.abs(this.speed) / 1.2));
        }
        w.spin += (spin - w.spin) * Math.min(1, dt * 8);
      }
    }

    // Brakes.
    const stopped = Math.abs(this.speed) < 0.5;
    const engineBrake = throttle === 0 && brake === 0 && !stopped ? engineBrakeForce(t, this.drivetrain) : 0;
    const hold = throttle === 0 && brake === 0 && stopped && !this.freeRoll ? t.holdBrakeForce : 0;
    for (let i = 0; i < 4; i++) {
      const front = t.wheels[i].front;
      let bf = (brake * t.brakeForce * (front ? t.brakeFrontBias : 1 - t.brakeFrontBias)) / 2;
      if (input.handbrake && !front) bf += t.handbrakeForce / 2;
      bf += (engineBrake + hold) / 4;
      if (bf > 0 && !(throttle > 0 && !input.handbrake)) {
        c.setWheelEngineForce(i, 0);
        c.setWheelBrake(i, bf * dt);
      } else {
        c.setWheelEngineForce(i, input.handbrake && !front ? 0 : this.requests[i]);
        c.setWheelBrake(i, input.handbrake && !front ? (t.handbrakeForce / 2) * dt : 0);
      }
    }

    // Steering narrows with speed; simple Ackermann so the inner wheel turns more.
    const sp = Math.min(1, Math.abs(this.speed) / t.steering.minAngleSpeed);
    const maxA =
      ((t.steering.maxAngleDeg + (t.steering.minAngleDeg - t.steering.maxAngleDeg) * sp * sp * (3 - 2 * sp)) *
        Math.PI) /
      180;
    const angle = Math.max(-1, Math.min(1, input.steer)) * maxA;
    const wb = Math.abs(t.wheels[0].z - t.wheels[2].z);
    const halfTrack = Math.abs(t.wheels[0].x);
    for (let i = 0; i < 4; i++) {
      if (!t.wheels[i].front) continue;
      let a = angle;
      if (Math.abs(angle) > 1e-4) {
        const radius = wb / Math.tan(Math.abs(angle));
        const inner = (angle > 0 && t.wheels[i].x > 0) || (angle < 0 && t.wheels[i].x < 0);
        a = Math.sign(angle) * Math.atan(wb / (radius + (inner ? -halfTrack : halfTrack)));
      }
      this.wheels[i].steer = a;
      c.setWheelSteering(i, STEER_SIGN * a);
    }

    // Suspension: condition multiplier, mud sink and anti-roll bars. A bar shifts load
    // from the less compressed wheel to the more compressed one on the same axle; we do
    // that by moving spring preload (rest length) between them.
    for (const [i, j, k] of [
      [0, 1, t.antiRoll.front],
      [2, 3, t.antiRoll.rear],
    ]) {
      const wi = this.wheels[i];
      const wj = this.wheels[j];
      let shift = 0;
      if (wi.contact && wj.contact) {
        const springRate = t.springStiffness * t.mass;
        shift = (k * (wj.suspension - wi.suspension)) / springRate;
        shift = Math.max(-0.08, Math.min(0.08, shift));
      }
      this.preload[i] = shift;
      this.preload[j] = -shift;
    }
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const sinkTarget = w.contact
        ? surfaces[w.surface].sink * Math.min(1, 0.4 + w.spin + (Math.abs(this.speed) < 2 ? 0.4 : 0))
        : 0;
      w.sink += (sinkTarget - w.sink) * Math.min(1, dt * (sinkTarget > w.sink ? 0.8 : 2.5));
      c.setWheelSuspensionRestLength(i, t.suspensionRestLength + w.sink + this.preload[i]);
      c.setWheelSuspensionStiffness(i, t.springStiffness * suspensionStiffnessMultiplier(this.condition, i));
    }

    c.updateVehicle(dt, undefined, WHEEL_FILTER);
    this.addRollTorque(q);
    this.pushDynamicGround(q, dt);

    // Rolling resistance, aero drag and water drag.
    let rr = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (w.contact) rr += surfaces[w.surface].rollingResistance * w.load;
    }
    const sv = Math.max(-1, Math.min(1, this.speed / 0.6));
    let fx = -fwd.x * rr * sv;
    let fy = -fwd.y * rr * sv;
    let fz = -fwd.z * rr * sv;
    const vmag = Math.hypot(vel.x, vel.y, vel.z);
    const aero = 0.5 * 1.2 * t.dragArea * vmag;
    fx -= aero * vel.x;
    fy -= aero * vel.y;
    fz -= aero * vel.z;
    const depth = this.bodyWaterDepth();
    if (depth > 0) {
      const d = Math.min(depth, waterDrag.maxDepth);
      const k = d * (waterDrag.quadratic * vmag + waterDrag.linear);
      fx -= k * vel.x;
      fy -= k * vel.y;
      fz -= k * vel.z;
    }
    this.body.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    void right;
  }

  /**
   * Rapier applies wheel side forces near the centre-of-mass height (fixed 10% "roll
   * influence"), which makes rollovers nearly impossible. Add back the missing torque.
   */
  private addRollTorque(q: Quat): void {
    const scale = this.tuning.rollTorqueScale * 0.9;
    if (scale <= 0) return;
    const c = this.controller;
    const up = rotate(q, 0, 1, 0, this.tmpUp);
    const com = this.body.worldCom();
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (let i = 0; i < 4; i++) {
      if (!c.wheelIsInContact(i)) continue;
      const j = c.wheelSideImpulse(i) ?? 0;
      if (j === 0) continue;
      const cp = c.wheelContactPoint(i);
      const n = c.wheelContactNormal(i);
      if (!cp || !n) continue;
      const s = c.wheelSteering(i) ?? 0;
      const axle = rotate(q, Math.cos(s), 0, Math.sin(s));
      const proj = axle.x * n.x + axle.y * n.y + axle.z * n.z;
      let ax = axle.x - n.x * proj;
      let ay = axle.y - n.y * proj;
      let az = axle.z - n.z * proj;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const d = up.x * (cp.x - com.x) + up.y * (cp.y - com.y) + up.z * (cp.z - com.z);
      const k = scale * d * j;
      // (up × axle) · k
      tx += (up.y * az - up.z * ay) * k;
      ty += (up.z * ax - up.x * az) * k;
      tz += (up.x * ay - up.y * ax) * k;
    }
    this.body.applyTorqueImpulse({ x: tx, y: ty, z: tz }, true);
  }

  /**
   * Rapier's wheels don't push back on what they stand on. Apply each wheel's load and
   * tyre forces to dynamic ground (planks, the Fallen Tree) so the car's weight presses
   * a plank onto its supports and drive force can shove it.
   */
  private pushDynamicGround(q: Quat, dt: number): void {
    const c = this.controller;
    for (let i = 0; i < 4; i++) {
      if (!c.wheelIsInContact(i)) continue;
      const col = c.wheelGroundObject(i);
      const body = col?.parent();
      if (!body || !body.isDynamic()) continue;
      const n = c.wheelContactNormal(i);
      const cp = c.wheelContactPoint(i);
      if (!n || !cp) continue;
      const load = Math.min(this.tuning.maxSuspensionForce, c.wheelSuspensionForce(i) ?? 0) * dt;
      const steer = c.wheelSteering(i) ?? 0;
      // Wheel axle and forward directions (forward = normal × axle, as in Rapier).
      const ax = rotate(q, Math.cos(steer), 0, Math.sin(steer));
      const fx = n.y * ax.z - n.z * ax.y;
      const fy = n.z * ax.x - n.x * ax.z;
      const fz = n.x * ax.y - n.y * ax.x;
      const fwdImp = c.wheelForwardImpulse(i) ?? 0;
      const sideImp = c.wheelSideImpulse(i) ?? 0;
      body.applyImpulseAtPoint(
        {
          x: -n.x * load - fx * fwdImp - ax.x * sideImp,
          y: -n.y * load - fy * fwdImp - ax.y * sideImp,
          z: -n.z * load - fz * fwdImp - ax.z * sideImp,
        },
        cp,
        true,
      );
    }
  }

  /** Depth of water around the body centre (m above the ground under it). */
  bodyWaterDepth(): number {
    let max = 0;
    for (const w of this.wheels) max = Math.max(max, w.water);
    return max;
  }

  /** Read back wheel state after the physics step. */
  postStep(dt: number): void {
    const c = this.controller;
    const vel = this.body.linvel();
    const ang = this.body.angvel();
    const com = this.body.worldCom();
    const right = rotate(this.body.rotation(), 1, 0, 0, this.tmpRight);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.contact = c.wheelIsInContact(i);
      const susp = c.wheelSuspensionLength(i) ?? w.suspension;
      w.compression = (w.suspension - susp) / dt;
      w.suspension = susp;
      this.wheelImpacts[i] = 0;
      this.impactCooldown[i] = Math.max(0, this.impactCooldown[i] - dt);
      if (w.contact && w.compression > this.tuning.wheelImpactSpeed && this.impactCooldown[i] === 0) {
        this.wheelImpacts[i] = w.compression;
        this.impactCooldown[i] = 0.12;
      }
      w.rotation = c.wheelRotation(i) ?? w.rotation;
      w.load = w.contact ? Math.min(this.tuning.maxSuspensionForce, c.wheelSuspensionForce(i) ?? 0) : 0;
      const cp = c.wheelContactPoint(i);
      if (cp) {
        w.contactPoint.x = cp.x;
        w.contactPoint.y = cp.y;
        w.contactPoint.z = cp.z;
      }
      if (w.contact) {
        w.surface = this.physics.surfaceOfCollider(
          c.wheelGroundObject(i),
          w.contactPoint.x,
          w.contactPoint.z,
        );
        // Velocity of the chassis at the contact point, sideways component.
        const rx = w.contactPoint.x - com.x;
        const ry = w.contactPoint.y - com.y;
        const rz = w.contactPoint.z - com.z;
        const px = vel.x + ang.y * rz - ang.z * ry;
        const py = vel.y + ang.z * rx - ang.x * rz;
        const pz = vel.z + ang.x * ry - ang.y * rx;
        w.slide = Math.abs(px * right.x + py * right.y + pz * right.z);
      } else w.slide = 0;
      const ws = this.physics.ground.waterSurfaceAt(w.contactPoint.x, w.contactPoint.z);
      w.water = ws === null ? 0 : Math.max(0, ws + this.env.waterLevelOffset - w.contactPoint.y);
    }
    // Impact detection: sudden change in velocity.
    const dvx = vel.x - this.lastVel.x;
    const dvy = vel.y - this.lastVel.y;
    const dvz = vel.z - this.lastVel.z;
    const dv = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    // Ignore gravity's own contribution.
    this.lastImpact = Math.max(0, dv - 9.81 * dt * 1.5);
    if (dv > 1e-6) {
      this.lastImpactDir.x = dvx / dv;
      this.lastImpactDir.y = dvy / dv;
      this.lastImpactDir.z = dvz / dv;
    }
    this.lastVel.x = vel.x;
    this.lastVel.y = vel.y;
    this.lastVel.z = vel.z;
  }
}
