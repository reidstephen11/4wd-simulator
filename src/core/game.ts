import * as THREE from 'three';
import { highCountryMap } from '../data/map';
import { lateAfternoon } from '../data/environment';
import { defaultQuality, qualityPresets } from '../data/quality';
import { buildWorldSteps, type World } from '../sim/world/world';
import { GameRenderer } from '../render/renderer';
import { FreeCamera } from '../debug/freeCamera';
import { DebugOverlay } from '../debug/overlay';
import { GameLoop } from './loop';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Test / debug hook exposed on window.__game. */
export interface GameHook {
  ready: boolean;
  setCamera(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  stats(): { fps: number; frameMs: number; calls: number; triangles: number };
  heightAt(x: number, z: number): number;
}

declare global {
  interface Window {
    __game?: GameHook;
  }
}

export class Game {
  readonly debug: boolean;
  private readonly loop: GameLoop;
  private readonly freeCam: FreeCamera;
  private readonly overlay: DebugOverlay | null;

  private constructor(
    readonly world: World,
    readonly view: GameRenderer,
    uiRoot: HTMLElement,
  ) {
    this.debug = new URLSearchParams(location.search).has('debug');
    this.freeCam = new FreeCamera(view.camera, view.renderer.domElement);
    this.freeCam.enabled = true;
    const camp = world.pois.find((p) => p.id === world.map.spawnCampsite) ?? world.pois[0];
    const ground = world.terrain.heightAt(camp.x, camp.z);
    this.freeCam.set(
      new THREE.Vector3(camp.x - 40, ground + 28, camp.z + 70),
      new THREE.Vector3(camp.x + 60, ground + 10, camp.z - 160),
    );
    view.focus.set(camp.x, ground, camp.z);
    this.overlay = this.debug ? new DebugOverlay(uiRoot) : null;
    this.loop = new GameLoop({
      step: () => {},
      render: (_alpha, frameDt) => this.renderFrame(frameDt),
    });
    this.installHook();
  }

  static async create(
    appEl: HTMLElement,
    uiEl: HTMLElement,
    progress: (p: number, label: string) => void,
  ): Promise<Game> {
    const gen = buildWorldSteps(highCountryMap);
    let r = gen.next();
    while (!r.done) {
      progress(r.value.progress, r.value.label);
      await nextFrame();
      r = gen.next();
    }
    const world = r.value;
    progress(0.9, 'Building meshes');
    await nextFrame();
    const view = new GameRenderer(appEl, world, lateAfternoon, qualityPresets[defaultQuality]);
    return new Game(world, view, uiEl);
  }

  start(): void {
    this.loop.start();
  }

  private frameCount = 0;

  private renderFrame(frameDt: number): void {
    this.freeCam.update(frameDt);
    const cam = this.view.camera.position;
    this.view.focus.set(cam.x, this.world.terrain.heightAt(cam.x, cam.z), cam.z);
    this.view.render();
    this.overlay?.frame(frameDt, this.view.renderer);
    this.frameCount++;
    if (this.frameCount === 3 && window.__game) window.__game.ready = true;
  }

  private installHook(): void {
    window.__game = {
      ready: false,
      setCamera: (x, y, z, tx, ty, tz) => {
        this.freeCam.set(new THREE.Vector3(x, y, z), new THREE.Vector3(tx, ty, tz));
      },
      stats: () => ({
        fps: this.overlay?.fps ?? 0,
        frameMs: this.overlay?.frameMs ?? 0,
        calls: this.view.renderer.info.render.calls,
        triangles: this.view.renderer.info.render.triangles,
      }),
      heightAt: (x, z) => this.world.terrain.heightAt(x, z),
    };
  }
}
