import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { groupVehicleMaterials, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** Dial centres on the instrument panel, facing the driver (+z). */
export const DIAL_Y = 0.88;
export const DIAL_Z = -0.322;
/** Needles sweep 270° clockwise (as the driver sees it) from lower left; 0 = straight up. */
export const DIAL_SWEEP = Math.PI * 1.5;
export const DIAL_START = -DIAL_SWEEP / 2;
export const dashDials = {
  /** Speedometer, 0–140 km/h. */
  speed: { x: 0.36, radius: 0.068, max: 140, major: 20, minor: 10 },
  /** Tachometer, 0–5000 rpm, red from the redline. */
  rpm: { x: 0.215, radius: 0.039, max: 5000, major: 1000, minor: 500 },
  /** Oil pressure, low to high; nothing with the engine stalled. */
  oil: { x: 0.5, radius: 0.039, max: 1, major: 0.5, minor: 0.25 },
} as const;

/** Steering wheel centre and the column it sits on (right-hand drive). */
export const steeringWheel = {
  centre: { x: 0.38, y: 0.93, z: -0.08 },
  columnBase: { x: 0.38, y: 0.68, z: -0.46 },
  radius: 0.19,
  /** Steering-wheel turn per degree at the front wheels: full lock is about 1¼ turns. */
  ratio: 13,
};

/** Seconds for a needle to settle (they lag a little, like real gauges). */
const NEEDLE_LAG = { speed: 0.15, rpm: 0.1, oil: 0.45 };

/** Point on a dial face at `angle` (0 = up, clockwise as the driver sees it). */
export function dialPoint(x: number, radius: number, angle: number, z = DIAL_Z) {
  return { x: x + Math.sin(angle) * radius, y: DIAL_Y + Math.cos(angle) * radius, z };
}

const ivory = new THREE.Color('#E9E4CB'),
  dark = new THREE.Color('#1E2320'),
  metal = new THREE.Color('#A3A79F');

interface Lamp {
  material: THREE.MeshStandardMaterial;
  on: (v: Vehicle) => boolean;
}

/**
 * The parts of the cabin that move: the steering wheel turns with the front wheels,
 * the needles follow road speed, engine revs and oil pressure, and the warning lamps
 * show low range, the lockers, crawl control and a stalled engine.
 */
export class VehicleInstruments {
  readonly group = new THREE.Group();
  /** Turns about its local z, which runs up the column towards the driver. */
  readonly wheel = new THREE.Group();
  readonly needles: Record<keyof typeof dashDials, THREE.Group>;
  private readonly values = { speed: 0, rpm: 0, oil: 0 };
  private readonly lamps: Lamp[] = [];

  constructor(
    private readonly tuning: VehicleTuning,
    materials: THREE.Material[],
  ) {
    this.group.name = 'instruments';
    const c = steeringWheel.centre,
      base = steeringWheel.columnBase;
    // Local +z runs up the column towards the driver, so the rim faces them.
    const mount = new THREE.Group();
    mount.position.set(c.x, c.y, c.z);
    mount.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(c.x - base.x, c.y - base.y, c.z - base.z).normalize(),
    );
    const wheelMesh = new THREE.Mesh(buildSteeringWheel(), materials);
    wheelMesh.castShadow = true;
    this.wheel.add(wheelMesh);
    mount.add(this.wheel);
    this.group.add(mount);

    const needle = (dial: (typeof dashDials)[keyof typeof dashDials]) => {
      const pivot = new THREE.Group();
      pivot.position.set(dial.x, DIAL_Y, DIAL_Z + 0.012);
      const mesh = new THREE.Mesh(buildNeedle(dial.radius), materials);
      pivot.add(mesh);
      this.group.add(pivot);
      return pivot;
    };
    this.needles = { speed: needle(dashDials.speed), rpm: needle(dashDials.rpm), oil: needle(dashDials.oil) };

    const lampGeometry = new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12).rotateX(Math.PI / 2);
    const lamp = (x: number, hex: string, on: Lamp['on']) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).multiplyScalar(0.12),
        emissive: hex,
        emissiveIntensity: 0,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(lampGeometry, material);
      mesh.position.set(x, 0.795, -0.33);
      this.group.add(mesh);
      this.lamps.push({ material, on });
    };
    lamp(0.22, '#E89A2C', (v) => v.drivetrain.range === 'low');
    lamp(0.29, '#E89A2C', (v) => v.differentials.front);
    lamp(0.36, '#E89A2C', (v) => v.differentials.rear);
    lamp(0.43, '#6FCB5A', (v) => v.precisionCrawl);
    lamp(0.5, '#E2402F', (v) => !v.drivetrain.engineRunning);
  }

  update(v: Vehicle, dt: number): void {
    let front = 0;
    for (let i = 0; i < 4; i++) if (this.tuning.wheels[i].front) front += v.wheels[i].steer / 2;
    // A right turn winds the wheel clockwise as the driver sees it.
    this.wheel.rotation.z = -front * steeringWheel.ratio;

    const running = v.drivetrain.engineRunning;
    const target = {
      speed: Math.abs(v.speed) * 3.6,
      rpm: running ? v.drivetrain.rpm : 0,
      oil: running ? Math.min(1, 0.3 + (0.6 * v.drivetrain.rpm) / this.tuning.engine.redlineRpm) : 0,
    };
    for (const key of ['speed', 'rpm', 'oil'] as const) {
      this.values[key] += (target[key] - this.values[key]) * Math.min(1, dt / NEEDLE_LAG[key]);
      const dial = dashDials[key];
      const angle = DIAL_START + DIAL_SWEEP * Math.min(1.02, Math.max(0, this.values[key] / dial.max));
      this.needles[key].rotation.z = -angle;
    }
    for (const lamp of this.lamps) lamp.material.emissiveIntensity = lamp.on(v) ? 1.6 : 0;
  }
}

/** A thin black rim on three brushed spokes (left, right and down) with a horn boss. */
function buildSteeringWheel(): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = steeringWheel.radius;
  b.ring(0, 0, 0, r, 0.014, dark, M.Rubber);
  for (const angle of [Math.PI * 0.56, -Math.PI * 0.56, Math.PI]) {
    // Spokes dip slightly towards the column, like a shallow dish.
    b.rod(
      { x: Math.sin(angle) * 0.045, y: Math.cos(angle) * 0.045, z: -0.012 },
      { x: Math.sin(angle) * (r - 0.008), y: Math.cos(angle) * (r - 0.008), z: 0 },
      0.007,
      metal,
    );
  }
  b.slot = M.Rubber;
  b.push().rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.05, 0.056, 0.035, 20), dark);
  b.pop();
  b.slot = M.Metal;
  b.push()
    .translate(0, 0, 0.019)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 16), metal);
  b.pop();
  const geometry = b.build();
  groupVehicleMaterials(geometry);
  return geometry;
}

/** A tapered ivory needle pointing up from its pivot, with a short tail and a dark cap. */
function buildNeedle(radius: number): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const length = radius * 0.86,
    tail = radius * 0.18,
    w = Math.max(0.0024, radius * 0.06);
  b.slot = M.Lamp;
  b.tri({ x: -w / 2, y: -tail, z: 0 }, { x: w / 2, y: -tail, z: 0 }, { x: 0, y: length, z: 0 }, ivory);
  b.slot = M.Rubber;
  b.push()
    .translate(0, 0, 0.002)
    .rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(w * 1.6, w * 1.6, 0.004, 10), dark);
  b.pop();
  const geometry = b.build();
  groupVehicleMaterials(geometry);
  return geometry;
}
