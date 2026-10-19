import * as THREE from 'three';
import { particleTuning as P } from '../data/particles';
import type { QualityPreset } from '../data/quality';
import { SurfaceId } from '../data/surfaces';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { Terrain } from '../sim/world/terrain';
import { mixPal, pal } from './colors';
import { patchFog } from './fog';

type Range = readonly [number, number];
const rnd = (r: Range) => r[0] + Math.random() * (r[1] - r[0]);

interface PoolOptions {
  max: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Per-instance opacity attribute (transparent pools). */
  opacity?: boolean;
}

/**
 * A fixed-size pool of particles drawn as one InstancedMesh. Dead particles are
 * swap-removed so the live ones are always the first `count` instances.
 */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly size1: Float32Array;
  readonly spin: Float32Array;
  readonly color: Float32Array;
  readonly color1: Float32Array;
  /** Water surface height for wakes; ground kill height for chunks. */
  readonly floor: Float32Array;
  private readonly opacityAttr: THREE.InstancedBufferAttribute | null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(o: PoolOptions) {
    const n = o.max;
    this.mesh = new THREE.InstancedMesh(o.geometry, o.material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.color = new Float32Array(n * 3);
    this.color1 = new Float32Array(n * 3);
    this.floor = new Float32Array(n);
    if (o.opacity) {
      this.opacityAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      this.opacityAttr.setUsage(THREE.DynamicDrawUsage);
      o.geometry.setAttribute('aOpacity', this.opacityAttr);
    } else this.opacityAttr = null;
  }

  get max(): number {
    return this.life.length;
  }

  /** Add a particle; returns its index, or -1 when the pool is full. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    c0: THREE.Color,
    c1: THREE.Color = c0,
    floor = -1e9,
  ): number {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size0;
    this.size1[i] = size1;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.color[i3] = c0.r;
    this.color[i3 + 1] = c0.g;
    this.color[i3 + 2] = c0.b;
    this.color1[i3] = c1.r;
    this.color1[i3 + 1] = c1.g;
    this.color1[i3 + 2] = c1.b;
    this.floor[i] = floor;
    return i;
  }

  private kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    const copy = (a: Float32Array, k: number) => {
      for (let d = 0; d < k; d++) a[i * k + d] = a[j * k + d];
    };
    for (const a of [this.pos, this.vel, this.color, this.color1]) copy(a, 3);
    for (const a of [this.age, this.life, this.size, this.size1, this.spin, this.floor]) copy(a, 1);
  }

  /**
   * Advance and write instance data. `gravity` and `drag` apply to velocity; `shape`
   * maps age (0..1) to scale, `fade` to opacity, `flat` lays the instance on the ground.
   */
  update(
    dt: number,
    gravity: number,
    drag: number,
    shape: (t: number) => number,
    fade: ((t: number) => number) | null,
    flat: boolean,
    killBelowFloor: boolean,
  ): void {
    const damp = Math.exp(-drag * dt);
    for (let i = 0; i < this.count;) {
      this.age[i] += dt;
      const i3 = i * 3;
      if (this.age[i] >= this.life[i] || (killBelowFloor && this.pos[i3 + 1] < this.floor[i])) {
        this.kill(i);
        continue;
      }
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - gravity * dt;
      this.vel[i3 + 2] *= damp;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      i++;
    }
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const t = this.age[i] / this.life[i];
      const sc = (this.size[i] + (this.size1[i] - this.size[i]) * t) * shape(t);
      this.p.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      if (flat) {
        this.q.identity();
        this.s.set(sc, 1, sc);
      } else {
        const a = this.spin[i] + this.age[i] * 1.5;
        this.q.setFromEuler(this.e.set(a, a * 0.7, 0));
        this.s.set(sc, sc, sc);
      }
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.c.setRGB(
        this.color[i3] + (this.color1[i3] - this.color[i3]) * t,
        this.color[i3 + 1] + (this.color1[i3 + 1] - this.color[i3 + 1]) * t,
        this.color[i3 + 2] + (this.color1[i3 + 2] - this.color[i3 + 2]) * t,
      );
      this.mesh.setColorAt(i, this.c);
      if (this.opacityAttr && fade) this.opacityAttr.setX(i, fade(t));
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.opacityAttr) this.opacityAttr.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }
}

/** Lambert material whose instances carry their own opacity. */
function fadingMaterial(key: string, params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, ...params });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float aOpacity;\nvarying float vOpacity;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vOpacity = aOpacity;',
      );
    shader.fragmentShader =
      'varying float vOpacity;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.a *= vOpacity;',
      );
  };
  return patchFog(m, key);
}

const UP_SPAN = 0.6;

/**
 * Wheel effects (SPEC §4): dust trail on dry dirt, mud spray, water splash and a wake
 * in the creek. Reads the vehicle's wheel states each frame; purely visual.
 */
export class Particles {
  readonly group = new THREE.Group();
  private readonly dust: Pool;
  private readonly chunks: Pool;
  private readonly wakes: Pool;
  private rateScale = 1;
  /** Fractional particles carried between frames, per wheel and effect. */
  private readonly acc = new Float32Array(4 * 4 + 4);
  private wetness = 0;
  private readonly cDust = mixPal('dirtTrack', 'barkPale', 0.62);
  private readonly cGravelDust = mixPal('rock', 'barkPale', 0.55);
  private readonly cGrassDust = mixPal('grassDry', 'barkPale', 0.5);
  private readonly cMud = pal('mud').clone();
  private readonly cMudDark = mixPal('mud', 'vehicleTrim', 0.3);
  private readonly cSpray = mixPal('waterShallow', 'vehicleRoof', 0.75);
  private readonly cFoam = mixPal('waterShallow', 'vehicleRoof', 0.6);
  private readonly cWater = pal('waterShallow').clone();
  private readonly tmpColor = new THREE.Color();
  private readonly fwd = { x: 0, y: 0, z: 0 };
  private readonly bow = { x: 0, y: 0, z: 0 };
  private readonly bonnet = { x: 0, y: 0, z: 0 };
  private readonly cSmoke = new THREE.Color(P.smoke.color);

  constructor(
    private readonly terrain: Terrain,
    quality: QualityPreset,
    private readonly waterLevelOffset = 0,
  ) {
    this.dust = new Pool({
      max: P.maxDust,
      geometry: new THREE.IcosahedronGeometry(1, 0),
      // Some self-lighting softens the facets so a puff reads as dust, not glass.
      material: fadingMaterial('dust', {
        flatShading: true,
        emissive: mixPal('dirtTrack', 'barkPale', 0.7).multiplyScalar(0.35),
      }),
      opacity: true,
    });
    this.dust.mesh.renderOrder = 2;
    const chunkMat = patchFog(new THREE.MeshLambertMaterial({ flatShading: true }), 'particle-chunk');
    this.chunks = new Pool({
      max: P.maxChunks,
      geometry: new THREE.IcosahedronGeometry(1, 0),
      material: chunkMat,
    });
    const ring = new THREE.RingGeometry(0.88, 1, 18, 1);
    ring.rotateX(-Math.PI / 2);
    const wakeMat = fadingMaterial('wake', {
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.wakes = new Pool({ max: P.maxWakes, geometry: ring, material: wakeMat, opacity: true });
    this.group.name = 'particles';
    for (const p of [this.dust, this.chunks, this.wakes]) this.group.add(p.mesh);
    this.setQuality(quality);
  }

  setQuality(q: QualityPreset): void {
    this.rateScale = q.particles;
  }

  setWetness(w: number): void {
    this.wetness = w;
  }

  /** Remove every particle (after teleports). */
  clear(): void {
    this.dust.clear();
    this.chunks.clear();
    this.wakes.clear();
  }

  update(v: Vehicle, dt: number): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    if (this.rateScale > 0) this.emit(v, dt);
    this.dust.update(
      dt,
      -P.dust.rise,
      P.dust.drag,
      (t) => Math.min(1, t * 5) * (1 - t * t * 0.5),
      (t) => P.dust.opacity * Math.min(1, t * 6) * (1 - t) * (1 - t),
      false,
      false,
    );
    this.chunks.update(dt, P.gravity, 0.4, (t) => 1 - t * t, null, false, true);
    this.wakes.update(
      dt,
      0,
      0,
      () => 1,
      (t) => P.wake.opacity * Math.min(1, t * 8) * (1 - t) ** 1.5,
      true,
      false,
    );
  }

  private emit(v: Vehicle, dt: number): void {
    const vel = v.body.linvel();
    const speed = Math.abs(v.speed);
    v.forward(this.fwd);
    const dir = v.speed >= 0 ? 1 : -1;
    const S = this.rateScale;
    let maxWater = 0;
    for (let i = 0; i < v.wheels.length && i < 4; i++) {
      const w = v.wheels[i];
      const cp = w.contactPoint;
      maxWater = Math.max(maxWater, w.water);
      const side = v.tuning.wheels[i].x < 0 ? -1 : 1;
      // Sideways unit vector (right of the car).
      const rx = -this.fwd.z;
      const rz = this.fwd.x;

      const sp = P.splash;
      if (w.water > sp.minDepth && w.contact) {
        if (speed > sp.fromSpeed) {
          const k = Math.min(1, (speed - sp.fromSpeed) / (sp.fullSpeed - sp.fromSpeed));
          const n = this.count(i, 0, sp.rate * k * S * dt);
          const surface = cp.y + w.water;
          for (let j = 0; j < n; j++) {
            const out = side * (0.5 + Math.random()) * sp.spread;
            this.chunks.spawn(
              cp.x + rx * side * 0.15,
              surface + 0.05,
              cp.z + rz * side * 0.15,
              vel.x * 0.35 + rx * out + (Math.random() - 0.5),
              rnd(sp.lift) * (0.6 + 0.4 * k),
              vel.z * 0.35 + rz * out + (Math.random() - 0.5),
              rnd(sp.life),
              rnd(sp.size),
              rnd(sp.size) * 0.5,
              this.cSpray,
              this.cWater,
              surface - 0.05,
            );
          }
        }
        continue;
      }
      if (!w.contact) continue;

      if (w.surface === SurfaceId.Mud) {
        const m = P.mud;
        const rate = m.spinRate * w.spin + m.speedRate * Math.min(1, speed / 6);
        const n = this.count(i, 1, rate * S * dt);
        for (let j = 0; j < n; j++) {
          const back = -dir * rnd(m.throwSpeed) * (0.5 + w.spin);
          this.chunks.spawn(
            cp.x - this.fwd.x * dir * 0.35,
            cp.y + 0.12,
            cp.z - this.fwd.z * dir * 0.35,
            vel.x * 0.5 + this.fwd.x * back + rx * side * Math.random() * 1.2,
            rnd(m.lift),
            vel.z * 0.5 + this.fwd.z * back + rz * side * Math.random() * 1.2,
            rnd(m.life),
            rnd(m.size),
            rnd(m.size),
            Math.random() < 0.5 ? this.cMud : this.cMudDark,
            undefined,
            this.terrain.heightAt(cp.x, cp.z) - 0.3,
          );
        }
        continue;
      }

      const d = P.dust;
      const scale =
        w.surface === SurfaceId.Dirt
          ? d.surfaceScale.dirt
          : w.surface === SurfaceId.Gravel
            ? d.surfaceScale.gravel
            : w.surface === SurfaceId.Grass
              ? d.surfaceScale.grass
              : 0;
      if (scale > 0 && speed > d.fromSpeed && this.wetness < d.maxWetness) {
        const k = Math.min(1, (speed - d.fromSpeed) / (d.fullSpeed - d.fromSpeed));
        // Rear wheels throw most of the dust.
        const rear = v.tuning.wheels[i].front ? 0.45 : 1;
        const n = this.count(i, 2, d.rate * k * scale * rear * S * dt);
        const col =
          w.surface === SurfaceId.Gravel
            ? this.cGravelDust
            : w.surface === SurfaceId.Grass
              ? this.cGrassDust
              : this.cDust;
        for (let j = 0; j < n; j++) {
          this.tmpColor.copy(col).multiplyScalar(0.94 + Math.random() * 0.12);
          this.dust.spawn(
            cp.x - this.fwd.x * dir * 0.4 + (Math.random() - 0.5) * 0.4,
            cp.y + 0.25,
            cp.z - this.fwd.z * dir * 0.4 + (Math.random() - 0.5) * 0.4,
            vel.x * 0.25 + (Math.random() - 0.5) * UP_SPAN * 2,
            0.3 + Math.random() * UP_SPAN,
            vel.z * 0.25 + (Math.random() - 0.5) * UP_SPAN * 2,
            rnd(d.life),
            rnd(d.size) * 0.3,
            rnd(d.size) * (0.6 + 0.4 * k),
            this.tmpColor,
          );
        }
      }
    }

    // Wake: rings from the bow and the rear wheels while pushing through water.
    const W = P.wake;
    if (maxWater > W.minDepth && speed > W.fromSpeed) {
      const k = Math.min(1, speed / 4);
      v.localToWorld(0, 0, -2.0, this.bow);
      const surface = this.terrain.waterSurfaceAt(this.bow.x, this.bow.z, this.waterLevelOffset);
      if (surface !== null) {
        for (let n = this.count(4, 0, W.rate * k * Math.min(1, S) * dt); n > 0; n--)
          this.wakes.spawn(
            this.bow.x,
            surface + 0.02,
            this.bow.z,
            vel.x * 0.15,
            0,
            vel.z * 0.15,
            rnd(W.life),
            W.radius[0],
            W.radius[1],
            this.cFoam,
            this.cWater,
          );
      }
      for (const i of [2, 3]) {
        const cp = v.wheels[i].contactPoint;
        const s = this.terrain.waterSurfaceAt(cp.x, cp.z, this.waterLevelOffset);
        if (s === null) continue;
        for (let n = this.count(4, i - 1, W.rearRate * k * Math.min(1, S) * dt); n > 0; n--)
          this.wakes.spawn(
            cp.x,
            s + 0.02,
            cp.z,
            0,
            0,
            0,
            rnd(W.life) * 0.8,
            0.3,
            W.radius[1] * 0.6,
            this.cFoam,
            this.cWater,
          );
      }
    }

    // A badly hurt engine smokes from under the bonnet.
    const K = P.smoke;
    const engine = v.condition.engine;
    if (engine < K.from && v.drivetrain.engineRunning) {
      const n = this.count(4, 3, K.rate * (1 - engine / K.from) * S * dt);
      const p = v.localToWorld(0, K.y, K.z, this.bonnet);
      for (let j = 0; j < n; j++)
        this.dust.spawn(
          p.x + (Math.random() - 0.5) * 0.5,
          p.y,
          p.z + (Math.random() - 0.5) * 0.5,
          vel.x * 0.7,
          0.6 + Math.random() * 0.5,
          vel.z * 0.7,
          rnd(K.life),
          K.size[0],
          rnd(K.size) * 1.8,
          this.cSmoke,
        );
    }
  }

  /** Whole particles to emit this frame for a slot, keeping the remainder. */
  private count(slot: number, effect: number, amount: number): number {
    const k = slot * 4 + effect;
    this.acc[k] += amount;
    const n = Math.floor(this.acc[k]);
    this.acc[k] -= n;
    return n;
  }

  get live(): number {
    return this.dust.count + this.chunks.count + this.wakes.count;
  }

  /** Live particles per pool (debug overlay). */
  counts(): string {
    return `dust ${this.dust.count} chunks ${this.chunks.count} wakes ${this.wakes.count}`;
  }
}
