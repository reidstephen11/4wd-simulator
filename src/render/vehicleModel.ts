import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { slerp } from '../sim/vehicle/math';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';

/** Body zones (vertex tag) used for dirt build-up. */
export const BodyZone = { Front: 0, Sides: 1, Rear: 2, Roof: 3, Trim: 4, Glass: 5 } as const;

/**
 * Generic short-wheelbase 1970s 4WD (SPEC §4): boxy body, round headlights, flat bonnet,
 * roof rack, spare wheel on the back, winch on the front bumper. No badges.
 * Wheels follow the suspension so articulation is visible.
 */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly bodyGroup = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly rackPlanks: THREE.Mesh;
  readonly wheels: { pivot: THREE.Group; spin: THREE.Group }[] = [];
  readonly bodyMaterial: THREE.MeshLambertMaterial;
  private readonly tmpQ = { x: 0, y: 0, z: 0, w: 1 };
  /** Extra visual wheel spin from wheelspin (rad). */
  private readonly spinExtra = [0, 0, 0, 0];

  constructor(private readonly tuning: VehicleTuning) {
    this.bodyMaterial = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.body = new THREE.Mesh(this.buildBody().build(true), this.bodyMaterial);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.bodyGroup.add(this.body);
    this.root.add(this.bodyGroup);

    const planks = new MeshBuilder(7);
    for (const x of [-0.22, 0.22]) {
      planks.push().translate(x, 1.66, 0.25);
      planks.box(0.3, 0.05, 2.4, pal('barkOchre'));
      planks.pop();
    }
    this.rackPlanks = new THREE.Mesh(planks.build(), this.bodyMaterial);
    this.rackPlanks.castShadow = true;
    this.bodyGroup.add(this.rackPlanks);

    const wheelGeo = this.buildWheel().build();
    const wheelMat = this.bodyMaterial;
    for (const w of tuning.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, 0, w.z);
      const spin = new THREE.Group();
      const mesh = new THREE.Mesh(wheelGeo, wheelMat);
      mesh.castShadow = true;
      // Mirror the left wheels so the rim faces out.
      if (w.x < 0) mesh.scale.x = -1;
      spin.add(mesh);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin });
    }
  }

  private buildBody(): MeshBuilder {
    const b = new MeshBuilder(42);
    const body = pal('vehicleBody');
    const roof = pal('vehicleRoof');
    const trim = pal('vehicleTrim');
    const glass = pal('vehicleTrim').clone().lerp(pal('waterDeep'), 0.35);
    const lamp = pal('vehicleRoof')
      .clone()
      .lerp(new THREE.Color(1, 0.95, 0.8), 0.4);
    // Lower body tub (subdivided so dents have vertices to push).
    b.tag = BodyZone.Sides;
    b.push().translate(0, 0.3, 0.02);
    b.box(1.64, 0.72, 3.66, body, [6, 3, 14]);
    b.pop();
    // Bonnet (front, flat).
    b.tag = BodyZone.Front;
    b.push().translate(0, 0.72, -1.23);
    b.box(1.56, 0.12, 1.2, body, [5, 1, 4]);
    b.pop();
    // Front panel / grille surround.
    b.push().translate(0, 0.42, -1.84);
    b.box(1.56, 0.5, 0.06, body, [5, 2, 1]);
    b.pop();
    // Grille.
    b.tag = BodyZone.Trim;
    b.push().translate(0, 0.44, -1.88);
    b.box(0.62, 0.32, 0.04, trim);
    b.pop();
    // Round headlights.
    for (const x of [-0.56, 0.56]) {
      b.push()
        .translate(x, 0.46, -1.88)
        .rotate(Math.PI / 2, 0, 0);
      b.cylinder(0.12, 0.12, 0.06, 10, trim, true, lamp);
      b.pop();
    }
    // Cabin and hardtop.
    b.tag = BodyZone.Sides;
    b.push().translate(0, 1.1, 0.62);
    b.box(1.58, 0.74, 2.42, body, [5, 2, 8]);
    b.pop();
    b.tag = BodyZone.Roof;
    b.push().translate(0, 1.5, 0.6);
    b.box(1.62, 0.08, 2.5, roof, [4, 1, 6]);
    b.pop();
    // Windscreen (raked) and side windows.
    b.tag = BodyZone.Glass;
    b.push().translate(0, 1.12, -0.62).rotate(-0.22, 0, 0);
    b.box(1.46, 0.62, 0.05, glass);
    b.pop();
    for (const x of [-0.8, 0.8]) {
      b.push().translate(x, 1.16, 0.15);
      b.box(0.03, 0.42, 0.9, glass);
      b.pop();
      b.push().translate(x, 1.16, 1.2);
      b.box(0.03, 0.42, 0.95, glass);
      b.pop();
    }
    b.push().translate(0, 1.16, 1.84);
    b.box(1.2, 0.42, 0.03, glass);
    b.pop();
    // Bumpers and winch.
    b.tag = BodyZone.Trim;
    b.push().translate(0, 0.06, -1.97);
    b.box(1.84, 0.18, 0.16, trim);
    b.pop();
    b.push().translate(0, 0.2, -2.0);
    b.box(0.56, 0.2, 0.2, trim.clone().multiplyScalar(1.25));
    b.pop();
    b.push().translate(0, 0.06, 1.93);
    b.box(1.8, 0.16, 0.12, trim);
    b.pop();
    // Tail lights, indicators and blank plates.
    const tail = pal('dirtTrack').clone().lerp(pal('dirtDark'), 0.3);
    const amber = pal('barkOchre');
    for (const x of [-0.68, 0.68]) {
      b.push().translate(x, 0.5, 1.86);
      b.box(0.14, 0.22, 0.05, tail);
      b.pop();
      b.push().translate(x * 1.04, 0.24, -1.88);
      b.box(0.12, 0.08, 0.05, amber);
      b.pop();
    }
    for (const z of [-2.06, 1.99]) {
      b.push().translate(0, 0.08, z);
      b.box(0.42, 0.13, 0.02, pal('vehicleRoof'));
      b.pop();
    }
    // Side steps and door seams.
    for (const x of [-0.86, 0.86]) {
      b.push().translate(x, -0.04, 0.05);
      b.box(0.14, 0.05, 1.1, trim);
      b.pop();
      b.push().translate(x * 0.96, 0.55, -0.5);
      b.box(0.02, 0.6, 0.03, trim);
      b.pop();
    }
    // Spare wheel on the back.
    b.push()
      .translate(0, 0.86, 2.05)
      .rotate(Math.PI / 2, 0, 0);
    b.cylinder(0.36, 0.36, 0.24, 12, trim, true, trim.clone().multiplyScalar(1.4));
    b.pop();
    // Wheel arch flares.
    for (const w of this.tuning.wheels) {
      b.push().translate(Math.sign(w.x) * 0.84, 0.5, w.z);
      b.box(0.1, 0.1, 0.95, trim);
      b.pop();
    }
    // Chassis rails and axles (seen when the car tips).
    b.push().translate(0, -0.08, 0);
    b.box(1.1, 0.14, 3.6, trim);
    b.pop();
    for (const z of [-this.tuning.wheels[2].z, this.tuning.wheels[2].z]) {
      b.push()
        .translate(0, -0.02, z)
        .rotate(0, 0, Math.PI / 2);
      b.cylinder(0.07, 0.07, 1.3, 6, trim);
      b.pop();
      b.push().translate(0, -0.02, z);
      b.blob(0.16, trim, 0.05);
      b.pop();
    }
    // Roof rack.
    for (const x of [-0.72, 0.72]) {
      b.push().translate(x, 1.62, 0.6);
      b.box(0.05, 0.05, 2.3, trim);
      b.pop();
    }
    for (const z of [-0.45, 0.25, 0.95, 1.65]) {
      b.push().translate(0, 1.6, z);
      b.box(1.5, 0.04, 0.05, trim);
      b.pop();
    }
    // Mirrors.
    for (const x of [-0.92, 0.92]) {
      b.push().translate(x, 1.0, -0.62);
      b.box(0.05, 0.14, 0.1, trim);
      b.pop();
    }
    return b;
  }

  private buildWheel(): MeshBuilder {
    const b = new MeshBuilder(3);
    const t = this.tuning;
    const tyre = pal('vehicleTrim');
    const rim = pal('vehicleRoof').clone().multiplyScalar(0.8);
    b.push().rotate(0, 0, Math.PI / 2);
    b.cylinder(t.wheelRadius, t.wheelRadius, t.wheelWidth, 12, tyre, true, tyre);
    b.pop();
    // Rim on the outer face (+x) and a few tread blocks.
    b.push()
      .translate(t.wheelWidth / 2 + 0.005, 0, 0)
      .rotate(0, 0, Math.PI / 2);
    b.cylinder(0.2, 0.22, 0.02, 8, rim, true, rim);
    b.pop();
    return b;
  }

  /** Show or hide planks on the roof rack. */
  setPlanksOnRack(count: number): void {
    this.rackPlanks.visible = count > 0;
  }

  update(v: Vehicle, alpha: number, dt: number): void {
    const p0 = v.prevPosition;
    const p1 = v.body.translation();
    this.root.position.set(
      p0.x + (p1.x - p0.x) * alpha,
      p0.y + (p1.y - p0.y) * alpha,
      p0.z + (p1.z - p0.z) * alpha,
    );
    const q = slerp(v.prevRotation, v.body.rotation(), alpha, this.tmpQ);
    this.root.quaternion.set(q.x, q.y, q.z, q.w);
    const t = this.tuning;
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i];
      const ww = this.wheels[i];
      ww.pivot.position.y = t.wheels[i].y - w.suspension + w.sink * 0.0;
      ww.pivot.rotation.y = -w.steer;
      // Extra spin when the wheel is spinning beyond grip.
      this.spinExtra[i] +=
        w.spin * dt * 25 * Math.sign(v.throttle > 0 ? (v.drivetrain.gear < 0 ? -1 : 1) : 0);
      ww.spin.rotation.x = -(w.rotation + this.spinExtra[i]);
    }
  }
}
