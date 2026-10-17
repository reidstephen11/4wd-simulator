import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { slerp } from '../sim/vehicle/math';
import type { VehicleCondition } from '../sim/vehicle/condition';
import { hash2 } from '../sim/world/rng';
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
  readonly bodyMaterial: THREE.MeshPhysicalMaterial;
  private readonly tmpQ = { x: 0, y: 0, z: 0, w: 1 };
  private readonly wheelGeo: THREE.BufferGeometry;
  private readonly basePos: Float32Array;
  private readonly baseCol: Float32Array;
  private readonly wheelBaseCol: Float32Array;
  private readonly dirtWeight: Float32Array;
  private lastDirtKey = '';
  private lastDentKey = '';
  /** Extra visual wheel spin from wheelspin (rad). */
  private readonly spinExtra = [0, 0, 0, 0];

  constructor(private readonly tuning: VehicleTuning) {
    this.bodyMaterial = patchFog(
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.16,
        clearcoat: 0.65,
        clearcoatRoughness: 0.28,
      }),
    );
    const trimMaterial = patchFog(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.25 }),
    );
    const glassMaterial = patchFog(
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, clearcoat: 1 }),
    );
    const bodyGeometry = this.buildBody().build(true);
    this.groupByTag(bodyGeometry, (tag) => (tag === BodyZone.Glass ? 2 : tag === BodyZone.Trim ? 1 : 0), 3);
    this.body = new THREE.Mesh(bodyGeometry, [this.bodyMaterial, trimMaterial, glassMaterial]);
    const bg = this.body.geometry;
    this.basePos = Float32Array.from(bg.getAttribute('position').array as Float32Array);
    this.baseCol = Float32Array.from(bg.getAttribute('color').array as Float32Array);
    // Dirt collects low down and in patches.
    this.dirtWeight = new Float32Array(this.basePos.length / 3);
    for (let i = 0; i < this.dirtWeight.length; i++) {
      const y = this.basePos[i * 3 + 1];
      const patch = hash2(Math.floor(this.basePos[i * 3] * 4), Math.floor(this.basePos[i * 3 + 2] * 4), 5);
      this.dirtWeight[i] = Math.min(1, Math.max(0.1, 1.15 - (y + 0.1) / 1.4) * (0.65 + 0.5 * patch));
    }
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
    this.rackPlanks = new THREE.Mesh(
      planks.build(),
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
    );
    this.rackPlanks.castShadow = true;
    this.bodyGroup.add(this.rackPlanks);

    const wheelGeo = this.buildWheel().build(true);
    this.groupByTag(wheelGeo, (tag) => tag, 2);
    this.wheelGeo = wheelGeo;
    this.wheelBaseCol = Float32Array.from(wheelGeo.getAttribute('color').array as Float32Array);
    const wheelMat = [
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 })),
      patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.65 })),
    ];
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
    b.vary = false;
    const body = pal('vehicleBody');
    const roof = pal('vehicleRoof');
    const trim = pal('vehicleTrim');
    const glass = pal('vehicleTrim').clone().lerp(pal('waterDeep'), 0.65);
    const lamp = pal('vehicleRoof')
      .clone()
      .lerp(new THREE.Color(1, 0.95, 0.8), 0.4);
    // Lower body tub (subdivided so dents have vertices to push). Lower between the
    // axles, higher over the front and rear overhangs.
    b.tag = BodyZone.Sides;
    b.push().translate(0, 0.3, 0);
    b.box(1.64, 0.72, 2.3, body, [6, 3, 9]);
    b.pop();
    b.tag = BodyZone.Front;
    b.push().translate(0, 0.42, -1.5);
    b.box(1.64, 0.48, 0.72, body, [6, 2, 3]);
    b.pop();
    b.tag = BodyZone.Rear;
    b.push().translate(0, 0.42, 1.5);
    b.box(1.64, 0.48, 0.72, body, [6, 2, 3]);
    b.pop();
    b.tag = BodyZone.Front;
    // Bonnet (front, flat).
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
      b.cylinder(0.12, 0.12, 0.06, 24, trim, true, lamp);
      b.pop();
    }
    for (let x = -0.25; x <= 0.26; x += 0.085) {
      b.push().translate(x, 0.44, -1.906);
      b.box(0.025, 0.26, 0.025, roof.clone().multiplyScalar(0.65));
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
    b.push().translate(0, 0.24, -1.97);
    b.box(1.84, 0.18, 0.16, trim);
    b.pop();
    b.push().translate(0, 0.33, -2.0);
    b.box(0.56, 0.2, 0.2, trim.clone().multiplyScalar(1.25));
    b.pop();
    b.push().translate(0, 0.24, 1.93);
    b.box(1.8, 0.16, 0.12, trim);
    b.pop();
    // Tail lights, indicators and blank plates.
    const tail = pal('dirtTrack').clone().lerp(pal('dirtDark'), 0.3);
    const amber = pal('barkOchre');
    for (const x of [-0.68, 0.68]) {
      b.push().translate(x, 0.5, 1.86);
      b.box(0.14, 0.22, 0.05, tail);
      b.pop();
      b.push().translate(x * 1.04, 0.36, -1.88);
      b.box(0.12, 0.08, 0.05, amber);
      b.pop();
    }
    for (const z of [-2.06, 1.99]) {
      b.push().translate(0, 0.26, z);
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
    b.cylinder(0.36, 0.36, 0.24, 32, trim, true, trim.clone().multiplyScalar(1.4));
    b.pop();
    // Wheel arch flares.
    for (const w of this.tuning.wheels) {
      b.push().translate(Math.sign(w.x) * 0.84, 0.5, w.z);
      b.box(0.1, 0.1, 0.95, trim);
      b.pop();
    }
    // Door hardware, windscreen seals, wipers and a spare with a visible steel rim.
    for (const side of [-1, 1]) {
      b.push().translate(side * 0.826, 0.82, 0.33);
      b.box(0.035, 0.045, 0.18, trim);
      b.pop();
      for (const y of [0.37, 0.68]) {
        b.push().translate(side * 0.83, y, -0.48);
        b.box(0.035, 0.055, 0.12, roof);
        b.pop();
      }
      b.push()
        .translate(side * 0.37, 0.87, -0.71)
        .rotate(0, 0, side * 0.35);
      b.box(0.42, 0.018, 0.025, trim);
      b.pop();
      b.push().translate(side * 0.62, 1.16, 1.862);
      b.box(0.022, 0.45, 0.025, trim);
      b.pop();
    }
    b.push()
      .translate(0, 0.86, 2.182)
      .rotate(Math.PI / 2, 0, 0);
    b.cylinder(0.22, 0.22, 0.025, 24, roof, true, roof);
    b.pop();
    b.push()
      .translate(0, 0.86, 2.202)
      .rotate(Math.PI / 2, 0, 0);
    b.cylinder(0.075, 0.075, 0.04, 16, trim);
    b.pop();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      b.push()
        .translate(Math.cos(a) * 0.355, 0.86 + Math.sin(a) * 0.355, 2.05)
        .rotate(0, 0, a);
      b.box(0.035, 0.062, 0.25, trim);
      b.pop();
    }
    // Chassis rails and axles (seen when the car tips).
    b.push().translate(0, -0.06, 0);
    b.box(1.1, 0.14, 2.7, trim);
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
    b.vary = false;
    const t = this.tuning;
    const tyre = pal('vehicleTrim').clone().multiplyScalar(0.65);
    const rim = pal('vehicleRoof').clone().multiplyScalar(0.8);
    b.push().rotate(0, 0, Math.PI / 2);
    b.cylinder(t.wheelRadius * 0.97, t.wheelRadius * 0.97, t.wheelWidth, 32, tyre, true, tyre);
    b.pop();
    // Two rows of staggered off-road tread blocks.
    for (let i = 0; i < 28; i++) {
      for (const side of [-1, 1]) {
        const a = ((i + (side > 0 ? 0.4 : 0)) / 28) * Math.PI * 2;
        b.push()
          .translate(side * t.wheelWidth * 0.25, Math.cos(a) * t.wheelRadius, Math.sin(a) * t.wheelRadius)
          .rotate(a, side * 0.18, 0);
        b.box(t.wheelWidth * 0.47, 0.045, 0.065, tyre);
        b.pop();
      }
    }
    b.tag = 1;
    b.push()
      .translate(t.wheelWidth / 2 + 0.008, 0, 0)
      .rotate(0, 0, -Math.PI / 2);
    b.cylinder(0.2, 0.22, 0.028, 24, rim, true, rim);
    b.pop();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.push()
        .translate(t.wheelWidth / 2 + 0.03, Math.cos(a) * 0.11, Math.sin(a) * 0.11)
        .rotate(0, 0, -Math.PI / 2);
      b.cylinder(0.019, 0.019, 0.02, 6, tyre);
      b.pop();
    }
    return b;
  }

  /** Group indexed triangles without moving the vertices used by dirt and dents. */
  private groupByTag(
    geometry: THREE.BufferGeometry,
    materialFor: (tag: number) => number,
    count: number,
  ): void {
    const tags = geometry.getAttribute('tag');
    const indices: number[] = [];
    for (let m = 0; m < count; m++) {
      const start = indices.length;
      for (let i = 0; i < tags.count; i += 3) {
        if (materialFor(tags.getX(i)) === m) indices.push(i, i + 1, i + 2);
      }
      geometry.addGroup(start, indices.length - start, m);
    }
    geometry.setIndex(indices);
  }

  /** Blend in dirt and push in dents from the vehicle's condition (cheap when unchanged). */
  applyCondition(c: VehicleCondition): void {
    const d = c.dirt;
    const dirtKey = [d.front, d.sides, d.rear, d.wheels, c.mudShare].map((x) => Math.round(x * 50)).join(',');
    if (dirtKey !== this.lastDirtKey) {
      this.lastDirtKey = dirtKey;
      const dirtCol = pal('dirtTrack').clone().lerp(pal('mud'), c.mudShare);
      const col = this.body.geometry.getAttribute('color') as THREE.BufferAttribute;
      const tags = this.body.geometry.getAttribute('tag') as THREE.BufferAttribute;
      const arr = col.array as Float32Array;
      const avg = (d.front + d.sides + d.rear) / 3;
      for (let i = 0; i < col.count; i++) {
        const tag = tags.getX(i);
        const level =
          tag === BodyZone.Front
            ? d.front
            : tag === BodyZone.Rear
              ? d.rear
              : tag === BodyZone.Roof
                ? d.sides * 0.25
                : tag === BodyZone.Glass
                  ? avg * 0.45
                  : tag === BodyZone.Trim
                    ? avg * 0.8
                    : d.sides;
        const k = Math.min(0.85, level * this.dirtWeight[i]);
        arr[i * 3] = this.baseCol[i * 3] + (dirtCol.r - this.baseCol[i * 3]) * k;
        arr[i * 3 + 1] = this.baseCol[i * 3 + 1] + (dirtCol.g - this.baseCol[i * 3 + 1]) * k;
        arr[i * 3 + 2] = this.baseCol[i * 3 + 2] + (dirtCol.b - this.baseCol[i * 3 + 2]) * k;
      }
      col.needsUpdate = true;
      const wcol = this.wheelGeo.getAttribute('color') as THREE.BufferAttribute;
      const warr = wcol.array as Float32Array;
      const kw = Math.min(0.8, d.wheels * 0.8);
      for (let i = 0; i < warr.length; i += 3) {
        warr[i] = this.wheelBaseCol[i] + (dirtCol.r - this.wheelBaseCol[i]) * kw;
        warr[i + 1] = this.wheelBaseCol[i + 1] + (dirtCol.g - this.wheelBaseCol[i + 1]) * kw;
        warr[i + 2] = this.wheelBaseCol[i + 2] + (dirtCol.b - this.wheelBaseCol[i + 2]) * kw;
      }
      wcol.needsUpdate = true;
    }
    const dentKey = c.dents.map((x) => `${x.x.toFixed(2)}${x.z.toFixed(2)}${x.depth.toFixed(3)}`).join('|');
    if (dentKey !== this.lastDentKey) {
      this.lastDentKey = dentKey;
      const pos = this.body.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      arr.set(this.basePos);
      for (const dent of c.dents) {
        const r2 = dent.radius * dent.radius;
        for (let i = 0; i < arr.length; i += 3) {
          const dx = this.basePos[i] - dent.x;
          const dy = this.basePos[i + 1] - dent.y;
          const dz = this.basePos[i + 2] - dent.z;
          const q = (dx * dx + dy * dy + dz * dz) / r2;
          if (q >= 1) continue;
          const f = dent.depth * (1 - q) * (1 - q);
          arr[i] += dent.nx * f;
          arr[i + 1] += dent.ny * f;
          arr[i + 2] += dent.nz * f;
        }
      }
      pos.needsUpdate = true;
      this.body.geometry.computeVertexNormals();
    }
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
