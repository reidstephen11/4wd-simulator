import * as THREE from 'three';
import type { VehicleTuning } from '../data/vehicle';
import type { CabinLayout, DialLayout } from '../data/vehicles';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { BodyZone, groupVehicleMaterials, VehicleBuilder, VehicleMaterial as M } from './vehicleGeometry';

/** Needles sweep 270° clockwise (as the driver sees it) from lower left; 0 = straight up. */
export const DIAL_SWEEP = Math.PI * 1.5;
export const DIAL_START = -DIAL_SWEEP / 2;

/** Seconds for a needle to settle (they lag a little, like real gauges). */
const NEEDLE_LAG = { speed: 0.15, rpm: 0.1, oil: 0.45 };

/** Point on a dial face at `angle` (0 = up, clockwise as the driver sees it). */
export function dialPoint(cabin: CabinLayout, x: number, radius: number, angle: number, z = cabin.dialZ) {
  return { x: x + Math.sin(angle) * radius, y: cabin.dialY + Math.cos(angle) * radius, z };
}

const faceDark = new THREE.Color('#343B37'),
  faceMetal = new THREE.Color('#858A83'),
  faceIvory = new THREE.Color('#D9D6BF'),
  faceRed = new THREE.Color('#B8432F');

/** Dial faces with bezels and graduations (fixed parts; the needles move). */
export function addDialFaces(b: VehicleBuilder, cabin: CabinLayout, redlineRpm: number): void {
  for (const [key, dial] of Object.entries(cabin.dials)) {
    const { x, radius } = dial;
    b.slot = M.Rubber;
    b.tag = BodyZone.Trim;
    b.push()
      .translate(x, cabin.dialY, cabin.dialZ)
      .rotate(Math.PI / 2, 0, 0);
    b.geometry(new THREE.CylinderGeometry(radius, radius, 0.008, 24), faceDark);
    b.pop();
    b.ring(x, cabin.dialY, cabin.dialZ + 0.005, radius, 0.004, faceMetal);
    // Major and minor graduations; the tachometer is red from the redline.
    for (let value = 0; value <= dial.max + 1e-6; value += dial.minor) {
      const angle = DIAL_START + (DIAL_SWEEP * value) / dial.max;
      const major = Math.abs(value / dial.major - Math.round(value / dial.major)) < 1e-6;
      const hot = key === 'rpm' && value >= redlineRpm;
      const low = key === 'oil' && value === 0;
      b.rod(
        dialPoint(cabin, x, radius * (major ? 0.68 : 0.78), angle, cabin.dialZ + 0.011),
        dialPoint(cabin, x, radius * 0.88, angle, cabin.dialZ + 0.011),
        major ? 0.0019 : 0.0011,
        hot || low ? faceRed : faceIvory,
      );
    }
  }
}

/** The steering column; the wheel itself turns with the steering (VehicleInstruments). */
export function addSteeringColumn(b: VehicleBuilder, cabin: CabinLayout): void {
  const { centre, columnBase } = cabin.steeringWheel;
  const top = new THREE.Vector3(centre.x, centre.y, centre.z).lerp(
    new THREE.Vector3(columnBase.x, columnBase.y, columnBase.z),
    0.06,
  );
  b.rod(columnBase, top, 0.024, faceDark, M.Rubber);
  b.rod(columnBase, new THREE.Vector3().lerpVectors(columnBase, top, 0.45), 0.042, faceDark, M.Rubber);
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
  readonly needles: Record<keyof CabinLayout['dials'], THREE.Group>;
  private readonly values = { speed: 0, rpm: 0, oil: 0 };
  private readonly lamps: Lamp[] = [];

  constructor(
    private readonly tuning: VehicleTuning,
    private readonly cabin: CabinLayout,
    materials: THREE.Material[],
  ) {
    this.group.name = 'instruments';
    const c = cabin.steeringWheel.centre,
      base = cabin.steeringWheel.columnBase;
    // Local +z runs up the column towards the driver, so the rim faces them.
    const mount = new THREE.Group();
    mount.position.set(c.x, c.y, c.z);
    mount.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(c.x - base.x, c.y - base.y, c.z - base.z).normalize(),
    );
    const wheelMesh = new THREE.Mesh(buildSteeringWheel(cabin.steeringWheel), materials);
    wheelMesh.castShadow = true;
    this.wheel.add(wheelMesh);
    mount.add(this.wheel);
    this.group.add(mount);

    const needle = (dial: DialLayout) => {
      const pivot = new THREE.Group();
      pivot.position.set(dial.x, cabin.dialY, cabin.dialZ + 0.012);
      const mesh = new THREE.Mesh(buildNeedle(dial.radius), materials);
      pivot.add(mesh);
      this.group.add(pivot);
      return pivot;
    };
    const dials = cabin.dials;
    this.needles = { speed: needle(dials.speed), rpm: needle(dials.rpm), oil: needle(dials.oil) };

    const lampGeometry = new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 12).rotateX(Math.PI / 2);
    const lamp = (index: number, hex: string, on: Lamp['on']) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex).multiplyScalar(0.12),
        emissive: hex,
        emissiveIntensity: 0,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(lampGeometry, material);
      mesh.position.set(cabin.lamps.xs[index], cabin.lamps.y, cabin.lamps.z);
      this.group.add(mesh);
      this.lamps.push({ material, on });
    };
    lamp(0, '#E89A2C', (v) => v.drivetrain.range === 'low');
    lamp(1, '#E89A2C', (v) => v.differentials.front);
    lamp(2, '#E89A2C', (v) => v.differentials.rear);
    lamp(3, '#6FCB5A', (v) => v.precisionCrawl);
    lamp(4, '#E2402F', (v) => !v.drivetrain.engineRunning);
  }

  update(v: Vehicle, dt: number): void {
    let front = 0;
    for (let i = 0; i < 4; i++) if (this.tuning.wheels[i].front) front += v.wheels[i].steer / 2;
    // A right turn winds the wheel clockwise as the driver sees it.
    this.wheel.rotation.z = -front * this.cabin.steeringWheel.ratio;

    const running = v.drivetrain.engineRunning;
    const target = {
      speed: Math.abs(v.speed) * 3.6,
      rpm: running ? v.drivetrain.rpm : 0,
      oil: running ? Math.min(1, 0.3 + (0.6 * v.drivetrain.rpm) / this.tuning.engine.redlineRpm) : 0,
    };
    for (const key of ['speed', 'rpm', 'oil'] as const) {
      this.values[key] += (target[key] - this.values[key]) * Math.min(1, dt / NEEDLE_LAG[key]);
      const dial = this.cabin.dials[key];
      const angle = DIAL_START + DIAL_SWEEP * Math.min(1.02, Math.max(0, this.values[key] / dial.max));
      this.needles[key].rotation.z = -angle;
    }
    for (const lamp of this.lamps) lamp.material.emissiveIntensity = lamp.on(v) ? 1.6 : 0;
  }
}

/**
 * A thin black rim with a horn boss on three brushed spokes (left, right and down), or
 * four black ones in a shallow X like the Land Rover's.
 */
function buildSteeringWheel(wheel: CabinLayout['steeringWheel']): THREE.BufferGeometry {
  const b = new VehicleBuilder();
  const r = wheel.radius;
  const four = wheel.spokes === 4;
  b.ring(0, 0, 0, r, four ? 0.016 : 0.014, dark, M.Rubber);
  const spokes = four
    ? [Math.PI * 0.36, -Math.PI * 0.36, Math.PI * 0.64, -Math.PI * 0.64]
    : [Math.PI * 0.56, -Math.PI * 0.56, Math.PI];
  for (const angle of spokes) {
    // Spokes dip slightly towards the column, like a shallow dish.
    b.rod(
      { x: Math.sin(angle) * 0.045, y: Math.cos(angle) * 0.045, z: -0.012 },
      { x: Math.sin(angle) * (r - 0.008), y: Math.cos(angle) * (r - 0.008), z: 0 },
      four ? 0.009 : 0.007,
      four ? dark : metal,
      four ? M.Rubber : M.Metal,
    );
  }
  b.slot = M.Rubber;
  b.push().rotate(Math.PI / 2, 0, 0);
  b.geometry(new THREE.CylinderGeometry(four ? 0.065 : 0.05, four ? 0.07 : 0.056, 0.035, 20), dark);
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
