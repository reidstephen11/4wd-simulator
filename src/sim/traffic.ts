import type RAPIER from '@dimforge/rapier3d-compat';
import { SurfaceId } from '../data/surfaces';
import { Groups, groups, type Physics, type Rapier } from './physics';
import { STUCK_RIDE_HEIGHT } from './stuckVehicle';
import type { DensePolyline } from './world/polyline';

/**
 * Other people's 4WDs coming the other way on narrow track. The first time you reach either
 * end of a traffic track, a car sets off from the far end towards you. It drives the
 * track's centre line and stops whenever you're on the line ahead of it, so to get past
 * you pull off to one side and let it by. Once at the end of the track it's gone.
 */
export interface TrafficPlan {
  /** Who it is, as the HUD names them ("A Troopy"). */
  name: string;
  /** The track's centre line, (x, z) in order. */
  points: readonly (readonly [number, number])[];
}

/**
 * The plans for an episode's traffic, one per entry that names a generated track. The
 * car drives the track's dense centreline (the spline the ground was graded along), not
 * the authored control points: their chords stray up to 4.5 m from the track on the ridge.
 */
export function trafficPlans(
  defs: readonly { track: string; name: string }[],
  tracks: readonly { def: { id: string }; poly: DensePolyline }[],
): TrafficPlan[] {
  return defs.flatMap((t) => {
    const track = tracks.find((tr) => tr.def.id === t.track);
    if (!track || track.poly.count < 2) return [];
    const points = Array.from(
      { length: track.poly.count },
      (_, k) => [track.poly.xs[k], track.poly.zs[k]] as const,
    );
    return [{ name: t.name, points }];
  });
}

export type TrafficEvent =
  | { type: 'spawned'; car: OncomingCar }
  | { type: 'waiting'; car: OncomingCar }
  | { type: 'moving'; car: OncomingCar }
  | { type: 'gone'; car: OncomingCar };

/** Reaching this close to a track's end sends a car the other way (m). */
const TRIGGER = 15;
/** Driving speed (m/s). */
const SPEED = 5;
/** It stops when you're this far ahead of it or closer (m)... */
const LOOK_AHEAD = 18;
/** ...and less than this far either side of its line (m): pulled over further, it squeezes by. */
const CLEARANCE = 2.3;

export class OncomingCar {
  /** How far along its path it has driven (m). */
  s = 0;
  waiting = false;
  readonly length: number;
  private readonly cum: number[] = [0];

  constructor(
    readonly name: string,
    readonly path: readonly (readonly [number, number])[],
  ) {
    for (let i = 1; i < path.length; i++)
      this.cum.push(this.cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    this.length = this.cum[this.cum.length - 1];
  }

  /** Where it is at distance `s` along the path, and which way it faces (degrees, 0 = north). */
  at(s = this.s): { x: number; z: number; headingDeg: number } {
    let i = 1;
    while (i < this.path.length - 1 && this.cum[i] < s) i++;
    const [ax, az] = this.path[i - 1];
    const [bx, bz] = this.path[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (s - this.cum[i - 1]) / seg));
    const headingDeg = (Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, headingDeg };
  }

  /** The point (x, z) as a distance along the path and a distance off its line. */
  project(x: number, z: number): { along: number; off: number } {
    let best = { along: 0, off: Infinity };
    for (let i = 1; i < this.path.length; i++) {
      const [ax, az] = this.path[i - 1];
      const [bx, bz] = this.path[i];
      const len = this.cum[i] - this.cum[i - 1] || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)));
      const off = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
      if (off < best.off) best = { along: this.cum[i - 1] + t * len, off };
    }
    return best;
  }

  /** Drive on for `dt` seconds unless you're in the way. Returns true when it reaches the end. */
  update(dt: number, player: { x: number; z: number }): boolean {
    const p = this.project(player.x, player.z);
    const ahead = p.along - this.s;
    this.waiting = ahead > -2 && ahead < LOOK_AHEAD && p.off < CLEARANCE;
    if (!this.waiting) this.s = Math.min(this.length, this.s + SPEED * dt);
    return this.s >= this.length;
  }
}

export class Traffic {
  readonly cars: OncomingCar[] = [];
  private readonly sent = new Set<number>();

  constructor(private readonly plans: readonly TrafficPlan[]) {}

  /** Back to the start of the episode: no cars out, and every track ready to send one again. */
  reset(): void {
    this.cars.length = 0;
    this.sent.clear();
  }

  /** Call every step with where you are; returns what changed. */
  update(dt: number, player: { x: number; z: number }): TrafficEvent[] {
    const events: TrafficEvent[] = [];
    this.plans.forEach((plan, i) => {
      if (this.sent.has(i) || plan.points.length < 2) return;
      const [a, b] = [plan.points[0], plan.points[plan.points.length - 1]];
      const nearA = Math.hypot(player.x - a[0], player.z - a[1]) <= TRIGGER;
      const nearB = Math.hypot(player.x - b[0], player.z - b[1]) <= TRIGGER;
      if (!nearA && !nearB) return;
      this.sent.add(i);
      // It sets off from the end you're not at.
      const path = nearA ? [...plan.points].reverse() : [...plan.points];
      const car = new OncomingCar(plan.name, path);
      this.cars.push(car);
      events.push({ type: 'spawned', car });
    });
    for (const car of [...this.cars]) {
      const was = car.waiting;
      const done = car.update(dt, player);
      if (car.waiting !== was) events.push({ type: car.waiting ? 'waiting' : 'moving', car });
      if (done) {
        this.cars.splice(this.cars.indexOf(car), 1);
        events.push({ type: 'gone', car });
      }
    }
    return events;
  }
}

/**
 * It's solid to the player's car only. A kinematic body moves whatever it meets, so it
 * must not touch the movable things on its track (fallen rocks and trees, planks): it
 * would push them along in front of it.
 */
const SOLID = groups(Groups.DYNAMIC, Groups.VEHICLE);
const HALF_BASE = 1.15;

/** A kinematic body for an oncoming car, the same size as a bogged one. */
export function createTrafficBody(R: Rapier, physics: Physics): RAPIER.RigidBody {
  const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  const c = physics.world.createCollider(
    R.ColliderDesc.cuboid(0.85, 0.85, 2.0)
      .setTranslation(0, 0.5, 0)
      .setFriction(0.5)
      .setCollisionGroups(SOLID),
    body,
  );
  physics.colliderSurface.set(c.handle, SurfaceId.Rock);
  return body;
}

/** Sit the car's body on the ground where it now is along its path. */
export function placeTrafficBody(
  body: RAPIER.RigidBody,
  car: OncomingCar,
  heightAt: (x: number, z: number) => number,
  teleport: boolean,
): void {
  const { x, z, headingDeg } = car.at();
  const h = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const front = heightAt(x + fx * HALF_BASE, z + fz * HALF_BASE);
  const rear = heightAt(x - fx * HALF_BASE, z - fz * HALF_BASE);
  const pitch = Math.atan2(front - rear, 2 * HALF_BASE);
  const yaw = -h;
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const q = { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
  const p = { x, y: (front + rear) / 2 + STUCK_RIDE_HEIGHT, z };
  if (teleport) {
    body.setTranslation(p, true);
    body.setRotation(q, true);
  } else {
    body.setNextKinematicTranslation(p);
    body.setNextKinematicRotation(q);
  }
}
