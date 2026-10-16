import * as THREE from 'three';
import type { VehicleInput } from '../sim/input/vehicleInput';
import type { Game } from './game';

const LOCAL = 'player-1';

/** Test / debug hook exposed on window.__game (used by Playwright and the dev scripts). */
export interface GameHook {
  ready: boolean;
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  useChaseCamera(): void;
  stats(): { fps: number; frameMs: number; calls: number; triangles: number };
  heightAt(x: number, z: number): number;
  teleport(x: number, z: number, headingDeg: number): void;
  teleportPoi(id: string): void;
  /** Override driver input. Pass null to give control back to the devices. */
  setInput(input: Partial<VehicleInput> | null): void;
  vehicle(): { x: number; y: number; z: number; speed: number; range: string; tilt: number; heading: number };
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
    stats: () => ({
      fps: g.overlay?.fps ?? 0,
      frameMs: g.overlay?.frameMs ?? 0,
      calls: g.view.renderer.info.render.calls,
      triangles: g.view.renderer.info.render.triangles,
    }),
    heightAt: (x, z) => g.world.terrain.heightAt(x, z),
    teleport: (x, z, h) => {
      g.vehicle.teleport(g.sim.poseAt(x, z, h));
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
      };
    },
  };
}
