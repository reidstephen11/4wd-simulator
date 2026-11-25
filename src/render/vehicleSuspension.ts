import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import { solidAxlePose } from '../sim/vehicle/solidAxle';
import { BodyZone, VehicleBuilder, VehicleMaterial as M, groupVehicleMaterials } from './vehicleGeometry';

/** Coil seats, as an offset across from each wheel and a height on the chassis. */
const COIL = { inboard: 0.24, top: 0.24, axleTop: 0.09 };

/** Height of a leaf-sprung shock's top eye. */
function leafTop(layout: SuspensionLayout, front: boolean): number {
  return layout.leafShockTop ? (front ? layout.leafShockTop.front : layout.leafShockTop.rear) : 0.34;
}

/** Placement for a vehicle whose wide tyres need a different spring and link envelope. */
export interface SuspensionLayout {
  coilInboard: number;
  radiusArmAxleX: number;
  radiusArmChassisX: number;
  rearDamperOffset: number;
  /**
   * Leaf springs only: the height of each shock's top eye when the body gives it somewhere to
   * hang (an inner wing, a wheel tub). The shock then ends in a bracket there, where it would
   * otherwise hang from a tower of two braces off the chassis rail, whose top stands in the
   * open arch.
   */
  leafShockTop?: {
    front: number;
    rear: number;
    /** Where its lower eye is on the axle, out from the centre. */ axleX: number;
  };
}
export const DEFAULT_LAYOUT: SuspensionLayout = {
  coilInboard: COIL.inboard,
  radiusArmAxleX: 0.5,
  radiusArmChassisX: 0.42,
  rearDamperOffset: 0.02,
};

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
  readonly hubs: THREE.Vector3[];
  readonly rolls: number[];
  private readonly axleOf: number[];
  private readonly poses: ReturnType<typeof solidAxlePose>[] = [];
  private readonly layouts: { left: number; right: number; z: number }[] = [];
  private readonly shocks: THREE.Mesh[] = [];
  private readonly leaves: {
    mesh: THREE.Mesh;
    base: Float32Array;
    parked: number;
    lastY: number;
    lastSin: number;
  }[] = [];
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
    private readonly layout: SuspensionLayout = DEFAULT_LAYOUT,
  ) {
    this.hubs = tuning.wheels.map(() => new THREE.Vector3());
    this.rolls = tuning.wheels.map(() => 0);
    this.axleOf = tuning.wheels.map(() => 0);
    const steel = new THREE.Color('#6D756D'),
      dark = new THREE.Color('#343C36');
    const hub =
      (tuning.drawnWheels?.halfTrack ?? Math.max(...tuning.wheels.map((w) => Math.abs(w.x)))) + 0.005;
    const axle = new VehicleBuilder();
    axle.rod({ x: -hub, y: 0, z: 0 }, { x: hub, y: 0, z: 0 }, 0.052, dark);
    axle.slot = M.Metal;
    axle.tag = BodyZone.Trim;
    axle.push().translate(0.08, 0, 0).scale(1, 0.8, 1);
    axle.geometry(new THREE.SphereGeometry(0.13, 16, 10), dark);
    axle.pop();
    axle.ring(0.08, 0, 0.09, 0.092, 0.008, steel);
    const leaves = new VehicleBuilder();
    for (const side of springs === 'leaf' ? [-1, 1] : []) {
      for (let leaf = 0; leaf < 4; leaf++) {
        const length = 0.92 - leaf * 0.13;
        for (let k = 0; k < 7; k++) {
          const za = (k / 7 - 0.5) * length,
            zb = ((k + 1) / 7 - 0.5) * length;
          const ya = 0.035 + za * za * 0.35 - leaf * 0.012,
            yb = 0.035 + zb * zb * 0.35 - leaf * 0.012;
          leaves.block(
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
      // Hanger rods just inboard of each spring, mirrored side to side.
      for (const dz of [-0.075, 0.075])
        axle.rod(
          { x: side * (0.48 - 0.045), y: 0.09, z: dz },
          { x: side * (0.48 - 0.045), y: -0.065, z: dz },
          0.007,
          steel,
        );
    }
    const leafGeometry = springs === 'leaf' ? leaves.build() : null;
    if (leafGeometry) groupVehicleMaterials(leafGeometry);
    const axleGeometry = axle.build();
    groupVehicleMaterials(axleGeometry);
    for (const front of [true, false]) {
      const indices = tuning.wheels.map((w, i) => ({ w, i })).filter(({ w }) => w.front === front);
      const left = indices.find(({ w }) => w.x < 0)!,
        right = indices.find(({ w }) => w.x > 0)!;
      this.axleOf[left.i] = this.axleOf[right.i] = this.layouts.length;
      this.poses.push(solidAxlePose(right.w.x - left.w.x, 0, 0));
      this.layouts.push({ left: left.i, right: right.i, z: left.w.z });
      const mesh = new THREE.Mesh(axleGeometry, materials);
      mesh.name = front ? 'front-solid-axle' : 'rear-solid-axle';
      mesh.castShadow = true;
      mesh.scale.x = (tuning.drawnWheels?.halfTrack ?? (right.w.x - left.w.x) / 2) / (hub - 0.005);
      this.axles.push(mesh);
      this.group.add(mesh);
      if (leafGeometry) {
        const geometry = leafGeometry.clone();
        const spring = new THREE.Mesh(geometry, materials);
        spring.name = front ? 'front-leaf-springs' : 'rear-leaf-springs';
        spring.castShadow = true;
        spring.position.z = left.w.z;
        const parked = left.w.y - tuning.suspensionRestLength + 9.81 / (4 * tuning.springStiffness);
        this.leaves.push({
          mesh: spring,
          base: Float32Array.from(geometry.getAttribute('position').array),
          parked,
          lastY: NaN,
          lastSin: NaN,
        });
        this.group.add(spring);
        const hangers = new VehicleBuilder();
        for (const x of [-0.48, 0.48])
          for (const z of [-0.46, 0.46]) {
            hangers.rod({ x, y: 0.12, z }, { x, y: parked + 0.035 + z * z * 0.35, z }, 0.014, steel);
          }
        const hangerGeometry = hangers.build();
        groupVehicleMaterials(hangerGeometry);
        const hanger = new THREE.Mesh(hangerGeometry, materials);
        hanger.position.z = left.w.z;
        this.group.add(hanger);
      }
    }
    leafGeometry?.dispose();
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
    // Upper shock eyes and coil seats need visible chassis brackets as well as a
    // numerical anchor. Keep them fixed while their lower ends move with the axle.
    const mounts = new VehicleBuilder();
    for (const w of tuning.wheels) {
      const side = Math.sign(w.x);
      const dz = w.front ? 0.16 : -0.16;
      const offset = w.front ? 0.02 : layout.rearDamperOffset;
      const top =
        springs === 'leaf'
          ? { x: side * 0.54, y: leafTop(layout, w.front), z: w.z + 0.23 }
          : { x: side * (Math.abs(w.x) - layout.coilInboard + offset), y: COIL.top + 0.08, z: w.z + dz };
      if (springs === 'leaf' && layout.leafShockTop)
        mounts.block(top.x, top.y + 0.02, top.z, 0.07, 0.05, 0.07, dark, M.Metal, BodyZone.Trim);
      else
        for (const brace of [-0.08, 0.08])
          mounts.rod({ x: side * 0.47, y: 0.07, z: top.z + brace }, top, 0.018, steel);
      if (springs === 'coil') {
        const x = side * (Math.abs(w.x) - layout.coilInboard);
        mounts.block(x, COIL.top + 0.01, w.z, 0.2, 0.02, 0.2, dark, M.Metal, BodyZone.Trim);
        mounts.rod({ x: side * 0.47, y: 0.07, z: w.z }, { x, y: COIL.top + 0.02, z: w.z }, 0.025, steel);
      }
    }
    const mountGeometry = mounts.build();
    groupVehicleMaterials(mountGeometry);
    const mountMesh = new THREE.Mesh(mountGeometry, materials);
    mountMesh.name = 'chassis-suspension-mounts';
    this.group.add(mountMesh);
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
          [layout.radiusArmAxleX, layout.radiusArmChassisX, 0.95],
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
      const pose = solidAxlePose(span, left, right);
      this.poses[i] = pose;
      this.axles[i].position.set(0, pose.y, layout.z);
      this.axles[i].rotation.z = pose.roll;
      for (const w of [layout.left, layout.right]) {
        const x = this.tuning.drawnWheels
          ? Math.sign(this.tuning.wheels[w].x) * this.tuning.drawnWheels.halfTrack
          : this.tuning.wheels[w].x;
        this.hubs[w].set(x * pose.cos, pose.y + x * pose.sin, this.tuning.wheels[w].z);
        this.rolls[w] = pose.roll;
      }
    }
    for (let i = 0; i < this.leaves.length; i++) {
      const leaf = this.leaves[i];
      const { mesh, base, parked } = leaf;
      const p = this.poses[i];
      if (Math.abs(p.y - leaf.lastY) < 0.00001 && Math.abs(p.sin - leaf.lastSin) < 0.00001) continue;
      leaf.lastY = p.y;
      leaf.lastSin = p.sin;
      const position = mesh.geometry.getAttribute('position');
      for (let v = 0; v < position.count; v++) {
        const x = base[v * 3],
          y = base[v * 3 + 1],
          z = base[v * 3 + 2];
        // The main leaf's eyes stay on their chassis hangers. Its centre follows the
        // spring seat on the axle; the shorter leaves bend with the main leaf.
        const bend = Math.max(0, 1 - (z / 0.46) ** 2);
        position.setXYZ(
          v,
          x + (x * p.cos - y * p.sin - x) * bend,
          y + parked + (p.y + x * p.sin + y * p.cos - y - parked) * bend,
          z,
        );
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    for (let i = 0; i < this.shocks.length; i++) {
      const wheel = this.tuning.wheels[i],
        side = Math.sign(wheel.x);
      if (this.springs === 'leaf') {
        this.from.set(side * 0.54, leafTop(this.layout, wheel.front), wheel.z + 0.23);
        // 0.63 m out is inside a tyre whose inner face is at 0.595 m; a layout can bring it in.
        this.axlePoint(i, side * (this.layout.leafShockTop?.axleX ?? 0.63), 0.045, wheel.z + 0.05);
      } else {
        // Dampers stand just behind (front) or ahead of (rear) the coils.
        const dz = wheel.front ? 0.16 : -0.16;
        const offset = wheel.front ? 0.02 : this.layout.rearDamperOffset;
        this.from.set(
          side * (Math.abs(wheel.x) - this.layout.coilInboard + offset),
          COIL.top + 0.08,
          wheel.z + dz,
        );
        this.axlePoint(
          i,
          side * (Math.abs(wheel.x) - this.layout.coilInboard + offset + 0.02),
          0.03,
          wheel.z + dz,
        );
      }
      this.stretch(this.shocks[i], this.from, this.to);
    }
    for (let i = 0; i < this.coils.length; i++) {
      const wheel = this.tuning.wheels[i],
        x = Math.sign(wheel.x) * (Math.abs(wheel.x) - this.layout.coilInboard);
      this.from.set(x, COIL.top, wheel.z);
      this.axlePoint(i, x, COIL.axleTop, wheel.z);
      this.stretch(this.coils[i], this.from, this.to);
    }
    for (const arm of this.arms) {
      this.axlePoint(arm.wheel, arm.axle.x, arm.axle.y, arm.axle.z);
      this.stretch(arm.mesh, arm.chassis, this.to);
    }
  }

  /** A spring, shock or link attaches to the beam, inboard of its hub. */
  private axlePoint(wheel: number, x: number, y: number, z: number): void {
    const p = this.poses[this.axleOf[wheel]];
    this.to.set(x * p.cos - y * p.sin, p.y + x * p.sin + y * p.cos, z);
  }

  /** Place a unit-height part along +y so it spans `a` to `b`. */
  private stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    this.delta.copy(b).sub(a);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(1, this.delta.length(), 1);
    mesh.quaternion.setFromUnitVectors(this.up, this.delta.normalize());
  }
}
