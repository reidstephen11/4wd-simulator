import * as THREE from 'three';
import { highCountryMap } from '../data/map';
import { lateAfternoon } from '../data/environment';
import { defaultQuality, qualityPresets } from '../data/quality';
import { vehicleTuning } from '../data/vehicle';
import { cameraTuning } from '../data/camera';
import { buildWorldSteps, type World } from '../sim/world/world';
import { loadRapier } from '../sim/physics';
import { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { InputManager } from '../sim/input/inputManager';
import type { VehicleInput } from '../sim/input/vehicleInput';
import type { PoiDef } from '../sim/world/mapTypes';
import { poiApproach } from '../sim/world/poiApproach';
import { headingOf } from '../sim/vehicle/math';
import { GameRenderer } from '../render/renderer';
import { VehicleModel } from '../render/vehicleModel';
import { ChaseCamera } from '../render/chaseCamera';
import { FreeCamera } from '../debug/freeCamera';
import { DebugOverlay } from '../debug/overlay';
import { DebugTools } from '../debug/debugTools';
import { GameLoop } from './loop';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export const LOCAL_VEHICLE = 'player-1';

/** Test / debug hook exposed on window.__game. */
export interface GameHook {
  ready: boolean;
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  useChaseCamera(): void;
  stats(): { fps: number; frameMs: number; calls: number; triangles: number };
  heightAt(x: number, z: number): number;
  teleport(x: number, z: number, headingDeg: number): void;
  teleportPoi(id: string): void;
  /** Override driver input (tests). Pass null to give control back to devices. */
  setInput(input: Partial<VehicleInput> | null): void;
  vehicle(): { x: number; y: number; z: number; speed: number; range: string; tilt: number; heading: number };
  /** Park the vehicle on the approach to a POI and frame it with the free camera (screenshots). */
  showPoi(id: string): void;
  pois(): { id: string; name: string; x: number; z: number; radius: number }[];
}

declare global {
  interface Window {
    __game?: GameHook;
  }
}

export class Game {
  readonly debug: boolean;
  private readonly loop: GameLoop;
  private readonly input: InputManager;
  private readonly freeCam: FreeCamera;
  private readonly chase: ChaseCamera;
  private readonly overlay: DebugOverlay | null;
  private readonly tools: DebugTools | null;
  private readonly model: VehicleModel;
  private freeCamOn = false;
  private scriptedInput: Partial<VehicleInput> | null = null;
  private readonly inputs = new Map<string, VehicleInput>();
  private frameCount = 0;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();

  private constructor(
    readonly world: World,
    readonly sim: Simulation,
    readonly view: GameRenderer,
    uiRoot: HTMLElement,
  ) {
    this.debug = new URLSearchParams(location.search).has('debug');
    this.input = new InputManager(window);
    const pose = sim.campsitePose(world.map.spawnCampsite);
    sim.addVehicle(LOCAL_VEHICLE, pose);

    this.model = new VehicleModel(vehicleTuning);
    view.scene.add(this.model.root);
    view.camera.fov = cameraTuning.fov;
    view.camera.near = cameraTuning.near;
    view.camera.updateProjectionMatrix();

    this.chase = new ChaseCamera(
      view.camera,
      (from, dir, max) => sim.castStatic(from.x, from.y, from.z, dir.x, dir.y, dir.z, max),
      (x, z) => world.terrain.heightAt(x, z),
    );
    this.freeCam = new FreeCamera(view.camera, view.renderer.domElement);
    this.overlay = this.debug ? new DebugOverlay(uiRoot) : null;
    this.tools = this.debug
      ? new DebugTools(uiRoot, view.scene, sim, vehicleTuning, () => this.vehicle, world.pois, {
          teleport: (p) => this.teleportToPoi(p),
          toggleFreeCam: () => this.toggleFreeCam(),
        })
      : null;
    window.addEventListener('keydown', (e) => {
      if (this.debug && e.code === 'KeyC') this.toggleFreeCam();
    });
    this.loop = new GameLoop({
      step: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.renderFrame(alpha, frameDt),
    });
    this.installHook();
  }

  static async create(
    appEl: HTMLElement,
    uiEl: HTMLElement,
    progress: (p: number, label: string) => void,
  ): Promise<Game> {
    const rapier = loadRapier();
    const gen = buildWorldSteps(highCountryMap);
    let r = gen.next();
    while (!r.done) {
      progress(r.value.progress, r.value.label);
      await nextFrame();
      r = gen.next();
    }
    const world = r.value;
    progress(0.86, 'Starting physics');
    await nextFrame();
    const sim = new Simulation(await rapier, world, lateAfternoon);
    progress(0.92, 'Building meshes');
    await nextFrame();
    // Sign lettering uses the web font; wait for it (but never block on a slow network).
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    const view = new GameRenderer(
      appEl,
      world,
      lateAfternoon,
      qualityPresets[defaultQuality],
      sim.dynamics.values(),
    );
    return new Game(world, sim, view, uiEl);
  }

  get vehicle(): Vehicle {
    return this.sim.vehicles.get(LOCAL_VEHICLE) as Vehicle;
  }

  start(): void {
    this.loop.start();
  }

  private toggleFreeCam(): boolean {
    this.freeCamOn = !this.freeCamOn;
    this.freeCam.enabled = this.freeCamOn;
    this.input.vehicleEnabled = !this.freeCamOn;
    if (this.freeCamOn) this.freeCam.syncFromCamera();
    else this.chase.reset();
    return this.freeCamOn;
  }

  private teleportToPoi(p: PoiDef): void {
    const r = p.reset ?? { x: p.x, z: p.z + 12, headingDeg: 0 };
    this.vehicle.teleport(this.sim.poseAt(r.x, r.z, r.headingDeg));
    this.chase.reset();
    this.view.snap();
  }

  private showPoi(id: string): void {
    const poi = this.world.pois.find((p) => p.id === id);
    if (!poi) return;
    const path = poiApproach(poi, this.world.features.tracks, 45);
    const t = this.world.terrain;
    const park = path[Math.max(0, path.length - 14)];
    const next = path[Math.min(path.length - 1, path.length - 10)];
    this.vehicle.teleport(this.sim.poseAt(park[0], park[1], headingOf(next[0] - park[0], next[1] - park[1])));
    const from = path[0];
    const dx = from[0] - poi.x;
    const dz = from[1] - poi.z;
    const d = Math.hypot(dx, dz) || 1;
    const cx = poi.x + (dx / d) * 34;
    const cz = poi.z + (dz / d) * 34;
    const cy = Math.max(t.heightAt(cx, cz), t.heightAt(poi.x, poi.z)) + 13;
    if (!this.freeCamOn) this.toggleFreeCam();
    this.freeCam.set(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Vector3(poi.x, t.heightAt(poi.x, poi.z) + 1.5, poi.z),
    );
    this.view.snap();
  }

  private step(dt: number): void {
    const inp = this.input.vehicleInput(dt);
    if (this.scriptedInput) Object.assign(inp, this.scriptedInput);
    this.inputs.set(LOCAL_VEHICLE, inp);
    this.sim.step(this.inputs, dt);
  }

  private renderFrame(alpha: number, frameDt: number): void {
    this.input.poll();
    const v = this.vehicle;
    this.model.update(v, alpha, frameDt);
    if (this.freeCamOn) this.freeCam.update(frameDt);
    else {
      this.chase.zoom(this.input.takeZoom(frameDt));
      const p = this.model.root.position;
      this.tmpPos.copy(p);
      const f = v.forward();
      this.tmpFwd.set(f.x, f.y, f.z);
      this.chase.update(frameDt, {
        position: this.tmpPos,
        forward: this.tmpFwd,
        speed: v.speed,
        slopeDeg: this.world.terrain.slopeDegAt(p.x, p.z),
      });
    }
    this.view.focus.copy(this.model.root.position);
    this.view.render();
    if (this.overlay) {
      this.overlay.setLines(this.tools?.update(v) ?? []);
      this.overlay.frame(frameDt, this.view.renderer);
    }
    this.input.consumeUi();
    this.frameCount++;
    if (this.frameCount === 3 && window.__game) window.__game.ready = true;
  }

  private installHook(): void {
    window.__game = {
      ready: false,
      setCamera: (x, y, z, tx, ty, tz) => {
        if (!this.freeCamOn) this.toggleFreeCam();
        this.freeCam.set(new THREE.Vector3(x, y, z), new THREE.Vector3(tx, ty, tz));
        this.view.snap();
      },
      useChaseCamera: () => {
        if (this.freeCamOn) this.toggleFreeCam();
      },
      stats: () => ({
        fps: this.overlay?.fps ?? 0,
        frameMs: this.overlay?.frameMs ?? 0,
        calls: this.view.renderer.info.render.calls,
        triangles: this.view.renderer.info.render.triangles,
      }),
      heightAt: (x, z) => this.world.terrain.heightAt(x, z),
      teleport: (x, z, h) => {
        this.vehicle.teleport(this.sim.poseAt(x, z, h));
        this.chase.reset();
        this.view.snap();
      },
      teleportPoi: (id) => {
        const p = this.world.pois.find((q) => q.id === id);
        if (p) this.teleportToPoi(p);
      },
      setInput: (inp) => {
        this.scriptedInput = inp;
      },
      showPoi: (id) => this.showPoi(id),
      pois: () => this.world.pois.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, radius: p.radius })),
      vehicle: () => {
        const v = this.vehicle;
        const p = v.body.translation();
        const f = v.forward();
        return {
          x: p.x,
          y: p.y,
          z: p.z,
          speed: v.speed,
          range: v.drivetrain.range,
          tilt: v.tiltDeg(),
          heading: ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360,
        };
      },
    };
  }
}
