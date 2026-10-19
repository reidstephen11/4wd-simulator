import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { BodyZone, VehicleBuilder, VehicleMaterial as M, groupVehicleMaterials } from './vehicleGeometry';

/** Coil seats, as an offset across from each wheel and a height on the chassis. */
const COIL = { inboard: 0.24, top: 0.24, axleTop: 0.09 };

/** Unit-height coil spring along +y, stretched each frame to the gap it spans. */
function coilGeometry(steel: THREE.Color): THREE.BufferGeometry {
  const turns = 7,
    radius = 0.085,
    wire = 0.013;
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: turns * 12 + 1 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, i / (turns * 12) - 0.5, Math.sin(a) * radius);
    }),
  );
  const coil = new VehicleBuilder();
  coil.slot = M.Paint;
  coil.tag = BodyZone.Trim;
  coil.geometry(new THREE.TubeGeometry(curve, turns * 16, wire, 5, false), steel);
  const geometry = coil.build();
  groupVehicleMaterials(geometry);
  return geometry;
}

/**
 * Visible solid axles and telescoping dampers follow the four simulated wheel hubs. The
 * axles hang on leaf springs (short-wheelbase 4WD) or on coils with radius arms
 * (Land Rover).
 */
export class VehicleSuspension {
  readonly group = new THREE.Group();
  readonly axles: THREE.Mesh[] = [];
  private readonly layouts: { left: number; right: number; z: number }[] = [];
  private readonly shocks: THREE.Mesh[] = [];
  private readonly coils: THREE.Mesh[] = [];
  private readonly arms: { mesh: THREE.Mesh; wheel: number; chassis: THREE.Vector3; axle: THREE.Vector3 }[] =
    [];
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly tuning: VehicleTuning,
    materials: THREE.Material[],
    private readonly springs: 'leaf' | 'coil' = 'leaf',
  ) {
    const steel = new THREE.Color('#6D756D'),
      dark = new THREE.Color('#343C36');
    const hub = Math.max(...tuning.wheels.map((w) => Math.abs(w.x))) + 0.005;
    const axle = new VehicleBuilder();
    axle.rod({ x: -hub, y: 0, z: 0 }, { x: hub, y: 0, z: 0 }, 0.052, dark);
    axle.slot = M.Metal;
    axle.tag = BodyZone.Trim;
    axle.push().translate(0.08, 0, 0).scale(1, 0.8, 1);
    axle.geometry(new THREE.SphereGeometry(0.13, 16, 10), dark);
    axle.pop();
    axle.ring(0.08, 0, 0.09, 0.092, 0.008, steel);
    for (const side of springs === 'leaf' ? [-1, 1] : []) {
      for (let leaf = 0; leaf < 4; leaf++) {
        const length = 0.92 - leaf * 0.13;
        for (let k = 0; k < 7; k++) {
          const za = (k / 7 - 0.5) * length,
            zb = ((k + 1) / 7 - 0.5) * length;
          const ya = 0.035 + za * za * 0.35 - leaf * 0.012,
            yb = 0.035 + zb * zb * 0.35 - leaf * 0.012;
          axle.block(
            side * 0.48,
            (ya + yb) / 2,
            (za + zb) / 2,
            0.065,
            0.009,
            length / 7 + 0.004,
            dark,
            M.Metal,
            BodyZone.Trim,
          );
        }
      }
      for (const dz of [-0.075, 0.075])
        axle.rod(
          { x: side * 0.48 - 0.045, y: 0.09, z: dz },
          { x: side * 0.48 - 0.045, y: -0.065, z: dz },
          0.007,
          steel,
        );
    }
    const axleGeometry = axle.build();
    groupVehicleMaterials(axleGeometry);
    for (const front of [true, false]) {
      const indices = tuning.wheels.map((w, i) => ({ w, i })).filter(({ w }) => w.front === front);
      const left = indices.find(({ w }) => w.x < 0)!,
        right = indices.find(({ w }) => w.x > 0)!;
      this.layouts.push({ left: left.i, right: right.i, z: left.w.z });
      const mesh = new THREE.Mesh(axleGeometry, materials);
      mesh.name = front ? 'front-solid-axle' : 'rear-solid-axle';
      mesh.castShadow = true;
      this.axles.push(mesh);
      this.group.add(mesh);
    }
    const damper = new VehicleBuilder();
    damper.rod({ x: 0, y: -0.5, z: 0 }, { x: 0, y: 0.16, z: 0 }, 0.012, steel);
    damper.rod({ x: 0, y: -0.05, z: 0 }, { x: 0, y: 0.5, z: 0 }, 0.026, new THREE.Color('#B59B4D'), M.Paint);
    const geometry = damper.build();
    groupVehicleMaterials(geometry);
    for (let i = 0; i < tuning.wheels.length; i++) {
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = `damper-${i}`;
      this.shocks.push(mesh);
      this.group.add(mesh);
    }
    if (springs === 'coil') {
      const spring = coilGeometry(new THREE.Color('#3E4A3B'));
      const arm = new VehicleBuilder();
      arm.rod({ x: 0, y: -0.5, z: 0 }, { x: 0, y: 0.5, z: 0 }, 0.03, dark);
      const armGeometry = arm.build();
      groupVehicleMaterials(armGeometry);
      for (let i = 0; i < tuning.wheels.length; i++) {
        const w = tuning.wheels[i],
          side = Math.sign(w.x);
        const coil = new THREE.Mesh(spring, materials);
        coil.name = `coil-${i}`;
        coil.castShadow = true;
        this.coils.push(coil);
        this.group.add(coil);
        // Radius arms (front) and trailing links (rear) run forward or back to the chassis.
        const toward = w.front ? 1 : -1;
        for (const [ax, cx, len] of [
          [0.5, 0.42, 0.95],
          ...(w.front ? [] : ([[0.18, 0.12, 0.7]] as const)),
        ] as const) {
          const mesh = new THREE.Mesh(armGeometry, materials);
          this.arms.push({
            mesh,
            wheel: i,
            chassis: new THREE.Vector3(side * cx, -0.02, w.z + toward * len),
            axle: new THREE.Vector3(side * ax, -0.06, w.z),
          });
          this.group.add(mesh);
        }
      }
    }
  }

  update(wheelHeights: readonly number[]): void {
    for (let i = 0; i < this.layouts.length; i++) {
      const layout = this.layouts[i];
      const left = wheelHeights[layout.left],
        right = wheelHeights[layout.right];
      const span = this.tuning.wheels[layout.right].x - this.tuning.wheels[layout.left].x;
      this.axles[i].position.set(0, (left + right) / 2, layout.z);
      this.axles[i].rotation.z = Math.atan2(right - left, span);
    }
    for (let i = 0; i < this.shocks.length; i++) {
      const wheel = this.tuning.wheels[i],
        side = Math.sign(wheel.x);
      if (this.springs === 'leaf') {
        this.from.set(side * 0.54, 0.34, wheel.z + 0.23);
        this.to.set(side * 0.63, wheelHeights[i] + 0.045, wheel.z + 0.05);
      } else {
        // Dampers stand just behind (front) or ahead of (rear) the coils.
        const dz = wheel.front ? 0.16 : -0.16;
        this.from.set(side * (Math.abs(wheel.x) - COIL.inboard + 0.02), COIL.top + 0.08, wheel.z + dz);
        this.to.set(side * (Math.abs(wheel.x) - COIL.inboard + 0.04), wheelHeights[i] + 0.03, wheel.z + dz);
      }
      this.stretch(this.shocks[i], this.from, this.to);
    }
    for (let i = 0; i < this.coils.length; i++) {
      const wheel = this.tuning.wheels[i],
        x = Math.sign(wheel.x) * (Math.abs(wheel.x) - COIL.inboard);
      this.from.set(x, COIL.top, wheel.z);
      this.to.set(x, wheelHeights[i] + COIL.axleTop, wheel.z);
      this.stretch(this.coils[i], this.from, this.to);
    }
    for (const arm of this.arms) {
      this.to.copy(arm.axle);
      this.to.y += wheelHeights[arm.wheel];
      this.stretch(arm.mesh, arm.chassis, this.to);
    }
  }

  /** Place a unit-height part along +y so it spans `a` to `b`. */
  private stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    this.delta.copy(b).sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(1, this.delta.length(), 1);
    mesh.quaternion.setFromUnitVectors(this.up, this.delta.normalize());
  }
}
