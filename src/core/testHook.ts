import type { MapId } from '../data/maps';
import * as THREE from 'three';
import type { VehicleInput } from '../sim/input/vehicleInput';
import type { AudioInfo } from '../audio/audioSystem';
import { Autopilot } from '../sim/input/autopilot';
import { poiApproach } from '../sim/world/poiApproach';
import { headingOf } from '../sim/vehicle/math';
import type { Game } from './game';
import type { CameraPreset } from '../data/camera';
import type { VehicleId } from '../data/vehicle';
import type { HeadlightMode } from '../data/headlights';

const LOCAL = 'player-1';

/** Test / debug hook exposed on window.__game (used by Playwright and the dev scripts). */
export interface GameHook {
  ready: boolean;
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  useChaseCamera(): void;
  camera(): { position: number[]; direction: number[]; distance: number; preset: CameraPreset };
  /** Switch the chase camera to a view (follow, crawler views, driver's seat). */
  cameraPreset(preset: CameraPreset): void;
  stats(): {
    fps: number;
    frameMs: number;
    calls: number;
    triangles: number;
    particles: number;
    /** Main-thread ms per frame: simulation steps, the rest of the frame, three.js render. */
    simMs: number;
    renderMs: number;
    sceneMs: number;
    /** Terrain chunks drawn per detail level (0 = finest). */
    terrainLod: number[];
  };
  heightAt(x: number, z: number): number;
  teleport(x: number, z: number, headingDeg: number): void;
  teleportPoi(id: string): void;
  /** Override driver input. Pass null to give control back to the devices. */
  setInput(input: Partial<VehicleInput> | null): void;
  vehicle(): {
    x: number;
    y: number;
    z: number;
    speed: number;
    range: string;
    tilt: number;
    heading: number;
    frontLocked: boolean;
    rearLocked: boolean;
    precisionCrawl: boolean;
    throttle: number;
    brake: number;
    /** False while the engine is stalled or still cranking. */
    engineRunning: boolean;
    lights: HeadlightMode;
  };
  /** Park the vehicle on the approach to a POI and frame it with the free camera. */
  showPoi(id: string): void;
  tool(action: 'planks' | 'winch' | 'confirm' | 'cancel' | 'detach' | 'recall' | 'quick'): boolean;
  /** Plain-data simulation snapshot. */
  state(): unknown;
  returnToCampsite(id: string): void;
  /** Debug: turn the car upside down where it is. */
  flip(): void;
  pois(): { id: string; name: string; x: number; z: number; radius: number }[];
  discovered(): string[];
  lastCampsite(): string;
  ui(): { map: boolean; pause: boolean; toolMenu: boolean; paused: boolean; mode: string };
  /** Seconds of simulated time so far. */
  simTime(): number;
  /**
   * Simulate up to a second per frame instead of a twelfth, so the simulation keeps up
   * with frames that take seconds to draw (tests on a software renderer).
   */
  setCatchUp(on: boolean): void;
  /**
   * Start the autopilot on the track leading to a POI, `back` metres out (teleports
   * there first). Pass null to stop it.
   */
  autopilot(poiId: string | null, back?: number, speed?: number): void;
  autopilotState(): { active: boolean; done: boolean; remaining: number };
  setQuality(level: 'low' | 'medium' | 'high'): void;
  quality(): 'low' | 'medium' | 'high';
  /** Is the park brake on? */
  parkBrake(): boolean;
  /** Draw calls and triangles per top-level scene group (renders the scene once per group). */
  breakdown(): Record<string, { calls: number; triangles: number }>;
  /** Audio state, levels and what's playing. */
  audio(): AudioInfo;
  /** Debug: play a bird call now. */
  bird(kind: 'kookaburra' | 'magpie'): void;
  /** Swap to another vehicle where the current one stands (no fade). */
  setVehicle(id: VehicleId): void;
  vehicleId(): VehicleId;
  /** The loaded map; `setMap` saves another as current and reloads the page. */
  mapId(): MapId;
  setMap(id: MapId): void;
  /** The welcome screen's time of day and weather, and how wet and rainy that makes it. */
  conditions(): { time: string; weather: string; wetness: number; rain: number };
  /** Set the park brake directly (the key toggles it). */
  setParkBrake(on: boolean): void;
  /** Set the headlights directly (the key cycles them). */
  setLights(mode: HeadlightMode): void;
  /** Damage the vehicle directly: engine, tyres and suspension health (1 = as new). */
  setHealth(h: { engine?: number; tyres?: number[]; suspension?: number[] }): void;
  /** The vehicle's health, and whether a roadside repair is under way. */
  health(): { engine: number; tyres: number[]; suspension: number[]; spare: boolean; repairing: boolean };
  /** How strongly the beams light the ground now (0 in daylight, where there are none). */
  beams(): { head: number; roof: number };
  /**
   * Render a frame and return the mean brightness (0..255) of part of the screen, given
   * as fractions of its width and height from the top left.
   */
  brightness(x0: number, y0: number, x1: number, y1: number): number;
}

declare global {
  interface Window {
    __game?: GameHook;
  }
}

export function installHook(game: Game): void {
  const g = game;
  window.__game = {
    ready: false,
    setCamera: (x, y, z, tx, ty, tz) => {
      if (!g.freeCamOn) g.toggleFreeCam();
      g.freeCam.set(new THREE.Vector3(x, y, z), new THREE.Vector3(tx, ty, tz));
      g.view.snap();
    },
    useChaseCamera: () => {
      if (g.freeCamOn) g.toggleFreeCam();
    },
    camera: () => ({
      position: g.view.camera.position.toArray(),
      direction: g.view.camera.getWorldDirection(new THREE.Vector3()).toArray(),
      distance: g.chase.distance,
      preset: g.chase.preset,
    }),
    cameraPreset: (preset) => g.chase.selectPreset(preset),
    stats: () => ({
      fps: g.overlay?.fps ?? 0,
      frameMs: g.overlay?.frameMs ?? 0,
      calls: g.view.renderer.info.render.calls,
      triangles: g.view.renderer.info.render.triangles,
      particles: g.view.particles.live,
      simMs: g.loop.timings.sim,
      renderMs: g.loop.timings.render,
      sceneMs: g.sceneMs,
      terrainLod: g.view.terrainMesh.lodCounts(),
    }),
    autopilot: (poiId, back = 300, speed = 8) => {
      if (!poiId) {
        g.autopilot = null;
        return;
      }
      const poi = g.world.pois.find((p) => p.id === poiId);
      if (!poi) throw new Error(`No POI ${poiId}`);
      const path = poiApproach(poi, g.world.features.tracks, back);
      const a = path[0];
      const b = path[Math.min(3, path.length - 1)];
      g.vehicle.teleport(
        g.sim.poseAt(a[0], a[1], headingOf(b[0] - a[0], b[1] - a[1]), g.vehicle.tuning.wheelRadius),
      );
      g.chase.reset();
      g.view.snap();
      g.autopilot = new Autopilot(path, speed);
    },
    setQuality: (level) => g.changeSettings({ quality: level }),
    quality: () => g.settings.quality,
    parkBrake: () => g.vehicle.parkBrake,
    breakdown: () => {
      const r = g.view.renderer;
      const scene = g.view.scene;
      const kids = scene.children.filter((c) => c.visible);
      const out: Record<string, { calls: number; triangles: number }> = {};
      const measure = (name: string, only: THREE.Object3D, siblings: THREE.Object3D[]) => {
        for (const k of siblings) k.visible = k === only || k === g.view.camera || k.type.endsWith('Light');
        r.render(scene, g.view.camera);
        out[name] = { calls: r.info.render.calls, triangles: r.info.render.triangles };
        for (const k of siblings) k.visible = true;
      };
      kids.forEach((c, i) => measure(c.name || `${c.type}#${i}`, c, kids));
      // Vegetation by part (trees, rocks, ground cover...).
      const veg = g.view.vegetation.group;
      const parts = veg.children.filter((c) => c.visible);
      for (const k of kids) k.visible = k === veg || k === g.view.camera || k.type.endsWith('Light');
      parts.forEach((c, i) => measure(`vegetation/${c.name || c.type + '#' + i}`, c, parts));
      for (const k of kids) k.visible = true;
      return out;
    },
    autopilotState: () => ({
      active: g.autopilot !== null,
      done: g.autopilot?.done ?? false,
      remaining: g.autopilot ? g.autopilot.remaining(g.vehicle) : 0,
    }),
    heightAt: (x, z) => g.world.terrain.heightAt(x, z),
    teleport: (x, z, h) => {
      g.crawlRuns.cancel();
      g.vehicle.teleport(g.sim.poseAt(x, z, h, g.vehicle.tuning.wheelRadius));
      g.chase.reset();
      g.view.snap();
    },
    teleportPoi: (id) => {
      const p = g.world.pois.find((q) => q.id === id);
      if (p) g.teleportToPoi(p);
    },
    setInput: (inp) => {
      g.scriptedInput = inp;
    },
    showPoi: (id) => g.showPoi(id),
    tool: (action) => {
      switch (action) {
        case 'planks':
          return g.tool.startPlanks();
        case 'winch':
          return g.tool.startWinchTarget();
        case 'confirm':
          g.tool.confirm();
          return true;
        case 'cancel':
          g.tool.cancel();
          return true;
        case 'detach':
          g.sim.detachWinch(LOCAL);
          return true;
        case 'recall':
          g.sim.recallPlanks(LOCAL);
          return true;
        case 'quick':
          g.sim.quickAttach(LOCAL);
          return true;
      }
      return false;
    },
    state: () => g.sim.serialize(),
    flip: () => {
      const v = g.vehicle;
      const p = v.body.translation();
      v.body.setTranslation({ x: p.x, y: p.y + 1.6, z: p.z }, true);
      v.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
    },
    returnToCampsite: (id) => {
      g.sim.returnToCampsite(LOCAL, id);
      g.chase.reset();
      g.view.snap();
    },
    pois: () => g.world.pois.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, radius: p.radius })),
    discovered: () => [...g.exploration.discovered],
    lastCampsite: () => g.exploration.lastCampsite,
    ui: () => ({
      map: g.map.isOpen,
      pause: g.pause.isOpen,
      toolMenu: g.toolMenu.isOpen,
      paused: g.loop.paused,
      mode: g.tool.mode,
    }),
    simTime: () => g.sim.time,
    setCatchUp: (on) => {
      g.loop.catchUp = on;
    },
    audio: () => g.audio.info(),
    bird: (kind) => g.audio.bird(kind),
    setVehicle: (id) => g.swapVehicle(id),
    vehicleId: () => g.vehicleId,
    mapId: () => g.mapId,
    setMap: (id) => void g.changeMap(id),
    conditions: () => ({ ...g.launchConditions, wetness: g.sim.env.wetness, rain: g.sim.env.rain }),
    setParkBrake: (on) => {
      g.vehicle.parkBrake = on;
    },
    setLights: (mode) => {
      g.vehicle.lights = mode;
    },
    setHealth: (h) => {
      const c = g.vehicle.condition;
      if (h.engine !== undefined) c.engine = h.engine;
      h.tyres?.forEach((t, i) => (c.tyres[i] = c.tyreTarget[i] = t));
      h.suspension?.forEach((t, i) => (c.suspension[i] = t));
    },
    health: () => {
      const c = g.vehicle.condition;
      return {
        engine: c.engine,
        tyres: [...c.tyres],
        suspension: [...c.suspension],
        spare: c.spare,
        repairing: g.sim.toolsOf(LOCAL).repair !== null,
      };
    },
    beams: () => g.model.beams?.strengths ?? { head: 0, roof: 0 },
    brightness: (x0, y0, x1, y1) => {
      // Read straight after rendering, before the browser shows (and clears) the frame.
      g.model.update(g.vehicle, 1, 0);
      g.view.render();
      const gl = g.view.renderer.getContext();
      const w = gl.drawingBufferWidth,
        h = gl.drawingBufferHeight;
      const px = Math.floor(x0 * w),
        py = Math.floor((1 - y1) * h);
      const pw = Math.max(1, Math.floor((x1 - x0) * w)),
        ph = Math.max(1, Math.floor((y1 - y0) * h));
      const buf = new Uint8Array(pw * ph * 4);
      gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 4)
        sum += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
      return sum / (pw * ph);
    },
    vehicle: () => {
      const v = g.vehicle;
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
        frontLocked: v.differentials.front,
        rearLocked: v.differentials.rear,
        precisionCrawl: v.precisionCrawl,
        throttle: v.throttle,
        brake: v.brake,
        engineRunning: v.drivetrain.engineRunning,
        lights: v.lights,
      };
    },
  };
}
