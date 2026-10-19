import type RAPIER from '@dimforge/rapier3d-compat';
import type { EnvironmentConfig } from '../data/environment';
import type { HeadlightMode } from '../data/headlights';
import { damageTuning, type DamageMode } from '../data/damage';
import { SurfaceId } from '../data/surfaces';
import { vehicleTuning, type VehicleTuning } from '../data/vehicle';
import { Emitter } from '../core/events';
import { Groups, groups, Physics, type GroundQuery, type Rapier } from './physics';
import type { VehicleInput } from './input/vehicleInput';
import { Vehicle, type SpawnPose } from './vehicle/vehicle';
import type { World } from './world/world';
import { placedPropShapes } from './world/props';
import { deckAt } from './world/bridges';
import { StaticMeshBatcher } from './world/staticMesh';
import type { FallenTreeDef } from './world/mapTypes';
import { scatterTuning } from '../data/vegetation';
import { winchTuning } from '../data/tools';
import { VehicleTools, type ToolEvent } from './tools/tools';
import type { Anchor } from './tools/anchors';
import { updateWear } from './vehicle/wear';
import { limitDamage, repairAll, updateDamage, worstTyre, type DamageEvent } from './vehicle/damage';
import { emptyInput } from './input/vehicleInput';
import { headingOf, rotate, v3 } from './vehicle/math';

/** Branch stubs on the Fallen Tree: [position along the trunk (−1..1), offset x, offset z]. */
export const FALLEN_TREE_STUBS: ReadonlyArray<readonly [number, number, number]> = [
  [-0.4, 0.45, 0.2],
  [0.1, -0.4, 0.35],
  [0.55, 0.3, -0.4],
];

/** Rotation that lays a +y capsule flat (90° about x) and then turns it `yaw` about y. */
export function quatYawX(yaw: number): { x: number; y: number; z: number; w: number } {
  const c = Math.cos(Math.PI / 4);
  const sx = Math.sin(Math.PI / 4);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  // q = qy * qx
  return { w: cy * c, x: cy * sx, y: sy * c, z: -sy * sx };
}

/** A movable world object (the Fallen Tree; later, planks). */
export interface DynamicObject {
  id: string;
  kind: 'fallenTree' | 'plank';
  body: RAPIER.RigidBody;
  def?: FallenTreeDef;
}

export interface SimEvents extends Record<string, unknown> {
  vehicleSpawned: { id: string };
  rangeChanged: { id: string; range: 'high' | 'low' };
  diffChanged: { id: string; axle: 'front' | 'rear'; locked: boolean };
  diffBlocked: { id: string; axle: 'front' | 'rear' };
  precisionChanged: { id: string; enabled: boolean };
  parkBrakeChanged: { id: string; on: boolean };
  lightsChanged: { id: string; mode: HeadlightMode };
  tool: { id: string; event: ToolEvent };
  /** Flooding stalled or restarted the engine, or it is being started (start-up, a vehicle swap). */
  engine: { id: string; event: 'stalled' | 'restarted' | 'starting' };
  dent: { id: string; impact: number };
  /** Mechanical damage: a tyre cut, a suspension corner bent or the engine hurt. */
  damage: { id: string } & DamageEvent;
  /** Repaired: at the roadside (a field repair or the spare fitted) or back at camp. */
  repaired: { id: string; kind: 'field' | 'spare' | 'camp' };
  /** A wheel hit something hard (suspension compressing fast). */
  wheelImpact: { id: string; wheel: number; speed: number };
  /** The chassis knocked into the ground or a rock (impulse, N·s). */
  bodyKnock: { id: string; impulse: number };
  returned: { id: string; campsite: string };
}

/** Plain-data snapshot of the simulation (SPEC §11: sim state must be serialisable). */
export interface SimState {
  time: number;
  vehicles: Array<{
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    linvel: { x: number; y: number; z: number };
    angvel: { x: number; y: number; z: number };
    range: 'high' | 'low';
    gear: number;
    differentials: { front: boolean; rear: boolean };
    precisionCrawl: boolean;
    parkBrake: boolean;
    lights: HeadlightMode;
    engineRunning: boolean;
    /** Seconds of cranking left before the engine catches. */
    crank: number;
    flood: { timer: number; stalled: boolean; dryTime: number };
    dirt: { front: number; sides: number; rear: number; wheels: number };
    dents: number;
    health: { engine: number; tyres: number[]; suspension: number[]; spare: boolean };
    winch: { anchor: string | null; length: number };
    planks: { carried: number; placed: { x: number; y: number; z: number }[] };
    jack: string;
  }>;
}

/**
 * The game simulation: physics world, terrain collider and vehicle entities. No
 * rendering, UI or audio here; those layers read this state every frame.
 */
export class Simulation {
  readonly physics: Physics;
  readonly vehicles = new Map<string, Vehicle>();
  readonly events = new Emitter<SimEvents>();
  readonly ground: GroundQuery;
  readonly dynamics = new Map<string, DynamicObject>();
  readonly tools = new Map<string, VehicleTools>();
  /** Bodies of swapped-out vehicles, disabled until the next step removes them. */
  private readonly retired: RAPIER.RigidBody[] = [];
  time = 0;
  /** How harsh mechanical damage is (the settings choice; off unless the game sets it). */
  damage: DamageMode = 'off';

  constructor(
    readonly R: Rapier,
    readonly world: World,
    readonly env: EnvironmentConfig,
  ) {
    const terrain = world.terrain;
    this.ground = {
      surfaceAt: (x, z) => terrain.surfaceAt(x, z),
      waterSurfaceAt: (x, z) => terrain.waterSurfaceAt(x, z),
      heightAt: (x, z) => terrain.heightAt(x, z),
    };
    this.physics = new Physics(R, this.ground);
    this.physics.addTerrain(terrain);
    this.physics.addWalls(world.map.wallHalfExtent);
    for (const b of world.features.boxes)
      this.physics.addStaticBox(b, b.kind === 'ledge' ? SurfaceId.Rock : SurfaceId.Dirt);
    for (const r of world.features.rocks) this.physics.addStaticRock(r);
    for (const t of world.features.timbers) this.physics.addStaticRock(t, 0.7, SurfaceId.Wood);
    this.addScatterColliders();
    for (const f of world.map.fallenTrees) this.addFallenTree(f);
  }

  /**
   * Trees, rocks, logs and props become a few triangle-mesh colliders (one per 256 m
   * cell and surface), which keeps Rapier's step cost flat however much is scattered.
   */
  private addScatterColliders(): void {
    const R = this.R;
    const batcher = new StaticMeshBatcher(256);
    const h = scatterTuning.trunkColliderHeight;
    for (const t of this.world.scatter.trees) {
      if (!t.solid) continue;
      batcher.prism(
        'wood',
        [t.x, t.y - 0.5, t.z],
        [t.x + t.leanX * h, t.y + h, t.z + t.leanZ * h],
        t.trunkRadius,
        6,
      );
    }
    for (const r of this.world.scatter.rocks) {
      // Slightly smaller than the drawn rock so wheels touch what they see.
      if (r.solid) batcher.ico('rock', r.x, r.y, r.z, r.radius * 0.9, r.squash);
    }
    for (const l of this.world.scatter.logs) {
      const ex = Math.sin(l.yaw) * l.length * 0.5;
      const ez = Math.cos(l.yaw) * l.length * 0.5;
      batcher.prism('wood', [l.x - ex, l.y, l.z - ez], [l.x + ex, l.y, l.z + ez], l.radius, 6);
    }
    for (const log of this.world.features.logs)
      batcher.prism('wood', log.a, log.b, log.radius, 9, -Math.PI / 2);
    for (const p of this.world.map.props) {
      for (const ps of placedPropShapes(p, this.world.terrain)) {
        const s = ps.shape;
        if (s.type === 'box') batcher.box('wood', ps.x, ps.y, ps.z, s.hx, s.hy, s.hz, ps.yaw);
        else if (s.axis === 'x') {
          const dx = Math.cos(ps.yaw) * s.hh;
          const dz = -Math.sin(ps.yaw) * s.hh;
          batcher.prism(
            'wood',
            [ps.x - dx, ps.y, ps.z - dz],
            [ps.x + dx, ps.y, ps.z + dz],
            s.r,
            s.sides,
            -Math.PI / 2,
          );
        } else batcher.prism('wood', [ps.x, ps.y - s.hh, ps.z], [ps.x, ps.y + s.hh, ps.z], s.r, 10);
      }
    }
    for (const [key, b] of batcher.batches) {
      const surface = key.startsWith('rock') ? SurfaceId.Rock : SurfaceId.Wood;
      const c = this.physics.world.createCollider(
        R.ColliderDesc.trimesh(
          new Float32Array(b.vertices),
          new Uint32Array(b.indices),
          R.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
          .setFriction(surface === SurfaceId.Rock ? 1.0 : 0.6)
          .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
      );
      this.physics.colliderSurface.set(c.handle, surface);
    }
  }

  /** The Fallen Tree (SPEC §5): a heavy dynamic log that can be winched or pushed aside. */
  private addFallenTree(f: FallenTreeDef): void {
    const R = this.R;
    const yaw = (-f.headingDeg * Math.PI) / 180;
    const y = this.world.terrain.heightAt(f.x, f.z) + f.radius + 0.05;
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(f.x, y, f.z)
        .setRotation(quatYawX(yaw))
        .setLinearDamping(0.4)
        .setAngularDamping(1.2),
    );
    const member = groups(Groups.DYNAMIC, 0xffff);
    const half = f.length / 2 - f.radius;
    const trunk = this.physics.world.createCollider(
      R.ColliderDesc.capsule(half, f.radius)
        .setMass(f.mass * 0.85)
        .setFriction(0.8)
        .setCollisionGroups(member),
      body,
    );
    this.physics.colliderSurface.set(trunk.handle, SurfaceId.Wood);
    // Broken branch stubs stop it rolling like a pipe.
    for (const [ay, ox, oz] of FALLEN_TREE_STUBS) {
      const stub = this.physics.world.createCollider(
        R.ColliderDesc.capsule(0.35, 0.09)
          .setTranslation(ox, ay * half, oz)
          .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) })
          .setMass((f.mass * 0.15) / 3)
          .setFriction(0.9)
          .setCollisionGroups(member),
        body,
      );
      this.physics.colliderSurface.set(stub.handle, SurfaceId.Wood);
    }
    this.dynamics.set(f.id, { id: f.id, kind: 'fallenTree', body, def: f });
  }

  /** Spawn pose on the ground (or a bridge deck) at (x, z) for wheels of this radius. */
  poseAt(x: number, z: number, headingDeg: number, wheelRadius = vehicleTuning.wheelRadius): SpawnPose {
    const ground = this.world.terrain.heightAt(x, z);
    const deck = deckAt(this.world.features.tracks, x, z);
    return { x, y: Math.max(ground, deck ?? -Infinity) + wheelRadius + 0.12, z, headingDeg };
  }

  campsitePose(poiId: string, wheelRadius = vehicleTuning.wheelRadius): SpawnPose {
    const p = this.world.pois.find((q) => q.id === poiId);
    if (!p) throw new Error(`Unknown POI ${poiId}`);
    const r = p.reset ?? { x: p.x, z: p.z, headingDeg: 0 };
    return this.poseAt(r.x, r.z, r.headingDeg, wheelRadius);
  }

  addVehicle(id: string, pose: SpawnPose, tuning: VehicleTuning = vehicleTuning): Vehicle {
    const env = this.env;
    const v = new Vehicle(id, this.physics, tuning, pose, {
      get wetness() {
        return env.wetness;
      },
      get waterLevelOffset() {
        return env.waterLevelOffset;
      },
    });
    this.vehicles.set(id, v);
    this.tools.set(id, new VehicleTools());
    this.events.emit('vehicleSpawned', { id });
    return v;
  }

  /** Crank a vehicle's engine: it drives once the engine catches. */
  startEngine(id: string): void {
    if (this.vehicleOf(id).startEngine()) this.events.emit('engine', { id, event: 'starting' });
  }

  /**
   * Swap a vehicle for another model where it stands, facing the same way: the winch
   * lets go, placed planks come back and the new one starts clean (with its lights as
   * they were).
   */
  replaceVehicle(id: string, tuning: VehicleTuning): Vehicle {
    const old = this.vehicleOf(id);
    const tools = this.toolsOf(id);
    tools.winch.detach();
    tools.planks.recall(this.physics);
    const p = old.body.translation();
    const f = old.forward();
    const ground = this.world.terrain.heightAt(p.x, p.z);
    // The tyres' lowest point, kept as high as before (on a rock, say), never below the ground.
    const base = Math.max(p.y - 0.12 - old.tuning.wheelRadius, ground);
    const pose: SpawnPose = {
      x: p.x,
      y: base + tuning.wheelRadius + 0.17,
      z: p.z,
      headingDeg: headingOf(f.x, f.z),
    };
    old.retire();
    this.retired.push(old.body);
    this.vehicles.delete(id);
    this.tools.delete(id);
    const v = this.addVehicle(id, pose, tuning);
    // The driver keeps the lights as they had them.
    v.lights = old.lights;
    return v;
  }

  toolsOf(id: string): VehicleTools {
    const t = this.tools.get(id);
    if (!t) throw new Error(`No vehicle ${id}`);
    return t;
  }

  private vehicleOf(id: string): Vehicle {
    const v = this.vehicles.get(id);
    if (!v) throw new Error(`No vehicle ${id}`);
    return v;
  }

  private toolEvent(id: string, event: ToolEvent): void {
    this.events.emit('tool', { id, event });
  }

  step(inputs: ReadonlyMap<string, VehicleInput>, dt: number): void {
    for (const [id, v] of this.vehicles) {
      let input = inputs.get(id);
      if (!input) continue;
      const tools = this.toolsOf(id);
      // Working on the car: it stays parked until the job is done.
      if (tools.repair) {
        input = { ...emptyInput(), handbrake: true, cycleLights: input.cycleLights };
        tools.repair.remaining -= dt;
        if (tools.repair.remaining <= 0) this.finishRepair(id);
      }
      if (tools.jack.state === 'righting') {
        v.snapshot();
        tools.jack.step(v, input.jack, dt, this.R, (x, z) => this.world.terrain.heightAt(x, z));
        const after: string = tools.jack.state;
        if (after === 'idle') this.toolEvent(id, { type: 'righted' });
        continue;
      }
      // E picks up planks when they're in reach, otherwise it's the winch.
      if (input.interact && tools.planks.inReach(v).length > 0) {
        const n = tools.planks.pickUp(v, this.physics);
        this.toolEvent(id, { type: 'planksPickedUp', count: n });
      } else if (input.winchAttach) this.quickAttach(id);
      tools.updateFreeRoll(v, input);
      const before = v.drivetrain.range;
      const frontBefore = v.differentials.front;
      const rearBefore = v.differentials.rear;
      const precisionBefore = v.precisionCrawl;
      const parkBefore = v.parkBrake;
      const lightsBefore = v.lights;
      v.step(input, dt);
      if (v.parkBrake !== parkBefore) this.events.emit('parkBrakeChanged', { id, on: v.parkBrake });
      if (v.lights !== lightsBefore) this.events.emit('lightsChanged', { id, mode: v.lights });
      if (v.drivetrain.range !== before) this.events.emit('rangeChanged', { id, range: v.drivetrain.range });
      for (const axle of ['front', 'rear'] as const) {
        const previous = axle === 'front' ? frontBefore : rearBefore;
        if (v.differentials[axle] !== previous)
          this.events.emit('diffChanged', { id, axle, locked: v.differentials[axle] });
        else if (axle === 'front' ? input.toggleFrontDiff : input.toggleRearDiff)
          this.events.emit('diffBlocked', { id, axle });
      }
      if (v.precisionCrawl !== precisionBefore)
        this.events.emit('precisionChanged', { id, enabled: v.precisionCrawl });
      if (v.floodEvent) this.events.emit('engine', { id, event: v.floodEvent });
      tools.winch.step(v, input.winchIn, input.winchOut, dt);
      v.externalLoad = tools.winch.tension;
      tools.jack.step(v, input.jack, dt, this.R, (x, z) => this.world.terrain.heightAt(x, z));
    }
    this.physics.step();
    for (const body of this.retired.splice(0)) this.physics.world.removeRigidBody(body);
    for (const [id, v] of this.vehicles) {
      v.postStep(dt);
      for (let i = 0; i < v.wheelImpacts.length; i++)
        if (v.wheelImpacts[i] > 0)
          this.events.emit('wheelImpact', { id, wheel: i, speed: v.wheelImpacts[i] });
      if (v.bodyContact.knock > 0) this.events.emit('bodyKnock', { id, impulse: v.bodyContact.knock });
      if (updateWear(v, dt)) this.events.emit('dent', { id, impact: v.lastImpact });
      for (const e of updateDamage(v, this.damage, dt)) this.events.emit('damage', { id, ...e });
    }
    this.time += dt;
  }

  // --- Winch -------------------------------------------------------------

  /** Anchors within cable reach of a vehicle's winch (SPEC §7.1). */
  findAnchors(id: string, range = winchTuning.cableLength - 1): Anchor[] {
    const v = this.vehicleOf(id);
    const t = v.tuning;
    const m = v.localToWorld(t.winchMount.x, t.winchMount.y, t.winchMount.z);
    const out: Anchor[] = [];
    const within = (x: number, y: number, z: number) => Math.hypot(x - m.x, y - m.y, z - m.z) <= range;
    const trees = this.world.treeGrid.near(m.x, m.z, range);
    for (const tr of trees) {
      if (!tr.solid) continue;
      const y = tr.y + 1.1;
      if (!within(tr.x, y, tr.z)) continue;
      out.push({
        kind: 'tree',
        id: `tree:${tr.x.toFixed(1)}:${tr.z.toFixed(1)}`,
        point: v3(tr.x, y, tr.z),
        radius: tr.trunkRadius,
        label: 'Tree',
      });
    }
    for (const r of this.world.rockGrid.near(m.x, m.z, range)) {
      if (!r.anchor || !r.solid) continue;
      const y = r.y + r.radius * r.squash * 0.85;
      if (!within(r.x, y, r.z)) continue;
      out.push({
        kind: 'rock',
        id: `rock:${r.x.toFixed(1)}:${r.z.toFixed(1)}`,
        point: v3(r.x, y, r.z),
        radius: 0.1,
        label: 'Boulder',
      });
    }
    for (const obj of this.dynamics.values()) {
      if (obj.kind !== 'fallenTree' || !obj.def) continue;
      // Hook the trunk at the point nearest the winch.
      const p = obj.body.translation();
      const axis = rotate(obj.body.rotation(), 0, 1, 0);
      const half = obj.def.length / 2 - obj.def.radius - 0.5;
      const s = Math.max(
        -half,
        Math.min(half, (m.x - p.x) * axis.x + (m.y - p.y) * axis.y + (m.z - p.z) * axis.z),
      );
      const wx = p.x + axis.x * s;
      const wy = p.y + axis.y * s;
      const wz = p.z + axis.z * s;
      if (!within(wx, wy, wz)) continue;
      out.push({
        kind: 'object',
        id: `obj:${obj.id}`,
        point: v3(wx, wy, wz),
        radius: obj.def.radius,
        body: obj.body,
        local: v3(0, s, 0),
        label: 'Fallen tree',
      });
    }
    for (const other of this.vehicles.values()) {
      if (other === v) continue;
      const tow = other.tuning.towPoint;
      const p = other.localToWorld(tow.x, tow.y, tow.z);
      if (!within(p.x, p.y, p.z)) continue;
      out.push({
        kind: 'vehicle',
        id: `veh:${other.id}`,
        point: p,
        radius: 0.05,
        body: other.body,
        local: { ...tow },
        label: 'Vehicle',
      });
    }
    return out;
  }

  /** E / RB: attach to the best anchor in range, or detach. */
  quickAttach(id: string): void {
    const v = this.vehicleOf(id);
    const tools = this.toolsOf(id);
    if (tools.winch.attached) {
      tools.winch.detach();
      this.toolEvent(id, { type: 'winchDetached' });
      return;
    }
    const best = tools.bestAnchor(v, this.findAnchors(id));
    if (!best) {
      this.toolEvent(id, { type: 'noAnchor' });
      return;
    }
    tools.winch.attach(v, best);
    this.toolEvent(id, { type: 'winchAttached', anchor: best });
  }

  attachTo(id: string, anchor: Anchor): void {
    const tools = this.toolsOf(id);
    tools.winch.attach(this.vehicleOf(id), anchor);
    this.toolEvent(id, { type: 'winchAttached', anchor });
  }

  detachWinch(id: string): void {
    const tools = this.toolsOf(id);
    if (!tools.winch.attached) return;
    tools.winch.detach();
    this.toolEvent(id, { type: 'winchDetached' });
  }

  // --- Planks ------------------------------------------------------------

  /** Height of whatever static or dynamic thing is under (x, z). */
  probeGround = (x: number, z: number, fromY: number): number => {
    const R = this.R;
    const ray = new R.Ray({ x, y: fromY + 3, z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRay(
      ray,
      60,
      true,
      undefined,
      groups(Groups.DYNAMIC, Groups.TERRAIN | Groups.STATIC),
    );
    return hit ? fromY + 3 - hit.timeOfImpact : this.world.terrain.heightAt(x, z);
  };

  placePlanks(id: string): boolean {
    const tools = this.toolsOf(id);
    const n = tools.planks.carried;
    const ok = tools.planks.place(this.vehicleOf(id), this.physics, this.probeGround);
    if (ok) this.toolEvent(id, { type: 'planksPlaced', count: n });
    return ok;
  }

  recallPlanks(id: string): void {
    this.toolsOf(id).planks.recall(this.physics);
    this.toolEvent(id, { type: 'planksRecalled' });
  }

  // --- Damage and repairs -----------------------------------------------

  /** Change how harsh damage is; damage beyond what the new setting allows is put right. */
  setDamage(mode: DamageMode): void {
    this.damage = mode;
    for (const v of this.vehicles.values()) limitDamage(v.condition, mode);
  }

  /**
   * What a roadside repair could do now: a field repair puts everything right with mild
   * damage; with realistic damage only a cut tyre can be swapped for the spare.
   */
  repairOption(id: string): { kind: 'field' | 'spare'; possible: boolean; reason?: string } | null {
    const v = this.vehicleOf(id);
    const c = v.condition;
    if (this.damage === 'off') return null;
    const kind = this.damage === 'mild' ? 'field' : 'spare';
    const needed =
      kind === 'field'
        ? c.engine < 1 || c.tyreTarget.some((h) => h < 1) || c.suspension.some((h) => h < 1)
        : worstTyre(c) >= 0;
    if (!needed) return null;
    if (kind === 'spare' && !c.spare) return { kind, possible: false, reason: 'The spare is already on' };
    if (Math.abs(v.speed) > 0.5) return { kind, possible: false, reason: 'Stop first' };
    if (v.tiltDeg() > 30) return { kind, possible: false, reason: 'Too steep to work on it here' };
    return { kind, possible: true };
  }

  /** Start a roadside repair (tool menu). False if there's nothing it can do here. */
  startRepair(id: string): boolean {
    const option = this.repairOption(id);
    const tools = this.toolsOf(id);
    if (!option?.possible || tools.repair) return false;
    const R = damageTuning.repair;
    const total = option.kind === 'field' ? R.fieldSeconds : R.spareSeconds;
    tools.repair = { kind: option.kind, remaining: total, total };
    return true;
  }

  private finishRepair(id: string): void {
    const tools = this.toolsOf(id);
    const job = tools.repair;
    tools.repair = null;
    if (!job) return;
    const c = this.vehicleOf(id).condition;
    if (job.kind === 'field') {
      const spare = c.spare;
      repairAll(c);
      c.spare = spare;
    } else {
      const i = worstTyre(c);
      if (i >= 0 && c.spare) {
        c.tyres[i] = 1;
        c.tyreTarget[i] = 1;
        c.spare = false;
      }
    }
    this.events.emit('repaired', { id, kind: job.kind });
  }

  /** Put everything right (a campsite's workshop, or being brought back to camp). */
  repairAtCamp(id: string): void {
    const v = this.vehicleOf(id);
    const c = v.condition;
    const was =
      c.engine < 1 ||
      c.tyres.some((h) => h < 1) ||
      c.tyreTarget.some((h) => h < 1) ||
      c.suspension.some((h) => h < 1) ||
      !c.spare;
    repairAll(c);
    if (was) this.events.emit('repaired', { id, kind: 'camp' });
  }

  // --- Campsites ---------------------------------------------------------

  /**
   * Pause-menu backup (SPEC §7.4): back to a campsite, flooding cleared, planks returned
   * and any damage repaired.
   */
  returnToCampsite(id: string, campsiteId: string): void {
    const v = this.vehicleOf(id);
    const tools = this.toolsOf(id);
    tools.winch.detach();
    tools.planks.recall(this.physics);
    tools.jack.state = 'idle';
    tools.jack.waitTime = 0;
    tools.repair = null;
    this.repairAtCamp(id);
    v.teleport(this.campsitePose(campsiteId, v.tuning.wheelRadius));
    const f = v.condition.flood;
    f.timer = 0;
    f.stalled = false;
    f.dryTime = 0;
    v.drivetrain.engineRunning = true;
    this.events.emit('returned', { id, campsite: campsiteId });
  }

  /**
   * Distance along a ray to the first static thing (terrain, rocks, trees, props), or
   * `max` if clear. Used by the camera to avoid clipping.
   */
  castStatic(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    const R = this.R;
    const ray = new R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.physics.world.castRay(
      ray,
      max,
      true,
      undefined,
      groups(Groups.VEHICLE, Groups.TERRAIN | Groups.STATIC),
    );
    return hit ? hit.timeOfImpact : max;
  }

  serialize(): SimState {
    return {
      time: this.time,
      vehicles: [...this.vehicles.values()].map((v) => {
        const tools = this.toolsOf(v.id);
        const p = v.body.translation();
        const q = v.body.rotation();
        const lv = v.body.linvel();
        const av = v.body.angvel();
        return {
          id: v.id,
          position: { x: p.x, y: p.y, z: p.z },
          rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
          linvel: { x: lv.x, y: lv.y, z: lv.z },
          angvel: { x: av.x, y: av.y, z: av.z },
          range: v.drivetrain.range,
          gear: v.drivetrain.gear,
          differentials: { ...v.differentials },
          precisionCrawl: v.precisionCrawl,
          parkBrake: v.parkBrake,
          lights: v.lights,
          engineRunning: v.drivetrain.engineRunning,
          crank: v.crank,
          flood: {
            timer: v.condition.flood.timer,
            stalled: v.condition.flood.stalled,
            dryTime: v.condition.flood.dryTime,
          },
          dirt: { ...v.condition.dirt },
          dents: v.condition.dents.length,
          health: {
            engine: v.condition.engine,
            tyres: [...v.condition.tyres],
            suspension: [...v.condition.suspension],
            spare: v.condition.spare,
          },
          winch: { anchor: tools.winch.anchor?.id ?? null, length: tools.winch.length },
          jack: tools.jack.state,
          planks: {
            carried: tools.planks.carried,
            placed: tools.planks.placed.map((pl) => {
              const b = pl.body.translation();
              return { x: b.x, y: b.y, z: b.z };
            }),
          },
        };
      }),
    };
  }

  /** Collider for debug drawing (everything except the heightfield). */
  isDebugDrawable(c: RAPIER.Collider): boolean {
    return !this.physics.terrainCollider || c.handle !== this.physics.terrainCollider.handle;
  }
}
