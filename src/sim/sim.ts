import type RAPIER from '@dimforge/rapier3d-compat';
import type { EnvironmentConfig } from '../data/environment';
import type { HeadlightMode } from '../data/headlights';
import { damageTuning, type DamageMode } from '../data/damage';
import { SurfaceId } from '../data/surfaces';
import { pressurePsi, setPressure, tyrePressures } from './vehicle/tyrePressure';
import { vehicleTuning, type VehicleTuning } from '../data/vehicle';
import { Emitter } from '../core/events';
import { Groups, groups, Physics, type GroundQuery, type Rapier } from './physics';
import type { VehicleInput } from './input/vehicleInput';
import { Vehicle, type RutField, type SpawnPose } from './vehicle/vehicle';
import type { GearboxMode } from './vehicle/drivetrain';
import type { World } from './world/world';
import { placedPropShapes } from './world/props';
import { deckAt } from './world/bridges';
import { StaticMeshBatcher } from './world/staticMesh';
import type { FallenTreeDef } from './world/mapTypes';
import { WaterCurrent } from './world/current';
import { riseShare } from './world/flood';
import { scatterTuning } from '../data/vegetation';
import { winchTuning } from '../data/tools';
import { VehicleTools, type RepairKind, type ToolEvent } from './tools/tools';
import { anchorPoint, type Anchor } from './tools/anchors';
import type { GroundProbe } from './tools/planks';
import { updateWear } from './vehicle/wear';
import {
  limitDamage,
  mendTyre,
  repairAll,
  updateDamage,
  worstTyre,
  type DamageEvent,
} from './vehicle/damage';
import { emptyInput } from './input/vehicleInput';
import { headingOf, rotate, v3 } from './vehicle/math';
import { addTrunkColliders, Surprises, type DynamicObject, type SurpriseEvent } from './surprises';
import { poseOf, snapshotPose } from './bodyPose';
import type { SurprisePlan } from './world/surprisePlan';
import { StuckVehicle, type StuckVehicleDef } from './stuckVehicle';
import { ChurnMap } from './world/churn';
import { poseBehind, Trailer, type TrailerEvent } from './trailer';
import { DRUM, canCouple, trailers, trailerTuning, type TrailerTuning } from '../data/trailers';
import { CargoDrum } from './cargoDrum';
import type { DeliveryState } from './trailerState';

/** Rotation that lays a +y capsule flat (90° about x) and then turns it `yaw` about y. */
export function quatYawX(yaw: number): { x: number; y: number; z: number; w: number } {
  const c = Math.cos(Math.PI / 4);
  const sx = Math.sin(Math.PI / 4);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  // q = qy * qx
  return { w: cy * c, x: cy * sx, y: sy * c, z: -sy * sx };
}

export { FALLEN_TREE_STUBS, type DynamicObject } from './surprises';

export interface SimEvents extends Record<string, unknown> {
  vehicleSpawned: { id: string };
  rangeChanged: { id: string; range: 'high' | 'low' };
  transferChanged: { id: string; mode: string };
  transferBlocked: { id: string; reason: string };
  windup: { id: string };
  diffChanged: { id: string; axle: 'front' | 'rear'; locked: boolean };
  diffBlocked: { id: string; axle: 'front' | 'rear' };
  precisionChanged: { id: string; enabled: boolean };
  parkBrakeChanged: { id: string; on: boolean };
  lightsChanged: { id: string; mode: HeadlightMode };
  tool: { id: string; event: ToolEvent };
  /** Flooding stalled or restarted the engine, or it is being started (start-up, a vehicle swap). */
  engine: {
    id: string;
    /**
     * 'stalledLugged': stalled against the clutch (manual gearbox); 'clutchToStart': the
     * pedal was pressed in gear with the clutch out, so the engine didn't turn over.
     */
    event: 'stalled' | 'restarted' | 'starting' | 'outOfFuel' | 'stalledLugged' | 'clutchToStart';
  };
  dent: { id: string; impact: number };
  /** Mechanical damage: a tyre cut, a suspension corner bent or the engine hurt. */
  damage: { id: string } & DamageEvent;
  /** Repaired: at the roadside (a field repair, a spare fitted, a plug, fuel poured in) or at camp. */
  repaired: { id: string; kind: RepairKind | 'camp' };
  /** A wheel hit something hard (suspension compressing fast). */
  wheelImpact: { id: string; wheel: number; speed: number };
  /** The chassis knocked into the ground or a rock (impulse, N·s). */
  bodyKnock: { id: string; impulse: number };
  returned: { id: string; campsite: string };
  /** A one-off event on the way started (a tree or rocks coming down ahead) or is down. */
  surprise: SurpriseEvent;
  /** A bogged vehicle came free on the end of the winch line. */
  rescued: { id: string };
  /** A trailer was hitched or unhitched, came round against the car, tipped over or was put back up. */
  trailer: { id: string; vehicle: string | null; event: TrailerEvent | { type: 'hitched' | 'unhitched' } };
  /** A trailer's wheel hit something hard (spring compression speed, m/s). */
  trailerBump: { id: string; vehicle: string | null; speed: number };
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
    transfer: import('./vehicle/transferCase').TransferState;
    gear: number;
    differentials: { front: boolean; rear: boolean };
    precisionCrawl: boolean;
    parkBrake: boolean;
    lights: HeadlightMode;
    engineRunning: boolean;
    /** Switched off until the pedal is pressed. */
    engineOff: boolean;
    /** Seconds of cranking left before the engine catches. */
    crank: number;
    flood: { timer: number; stalled: boolean; dryTime: number };
    dirt: { front: number; sides: number; rear: number; wheels: number };
    dents: number;
    health: { engine: number; tyres: number[]; suspension: number[] };
    supplies: { fuel: number; jerryCans: number; spares: number; plugs: number };
    winch: { anchor: string | null; length: number; doubleLine: boolean; treeProtector: boolean };
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
  /** This run's one-off events on the way (none unless the game adds them). */
  surprises: Surprises | null = null;
  /** Other people's vehicles bogged and waiting for a winch (an episode's stranded drivers), by id. */
  readonly stuck = new Map<string, StuckVehicle>();
  /** Clay and mud churned up by wheelspin over the run. */
  readonly churn = new ChurnMap();
  /**
   * Where wheels have pressed the ground into ruts, for a level whose ruts are felt (4WD
   * Simulator v0.31, `EpisodeDef.feltRuts`). Unset, as in Over the Cape, the vehicles feel none.
   */
  ruts: RutField | undefined;
  /** Trailers, hitched or standing on their jockey wheels, by id. */
  readonly trailers = new Map<string, Trailer>();
  readonly looseDrums = new Map<string, CargoDrum>();
  private drumSerial = 0;
  time = 0;
  /** How harsh mechanical damage is (the settings choice; off unless the game sets it). */
  damage: DamageMode = 'off';
  /** The gearbox setting every vehicle drives with (see Vehicle.setGearboxMode). */
  gearboxMode: GearboxMode = 'automatic';
  /**
   * Fuel burnt per litre the engine really uses. An episode shortens the real distance,
   * so it burns faster to match; 0 burns nothing (the tank never empties).
   */
  fuelScale = 0;
  /**
   * A storm raising the creeks (src/data/weatherTimeline.ts): metres above their own
   * level, and their current as a multiple of its own, each creek by its share of the rise
   * (`features.creekRise`). Puddles and mud holes stay as laid.
   */
  readonly creeks = { rise: 0, flowScale: 1 };

  constructor(
    readonly R: Rapier,
    readonly world: World,
    readonly env: EnvironmentConfig,
  ) {
    const terrain = world.terrain;
    const current = new WaterCurrent(world.features.creeks);
    const creeks = this.creeks;
    this.ground = {
      surfaceAt: (x, z) => terrain.surfaceAt(x, z),
      waterSurfaceAt: (x, z) => {
        const w = terrain.waterSurfaceAt(x, z);
        return w === null || creeks.rise === 0 ? w : w + creeks.rise * riseShare(world, terrain.index(x, z));
      },
      heightAt: (x, z) => terrain.heightAt(x, z),
      waterFlowAt: (x, z, out) => {
        current.at(x, z, out);
        if (creeks.flowScale === 1) return out;
        const k = 1 + (creeks.flowScale - 1) * riseShare(world, terrain.index(x, z));
        out.x *= k;
        out.z *= k;
        return out;
      },
      holeAt: (x, z) => terrain.holeAt(x, z),
    };
    this.physics = new Physics(R, this.ground);
    this.physics.addTerrain(terrain);
    this.physics.addWalls(...world.map.wall);
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
    addTrunkColliders(R, this.physics, body, f.length, f.radius, f.mass);
    this.dynamics.set(f.id, { id: f.id, kind: 'fallenTree', body, def: f, ...poseOf(body) });
  }

  /**
   * Add a run's surprises (before the renderer is built, so it draws them). Those in
   * `happened` are put down where they landed; the rest wait to start.
   */
  addSurprises(plans: readonly SurprisePlan[], happened: Iterable<string> = []): Surprises {
    const s = new Surprises(
      this.R,
      this.physics,
      (x, z) => this.world.terrain.heightAt(x, z),
      plans,
      this.world.features.tracks,
      happened,
    );
    for (const obj of s.objects()) this.dynamics.set(obj.id, obj);
    this.surprises = s;
    return s;
  }

  /** Put a bogged vehicle in the world (before the renderer is built), or out of the bog already. */
  addStuckVehicle(def: StuckVehicleDef, freed = false): StuckVehicle {
    const s = new StuckVehicle(this.R, this.physics, (x, z) => this.world.terrain.heightAt(x, z), def, freed);
    this.stuck.set(def.id, s);
    return s;
  }

  /** A trailer hitched straight behind a vehicle, or standing at a pose of its own. */
  addTrailer(
    id: string,
    tuning: TrailerTuning,
    at:
      string | { x: number; y: number; z: number; rotation: { x: number; y: number; z: number; w: number } },
  ): Trailer {
    const behind = typeof at === 'string' ? this.vehicleOf(at) : null;
    if (behind && !canCouple(tuning, behind.tuning))
      throw new Error(
        `The ${tuning.name}'s ring needs a pintle hook, and the ${behind.tuning.name} has none`,
      );
    const pose = behind
      ? poseBehind(behind, tuning, (x, z) => this.world.terrain.heightAt(x, z))
      : (at as Exclude<typeof at, string>);
    const env = this.env;
    const t = new Trailer(id, this.physics, tuning, pose, {
      get wetness() {
        return env.wetness;
      },
      get waterLevelOffset() {
        return env.waterLevelOffset;
      },
    });
    this.trailers.set(id, t);
    if (behind) t.hitch(behind);
    // Rapier 0.21 leaves a new body frozen if anything is moved before a step has run (as
    // in replaceVehicle): step once now, so a camp or a teleport straight after is safe.
    this.physics.step();
    return t;
  }

  /** Take a trailer out of the world. */
  removeTrailer(id: string): void {
    this.trailers.get(id)?.remove();
    this.trailers.delete(id);
  }

  /** Cargo comes out beyond the box's side, with the trailer's current velocity. */
  spillDrum(t: Trailer): CargoDrum | null {
    if (t.drums <= 0) return null;
    const up = rotate(t.body.rotation(), 0, 1, 0);
    const side = up.x >= 0 ? -1 : 1;
    const p = t.localToWorld(
      side * (t.tuning.bed.hx + DRUM.radius + 0.12),
      t.tuning.bed.y + DRUM.height / 2,
      t.tuning.bed.cz,
    );
    p.y = Math.max(p.y, this.world.terrain.heightAt(p.x, p.z) + DRUM.height / 2 + 0.05);
    let id: string;
    do {
      id = `drum-${++this.drumSerial}`;
    } while (this.looseDrums.has(id));
    const d = new CargoDrum(id, this.physics, p, t.body.rotation());
    d.body.setLinvel(t.body.linvel(), true);
    this.looseDrums.set(id, d);
    t.loadDrums(t.drums - 1);
    t.secureLoad();
    return d;
  }

  /** The nearest trailer alongside the car, including while it is slowing to a stop. */
  nearbyTrailer(id: string): Trailer | null {
    const v = this.vehicleOf(id);
    const p = v.body.translation();
    let best: Trailer | null = null;
    let distance = 12;
    for (const t of this.trailers.values()) {
      const q = t.body.translation();
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d <= distance) {
        best = t;
        distance = d;
      }
    }
    return best;
  }

  /** Actions still require both the car and the trailer to be stopped and upright. */
  workTrailer(id: string): Trailer | null {
    const v = this.vehicleOf(id);
    if (Math.abs(v.speed) > 0.5 || v.tiltDeg() > 25) return null;
    const t = this.nearbyTrailer(id);
    if (!t || t.tiltDeg() >= 25) return null;
    const speed = t.body.linvel();
    return Math.hypot(speed.x, speed.y, speed.z) < 0.6 ? t : null;
  }

  secureTrailerLoad(id: string): boolean {
    const t = this.workTrailer(id);
    if (!t) return false;
    t.secureLoad();
    return true;
  }

  /** A loose delivery drum beside an upright trailer, close enough to load by hand. */
  drumToLoad(id: string, stopped = true): CargoDrum | null {
    const t = stopped ? this.workTrailer(id) : this.nearbyTrailer(id);
    if (!t || t.drums >= 2) return null;
    const p = t.body.translation();
    const v = this.vehicleOf(id).body.translation();
    for (const d of this.looseDrums.values()) {
      const q = d.body.translation();
      const speed = d.body.linvel();
      if (
        Math.hypot(p.x - q.x, p.z - q.z) < 8 &&
        Math.hypot(v.x - q.x, v.z - q.z) < 12 &&
        Math.abs(p.y - q.y) < 2 &&
        (!stopped || Math.hypot(speed.x, speed.y, speed.z) < 1.2)
      )
        return d;
    }
    return null;
  }

  recoverDrum(id: string): boolean {
    const d = this.drumToLoad(id);
    const t = this.workTrailer(id);
    if (!d || !t) return false;
    d.remove();
    this.looseDrums.delete(d.id);
    t.loadDrums(t.drums + 1);
    t.secureLoad();
    return true;
  }

  repairTrailerTyre(id: string): boolean {
    const t = this.workTrailer(id);
    if (!t) return false;
    const i = t.tyres.findIndex((h) => h < 1);
    const c = this.vehicleOf(id).condition;
    if (i < 0 || (c.plugs <= 0 && c.spares <= 0)) return false;
    if (c.plugs > 0) c.plugs--;
    else c.spares--;
    t.tyres[i] = 1;
    return true;
  }

  deliveryState(): DeliveryState {
    const pose = (d: Trailer | CargoDrum) => ({
      id: d.id,
      position: { ...d.body.translation() },
      rotation: { ...d.body.rotation() },
    });
    return {
      trailers: [...this.trailers.values()].map((t) => ({
        ...pose(t),
        kind: t.tuning.id,
        hitched: t.hitchedTo !== null,
        drums: t.drums,
        strain: t.strain,
        tyres: [...t.tyres],
      })),
      looseDrums: [...this.looseDrums.values()].map(pose),
    };
  }

  /** Restore the actual cargo, including trailers left behind; never refill from a mission definition. */
  restoreDelivery(state: DeliveryState, vehicle: string): void {
    for (const id of [...this.trailers.keys()]) this.removeTrailer(id);
    for (const d of this.looseDrums.values()) d.remove();
    this.looseDrums.clear();
    let coupled = false;
    for (const saved of state.trailers) {
      const tuning = trailers[saved.kind];
      const hitch: boolean = saved.hitched && !coupled && canCouple(tuning, this.vehicleOf(vehicle).tuning);
      const t = this.addTrailer(
        saved.id,
        tuning,
        hitch
          ? vehicle
          : {
              ...saved.position,
              rotation: saved.rotation,
            },
      );
      coupled ||= hitch;
      t.loadDrums(saved.drums);
      t.strain = saved.strain;
      t.tyres.splice(0, 2, ...saved.tyres);
      t.tipped = t.tiltDeg() > trailerTuning.tippedDeg;
    }
    for (const d of state.looseDrums)
      this.looseDrums.set(d.id, new CargoDrum(d.id, this.physics, d.position, d.rotation));
    // Initialise Rapier's new bodies before a restart can move them again.
    this.physics.step();
  }

  /** The trailer a vehicle is towing, if any. */
  trailerOf(id: string): Trailer | null {
    const v = this.vehicles.get(id);
    for (const t of this.trailers.values()) if (v && t.hitchedTo === v) return t;
    return null;
  }

  /**
   * What the hitch could do now: hitch the nearest trailer whose coupling is in reach, or
   * unhitch the one on the back. Null with nothing to hitch or unhitch.
   */
  hitchOption(
    id: string,
  ): { kind: 'hitch' | 'unhitch'; trailer: Trailer; possible: boolean; reason?: string } | null {
    const v = this.vehicleOf(id);
    const towing = this.trailerOf(id);
    const stopped = Math.abs(v.speed) <= trailerTuning.stoppedSpeed;
    if (towing)
      return {
        kind: 'unhitch',
        trailer: towing,
        possible: stopped,
        reason: stopped ? undefined : 'Stop first',
      };
    let best: Trailer | null = null;
    let near = trailerTuning.hitchReach;
    for (const t of this.trailers.values()) {
      if (t.hitchedTo || t.tipped || !canCouple(t.tuning, v.tuning)) continue;
      const d = t.distanceToHitch(v);
      if (d <= near) {
        near = d;
        best = t;
      }
    }
    if (!best) return null;
    return { kind: 'hitch', trailer: best, possible: stopped, reason: stopped ? undefined : 'Stop first' };
  }

  /** Hitch the trailer in reach onto a vehicle. False if there's none, or it isn't stopped. */
  hitchTrailer(id: string): boolean {
    const o = this.hitchOption(id);
    if (!o || o.kind !== 'hitch' || !o.possible) return false;
    o.trailer.hitch(this.vehicleOf(id));
    this.events.emit('trailer', { id: o.trailer.id, vehicle: id, event: { type: 'hitched' } });
    return true;
  }

  /** Unhitch a vehicle's trailer where it stands. False if it has none, or isn't stopped. */
  unhitchTrailer(id: string): boolean {
    const o = this.hitchOption(id);
    if (!o || o.kind !== 'unhitch' || !o.possible) return false;
    o.trailer.unhitch();
    this.events.emit('trailer', { id: o.trailer.id, vehicle: null, event: { type: 'unhitched' } });
    return true;
  }

  /**
   * Bring a vehicle's trailer along after the vehicle has been moved: hitched straight behind
   * it, or, if the vehicle has nothing it can couple to (a No. 5's ring behind a car with only
   * a tow ball), standing unhitched behind it.
   */
  bringTrailer(id: string, trailer: Trailer | null = this.trailerOf(id)): void {
    if (!trailer) return;
    const v = this.vehicleOf(id);
    trailer.unhitch();
    const p = poseBehind(v, trailer.tuning, (x, z) => this.world.terrain.heightAt(x, z));
    trailer.teleport(p.x, p.y, p.z, p.rotation);
    if (canCouple(trailer.tuning, v.tuning)) trailer.hitch(v);
    else this.events.emit('trailer', { id: trailer.id, vehicle: null, event: { type: 'unhitched' } });
  }

  /**
   * Follow a change in the weather: how wet the ground is (the tyres' grip) and the rain,
   * and how high and fast the creeks run. The creek level offset stays as the world was
   * built with, since the puddles were laid for it.
   */
  setWeather(env: EnvironmentConfig, creekRise: number, flowScale: number): void {
    this.env.wetness = env.wetness;
    this.env.rain = env.rain;
    this.creeks.rise = creekRise;
    this.creeks.flowScale = flowScale;
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- for the getter below
    const sim = this;
    const v = new Vehicle(id, this.physics, tuning, pose, {
      get wetness() {
        return env.wetness;
      },
      get waterLevelOffset() {
        return env.waterLevelOffset;
      },
      churn: this.churn,
      // Looked up each time: the game may hand the simulation its ruts after the vehicle is made.
      get ruts() {
        return sim.ruts;
      },
    });
    // A vehicle arrives in neutral in the manual gearbox settings.
    v.setGearboxMode(this.gearboxMode);
    if (v.manualGearbox) {
      v.drivetrain.gear = 0;
      v.drivetrain.neutral = true;
    }
    this.vehicles.set(id, v);
    this.tools.set(id, new VehicleTools());
    this.events.emit('vehicleSpawned', { id });
    return v;
  }

  /** Crank a vehicle's engine: it drives once the engine catches. */
  startEngine(id: string): void {
    if (this.vehicleOf(id).startEngine()) this.events.emit('engine', { id, event: 'starting' });
  }

  /** Switch a vehicle's engine off: pressing the pedal starts it. */
  switchOffEngine(id: string): void {
    this.vehicleOf(id).switchOff();
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
    const towing = this.trailerOf(id);
    towing?.unhitch();
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
    this.vehicles.delete(id);
    this.tools.delete(id);
    const v = this.addVehicle(id, pose, tuning);
    // Rapier 0.21 leaves the new vehicle frozen in place if the old body is removed before
    // a step has run, or if either is moved (to a camp, say) before one has. Step once now.
    this.physics.step();
    this.physics.world.removeRigidBody(old.body);
    this.bringTrailer(id, towing);
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
    // Where everything else stood before this step, so the renderer can draw it between
    // steps as it does the car (which remembers its own pose in Vehicle.step).
    for (const tools of this.tools.values()) for (const pl of tools.planks.placed) snapshotPose(pl);
    for (const obj of this.dynamics.values()) snapshotPose(obj);
    for (const s of this.stuck.values()) snapshotPose(s);
    for (const d of this.looseDrums.values()) snapshotPose(d);
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
      } else if (input.interact && this.hitchOption(id)?.kind === 'hitch') this.hitchTrailer(id);
      else if (input.winchAttach) this.quickAttach(id);
      // Winching a bogged vehicle out, the handbrake holds this one where it stands (unless
      // driving). Not the brake pedal: pressed at a standstill, that selects reverse.
      if (tools.winch.anchor?.id.startsWith('stuck:') && input.throttle === 0 && !tools.repair)
        input = { ...input, handbrake: true };
      tools.updateFreeRoll(v, input);
      const before = v.drivetrain.range;
      const transferBefore = v.transfer.mode;
      const strainBefore = v.transfer.windup;
      const frontBefore = v.differentials.front;
      const rearBefore = v.differentials.rear;
      const precisionBefore = v.precisionCrawl;
      const parkBefore = v.parkBrake;
      const lightsBefore = v.lights;
      v.step(input, dt);
      if (v.transfer.mode !== transferBefore)
        this.events.emit('transferChanged', { id, mode: v.transfer.mode });
      else if (input.toggleRange)
        this.events.emit('transferBlocked', { id, reason: v.rangeShiftReason() ?? 'Cannot shift now' });
      if (strainBefore < 0.5 && v.transfer.windup >= 0.5) this.events.emit('windup', { id });
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
      if (v.startedByPedal) this.events.emit('engine', { id, event: 'starting' });
      if (v.stalledLugged) this.events.emit('engine', { id, event: 'stalledLugged' });
      if (v.startBlocked) this.events.emit('engine', { id, event: 'clutchToStart' });
      tools.winch.step(v, input.winchIn, input.winchOut, dt);
      v.externalLoad = tools.winch.tension;
      const pulled = tools.winch.anchor?.id.startsWith('stuck:')
        ? this.stuck.get(tools.winch.anchor.recoveryId ?? tools.winch.anchor.id.slice(6))
        : undefined;
      if (pulled?.pull(tools.winch.tension, tools.winch.mount, dt)) {
        // Out: its driver unhooks the line.
        tools.winch.detach();
        this.toolEvent(id, { type: 'winchDetached' });
        this.events.emit('rescued', { id: pulled.def.id });
      }
      tools.jack.step(v, input.jack, dt, this.R, (x, z) => this.world.terrain.heightAt(x, z));
    }
    if (this.surprises)
      for (const e of this.surprises.update(this.vehicles.values().next().value, dt))
        this.events.emit('surprise', e);
    for (const d of this.looseDrums.values()) d.step(dt, this.env.waterLevelOffset);
    for (const t of this.trailers.values()) t.step(dt);
    this.physics.step();
    for (const t of this.trailers.values()) {
      for (const event of t.postStep(dt, this.damage)) {
        if (event.type === 'drumLoose') this.spillDrum(t);
        this.events.emit('trailer', { id: t.id, vehicle: t.hitchedTo?.id ?? null, event });
      }
      if (t.bump > 0)
        this.events.emit('trailerBump', { id: t.id, vehicle: t.hitchedTo?.id ?? null, speed: t.bump });
    }
    for (const [id, v] of this.vehicles) {
      v.postStep(dt);
      for (let i = 0; i < v.wheelImpacts.length; i++)
        if (v.wheelImpacts[i] > 0)
          this.events.emit('wheelImpact', { id, wheel: i, speed: v.wheelImpacts[i] });
      if (v.bodyContact.knock > 0) this.events.emit('bodyKnock', { id, impulse: v.bodyContact.knock });
      if (updateWear(v, dt)) this.events.emit('dent', { id, impact: v.lastImpact });
      for (const e of updateDamage(v, this.damage, dt)) this.events.emit('damage', { id, ...e });
      const c = v.condition;
      if (this.fuelScale > 0 && c.fuel > 0) {
        c.fuel = Math.max(0, c.fuel - v.drivetrain.fuelRate * dt * this.fuelScale);
        if (c.fuel === 0) this.events.emit('engine', { id, event: 'outOfFuel' });
      }
    }
    this.time += dt;
  }

  // --- Winch -------------------------------------------------------------

  /** Anchors within cable reach of a vehicle's winch (SPEC §7.1). */
  findAnchors(id: string, range = winchTuning.cableLength - 1): Anchor[] {
    const v = this.vehicleOf(id);
    const t = v.tuning;
    const m = v.localToWorld(t.winchMount.x, t.winchMount.y, t.winchMount.z);
    if (this.toolsOf(id).winch.doubleLine) range = Math.min(range, (winchTuning.cableLength - 1) / 2);
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
        label: r.label ?? 'Boulder',
      });
    }
    for (const obj of this.dynamics.values()) {
      if (obj.kind === 'rock') {
        // A strap round a fallen rock.
        const p = obj.body.translation();
        if (!within(p.x, p.y, p.z)) continue;
        out.push({
          kind: 'object',
          id: `obj:${obj.id}`,
          point: v3(p.x, p.y, p.z),
          radius: obj.radius ?? 0.4,
          body: obj.body,
          local: v3(0, 0, 0),
          label: 'Fallen rock',
        });
        continue;
      }
      if (obj.kind !== 'fallenTree' || !obj.def) continue;
      // Hook the trunk at the point nearest the winch.
      const p = obj.body.translation();
      const axis = rotate(obj.body.rotation(), 0, 1, 0);
      const half = obj.def.length / 2 - obj.def.radius - 0.5;
      const s = Math.max(
        -half,
        Math.min(half, (m.x - p.x) * axis.x + (m.y - p.y) * axis.y + (m.z - p.z) * axis.z),
      );
      // A surprise's dead tree before it comes down is a fixed anchor like any tree.
      const label = obj.body.isKinematic() ? 'Dead tree' : 'Fallen tree';
      // Strapped where it's nearest, or near either end to swing it round.
      const hooks: [number, string, string][] = [];
      if (!obj.body.isKinematic())
        for (const [end, name] of [
          [-half, 'root'],
          [half, 'crown'],
        ] as const)
          hooks.push([end, `${label} (${name} end)`, `:${name}`]);
      if (hooks.every(([end]) => Math.abs(end - s) > 1.5)) hooks.push([s, label, '']);
      for (const [at, name, suffix] of hooks) {
        const wx = p.x + axis.x * at;
        const wy = p.y + axis.y * at;
        const wz = p.z + axis.z * at;
        if (!within(wx, wy, wz)) continue;
        out.push({
          kind: 'object',
          id: `obj:${obj.id}${suffix}`,
          point: v3(wx, wy, wz),
          radius: obj.def.radius,
          body: obj.body,
          local: v3(0, at, 0),
          label: name,
        });
      }
    }
    for (const s of this.stuck.values()) {
      if (s.freed) continue;
      const forward = rotate(s.body.rotation(), 0, 0, -1);
      const centre = s.body.translation();
      const inFront = (m.x - centre.x) * forward.x + (m.z - centre.z) * forward.z >= 0;
      // Use the end facing the winching car: no rope through the casualty's body.
      const local = inFront ? s.hook : s.rearHook;
      const p = anchorPoint(
        { kind: 'vehicle', id: '', point: v3(), radius: 0, body: s.body, local, label: '' },
        v3(),
      );
      if (!within(p.x, p.y, p.z)) continue;
      out.push({
        kind: 'vehicle',
        id: `stuck:${s.def.id}`,
        recoveryId: s.def.id,
        point: p,
        radius: 0.05,
        body: s.body,
        local: { ...local },
        label: `${s.def.name} (${inFront ? 'front' : 'rear'} recovery point)`,
      });
    }
    for (const t of this.trailers.values()) {
      // A strap on the drawbar of a trailer standing on its own (tipped, or stuck in a bog).
      if (t.hitchedTo) continue;
      const c = t.tuning.coupling;
      const p = t.couplingWorld();
      if (!within(p.x, p.y, p.z)) continue;
      out.push({
        kind: 'object',
        id: `trailer:${t.id}`,
        point: p,
        radius: 0.05,
        body: t.body,
        local: { x: c.x, y: c.y, z: c.z + 0.3 },
        label: 'Trailer drawbar',
      });
    }
    for (const other of this.vehicles.values()) {
      if (other === v) continue;
      // Rated chassis eye beside/above the hitch, never the trailer's tow ball.
      const hitch = other.tuning.towPoint;
      const tow = { x: hitch.x + 0.35, y: hitch.y + 0.12, z: hitch.z - 0.15 };
      const p = other.localToWorld(tow.x, tow.y, tow.z);
      if (!within(p.x, p.y, p.z)) continue;
      out.push({
        kind: 'vehicle',
        id: `veh:${other.id}`,
        point: p,
        radius: 0.05,
        body: other.body,
        local: { ...tow },
        label: 'Vehicle rear recovery point',
      });
    }
    return out.filter((a) => !this.toolsOf(id).winch.doubleLine || a.kind === 'tree' || a.kind === 'rock');
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
    if (!tools.winch.attach(v, best)) {
      this.toolEvent(id, { type: 'noAnchor' });
      return;
    }
    this.toolEvent(id, { type: 'winchAttached', anchor: best });
  }

  attachTo(id: string, anchor: Anchor): void {
    const tools = this.toolsOf(id);
    if (!tools.winch.attach(this.vehicleOf(id), anchor)) {
      this.toolEvent(id, { type: 'noAnchor' });
      return;
    }
    this.toolEvent(id, { type: 'winchAttached', anchor });
  }

  detachWinch(id: string): void {
    const tools = this.toolsOf(id);
    if (!tools.winch.attached) return;
    tools.winch.detach();
    this.toolEvent(id, { type: 'winchDetached' });
  }

  // --- Planks ------------------------------------------------------------

  /**
   * Height of whatever static or dynamic thing (a placed plank, a rock, a bogged car) is
   * under (x, z), leaving out `exclude` (the car doing the probing).
   */
  probeGround = (x: number, z: number, fromY: number, exclude?: RAPIER.RigidBody): number => {
    const R = this.R;
    const ray = new R.Ray({ x, y: fromY + 3, z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRay(
      ray,
      60,
      true,
      undefined,
      groups(Groups.DYNAMIC, Groups.TERRAIN | Groups.STATIC | Groups.DYNAMIC),
      undefined,
      exclude,
    );
    return hit ? fromY + 3 - hit.timeOfImpact : this.world.terrain.heightAt(x, z);
  };

  /** `probeGround` for a vehicle: it never lands on its own body. */
  probeGroundFor(id: string): GroundProbe {
    const body = this.vehicleOf(id).body;
    return (x, z, fromY) => this.probeGround(x, z, fromY, body);
  }

  placePlanks(id: string): boolean {
    const tools = this.toolsOf(id);
    const n = tools.planks.carried;
    const ok = tools.planks.place(this.vehicleOf(id), this.physics, this.probeGroundFor(id));
    if (ok) this.toolEvent(id, { type: 'planksPlaced', count: n });
    return ok;
  }

  recallPlanks(id: string): void {
    this.toolsOf(id).planks.recall(this.physics);
    this.toolEvent(id, { type: 'planksRecalled' });
  }

  // --- Damage and repairs -----------------------------------------------

  /** Change the gearbox setting for every vehicle (and those added later). */
  setGearboxMode(mode: GearboxMode): void {
    this.gearboxMode = mode;
    for (const v of this.vehicles.values()) v.setGearboxMode(mode);
  }

  /** Change how harsh damage is; damage beyond what the new setting allows is put right. */
  setDamage(mode: DamageMode): void {
    this.damage = mode;
    for (const v of this.vehicles.values()) limitDamage(v.condition, mode);
    if (mode !== 'realistic') for (const t of this.trailers.values()) t.tyres.fill(1);
  }

  /**
   * What a roadside repair could do now. Mild damage: a field repair puts everything right.
   * Realistic: a puncture takes a plug from the kit, a torn sidewall or a tyre off its rim
   * (or a puncture with no plugs left) a spare wheel; nothing else can be mended at the roadside.
   */
  repairOption(id: string): { kind: RepairKind; possible: boolean; reason?: string } | null {
    const v = this.vehicleOf(id);
    const c = v.condition;
    if (this.damage === 'off') return null;
    let kind: RepairKind;
    if (this.damage === 'mild') {
      if (!(c.engine < 1 || c.tyreTarget.some((h) => h < 1) || c.suspension.some((h) => h < 1))) return null;
      kind = 'field';
    } else {
      const i = worstTyre(c);
      if (i < 0) return null;
      kind = c.tyreFault[i] === 'puncture' && c.plugs > 0 ? 'plug' : 'spare';
      if (kind === 'spare' && c.spares === 0)
        return {
          kind,
          possible: false,
          reason: c.tyreFault[i] === 'puncture' ? 'No plugs or spares left' : 'No spares left',
        };
    }
    return this.canWork(v, kind);
  }

  /** Pour a jerry can into the tank: possible stopped, with a can left and room for it. */
  refuelOption(id: string): { kind: RepairKind; possible: boolean; reason?: string } | null {
    const v = this.vehicleOf(id);
    const c = v.condition;
    if (c.jerryCans === 0) return null;
    if (c.fuel > v.tuning.engine.fuel.tankLitres - damageTuning.jerryCanLitres)
      return { kind: 'refuel', possible: false, reason: 'The tank’s too full for a whole can' };
    return this.canWork(v, 'refuel');
  }

  private canWork(v: Vehicle, kind: RepairKind): { kind: RepairKind; possible: boolean; reason?: string } {
    if (Math.abs(v.speed) > 0.5) return { kind, possible: false, reason: 'Stop first' };
    if (v.tiltDeg() > 30) return { kind, possible: false, reason: 'Too steep to work on it here' };
    return { kind, possible: true };
  }

  startHubs(id: string): boolean {
    const v = this.vehicleOf(id);
    const tools = this.toolsOf(id);
    if (
      v.tuning.transfer !== 'partTime' ||
      v.tuning.autoHubs ||
      v.transfer.mode !== '2H' ||
      tools.repair ||
      !this.canWork(v, 'hubs').possible
    )
      return false;
    tools.repair = { kind: 'hubs', remaining: 20, total: 20 };
    return true;
  }

  /** Pump let-down tyres back up with the compressor: a roadside job like a repair. */
  startPump(id: string): boolean {
    return this.startPressure(id, 36);
  }

  startPressure(id: string, psi: number): boolean {
    const v = this.vehicleOf(id);
    const tools = this.toolsOf(id);
    const from = pressurePsi(v.condition);
    const speed = v.body.linvel();
    if (
      !tyrePressures.some((p) => p === psi) ||
      from === psi ||
      tools.repair ||
      !this.canWork(v, 'pump').possible ||
      Math.hypot(speed.x, speed.y, speed.z) > 0.5
    )
      return false;
    const total = ((psi > from ? damageTuning.repair.pumpSeconds : 12) * Math.abs(psi - from)) / 18;
    tools.repair = { kind: 'pump', remaining: total, total, targetPsi: psi };
    return true;
  }

  /** Digging helps shallow mud and sand; it cannot remove a deep bog or its water. */
  canDig(id: string): boolean {
    const v = this.vehicleOf(id);
    const speed = v.body.linvel();
    return (
      !this.toolsOf(id).repair &&
      this.canWork(v, 'dig').possible &&
      Math.hypot(speed.x, speed.y, speed.z) < 0.5 &&
      v.wheels.some(
        (w) =>
          w.contact &&
          w.water < 0.2 &&
          ([SurfaceId.Mud, SurfaceId.BlackSoil, SurfaceId.Sand] as number[]).includes(w.surface),
      )
    );
  }

  startDig(id: string): boolean {
    if (!this.canDig(id)) return false;
    this.toolsOf(id).repair = { kind: 'dig', remaining: 20, total: 20 };
    return true;
  }

  /** Start a roadside job (tool menu). False if there's nothing it can do here. */
  startRepair(id: string, refuel = false): boolean {
    const option = refuel ? this.refuelOption(id) : this.repairOption(id);
    const tools = this.toolsOf(id);
    if (!option?.possible || tools.repair) return false;
    const R = damageTuning.repair;
    const total = {
      field: R.fieldSeconds,
      spare: R.spareSeconds,
      plug: R.plugSeconds,
      refuel: R.refuelSeconds,
      pump: R.pumpSeconds,
      hubs: 20,
      dig: 20,
    }[option.kind];
    tools.repair = { kind: option.kind, remaining: total, total };
    return true;
  }

  private finishRepair(id: string): void {
    const tools = this.toolsOf(id);
    const job = tools.repair;
    tools.repair = null;
    if (!job) return;
    const v = this.vehicleOf(id);
    const c = v.condition;
    if (job.kind === 'field') repairAll(c);
    else if (job.kind === 'pump') setPressure(c, job.targetPsi ?? 36);
    else if (job.kind === 'dig') {
      const p = v.body.translation();
      v.dugGround = { x: p.x, z: p.z, relief: 1 };
    } else if (job.kind === 'hubs') v.transfer.hubsLocked = !v.transfer.hubsLocked;
    else if (job.kind === 'refuel') {
      if (c.jerryCans === 0) return;
      c.jerryCans--;
      const empty = c.fuel === 0;
      c.fuel = Math.min(v.tuning.engine.fuel.tankLitres, c.fuel + damageTuning.jerryCanLitres);
      // A dry engine needs the starter again.
      if (empty) this.startEngine(id);
    } else {
      const i = worstTyre(c);
      if (i < 0) return;
      if (job.kind === 'plug' && c.plugs > 0) c.plugs--;
      else if (job.kind === 'spare' && c.spares > 0) c.spares--;
      else return;
      mendTyre(c, i);
    }
    this.events.emit('repaired', { id, kind: job.kind });
  }

  /**
   * A campsite's rest: the engine and suspension are put right and punctures properly
   * patched. A torn sidewall stays torn, and spares, plugs and fuel aren't replaced.
   */
  repairAtCamp(id: string): void {
    const c = this.vehicleOf(id).condition;
    let mended =
      c.engine < 1 || c.engineHeat > damageTuning.engine.heatWarn || c.suspension.some((h) => h < 1);
    c.engine = 1;
    // A boiling engine cools over the rest, so it isn't still boiling (and losing health) at camp.
    c.engineHeat = 0.5;
    c.suspension.fill(1);
    for (let i = 0; i < 4; i++)
      if (
        c.tyreFault[i] !== 'sidewall' &&
        (c.tyres[i] < 1 || c.tyreTarget[i] < 1 || c.tyreFault[i] !== 'none')
      ) {
        mendTyre(c, i);
        mended = true;
      }
    if (mended) this.events.emit('repaired', { id, kind: 'camp' });
    // Arrival is recorded as soon as the car enters camp. Patch a nearby trailer before
    // that checkpoint is taken, including when the driver is still rolling to a stop.
    const p = this.vehicleOf(id).body.translation();
    for (const trailer of this.trailers.values()) {
      const q = trailer.body.translation();
      if (Math.hypot(p.x - q.x, p.z - q.z) > 12) continue;
      trailer.tyres.fill(1);
      if (trailer.tiltDeg() < 25) trailer.secureLoad();
    }
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
    const towing = this.trailerOf(id);
    v.teleport(this.campsitePose(campsiteId, v.tuning.wheelRadius));
    this.bringTrailer(id, towing);
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
          transfer: { ...v.transfer },
          gear: v.drivetrain.gear,
          differentials: { ...v.differentials },
          precisionCrawl: v.precisionCrawl,
          parkBrake: v.parkBrake,
          lights: v.lights,
          engineRunning: v.drivetrain.engineRunning,
          engineOff: v.engineOff,
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
          },
          supplies: {
            fuel: v.condition.fuel,
            jerryCans: v.condition.jerryCans,
            spares: v.condition.spares,
            plugs: v.condition.plugs,
          },
          winch: {
            anchor: tools.winch.anchor?.id ?? null,
            length: tools.winch.length,
            doubleLine: tools.winch.doubleLine,
            treeProtector: tools.winch.treeProtector,
          },
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
