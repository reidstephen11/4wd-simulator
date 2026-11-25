import type * as THREE from 'three';
import type { EpisodeDef } from '../data/episodes';
import type { VehicleId } from '../data/vehicle';
import { vehicles } from '../data/vehicles';
import { poseOf, snapshotPose, type PosedBody } from '../sim/bodyPose';
import type { Simulation } from '../sim/sim';
import {
  Traffic,
  createTrafficBody,
  placeTrafficBody,
  trafficPlans,
  type OncomingCar,
  type TrafficEvent,
} from '../sim/traffic';
import type { TrackInfo } from '../sim/world/features';
import { StuckVehicleView } from '../render/stuckVehicleView';

/**
 * The cars coming the other way on a narrow track (moved out of `Game`, v1.52): when the
 * track sends one, its kinematic body in the physics world and its model in the scene, its
 * toasts as it comes, waits and squeezes past, and its removal once it has gone by.
 */
export class TrafficCars {
  /** Which car each track sends, and when. */
  readonly traffic: Traffic;
  private readonly cars = new Map<OncomingCar, { car: PosedBody; view: StuckVehicleView }>();
  private readonly looks = new Map<string, VehicleId>();

  constructor(
    defs: EpisodeDef['traffic'],
    tracks: readonly TrackInfo[],
    private readonly sim: Pick<Simulation, 'R' | 'physics'>,
    private readonly scene: THREE.Object3D,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly toast: (text: string, ms?: number) => void,
  ) {
    for (const t of defs ?? []) this.looks.set(t.name, t.look);
    this.traffic = new Traffic(trafficPlans(defs ?? [], tracks));
  }

  /** Before a physics step: keep each car's pose, so a frame can draw it between the two. */
  snapshot(): void {
    for (const { car } of this.cars.values()) snapshotPose(car);
  }

  /** After a physics step: move the cars on, given where the player is. */
  update(dt: number, player: { x: number; z: number }): void {
    for (const e of this.traffic.update(dt, player)) this.onEvent(e);
  }

  /** Put each car's body where its plan has it now. */
  place(): void {
    for (const [plan, { car }] of this.cars) placeTrafficBody(car.body, plan, this.heightAt, false);
  }

  /** Each frame: draw the cars part way between the last two steps. */
  render(alpha: number): void {
    for (const { view } of this.cars.values()) view.update(alpha);
  }

  /** Every oncoming car off the road and out of the scene, and the tracks ready to send one again. */
  clear(): void {
    for (const car of [...this.cars.keys()]) this.remove(car);
    this.traffic.reset();
  }

  private onEvent(e: TrafficEvent): void {
    const { car } = e;
    if (e.type === 'spawned') {
      const body = createTrafficBody(this.sim.R, this.sim.physics);
      placeTrafficBody(body, car, this.heightAt, true);
      const posed: PosedBody = { body, ...poseOf(body) };
      const view = new StuckVehicleView(posed, vehicles[this.looks.get(car.name) ?? 'troopy'].tuning);
      view.model.root.name = 'traffic';
      this.scene.add(view.model.root);
      this.cars.set(car, { car: posed, view });
      this.toast(`${car.name} is coming the other way on this narrow track`, 3000);
    } else if (e.type === 'waiting') {
      this.toast(`${car.name} has stopped for you: pull off to one side to let it past`, 3000);
    } else if (e.type === 'moving' && car.s > 1) {
      this.toast(`${car.name} squeezes past with a wave`, 2200);
    } else if (e.type === 'gone') this.remove(car);
  }

  private remove(car: OncomingCar): void {
    const drawn = this.cars.get(car);
    if (!drawn) return;
    this.sim.physics.world.removeRigidBody(drawn.car.body);
    this.scene.remove(drawn.view.model.root);
    this.cars.delete(car);
  }
}
