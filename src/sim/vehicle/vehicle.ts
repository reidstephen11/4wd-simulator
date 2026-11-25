import type RAPIER from '@dimforge/rapier3d-compat';
import { solidAxlePose } from './solidAxle';
import {
  SurfaceId,
  surfaceGrip,
  surfaces,
  sweptTuning,
  tyreLock,
  waterDrag,
  waterLift,
} from '../../data/surfaces';
import { crashTuning, type VehicleTuning } from '../../data/vehicle';
import { nextHeadlightMode, type HeadlightMode } from '../../data/headlights';
import { damageTuning } from '../../data/damage';
import { floodTuning } from '../../data/tools';
import { carriedKg, type PackWeights } from '../../data/packing';
import type { ChurnMap } from '../world/churn';
import { Groups, groups, type Physics } from '../physics';
import type { VehicleInput } from '../input/vehicleInput';
import {
  createCondition,
  enginePowerMultiplier,
  suspensionStiffnessMultiplier,
  tyreDrop,
  tyreGripMultiplier,
  tyreSideGripMultiplier,
} from './condition';
import {
  coupledRpm,
  createDrivetrainState,
  engineBrakeForce,
  shiftGear,
  updateDrivetrain,
  type GearboxMode,
} from './drivetrain';
import { floodPower, updateFlood, type FloodEvent } from './flooding';
import { sandPressure } from './tyrePressure';
import { mulberry32 } from '../world/rng';
import { type Quat, type Vec3, dot, headingToYaw, rotate, v3, yawQuat } from './math';
import { WALL_SPEED, WallSide, WheelContacts } from './wheelContacts';
import { axleDriveCapacity } from './differential';
import {
  createTransferState,
  frontDriven,
  shiftTransfer,
  transferShiftReason,
  transferDrive,
  updateWindup,
} from './transferCase';

/** Sand, dry or under water: low tyre pressures cut its sink and drag. */
const isSand = (surface: SurfaceId): boolean => surface === SurfaceId.Sand || surface === SurfaceId.SoftBed;

/** How readily each surface lets a stuck wheel spin (visual, dirt and sound only). */
const LOOSENESS: Partial<Record<SurfaceId, number>> = {
  [SurfaceId.Mud]: 1,
  [SurfaceId.BlackSoil]: 1,
  [SurfaceId.Clay]: 0.8,
  [SurfaceId.Sand]: 0.85,
  [SurfaceId.SoftBed]: 0.7,
  [SurfaceId.Gravel]: 0.6,
  [SurfaceId.Water]: 0.4,
  [SurfaceId.Grass]: 0.35,
  [SurfaceId.Dirt]: 0.25,
};

/** Rolling back against the selected gear slower than this (m/s), the pedal for that gear is throttle. */
const SLIP_BACK = 1.5;

/** Rapier's positive steering turns left; our input is + = right. */
const STEER_SIGN = -1;

/**
 * World-space axle of a wheel steered by `steer`: Rapier turns the axle (1, 0, 0) about +y,
 * which takes it to (cos s, 0, −sin s). Its side impulse acts along this.
 */
export function steeredAxle(q: Quat, steer: number): Vec3 {
  return rotate(q, Math.cos(steer), 0, -Math.sin(steer));
}

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
  /** Braked past its grip: the wheel is locked and the tyre skids (m/s of skid, 0 = rolling). */
  skid: number;
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
  /** Churned-up clay and mud, worse where wheels have spun (absent: none). */
  churn?: ChurnMap;
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
  readonly transfer = createTransferState();
  readonly condition = createCondition();
  /**
   * What the packing weighs against the standard load the tuned mass carries (null: no
   * packing, the tuned mass as it is). Fuel burnt and cans emptied lighten the car again.
   */
  packing: PackWeights | null = null;
  /** Weight on board beyond the standard load (kg, negative when packed light). */
  payload = 0;
  private massPayload = 0;
  readonly differentials = { front: false, rear: false };
  precisionCrawl = false;
  readonly wheels: WheelState[];
  /** Speed along the heading (m/s, + forward). */
  speed = 0;
  throttle = 0;
  brake = 0;
  /** The handbrake is holding the rear wheels this step (park brake or a hold). */
  handbrake = false;
  /** The latching park brake: on until the driver lets it off. */
  parkBrake = false;
  horn = false;
  /** Headlights: off, low beam or high beam. */
  lights: HeadlightMode = 'off';
  /** When true the hold brake stays off (e.g. while winching). */
  freeRoll = false;
  /** External pull this step (winch), for audio/UI. */
  externalLoad = 0;
  /** Water lifting the body this step, as a share of the vehicle's weight. */
  afloat = 0;
  /** The water's velocity at the vehicle this step (m/s, horizontal). */
  readonly current = { x: 0, z: 0 };
  /** Seconds the current has been carrying the vehicle off (see sweptTuning). */
  swept = 0;
  /** Set when flooding stalls or restarts the engine this step. */
  floodEvent: FloodEvent = null;
  /** How high the bow wave stands above the water in front of the car (m). */
  bowWave = 0;
  /**
   * Seconds of cranking left: the starter turns the engine over and nothing drives
   * until it catches. Starting up, after a vehicle swap and after a flooded stall.
   */
  crank = 0;
  /**
   * The engine is switched off, as on arriving at the start of a run: silent until the
   * pedal is pressed, which turns it over on the starter.
   */
  engineOff = false;
  /** Set when pressing the pedal turned the switched-off engine over this step. */
  startedByPedal = false;
  /**
   * The gearbox setting this vehicle drives with (Automatic unless the game sets a manual
   * mode). See `setGearboxMode`.
   */
  gearboxMode: GearboxMode = 'automatic';
  /**
   * Set for the first step of a pedal press that couldn't start the engine: in the
   * sim-level 'clutch' mode it starts only in neutral or with the clutch pressed.
   */
  startBlocked = false;
  private startBlockHeld = false;
  /** Set for the step in which the engine stalled against the clutch. */
  stalledLugged = false;
  /** The engine is off because it stalled against the clutch (the HUD lights STALLED). */
  clutchStalled = false;
  /** Engine power multiplier applied this step (dips while flooding sputters). */
  enginePower = 1;
  /**
   * The chassis (not the tyres) touching the ground this step: how hard it presses
   * (N), how fast it slides at the contact (m/s), what it's on, and the sharpest
   * new knock (impulse, N·s; 0 = none). Sound and the HUD read these.
   */
  readonly bodyContact = { force: 0, slide: 0, surface: SurfaceId.Rock as SurfaceId, knock: 0 };
  /** Compression speed of each wheel that hit hard this step (0 = no hit). */
  readonly wheelImpacts = [0, 0, 0, 0];
  /**
   * How fast each corner of the body was moving down (m/s) as its wheel landed or
   * bottomed this step, 0 otherwise. Unlike the compression speed it ignores a rock step
   * rising under a slowly rolling wheel: only a corner that was falling counts.
   */
  readonly wheelLandings = [0, 0, 0, 0];
  /**
   * How hard each wheel dropped into a pothole or washout this step: the vehicle's speed
   * (m/s) times the hole's depth (m), give or take a quarter for how squarely it hit, once
   * per hole; 0 otherwise.
   */
  readonly wheelStrikes = [0, 0, 0, 0];
  private readonly inHole = [false, false, false, false];
  /** Each corner's downward speed after the last step. */
  private readonly cornerFall = [0, 0, 0, 0];
  private readonly impactCooldown = [0.5, 0.5, 0.5, 0.5];
  /** World position of the air intake (updated each step). */
  readonly intakePos = v3();
  private sputterRand = 0;
  /** Seeded so the simulation stays deterministic. */
  /** This vehicle's own random numbers (seeded by its id, so a run repeats). */
  readonly rand: () => number;
  readonly prevPosition = v3();
  readonly prevRotation: Quat = { x: 0, y: 0, z: 0, w: 1 };
  /** Biggest velocity change in the last step (m/s), for impacts/dents. */
  lastImpact = 0;
  readonly lastImpactDir = v3();
  private readonly lastVel = v3();
  private readonly tmpFwd = v3();
  private readonly tmpUp = v3();
  private readonly tmpRight = v3();
  private readonly liftPoint = v3();
  private caps = [0, 0, 0, 0];
  private requests = [0, 0, 0, 0];
  private preload = [0, 0, 0, 0];
  /** Sideways grip kept by each tyre in running water or going flat (1 = all of it). */
  private readonly sideCreep = [1, 1, 1, 1];
  private readonly wheelContacts: WheelContacts;
  private readonly rawWheelRotation = [0, 0, 0, 0];
  private readonly wheelRotationDelta = [0, 0, 0, 0];
  private articulationBlend = 0;
  /** Ground cleared with the shovel: local, temporary, and lost to wheelspin. */
  dugGround: { x: number; z: number; relief: number } | null = null;
  /** Lateral hub positions on the rigid beams (the track narrows in projection as they roll). */
  readonly wheelX: number[];
  /** Seconds the hill-start assist has held the brakes for this pull-away. */
  private hillHold = 0;

  constructor(
    readonly id: string,
    readonly physics: Physics,
    readonly tuning: VehicleTuning,
    spawn: SpawnPose,
    readonly env: VehicleEnv = { wetness: 0, waterLevelOffset: 0 },
  ) {
    const R = physics.R;
    const t = tuning;
    this.condition.fuel = t.engine.fuel.tankLitres;
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
    this.wheelX = t.wheels.map((w) => w.x);
    this.wheelContacts = new WheelContacts(physics, tuning);
    this.wheels = t.wheels.map(() => ({
      contact: false,
      surface: SurfaceId.Dirt,
      suspension: t.suspensionRestLength,
      compression: 0,
      rotation: 0,
      steer: 0,
      spin: 0,
      slide: 0,
      skid: 0,
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
    this.setMass();
  }

  /** The tuned mass plus the payload. */
  get mass(): number {
    return this.tuning.mass + this.payload;
  }

  private setMass(): void {
    const t = this.tuning;
    const k = this.mass / t.mass;
    const inertia = { x: t.inertia.x * k, y: t.inertia.y * k, z: t.inertia.z * k };
    this.body.setAdditionalMassProperties(this.mass, t.com, inertia, { x: 0, y: 0, z: 0, w: 1 }, true);
    this.massPayload = this.payload;
  }

  /** Weigh what's on board now, and give the body that mass once it has changed by a kilo. */
  private weighLoad(): void {
    const c = this.condition;
    const p = this.packing;
    this.payload = p ? carriedKg(c, p.spareKg) - p.baseKg : 0;
    if (Math.abs(this.payload - this.massPayload) >= 1) this.setMass();
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
  /**
   * A tyre against a wall (the far edge of a hole it dropped into, `WheelContacts.walls`):
   * stop that corner moving into it, as the tyre's face against the edge would. Only the
   * part of the corner's velocity along the tyre's rolling direction, into the wall, is
   * taken away; the car can still back out, or be winched or driven sideways.
   */
  private meetWalls(q: Quat): void {
    const walls = this.wheelContacts.walls;
    const t = this.tuning;
    const com = this.body.worldCom();
    for (let i = 0; i < t.wheels.length; i++) {
      const sides = walls[i];
      if (sides === 0) continue;
      const w = t.wheels[i];
      const hub = this.localToWorld(w.x, w.y - this.wheels[i].suspension, w.z, this.wallHub);
      const sx = this.wheelContacts.steerSin[i];
      const sz = this.wheelContacts.steerCos[i];
      for (const [bit, lx, lz] of [
        [WallSide.Ahead, sx, sz],
        [WallSide.Behind, -sx, -sz],
        [WallSide.Right, sz, -sx],
        [WallSide.Left, -sz, sx],
      ] as const) {
        if (!(sides & bit)) continue;
        // Towards the wall, level.
        const d = rotate(q, lx, 0, lz, this.wallDir);
        const len = Math.hypot(d.x, d.z) || 1;
        const dx = d.x / len,
          dz = d.z / len;
        // Velocity of the hub point, recomputed as each push changes it.
        const v = this.body.linvel();
        const o = this.body.angvel();
        const rx = hub.x - com.x,
          ry = hub.y - com.y,
          rz = hub.z - com.z;
        const vx = v.x + o.y * rz - o.z * ry;
        const vz = v.z + o.x * ry - o.y * rx;
        const into = vx * dx + vz * dz;
        if (into <= 0) continue;
        // Enough to stop the corner: the whole car's mass, since its other wheels push it on.
        const j = into * this.mass;
        this.body.applyImpulseAtPoint({ x: -dx * j, y: 0, z: -dz * j }, hub, true);
      }
    }
  }
  private readonly wallHub = v3();
  private readonly wallDir = v3();

  localToWorld(x: number, y: number, z: number, out: Vec3 = v3()): Vec3 {
    const p = this.body.translation();
    rotate(this.body.rotation(), x, y, z, out);
    out.x += p.x;
    out.y += p.y;
    out.z += p.z;
    return out;
  }

  /** Turn the engine over on the starter; it drives once it catches. False if it's already starting. */
  startEngine(): boolean {
    if (this.crank > 0) return false;
    this.engineOff = false;
    this.clutchStalled = false;
    this.crank = this.tuning.engine.crankSeconds;
    this.drivetrain.engineRunning = false;
    this.drivetrain.rpm = this.tuning.engine.crankRpm;
    return true;
  }

  /** Switch the engine off: it stays off until the pedal is pressed. */
  switchOff(): void {
    this.engineOff = true;
    this.crank = 0;
    this.drivetrain.engineRunning = false;
    this.drivetrain.rpm = 0;
  }

  /** A manual gearbox setting: the player picks the gear (reverse is a gear). */
  get manualGearbox(): boolean {
    return this.gearboxMode !== 'automatic';
  }

  /** A manual gearbox setting on a vehicle with a real clutch (not the 40 Series' automatic). */
  get clutchGearbox(): boolean {
    return this.manualGearbox && this.tuning.gearbox.kind === 'manual';
  }

  /**
   * Change the gearbox setting. Into a manual mode with the engine off, the box goes to
   * neutral so the pedal can start it; back to Automatic, neutral is dropped.
   */
  setGearboxMode(mode: GearboxMode): void {
    if (mode === this.gearboxMode) return;
    this.gearboxMode = mode;
    const d = this.drivetrain;
    if (mode === 'automatic') {
      if (d.neutral) d.gear = 0;
      d.neutral = false;
      d.clutch = 1;
    } else if (!d.engineRunning || this.engineOff) {
      d.gear = 0;
      d.neutral = true;
    }
  }

  rangeShiftReason(): string | null {
    return transferShiftReason(this.tuning, this.transfer, this.speed);
  }

  toggleCentre(): boolean {
    if (this.tuning.transfer !== 'fullTime' || (!this.transfer.centreLocked && Math.abs(this.speed) > 0.5))
      return false;
    this.transfer.centreLocked = !this.transfer.centreLocked;
    if (!this.transfer.centreLocked) this.transfer.windup = 0;
    return true;
  }

  toggleRange(): boolean {
    // Direct range assignments in headless labs remain supported.
    if (this.drivetrain.range === 'low') this.transfer.mode = '4L';
    if (!shiftTransfer(this.tuning, this.transfer, this.speed)) return false;
    const d = this.drivetrain;
    d.range = this.transfer.mode === '4L' ? 'low' : 'high';
    d.shiftTimer = Math.max(d.shiftTimer, 0.5);
    // In the manual settings the player keeps the gear they picked.
    if (this.manualGearbox) return true;
    // Changing range on the move, pick the gear that suits the new range, so the engine
    // neither labours nor overruns (the Unimog's road and field gears are far apart).
    const g = this.tuning.gearbox;
    if (d.gear > 0) {
      while (d.gear > 0 && coupledRpm(this.tuning, this.speed, d.gear, d.range) < g.downshiftRpm.full)
        d.gear--;
      while (
        d.gear < g.ratios.length - 1 &&
        coupledRpm(this.tuning, this.speed, d.gear, d.range) > g.upshiftRpm.full
      )
        d.gear++;
    }
    return true;
  }

  /** Engage at walking pace; unlocking is always allowed. */
  toggleDiff(axle: 'front' | 'rear'): boolean {
    if (
      !this.differentials[axle] &&
      Math.abs(dot(this.body.linvel(), this.forward())) > this.tuning.crawling.diffLockMaxKmh / 3.6
    )
      return false;
    this.differentials[axle] = !this.differentials[axle];
    return true;
  }

  teleport(pose: SpawnPose): void {
    this.body.setTranslation({ x: pose.x, y: pose.y, z: pose.z }, true);
    this.body.setRotation(yawQuat(headingToYaw(pose.headingDeg)), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) w.sink = 0;
    this.dugGround = null;
    this.swept = 0;
    this.cornerFall.fill(0);
    // Settling onto the ground after a teleport isn't a hit.
    this.impactCooldown.fill(0.5);
    this.drivetrain.gear = 0;
    this.body.setBodyType(this.physics.R.RigidBodyType.Dynamic, true);
    this.lastVel.x = this.lastVel.y = this.lastVel.z = 0;
    this.snapshot();
  }

  /**
   * Stop simulating this vehicle: drop the wheel controller and disable the body. The
   * caller removes the body after a physics step; removing it straight away leaves a
   * vehicle added in the same step frozen in place (Rapier 0.21).
   */
  retire(): void {
    this.physics.world.removeVehicleController(this.controller);
    this.body.setEnabled(false);
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
    this.weighLoad();
    const t = this.tuning;
    const c = this.controller;
    const q = this.body.rotation();
    const fwd = rotate(q, 0, 0, -1, this.tmpFwd);
    const right = rotate(q, 1, 0, 0, this.tmpRight);
    const vel = this.body.linvel();
    this.speed = dot(vel, fwd);
    this.horn = input.horn;
    if (input.toggleParkBrake) this.parkBrake = !this.parkBrake;
    const handbrake = input.handbrake || this.parkBrake;
    this.handbrake = handbrake;
    if (input.toggleRange) this.toggleRange();
    if (input.toggleFrontDiff) this.toggleDiff('front');
    if (input.toggleRearDiff) this.toggleDiff('rear');
    if (input.togglePrecision) this.precisionCrawl = !this.precisionCrawl;
    if (input.cycleLights) this.lights = nextHeadlightMode(this.lights);
    if (this.manualGearbox) {
      if (input.shiftUp) shiftGear(t, this.drivetrain, 1);
      if (input.shiftDown) shiftGear(t, this.drivetrain, -1);
    }

    // Throttle / brake / reverse, automatic-style. Accelerating against the way the
    // car is rolling brakes it, unless it is rolling back against the selected gear
    // (slipping back down a rock): then the throttle fights the roll, as in a real car.
    let throttle = 0;
    let brake = 0;
    const inReverse = this.drivetrain.gear < 0;
    let reverse = inReverse;
    const f = input.throttle;
    const b = input.brake;
    if (this.manualGearbox) {
      // Manual settings: the pedal is throttle in the selected gear, the brake only brakes.
      if (f > 0.02) throttle = f;
      if (b > 0.02) brake = b;
    } else if (f > 0.02 && b > 0.02) brake = Math.max(f, b);
    else if (f > 0.02) {
      if (this.speed < -0.5 && (inReverse || this.speed < -SLIP_BACK)) brake = f;
      else {
        throttle = f;
        reverse = false;
      }
    } else if (b > 0.02) {
      if (this.speed > 0.5 && (!inReverse || this.speed > SLIP_BACK)) brake = b;
      else {
        throttle = b;
        reverse = true;
      }
    }
    // Pressing the pedal (either way) with the engine switched off turns it over first.
    // In the 'clutch' mode it only starts in neutral or with the clutch pressed; Manual has
    // no clutch button, so it starts in any gear (the clutch is worked for the player).
    const canStart =
      !this.clutchGearbox || this.gearboxMode === 'manual' || this.drivetrain.neutral || input.clutch > 0.5;
    const blocked = this.engineOff && throttle > 0 && !canStart;
    this.startBlocked = blocked && !this.startBlockHeld;
    this.startBlockHeld = blocked;
    this.startedByPedal = this.engineOff && throttle > 0 && canStart && this.startEngine();
    if (this.precisionCrawl && throttle > 0) {
      const crawl = t.crawling;
      const target = (throttle * (reverse ? crawl.reverseKmh : crawl.forwardKmh)) / 3.6;
      const error = target - this.speed * (reverse ? -1 : 1);
      throttle = Math.max(0, Math.min(1, error * crawl.speedGain));
      // Regulate descents as well as level ground. Driver braking above still has full authority.
      if (error < -0.05) brake = Math.min(1, -error * crawl.brakeGain);
    } else if (this.precisionCrawl && throttle === 0 && brake === 0 && Math.abs(this.speed) > 0.05)
      // Controls released: crawl control brakes to a stop instead of letting it idle on.
      brake = Math.min(1, Math.abs(this.speed) * t.crawling.brakeGain);
    this.throttle = throttle;
    this.brake = brake;

    // Engine flooding: is the air intake under the water surface?
    this.localToWorld(t.intake.x, t.intake.y, t.intake.z, this.intakePos);
    const ws = this.physics.ground.waterSurfaceAt(this.intakePos.x, this.intakePos.z);
    const bed = this.physics.ground.heightAt?.(this.intakePos.x, this.intakePos.z);
    const wading = ws !== null && bed !== undefined ? ws + this.env.waterLevelOffset - bed : 0;
    const F = floodTuning;
    this.bowWave =
      wading > F.bowFromDepth
        ? Math.min(
            wading * F.bowMaxOfDepth,
            Math.max(0, Math.abs(this.speed) - F.bowFromSpeed) * F.bowPerSpeed,
          )
        : 0;
    const still = ws !== null && this.intakePos.y < ws + this.env.waterLevelOffset;
    const submerged =
      still || (ws !== null && this.intakePos.y < ws + this.env.waterLevelOffset + this.bowWave);
    this.floodEvent = updateFlood(
      this.condition.flood,
      submerged,
      f,
      dt,
      still ? 1 : 1 + F.bowFloodPerSpeed2 * Math.max(0, Math.abs(this.speed) - F.bowFromSpeed) ** 2,
    );
    // A flooded engine that's dried out restarts on the starter like any other.
    if (this.floodEvent === 'restarted') this.crank = t.engine.crankSeconds;
    const cranking = this.crank > 0;
    if (cranking) {
      this.crank = Math.max(0, this.crank - dt);
      // It catches straight to idle.
      if (this.crank === 0) this.drivetrain.rpm = t.engine.idleRpm;
    }
    // A wrecked engine (realistic damage) or an empty tank turns over on the starter but never runs.
    this.drivetrain.engineRunning =
      !this.engineOff &&
      !this.condition.flood.stalled &&
      !cranking &&
      this.condition.engine > 0 &&
      this.condition.fuel > 0;
    if (this.rand() < dt * 6) this.sputterRand = this.rand();
    this.enginePower =
      enginePowerMultiplier(this.condition) * floodPower(this.condition.flood, this.sputterRand);

    let drive = updateDrivetrain(
      t,
      this.drivetrain,
      {
        throttle,
        reverse,
        speed: this.speed,
        enginePower: this.enginePower,
        mode: this.gearboxMode,
        clutchPedal: input.clutch,
        autoClutch: this.precisionCrawl,
      },
      dt,
    );
    // Stalled against the clutch: the engine is off until the pedal cranks it again.
    this.stalledLugged = this.drivetrain.stalled;
    if (this.stalledLugged) {
      this.switchOff();
      this.clutchStalled = true;
    }
    // Off the throttle while the winch pulls, the gearbox sits in neutral so the car
    // neither creeps on the cable nor drags against it.
    if (this.freeRoll && throttle === 0) drive = 0;
    if (cranking) this.drivetrain.rpm = t.engine.crankRpm;

    // Grip available at each wheel. In running water the tyres creep sideways on the
    // washed bed, so the current pushes the vehicle downstream before it breaks loose;
    // rolling tyres creep more than standing ones.
    const running =
      Math.min(1, Math.hypot(this.current.x, this.current.z) / waterLift.creepFlow) *
      (waterLift.standingCreep + (1 - waterLift.standingCreep) * Math.min(1, Math.abs(this.speed) / 1.5));
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const churn = this.env.churn;
      if (churn && w.contact) {
        const p = w.contactPoint;
        churn.work(p.x, p.z, w.surface, w.spin, this.speed, this.env.wetness, dt);
      }
      const grip =
        surfaceGrip(w.surface, this.env.wetness) *
        tyreGripMultiplier(this.condition, i) *
        (churn && w.contact ? churn.grip(w.contactPoint.x, w.contactPoint.z, w.surface) : 1);
      this.caps[i] = w.contact ? t.longitudinalGrip * grip * w.load : 0;
      c.setWheelFrictionSlip(i, t.lateralGrip * grip);
      const deep = Math.min(1, Math.max(0, (w.water - 0.15) / (t.wheelRadius + 0.05)));
      this.sideCreep[i] =
        (1 - waterLift.creep * running * deep * deep * (3 - 2 * deep)) *
        tyreSideGripMultiplier(this.condition, i);
      c.setWheelSideFrictionStiffness(
        i,
        (handbrake && !t.wheels[i].front ? t.handbrakeSideGrip : 1) * this.sideCreep[i],
      );
    }

    // Open axles are limited by the weak tyre; locked axles can use both tyres' grip.
    const axleCaps = [
      axleDriveCapacity(this.caps[0], this.caps[1], this.differentials.front, t.openDiffLeak),
      axleDriveCapacity(this.caps[2], this.caps[3], this.differentials.rear, t.openDiffLeak),
    ];
    const axleRequests = transferDrive(t, this.transfer, drive, axleCaps[0], axleCaps[1]);
    updateWindup(t, this.transfer, this.wheels, this.speed, input.steer, dt);
    // With the engine stopped (empty tank, cranking, flooded) the pedal turns nothing.
    const driving = this.drivetrain.engineRunning ? throttle : 0;
    for (const [i, j] of [
      [0, 1],
      [2, 3],
    ]) {
      const perAxle = axleRequests[i < 2 ? 0 : 1];
      const a = this.caps[i];
      const bb = this.caps[j];
      const locked = this.differentials[t.wheels[i].front ? 'front' : 'rear'];
      const axleCap = axleDriveCapacity(a, bb, locked, t.openDiffLeak);
      const deliver = Math.sign(perAxle) * Math.min(Math.abs(perAxle), axleCap);
      const sum = a + bb;
      this.requests[i] = sum > 0 ? (deliver * a) / sum : 0;
      this.requests[j] = sum > 0 ? (deliver * bb) / sum : 0;
      const want = Math.abs(perAxle) / 2;
      for (const k of [i, j]) {
        const got = Math.abs(this.requests[k]);
        let spin = want > 1 && driving > 0.05 ? Math.max(0, 1 - got / want) : 0;
        // Bogged down on loose ground with the throttle in: the wheels dig and spin.
        const w = this.wheels[k];
        if (
          (i >= 2 || frontDriven(t, this.transfer)) &&
          w.contact &&
          driving > 0.3 &&
          Math.abs(this.speed) < 1.2
        ) {
          const loose = LOOSENESS[w.surface] ?? 0;
          spin = Math.max(spin, loose * driving * (1 - Math.abs(this.speed) / 1.2));
        }
        w.spin += (spin - w.spin) * Math.min(1, dt * 8);
      }
      if (locked) {
        const spin = Math.min(this.wheels[i].spin, this.wheels[j].spin);
        this.wheels[i].spin = this.wheels[j].spin = spin;
      }
    }

    // Brakes.
    const stopped = Math.abs(this.speed) < 0.5;
    const engineBrake = throttle === 0 && brake === 0 && !stopped ? engineBrakeForce(t, this.drivetrain) : 0;
    // The brakes also hold the car while the engine is being started.
    let hold =
      (throttle === 0 || cranking) && brake === 0 && stopped && !this.freeRoll ? t.holdBrakeForce : 0;
    // Hill-start assist: pulling away on a slope, the brakes stay on while the engine
    // and converter build up enough drive to hold the car (for at most a moment).
    const pull = 9.81 * this.mass * fwd.y * (reverse ? -1 : 1);
    if (
      throttle > 0 &&
      Math.abs(this.speed) < 0.3 &&
      this.hillHold < t.hillStartHold &&
      Math.abs(drive) < pull
    ) {
      this.hillHold += dt;
      hold = t.brakeForce;
    } else if (throttle === 0 || Math.abs(this.speed) >= 0.3) this.hillHold = 0;
    else this.hillHold = t.hillStartHold;
    const holding = hold > 0 && throttle > 0;
    for (let i = 0; i < 4; i++) {
      const front = t.wheels[i].front;
      let bf = (brake * t.brakeForce * (front ? t.brakeFrontBias : 1 - t.brakeFrontBias)) / 2;
      bf += hold / 4 + (frontDriven(t, this.transfer) ? engineBrake / 4 : front ? 0 : engineBrake / 2);
      const w = this.wheels[i];
      const grounded = w.contact && w.load > 0;
      const moving = Math.abs(this.speed) > tyreLock.minSpeed;
      // Stopping hard, a load-sensing valve keeps the rear brakes from locking first.
      if (!front && grounded && moving) bf = Math.min(bf, w.load * tyreLock.rearValve);
      if (handbrake && !front) bf += t.handbrakeForce / 2;
      // A tyre brakes only as hard as it grips (less on wet ground). Asked for more it
      // locks and skids, gripping less and no longer steering.
      const cap = this.caps[i] * tyreLock.peak;
      const lockedUp = grounded && moving && bf > cap;
      if (grounded) bf = Math.min(bf, lockedUp ? cap * tyreLock.slideGrip : cap);
      w.skid = lockedUp ? Math.abs(this.speed) : 0;
      if (lockedUp) c.setWheelSideFrictionStiffness(i, tyreLock.sideGrip * this.sideCreep[i]);
      if (bf > 0 && (holding || !(throttle > 0 && !handbrake))) {
        c.setWheelEngineForce(i, 0);
        c.setWheelBrake(i, bf * dt);
      } else {
        c.setWheelEngineForce(i, handbrake && !front ? 0 : this.requests[i]);
        c.setWheelBrake(i, handbrake && !front ? (t.handbrakeForce / 2) * dt : 0);
      }
    }

    // Steering narrows with speed; simple Ackermann so the inner wheel turns more.
    const sp = Math.min(1, Math.abs(this.speed) / t.steering.minAngleSpeed);
    const maxA =
      ((t.steering.maxAngleDeg + (t.steering.minAngleDeg - t.steering.maxAngleDeg) * sp * sp * (3 - 2 * sp)) *
        Math.PI) /
      180;
    // A locked front axle resists the different wheel speeds needed for a tight turn.
    // A bent front corner knocks its wheel out of line, pulling the car towards that side.
    const susp = this.condition.suspension;
    // A flat front tyre drags its wheel back, steering the car towards it.
    const tyres = this.condition.tyres;
    const toe =
      ((damageTuning.suspension.toeDeg * Math.PI) / 180) *
        (frontHealth(t, susp, -1) - frontHealth(t, susp, 1)) +
      ((damageTuning.tyre.flatToeDeg * Math.PI) / 180) *
        (frontHealth(t, tyres, -1) - frontHealth(t, tyres, 1));
    const angle =
      Math.max(-1, Math.min(1, input.steer)) *
        maxA *
        (1 - this.transfer.windup * 0.22) *
        (this.differentials.front ? t.crawling.frontLockSteering : 1) +
      toe;
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

    // Ease into softer low-range springs and bars. Match added sag with added rest
    // length, preserving parked height and the physical bump-stop positions.
    this.articulationBlend +=
      ((this.drivetrain.range === 'low' ? 1 : 0) - this.articulationBlend) * Math.min(1, dt * 4);
    const flex = this.articulationBlend;
    const extraDroop = t.crawling.extraDroop * flex;
    const parkedSag = 9.81 / (4 * t.springStiffness);
    // Rapier scales the springs with the body's mass: hold them at the tuned mass's, so a
    // heavy load squats the car.
    const stiffness = (t.springStiffness * (t.mass / this.mass)) / (1 + extraDroop / parkedSag);
    // A heavier car presses its tyres deeper into the mud.
    const loadSink = Math.min(1.6, Math.max(0.7, (this.mass / t.mass) ** 3));
    const barScale = 1 + (t.crawling.antiRollScale - 1) * flex;

    const dug = this.dugGround;
    if (dug) {
      const p = this.body.translation();
      if (Math.hypot(p.x - dug.x, p.z - dug.z) > 3) this.dugGround = null;
      else dug.relief = Math.max(0, dug.relief - (Math.max(...this.wheels.map((w) => w.spin)) * dt) / 12);
    }
    const relief = this.dugGround?.relief ?? 0;

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
        const springRate = stiffness * this.mass;
        shift = (k * barScale * (wj.suspension - wi.suspension)) / springRate;
        shift = Math.max(-0.08, Math.min(0.08, shift));
      }
      this.preload[i] = shift;
      this.preload[j] = -shift;
      const left = t.wheels[i],
        right = t.wheels[j];
      const axle = solidAxlePose(right.x - left.x, left.y - wi.suspension, right.y - wj.suspension);
      const mid = (left.x + right.x) / 2;
      this.wheelX[i] = mid + (left.x - mid) * axle.cos;
      this.wheelX[j] = mid + (right.x - mid) * axle.cos;
      // Contact forces stay tangent to the ground. Camber belongs to the rigid beam,
      // not a vertical component added to Rapier's calibrated lateral tyre impulses.
    }
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const sinkTarget = w.contact
        ? surfaces[w.surface].sink *
          (isSand(w.surface) ? sandPressure(this.condition).sink : 1) *
          (1 - 0.65 * relief) *
          loadSink *
          Math.min(1, 0.4 + w.spin + (Math.abs(this.speed) < 2 ? 0.4 : 0))
        : 0;
      w.sink += (sinkTarget - w.sink) * Math.min(1, dt * (sinkTarget > w.sink ? 0.8 : 2.5));
      c.setWheelMaxSuspensionTravel(i, t.suspensionTravel + extraDroop);
      c.setWheelSuspensionCompression(
        i,
        t.damperCompression + (t.crawling.damperCompression - t.damperCompression) * flex,
      );
      c.setWheelSuspensionRelaxation(
        i,
        t.damperRelaxation + (t.crawling.damperRelaxation - t.damperRelaxation) * flex,
      );
      c.setWheelSuspensionRestLength(i, t.suspensionRestLength + extraDroop + w.sink + this.preload[i]);
      c.setWheelSuspensionStiffness(i, stiffness * suspensionStiffnessMultiplier(this.condition, i));
      // A tyre going down rolls on a smaller radius, dropping that corner.
      c.setWheelRadius(i, t.wheelRadius - tyreDrop(this.condition, i, w.rotation));
    }

    // At a crawl, with the car on at least two wheels, a tyre meets the far edge of a hole
    // as a wall (v2.01) rather than climbing it.
    const grounded = this.wheels.reduce((n, w) => n + (w.contact ? 1 : 0), 0);
    const lookForWalls = Math.abs(this.speed) < WALL_SPEED && grounded >= 2;
    this.wheelContacts.update(
      this.body,
      c,
      WHEEL_FILTER,
      this.wheelX,
      lookForWalls,
      this.wheels.map((w) => w.contact),
    );
    c.updateVehicle(dt, this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS, WHEEL_FILTER);
    this.meetWalls(q);
    this.addRollTorque(q);
    this.pushDynamicGround(q, dt);

    // Rolling resistance, aero drag and water drag.
    let rr = 0;
    const sv = Math.max(-1, Math.min(1, this.speed / 0.6));
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) continue;
      const softGround =
        w.surface === SurfaceId.Mud || w.surface === SurfaceId.BlackSoil || isSand(w.surface);
      rr +=
        surfaces[w.surface].rollingResistance *
        w.load *
        (softGround ? 1 - 0.65 * relief : 1) *
        (isSand(w.surface) ? sandPressure(this.condition).drag : 1);
      // A soft or flat tyre drags at its own corner, which also pulls the car that way.
      const drag = damageTuning.tyre.flatDrag * (1 - this.condition.tyres[i]) * w.load * sv * dt;
      if (drag !== 0)
        this.body.applyImpulseAtPoint(
          { x: -fwd.x * drag, y: -fwd.y * drag, z: -fwd.z * drag },
          w.contactPoint,
          true,
        );
    }
    if (this.transfer.mode === '2H') {
      rr *= 0.97;
      this.drivetrain.fuelRate *= 0.98;
    }
    rr += this.mass * 9.81 * 0.025 * this.transfer.windup * Math.abs(input.steer);
    let fx = -fwd.x * rr * sv;
    let fy = -fwd.y * rr * sv;
    let fz = -fwd.z * rr * sv;
    const vmag = Math.hypot(vel.x, vel.y, vel.z);
    const aero = 0.5 * 1.2 * t.dragArea * vmag;
    fx -= aero * vel.x;
    fy -= aero * vel.y;
    fz -= aero * vel.z;
    const depth = this.bodyWaterDepth();
    const flow = this.current;
    flow.x = flow.z = 0;
    if (depth > 0) {
      // Drag against the water, which may be running: then the current pushes the car.
      const at = this.body.translation();
      this.physics.ground.waterFlowAt?.(at.x, at.z, flow);
      const rx = vel.x - flow.x;
      const rz = vel.z - flow.z;
      const d = Math.min(depth, waterDrag.maxDepth);
      const k = d * (waterDrag.quadratic * Math.hypot(rx, vel.y, rz) + waterDrag.linear);
      // Across the vehicle the water meets its whole side.
      const across = (waterDrag.side - 1) * (rx * right.x + vel.y * right.y + rz * right.z);
      fx -= k * (rx + across * right.x);
      fy -= k * (vel.y + across * right.y);
      fz -= k * (rz + across * right.z);
    }
    this.body.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    this.afloat = depth > 0 ? this.applyLift(q, fwd, right, dt) / (this.mass * 9.81) : 0;
    // Lifted off its tyres and drifting downstream: the current has the vehicle.
    const flowSpeed = Math.hypot(flow.x, flow.z);
    const downstream = flowSpeed > 0.1 ? (vel.x * flow.x + vel.z * flow.z) / flowSpeed : 0;
    if (this.afloat >= sweptTuning.lift && downstream > sweptTuning.speed) this.swept += dt;
    else this.swept = Math.max(0, this.swept - 2 * dt);
  }

  /**
   * Deep water lifts each part of the body by a share of the water it displaces, pushing
   * up at the middle of the part under water, and the tyres by all of theirs. Returns the
   * total lift (N).
   */
  private applyLift(q: Quat, fwd: Vec3, right: Vec3, dt: number): number {
    const ground = this.physics.ground;
    const p = this.liftPoint;
    const upY = rotate(q, 0, 1, 0, this.tmpUp).y;
    let lift = 0;
    for (const b of this.tuning.bodyBoxes) {
      this.localToWorld(b.cx, b.cy, b.cz, p);
      const ws = ground.waterSurfaceAt(p.x, p.z);
      if (ws === null) continue;
      // Half the box's height as it lies now.
      const e = Math.abs(right.y) * b.hx + Math.abs(upY) * b.hy + Math.abs(fwd.y) * b.hz;
      const under = Math.min(1, (ws + this.env.waterLevelOffset - (p.y - e)) / (2 * e));
      if (under <= 0) continue;
      const force = 8 * b.hx * b.hy * b.hz * under * waterLift.weight * waterLift.share;
      p.y += e * (under - 1);
      this.body.applyImpulseAtPoint({ x: 0, y: force * dt, z: 0 }, p, true);
      lift += force;
    }
    // The tyres are sealed: all the water they displace lifts the wheel off the bed.
    const r = this.tuning.wheelRadius;
    for (let i = 0; i < 4; i++) {
      const hp = this.tuning.wheels[i];
      this.localToWorld(hp.x, hp.y - this.wheels[i].suspension, hp.z, p);
      const ws = ground.waterSurfaceAt(p.x, p.z);
      if (ws === null) continue;
      const h = Math.min(2 * r, ws + this.env.waterLevelOffset - (p.y - r));
      if (h <= 0) continue;
      // Area of the circle's slice under the water, over the whole circle.
      const a = r - h;
      const under =
        (r * r * Math.acos(a / r) - a * Math.sqrt(Math.max(0, 2 * r * h - h * h))) / (Math.PI * r * r);
      const force = Math.PI * r * r * this.tuning.wheelWidth * under * waterLift.weight;
      this.body.applyImpulseAtPoint({ x: 0, y: force * dt, z: 0 }, p, true);
      lift += force;
    }
    return lift;
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
      // Not `steeredAxle`: the roll tuning (rollTorqueScale, the trailer tests) was calibrated
      // with this mirrored direction for the steered wheels, which gives them about half the
      // roll torque at full lock. With the true axle a full-lock turn while towing rolls the
      // car. Retuning the roll with the true axle is on the roadmap.
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
      const ax = steeredAxle(q, steer);
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

  /** Sum the chassis boxes' contacts with the world (skid plates and rails on rock). */
  private senseBodyContact(dt: number, vel: Vec3, ang: Vec3, com: Vec3): void {
    const world = this.physics.world;
    const bc = this.bodyContact;
    const wasTouching = bc.force > 0;
    let impulse = 0;
    let slideSum = 0;
    let surface: SurfaceId = bc.surface;
    let biggest = 0;
    const own = this.colliders;
    for (let k = 0; k < this.tuning.bodyBoxes.length; k++) {
      const box = own[k];
      world.contactPairsWith(box, (other) => {
        if (other.parent() === this.body) return;
        world.contactPair(box, other, (m) => {
          const n = m.numSolverContacts();
          if (n === 0) return;
          let j = 0;
          for (let i = 0; i < m.numContacts(); i++) j += m.contactImpulse(i);
          if (j <= 0) return;
          const p = m.solverContactPoint(0);
          if (!p) return;
          const normal = m.normal();
          // Chassis velocity at the contact, minus its component along the normal.
          const rx = p.x - com.x;
          const ry = p.y - com.y;
          const rz = p.z - com.z;
          const vx = vel.x + ang.y * rz - ang.z * ry;
          const vy = vel.y + ang.z * rx - ang.x * rz;
          const vz = vel.z + ang.x * ry - ang.y * rx;
          const vn = vx * normal.x + vy * normal.y + vz * normal.z;
          const slide = Math.hypot(vx - normal.x * vn, vy - normal.y * vn, vz - normal.z * vn);
          impulse += j;
          slideSum += slide * j;
          if (j > biggest) {
            biggest = j;
            surface = this.physics.surfaceOfCollider(other, p.x, p.z);
          }
        });
      });
    }
    bc.force = impulse / dt;
    bc.slide = impulse > 0 ? slideSum / impulse : 0;
    bc.surface = surface;
    bc.knock = !wasTouching && impulse > this.tuning.bodyKnockImpulse ? impulse : 0;
  }

  /** Read back wheel state after the physics step. */
  postStep(dt: number): void {
    const c = this.controller;
    const vel = this.body.linvel();
    const ang = this.body.angvel();
    const com = this.body.worldCom();
    const q = this.body.rotation();
    const right = rotate(q, 1, 0, 0, this.tmpRight);
    const up = rotate(q, 0, 1, 0, this.tmpUp);
    const pos = this.body.translation();
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const wasContact = w.contact;
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
      const hit = w.contact && (!wasContact || w.compression > this.tuning.wheelImpactSpeed);
      this.wheelLandings[i] = hit ? Math.max(0, this.cornerFall[i]) : 0;
      // The corner's velocity now (body velocity plus spin about the centre of mass).
      const hp = this.tuning.wheels[i];
      const k = rotate(q, hp.x, hp.y, hp.z);
      const kx = pos.x + k.x - com.x,
        ky = pos.y + k.y - com.y,
        kz = pos.z + k.z - com.z;
      this.cornerFall[i] = -(
        (vel.x + ang.y * kz - ang.z * ky) * up.x +
        (vel.y + ang.z * kx - ang.x * kz) * up.y +
        (vel.z + ang.x * ky - ang.y * kx) * up.z
      );
      const rotation = c.wheelRotation(i) ?? this.rawWheelRotation[i];
      this.wheelRotationDelta[i] = rotation - this.rawWheelRotation[i];
      this.rawWheelRotation[i] = rotation;
      w.rotation += this.wheelRotationDelta[i];
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
      const hole = w.contact ? (this.physics.ground.holeAt?.(w.contactPoint.x, w.contactPoint.z) ?? 0) : 0;
      // How squarely the tyre meets the hole's far edge varies.
      this.wheelStrikes[i] =
        hole > 0 && !this.inHole[i] ? Math.abs(this.speed) * hole * (0.75 + 0.5 * this.rand()) : 0;
      this.inHole[i] = hole > 0;
    }
    // Locked wheels share angular travel, including a tyre hanging in the air.
    for (const [i, j] of [
      [0, 1],
      [2, 3],
    ]) {
      if (!this.differentials[this.tuning.wheels[i].front ? 'front' : 'rear']) continue;
      const a = this.wheels[i],
        b = this.wheels[j];
      const load = a.load + b.load;
      const delta =
        load > 0
          ? (this.wheelRotationDelta[i] * a.load + this.wheelRotationDelta[j] * b.load) / load
          : (this.wheelRotationDelta[i] + this.wheelRotationDelta[j]) / 2;
      a.rotation += delta - this.wheelRotationDelta[i];
      b.rotation += delta - this.wheelRotationDelta[j];
    }
    this.senseBodyContact(dt, vel, ang, com);
    const hx = vel.x - this.lastVel.x,
      hz = vel.z - this.lastVel.z;
    if (
      Math.hypot(hx, hz) > crashTuning.minDeltaV &&
      Math.hypot(this.lastVel.x, this.lastVel.z) > crashTuning.minDeltaV &&
      hx * this.lastVel.x + hz * this.lastVel.z < 0
    ) {
      // Crumple: a hard stop against something. What the contact solver hands back
      // sideways or in reverse is mostly absorbed.
      const k = crashTuning.keepSpeed;
      this.body.setLinvel({ x: vel.x * k, y: Math.min(vel.y, vel.y * k), z: vel.z * k }, true);
      const s = crashTuning.keepSpin;
      this.body.setAngvel({ x: ang.x * s, y: ang.y * s, z: ang.z * s }, true);
      this.speed *= k;
    }
    // Impact detection: sudden change in velocity, including what a crumple absorbed.
    const after = this.body.linvel();
    const dvx = after.x - this.lastVel.x;
    const dvy = after.y - this.lastVel.y;
    const dvz = after.z - this.lastVel.z;
    const dv = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    // Ignore gravity's own contribution.
    this.lastImpact = Math.max(0, dv - 9.81 * dt * 1.5);
    if (dv > 1e-6) {
      this.lastImpactDir.x = dvx / dv;
      this.lastImpactDir.y = dvy / dv;
      this.lastImpactDir.z = dvz / dv;
    }
    this.lastVel.x = after.x;
    this.lastVel.y = after.y;
    this.lastVel.z = after.z;
  }
}

/** Health of the front suspension corner (or tyre) on one side (+1 right, -1 left). */
function frontHealth(t: VehicleTuning, suspension: readonly number[], side: 1 | -1): number {
  const i = t.wheels.findIndex((w) => w.front && Math.sign(w.x) === side);
  return i < 0 ? 1 : suspension[i];
}
