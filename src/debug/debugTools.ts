import * as THREE from 'three';
import { SurfaceId, surfaces } from '../data/surfaces';
import type { VehicleTuning } from '../data/vehicle';
import type { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { PoiDef } from '../sim/world/mapTypes';

const SURFACE_COLORS: Record<number, number> = {
  [SurfaceId.Dirt]: 0xb5653a,
  [SurfaceId.Grass]: 0xc9a35a,
  [SurfaceId.Gravel]: 0xa8876a,
  [SurfaceId.Rock]: 0x9a948a,
  [SurfaceId.Mud]: 0x6b4a33,
  [SurfaceId.Water]: 0x4e7c86,
  [SurfaceId.Wood]: 0xc58b5c,
};

interface SliderDef {
  label: string;
  get: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  step: number;
}

/**
 * Debug tools (SPEC §10): teleport list, free-fly toggle, collider wireframes, wheel
 * contact points with the surface under each wheel, and live tuning sliders.
 */
export class DebugTools {
  readonly panel: HTMLElement;
  showColliders = false;
  private readonly contactMarkers: THREE.Mesh[] = [];
  private readonly colliderLines: THREE.LineSegments;
  private colliderFrame = 0;

  constructor(
    root: HTMLElement,
    scene: THREE.Scene,
    private readonly sim: Simulation,
    private readonly tuning: VehicleTuning,
    private readonly getVehicle: () => Vehicle,
    pois: readonly PoiDef[],
    actions: {
      teleport: (poi: PoiDef) => void;
      toggleFreeCam: () => boolean;
      bird: (kind: 'kookaburra' | 'magpie') => void;
    },
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.panel.innerHTML = `<details open><summary>Debug</summary>
      <div class="debug-row"><button data-act="free">Free camera (backtick)</button><button data-act="coll">Colliders</button></div>
      <details><summary>Teleport</summary><div class="debug-teleports"></div></details>
      <details><summary>Sounds</summary><div class="debug-row"><button data-bird="kookaburra">Kookaburra</button><button data-bird="magpie">Magpie</button></div></details>
      <details><summary>Vehicle tuning</summary><div class="debug-sliders"></div></details>
    </details>`;
    root.appendChild(this.panel);
    const tp = this.panel.querySelector('.debug-teleports') as HTMLElement;
    for (const p of pois) {
      const b = document.createElement('button');
      b.textContent = p.name;
      b.addEventListener('click', () => actions.teleport(p));
      tp.appendChild(b);
    }
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-bird]'))
      b.addEventListener('click', () => actions.bird(b.dataset.bird as 'kookaburra' | 'magpie'));
    const freeBtn = this.panel.querySelector('[data-act="free"]') as HTMLButtonElement;
    freeBtn.addEventListener('click', () => freeBtn.classList.toggle('on', actions.toggleFreeCam()));
    const collBtn = this.panel.querySelector('[data-act="coll"]') as HTMLButtonElement;
    collBtn.addEventListener('click', () => {
      this.showColliders = !this.showColliders;
      collBtn.classList.toggle('on', this.showColliders);
      this.colliderLines.visible = this.showColliders;
    });
    this.buildSliders(this.panel.querySelector('.debug-sliders') as HTMLElement);
    // Stop slider/button key presses from driving the car.
    this.panel.addEventListener('keydown', (e) => e.stopPropagation());

    const geo = new THREE.SphereGeometry(0.07, 8, 6);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      m.renderOrder = 999;
      this.contactMarkers.push(m);
      scene.add(m);
    }
    this.colliderLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x00ffaa, vertexColors: false, depthTest: true }),
    );
    this.colliderLines.frustumCulled = false;
    this.colliderLines.visible = false;
    scene.add(this.colliderLines);
  }

  private buildSliders(el: HTMLElement): void {
    const t = this.tuning;
    const reapply = () => this.getVehicle().applyTuning();
    const defs: SliderDef[] = [
      {
        label: 'Mass (kg)',
        get: () => t.mass,
        set: (v) => ((t.mass = v), reapply()),
        min: 900,
        max: 2600,
        step: 10,
      },
      {
        label: 'COM height',
        get: () => t.com.y,
        set: (v) => ((t.com.y = v), reapply()),
        min: 0.1,
        max: 0.9,
        step: 0.01,
      },
      {
        label: 'Spring',
        get: () => t.springStiffness,
        set: (v) => (t.springStiffness = v),
        min: 8,
        max: 50,
        step: 0.5,
      },
      {
        label: 'Damp bump',
        get: () => t.damperCompression,
        set: (v) => ((t.damperCompression = v), reapply()),
        min: 0.2,
        max: 6,
        step: 0.1,
      },
      {
        label: 'Damp rebound',
        get: () => t.damperRelaxation,
        set: (v) => ((t.damperRelaxation = v), reapply()),
        min: 0.2,
        max: 6,
        step: 0.1,
      },
      {
        label: 'Lateral grip',
        get: () => t.lateralGrip,
        set: (v) => (t.lateralGrip = v),
        min: 0.3,
        max: 1.6,
        step: 0.01,
      },
      {
        label: 'Long. grip',
        get: () => t.longitudinalGrip,
        set: (v) => (t.longitudinalGrip = v),
        min: 0.3,
        max: 1.6,
        step: 0.01,
      },
      {
        label: 'Roll torque',
        get: () => t.rollTorqueScale,
        set: (v) => (t.rollTorqueScale = v),
        min: 0,
        max: 1.5,
        step: 0.05,
      },
      {
        label: 'Anti-roll F',
        get: () => t.antiRoll.front,
        set: (v) => (t.antiRoll.front = v),
        min: 0,
        max: 30000,
        step: 500,
      },
      {
        label: 'Anti-roll R',
        get: () => t.antiRoll.rear,
        set: (v) => (t.antiRoll.rear = v),
        min: 0,
        max: 30000,
        step: 500,
      },
      {
        label: 'Diff leak',
        get: () => t.openDiffLeak,
        set: (v) => (t.openDiffLeak = v),
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        label: 'Low range ×',
        get: () => t.ranges.low.ratio,
        set: (v) => (t.ranges.low.ratio = v),
        min: 1.5,
        max: 4,
        step: 0.1,
      },
      {
        label: 'Brake (N)',
        get: () => t.brakeForce,
        set: (v) => (t.brakeForce = v),
        min: 4000,
        max: 25000,
        step: 250,
      },
      {
        label: 'Max steer°',
        get: () => t.steering.maxAngleDeg,
        set: (v) => (t.steering.maxAngleDeg = v),
        min: 15,
        max: 45,
        step: 1,
      },
    ];
    for (const d of defs) {
      const row = document.createElement('label');
      row.className = 'debug-slider';
      const name = document.createElement('span');
      name.textContent = d.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(d.min);
      input.max = String(d.max);
      input.step = String(d.step);
      input.value = String(d.get());
      const val = document.createElement('output');
      val.textContent = String(d.get());
      input.addEventListener('input', () => {
        d.set(Number(input.value));
        val.textContent = input.value;
      });
      row.append(name, input, val);
      el.appendChild(row);
    }
  }

  /** Per-frame update of markers and wireframes; returns overlay text lines. */
  update(v: Vehicle): string[] {
    for (let i = 0; i < 4; i++) {
      const w = v.wheels[i];
      const m = this.contactMarkers[i];
      m.visible = w.contact;
      m.position.set(w.contactPoint.x, w.contactPoint.y, w.contactPoint.z);
      (m.material as THREE.MeshBasicMaterial).color.setHex(SURFACE_COLORS[w.surface] ?? 0xffffff);
    }
    if (this.showColliders && this.colliderFrame++ % 10 === 0) {
      const buffers = this.sim.physics.world.debugRender(undefined, (c) => {
        if (!this.sim.isDebugDrawable(c)) return false;
        const p = c.translation();
        const vp = v.body.translation();
        return Math.abs(p.x - vp.x) < 80 && Math.abs(p.z - vp.z) < 80;
      });
      const geo = this.colliderLines.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
      geo.computeBoundingSphere();
    }
    const p = v.body.translation();
    const d = v.drivetrain;
    return [
      `speed ${(v.speed * 3.6).toFixed(1)} km/h  ${d.range === 'high' ? 'H' : 'L'} gear ${d.gear < 0 ? 'R' : d.gear + 1}  ${d.rpm.toFixed(0)} rpm`,
      `throttle ${v.throttle.toFixed(2)} brake ${v.brake.toFixed(2)}  tilt ${v.tiltDeg().toFixed(0)}°`,
      `wheels ${v.wheels.map((w) => (w.contact ? surfaces[w.surface].name.split(' ')[0] : '—')).join(' | ')}`,
      `load ${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(' ')} kN  spin ${v.wheels.map((w) => w.spin.toFixed(1)).join(' ')}`,
      `pos ${p.x.toFixed(0)}, ${p.y.toFixed(1)}, ${p.z.toFixed(0)}`,
    ];
  }
}
