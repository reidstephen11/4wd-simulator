import * as THREE from 'three';
import { highCountryMap } from '../data/map';
import { lateAfternoon } from '../data/environment';
import { qualityPresets } from '../data/quality';
import { vehicleTuning } from '../data/vehicle';
import { cameraTuning } from '../data/camera';
import { buildWorldSteps, type World } from '../sim/world/world';
import { loadRapier } from '../sim/physics';
import { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { InputManager } from '../sim/input/inputManager';
import type { Autopilot } from '../sim/input/autopilot';
import type { VehicleInput } from '../sim/input/vehicleInput';
import type { PoiDef } from '../sim/world/mapTypes';
import { poiApproach } from '../sim/world/poiApproach';
import { headingOf } from '../sim/vehicle/math';
import { Exploration } from '../sim/exploration';
import { defaultSettings, loadSave, writeSave, type Settings } from '../sim/save/save';
import { CrawlRuns, type CrawlBests, type CrawlRunEvent } from '../sim/crawlRuns';
import { clock } from '../ui/hud';
import type { ToolEvent } from '../sim/tools/tools';
import { GameRenderer } from '../render/renderer';
import { VehicleModel } from '../render/vehicleModel';
import { ChaseCamera } from '../render/chaseCamera';
import { CameraDrag } from '../render/cameraDrag';
import { ToolsView } from '../render/tools';
import { Hud } from '../ui/hud';
import { ToolMenu, type ToolOption } from '../ui/toolMenu';
import { PaperMap } from '../ui/paperMap';
import { Fade, PauseMenu } from '../ui/menus';
import { FreeCamera } from '../debug/freeCamera';
import { DebugOverlay } from '../debug/overlay';
import { DebugTools } from '../debug/debugTools';
import { AudioSystem } from '../audio/audioSystem';
import { buildAudioFrame } from '../audio/frame';
import { GameLoop } from './loop';
import { ToolController } from './toolController';
import { buildHudState } from './hudState';
import { installHook } from './testHook';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export const LOCAL_VEHICLE = 'player-1';

/**
 * Orchestrates the simulation, rendering, UI and input for the local player.
 */
export class Game {
  readonly debug: boolean;
  readonly loop: GameLoop;
  readonly input: InputManager;
  readonly freeCam: FreeCamera;
  readonly chase: ChaseCamera;
  private readonly cameraDrag: CameraDrag;
  readonly overlay: DebugOverlay | null;
  private readonly debugTools: DebugTools | null;
  readonly model: VehicleModel;
  readonly toolsView: ToolsView;
  readonly tool: ToolController;
  readonly exploration: Exploration;
  /** Optional scored runs on the crawl trails. */
  readonly crawlRuns: CrawlRuns;
  readonly hud: Hud;
  readonly toolMenu: ToolMenu;
  readonly map: PaperMap;
  readonly pause: PauseMenu;
  private readonly fade: Fade;
  readonly audio: AudioSystem;
  settings: Settings;
  freeCamOn = false;
  scriptedInput: Partial<VehicleInput> | null = null;
  /** Drives the car along a path (scripted test drives). */
  autopilot: Autopilot | null = null;
  /** Main-thread time spent in three.js rendering per frame (ms, smoothed). */
  sceneMs = 0;
  /** Called when settings change (audio hooks in here). */
  onSettings: ((s: Settings) => void) | null = null;
  private readonly inputs = new Map<string, VehicleInput>();
  private frameCount = 0;
  private clock = 0;
  private anchorCheck = 0;
  private anchorInReach = false;
  private storageOk = true;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();

  private constructor(
    readonly world: World,
    readonly sim: Simulation,
    readonly view: GameRenderer,
    uiRoot: HTMLElement,
    settings: Settings,
    exploration: Exploration,
    crawlBests: CrawlBests,
  ) {
    this.debug = new URLSearchParams(location.search).has('debug');
    this.settings = settings;
    this.exploration = exploration;
    this.crawlRuns = new CrawlRuns(world.map.crawlTrails ?? [], world.features.tracks, crawlBests);
    this.input = new InputManager(window);
    this.audio = new AudioSystem(settings);
    // Loading puts you at the last campsite (SPEC §14).
    sim.addVehicle(LOCAL_VEHICLE, sim.campsitePose(exploration.lastCampsite || world.map.spawnCampsite));

    this.model = new VehicleModel(vehicleTuning);
    view.scene.add(this.model.root);
    this.toolsView = new ToolsView();
    view.scene.add(this.toolsView.group);
    this.tool = new ToolController(sim, this.input, LOCAL_VEHICLE);
    view.camera.fov = cameraTuning.fov;
    view.camera.near = cameraTuning.near;
    view.camera.updateProjectionMatrix();
    this.chase = new ChaseCamera(
      view.camera,
      (from, dir, max) => sim.castStatic(from.x, from.y, from.z, dir.x, dir.y, dir.z, max),
      (x, z) => world.terrain.heightAt(x, z),
    );
    this.freeCam = new FreeCamera(view.camera, view.renderer.domElement);

    this.hud = new Hud(uiRoot, (action) => this.input.requestDriveAction(action));
    this.hud.onCameraReset = () => this.chase.recenter();
    this.hud.onCameraPreset = () => this.chase.cyclePreset();
    this.toolMenu = new ToolMenu(uiRoot);
    this.toolMenu.onPick = (id) => this.pickTool(id);
    this.map = new PaperMap(uiRoot, world);
    this.map.onClose = () => this.closeMap();
    this.pause = new PauseMenu(
      uiRoot,
      {
        resume: () => this.closePause(),
        openMap: () => {
          this.closePause();
          this.openMap();
        },
        returnToCampsite: () => {
          this.closePause();
          void this.returnToLastCampsite();
        },
        changeSettings: (s) => this.changeSettings(s),
      },
      settings,
    );
    this.fade = new Fade(uiRoot);

    this.overlay = this.debug ? new DebugOverlay(uiRoot) : null;
    this.debugTools = this.debug
      ? new DebugTools(uiRoot, view.scene, sim, vehicleTuning, () => this.vehicle, world.pois, {
          teleport: (p) => this.teleportToPoi(p),
          toggleFreeCam: () => this.toggleFreeCam(),
          bird: (kind) => this.audio.bird(kind),
        })
      : null;
    window.addEventListener('keydown', (e) => {
      if (this.debug && e.code === 'Backquote' && !e.repeat) this.toggleFreeCam();
    });

    sim.events.on('tool', ({ event }) => this.onToolEvent(event));
    sim.events.on('rangeChanged', ({ range }) => {
      this.hud.toast(range === 'low' ? 'Low range' : 'High range', 1400);
      this.audio.drivetrainClunk('range');
    });
    sim.events.on('engine', ({ event }) => {
      this.hud.toast(event === 'stalled' ? 'Engine stalled — flooded' : 'Engine restarted');
      this.audio.engineEvent(event);
    });
    sim.events.on('diffChanged', ({ axle, locked }) => {
      this.hud.toast(
        `${axle === 'front' ? 'Front' : 'Rear'} differential ${locked ? 'locked' : 'open'}`,
        1600,
      );
      this.audio.drivetrainClunk(locked ? 'lockOn' : 'lockOff');
    });
    sim.events.on('diffBlocked', () => this.hud.toast('Slow below 5 km/h to engage diff locks'));
    sim.events.on('precisionChanged', ({ enabled }) =>
      this.hud.toast(enabled ? 'Precision crawl — hold throttle for walking pace' : 'Precision crawl off'),
    );
    sim.events.on('wheelImpact', ({ id, speed }) => id === LOCAL_VEHICLE && this.audio.wheelImpact(speed));
    sim.events.on('dent', ({ id, impact }) => id === LOCAL_VEHICLE && this.audio.dent(impact));
    sim.events.on('bodyKnock', ({ id, impulse }) => id === LOCAL_VEHICLE && this.audio.bodyKnock(impulse));

    this.loop = new GameLoop({
      step: (dt) => this.step(dt),
      render: (alpha, frameDt) => this.renderFrame(alpha, frameDt),
    });
    this.cameraDrag = new CameraDrag(
      view.renderer.domElement,
      () => !this.freeCamOn && !this.loop.paused && !this.toolMenu.isOpen,
      (yaw, pitch) => {
        this.input.usePointer();
        this.chase.orbit(yaw, pitch);
      },
    );
    installHook(this);
    // Draw the paper map in the background so the first open is instant.
    setTimeout(() => void this.map.prepare(), 2500);
  }

  static async create(
    appEl: HTMLElement,
    uiEl: HTMLElement,
    progress: (p: number, label: string) => void,
  ): Promise<Game> {
    const save = loadSave();
    const settings = save?.settings ?? { ...defaultSettings };
    const rapier = loadRapier();
    const gen = buildWorldSteps(highCountryMap);
    let r = gen.next();
    while (!r.done) {
      progress(r.value.progress, r.value.label);
      await nextFrame();
      r = gen.next();
    }
    const world = r.value;
    const exploration = new Exploration(
      world.pois,
      save?.exploration ?? { discovered: [], lastCampsite: world.map.spawnCampsite },
    );
    progress(0.86, 'Starting physics');
    await nextFrame();
    const sim = new Simulation(await rapier, world, lateAfternoon);
    progress(0.92, 'Building meshes');
    await nextFrame();
    // Sign lettering uses the web font; wait for it (but never block on a slow network).
    await Promise.race([document.fonts?.ready, new Promise((res) => setTimeout(res, 1500))]);
    const view = new GameRenderer(
      appEl,
      world,
      lateAfternoon,
      qualityPresets[settings.quality],
      sim.dynamics.values(),
    );
    return new Game(world, sim, view, uiEl, settings, exploration, save?.crawlBests ?? {});
  }

  get vehicle(): Vehicle {
    return this.sim.vehicles.get(LOCAL_VEHICLE) as Vehicle;
  }

  start(): void {
    this.loop.start();
  }

  // --- Saving ---------------------------------------------------------------

  save(): void {
    const ok = writeSave({
      version: 1,
      exploration: this.exploration.state(),
      settings: this.settings,
      crawlBests: this.crawlRuns.bests,
    });
    if (!ok && this.storageOk) {
      this.storageOk = false;
      console.warn('4WD Simulator: browser storage is unavailable, progress will not be saved.');
    }
  }

  changeSettings(s: Partial<Settings>): void {
    const prevQuality = this.settings.quality;
    this.settings = { ...this.settings, ...s };
    if (this.settings.quality !== prevQuality) this.view.setQuality(qualityPresets[this.settings.quality]);
    this.pause.setSettings(this.settings);
    this.audio.setSettings(this.settings);
    this.onSettings?.(this.settings);
    this.save();
  }

  // --- Modes ----------------------------------------------------------------

  toggleFreeCam(): boolean {
    this.freeCamOn = !this.freeCamOn;
    this.freeCam.enabled = this.freeCamOn;
    if (this.freeCamOn) this.freeCam.syncFromCamera();
    else this.chase.reset();
    return this.freeCamOn;
  }

  openMap(): void {
    if (this.map.isOpen) return;
    const p = this.vehicle.body.translation();
    this.map.open(this.exploration.discovered, { x: p.x, z: p.z, heading: this.cameraHeading() });
    this.loop.paused = true;
    this.audio.mapOpened();
  }

  closeMap(): void {
    this.map.close();
    this.audio.mapClosed();
    this.loop.paused = this.pause.isOpen;
  }

  openPause(): void {
    const camp = this.world.pois.find((p) => p.id === this.exploration.lastCampsite);
    this.pause.open(camp?.name ?? '');
    this.loop.paused = true;
  }

  closePause(): void {
    this.pause.close();
    this.loop.paused = this.map.isOpen;
  }

  async returnToLastCampsite(): Promise<void> {
    await this.fade.run(() => {
      this.tool.cancel();
      this.sim.returnToCampsite(LOCAL_VEHICLE, this.exploration.lastCampsite);
      this.crawlRuns.cancel();
      this.chase.reset();
      this.view.snap();
    });
  }

  teleportToPoi(p: PoiDef): void {
    this.crawlRuns.cancel();
    const r = p.reset ?? { x: p.x, z: p.z + 12, headingDeg: 0 };
    this.vehicle.teleport(this.sim.poseAt(r.x, r.z, r.headingDeg));
    this.chase.reset();
    this.view.snap();
  }

  /** Park on a POI's approach and frame it with the free camera (screenshots). */
  showPoi(id: string): void {
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

  private toolOptions(): ToolOption[] {
    const t = this.sim.toolsOf(LOCAL_VEHICLE);
    const v = this.vehicle;
    const planks: ToolOption =
      t.planks.carried > 0
        ? { id: 'planks', label: 'Place planks', icon: 'planks', enabled: true }
        : t.planks.canRecall(v)
          ? { id: 'recall', label: 'Recall planks', icon: 'planks', enabled: true }
          : { id: 'planks', label: 'Planks are out', icon: 'planks', enabled: false };
    return [
      { id: 'winch', label: 'Winch', icon: 'winch', enabled: this.anchorInReach },
      {
        id: 'frontDiff',
        label: v.differentials.front ? 'Unlock front diff' : 'Lock front diff',
        icon: 'feature',
        enabled: v.differentials.front || Math.abs(v.speed) <= vehicleTuning.crawling.diffLockMaxKmh / 3.6,
      },
      { id: 'detach', label: 'Detach winch', icon: 'detach', enabled: t.winch.attached },
      {
        id: 'rearDiff',
        label: v.differentials.rear ? 'Unlock rear diff' : 'Lock rear diff',
        icon: 'feature',
        enabled: v.differentials.rear || Math.abs(v.speed) <= vehicleTuning.crawling.diffLockMaxKmh / 3.6,
      },
      planks,
      {
        id: 'precision',
        label: v.precisionCrawl ? 'Disable precision crawl' : 'Enable precision crawl',
        icon: 'feature',
        enabled: true,
      },
    ];
  }

  private pickTool(id: string): void {
    if (id === 'winch' && !this.tool.startWinchTarget()) this.hud.toast('No anchor in reach');
    else if (id === 'planks') this.tool.startPlanks();
    else if (id === 'recall') this.sim.recallPlanks(LOCAL_VEHICLE);
    else if (id === 'detach') this.sim.detachWinch(LOCAL_VEHICLE);
    else if (id === 'frontDiff' || id === 'rearDiff' || id === 'precision') this.input.requestDriveAction(id);
  }

  private onToolEvent(e: ToolEvent): void {
    switch (e.type) {
      case 'winchAttached':
        this.hud.toast(`Winch attached to ${e.anchor.label.toLowerCase()}`);
        break;
      case 'winchDetached':
        this.hud.toast('Winch detached');
        break;
      case 'noAnchor':
        this.hud.toast('No anchor in reach');
        break;
      case 'planksPlaced':
        this.hud.toast('Planks down');
        break;
      case 'planksPickedUp':
        this.hud.toast(`Planks back on the rack (${this.sim.toolsOf(LOCAL_VEHICLE).planks.carried}/2)`);
        break;
      case 'planksRecalled':
        this.hud.toast('Planks recalled');
        break;
      case 'righted':
        this.hud.toast('Back on its wheels');
        break;
    }
  }

  cameraHeading(): number {
    this.view.camera.getWorldDirection(this.camDir);
    return headingOf(this.camDir.x, this.camDir.z);
  }

  // --- Loop -----------------------------------------------------------------

  private step(dt: number): void {
    const inp = this.input.vehicleInput(dt);
    if (this.scriptedInput) Object.assign(inp, this.scriptedInput);
    if (this.autopilot) Object.assign(inp, this.autopilot.input(this.vehicle, dt));
    // Park on the handbrake while placing planks, choosing an anchor or in the tool menu.
    if (this.tool.mode !== 'drive' || this.toolMenu.isOpen) {
      inp.throttle = 0;
      inp.brake = 0;
      inp.steer = 0;
      inp.handbrake = this.tool.mode !== 'drive';
      inp.winchAttach = false;
      inp.interact = false;
      inp.toggleFrontDiff = false;
      inp.toggleRearDiff = false;
      inp.togglePrecision = false;
    }
    this.inputs.set(LOCAL_VEHICLE, inp);
    this.sim.step(this.inputs, dt);
    const p = this.vehicle.body.translation();
    const found = this.exploration.check(p.x, p.z);
    for (const poi of found.discovered) this.hud.discovered(poi.name, poi.kind);
    if (found.discovered.length > 0) this.audio.discovery();
    if (found.campsite) {
      const camp = this.world.pois.find((q) => q.id === found.campsite);
      if (camp && !found.discovered.includes(camp)) this.hud.toast(`Campsite: ${camp.name}`);
    }
    if (found.discovered.length > 0 || found.campsite) this.save();
    const v = this.vehicle;
    const run = this.crawlRuns.update({
      x: p.x,
      z: p.z,
      tiltDeg: v.tiltDeg(),
      knock: v.bodyContact.knock > 0,
      winchAttached: this.sim.toolsOf(LOCAL_VEHICLE).winch.attached,
      dt,
    });
    if (run) this.onCrawlRun(run);
  }

  private onCrawlRun(e: CrawlRunEvent): void {
    if (e.type === 'started') {
      this.hud.toast(`${e.run.trail.name}: scored run started`, 1600);
      return;
    }
    const r = e.result;
    const parts = [
      r.reverses ? `${r.reverses} back-up${r.reverses === 1 ? '' : 's'}` : '',
      r.knocks ? `${r.knocks} knock${r.knocks === 1 ? '' : 's'}` : '',
      r.winches ? `winch ×${r.winches}` : '',
    ].filter(Boolean);
    if (e.type === 'failed') {
      this.hud.toast(`${r.name}: run over — ${r.dnf === 'rolled' ? 'rolled' : 'left the line'}`, 2600);
      return;
    }
    const best = this.crawlRuns.bests[r.trailId];
    const points = r.points === 0 ? 'clean run' : `${r.points} penalty point${r.points === 1 ? '' : 's'}`;
    this.hud.runResult(
      e.best ? 'New best' : 'Run complete',
      `${r.name} · ${clock(r.seconds)}`,
      `${points}${parts.length ? ` (${parts.join(', ')})` : ''}${e.best ? '' : ` · best ${clock(best.seconds)}, ${best.points} pts`}`,
    );
    this.audio.discovery();
    this.save();
  }

  /** Menus, map and tool menu input; runs every frame. */
  private handleUi(): void {
    const inp = this.input;
    if (this.map.isOpen) {
      if (inp.pressed('map') || inp.pressed('back') || inp.pressed('pause')) this.closeMap();
      return;
    }
    if (this.pause.isOpen) {
      const backs = inp.pressCount('back');
      if (inp.pressed('pause') && backs === 0) this.closePause();
      else if (backs > 0) {
        for (let k = 0; k < backs; k++)
          if (this.pause.navigate('back')) {
            this.closePause();
            break;
          }
      } else {
        for (let k = inp.pressCount('menuUp'); k > 0; k--) this.pause.navigate('up');
        for (let k = inp.pressCount('menuDown'); k > 0; k--) this.pause.navigate('down');
        for (let k = inp.pressCount('menuLeft'); k > 0; k--) this.pause.navigate('left');
        for (let k = inp.pressCount('menuRight'); k > 0; k--) this.pause.navigate('right');
        if (inp.pressed('confirm')) this.pause.navigate('confirm');
      }
      return;
    }
    if (this.toolMenu.isOpen) {
      if (!inp.held('toolMenu')) this.toolMenu.close(true);
      else {
        const s = inp.stick();
        const kx = (inp.held('menuRight') ? 1 : 0) - (inp.held('menuLeft') ? 1 : 0);
        const ky = (inp.held('menuDown') ? 1 : 0) - (inp.held('menuUp') ? 1 : 0);
        this.toolMenu.pointAt(s.x + kx, s.y + ky, 0.4);
      }
      return;
    }
    if (this.tool.mode !== 'drive') return;
    if (inp.pressed('pause')) this.openPause();
    else if (inp.pressed('map')) this.openMap();
    else if (inp.pressed('toolMenu')) this.toolMenu.open(this.toolOptions());
  }

  private renderFrame(alpha: number, frameDt: number): void {
    this.input.poll();
    this.clock += frameDt;
    const cameraWasEnabled = !this.freeCamOn && !this.loop.paused && !this.toolMenu.isOpen;
    const usedByTool = this.tool.update(frameDt);
    const cameraChord =
      this.input.pressed('cameraReset') &&
      this.input.held('toolMenu') &&
      !this.loop.paused &&
      !this.freeCamOn &&
      this.tool.mode === 'drive';
    if (cameraChord) {
      this.toolMenu.close(false);
      this.chase.cyclePreset();
    } else if (!usedByTool) this.handleUi();
    this.input.vehicleEnabled =
      !this.freeCamOn && !this.toolMenu.isOpen && !this.loop.paused && this.tool.mode === 'drive';
    const cameraEnabled = !this.freeCamOn && !this.loop.paused && !this.toolMenu.isOpen;
    this.cameraDrag.update();
    // Always drain the wheel, including while menus or the debug camera use it.
    const zoom = this.input.takeZoom(frameDt, this.tool.mode === 'drive');
    if (cameraEnabled && cameraWasEnabled) {
      const orbit = this.input.cameraOrbit(frameDt);
      this.chase.orbit(orbit.yaw, orbit.pitch);
      this.chase.zoom(zoom);
      if (this.input.pressed('cameraReset') && !cameraChord) this.chase.recenter();
      if (this.input.pressed('cameraPreset') && this.tool.mode === 'drive') this.chase.cyclePreset();
      if (this.input.pressed('gauges')) {
        const modes = ['auto', 'on', 'off'] as const;
        this.hud.gaugeMode = modes[(modes.indexOf(this.hud.gaugeMode) + 1) % modes.length];
        this.hud.toast(
          { auto: 'Crawl gauges: in low range', on: 'Crawl gauges: always', off: 'Crawl gauges: off' }[
            this.hud.gaugeMode
          ],
          1400,
        );
      }
    }
    this.hud.cockpitView = this.chase.preset === 'cockpit' && !this.freeCamOn;
    this.model.setCockpitView(this.hud.cockpitView);
    this.hud.cameraHelp(
      this.input.activeDevice,
      cameraEnabled,
      this.tool.mode === 'drive',
      this.chase.preset,
    );
    const v = this.vehicle;
    const tools = this.sim.toolsOf(LOCAL_VEHICLE);
    this.anchorCheck -= frameDt;
    if (this.anchorCheck <= 0) {
      this.anchorCheck = 0.4;
      this.anchorInReach = this.sim.findAnchors(LOCAL_VEHICLE).length > 0;
    }
    this.model.update(v, this.loop.paused ? 1 : alpha, frameDt);
    this.model.applyCondition(v.condition);
    this.model.setPlanksOnRack(tools.planks.carried);
    this.toolsView.update(v, tools, this.sim.probeGround, this.clock);
    this.view.particles.update(v, this.loop.paused ? 0 : frameDt);
    if (this.freeCamOn) this.freeCam.update(frameDt);
    else if (!this.loop.paused) {
      this.chase.toolView = this.tool.mode !== 'drive';
      const p = this.model.root.position;
      this.tmpPos.copy(p);
      const f = v.forward();
      this.tmpFwd.set(f.x, f.y, f.z);
      this.chase.update(frameDt, {
        position: this.tmpPos,
        forward: this.tmpFwd,
        speed: v.speed,
        slopeDeg: this.world.terrain.slopeDegAt(p.x, p.z),
        rotation: this.model.root.quaternion,
      });
    }
    this.view.focus.copy(this.model.root.position);
    const t0 = performance.now();
    this.view.render();
    this.sceneMs += (performance.now() - t0 - this.sceneMs) * 0.1;
    this.audio.update(buildAudioFrame(v, tools.winch, this.world, this.loop.paused, frameDt));
    this.hud.update(
      buildHudState({
        vehicle: v,
        tools,
        device: this.input.activeDevice,
        mode: this.tool.mode,
        cameraHeading: this.cameraHeading(),
        discovered: this.exploration.discovered,
        pois: this.world.pois,
        crawlCourses: this.world.map.crawlCourses,
        crawlTrails: this.world.map.crawlTrails,
        tracks: this.world.features.tracks,
        anchorInReach: this.anchorInReach,
        run: this.crawlRuns.run,
      }),
    );
    if (this.overlay) {
      const w = tools.winch;
      const fl = v.condition.flood;
      this.overlay.setLines([
        ...(this.debugTools?.update(v) ?? []),
        `winch ${w.anchor ? `${w.anchor.label} ${w.length.toFixed(1)} m ${(w.tension / 1000).toFixed(1)} kN` : 'off'}  planks ${tools.planks.carried}/2  jack ${tools.jack.state}`,
        `flood ${fl.timer.toFixed(1)} s${fl.stalled ? ' STALLED' : ''}  dirt ${v.condition.dirt.sides.toFixed(2)}  dents ${v.condition.dents.length}  mode ${this.tool.mode}`,
        `cpu ${(this.loop.timings.sim + this.loop.timings.render).toFixed(1)} ms: sim ${this.loop.timings.sim.toFixed(1)} ms (${this.loop.timings.steps.toFixed(1)} steps)  frame ${this.loop.timings.render.toFixed(1)} ms (three.js ${this.sceneMs.toFixed(1)} ms)`,
        audioLine(this.audio),
        `particles: ${this.view.particles.counts()}`,
      ]);
      this.overlay.frame(frameDt, this.view.renderer);
    }
    this.input.consumeUi();
    this.frameCount++;
    if (this.frameCount === 3 && window.__game) window.__game.ready = true;
  }
}

function audioLine(audio: AudioSystem): string {
  const a = audio.info();
  if (a.state !== 'running') return `audio ${a.state}${a.state === 'off' ? ' (click or press a key)' : ''}`;
  const tyres = Object.entries(a.tyres)
    .map(([k, w]) => `${k} ${w.toFixed(2)}`)
    .join(' ');
  return `audio ${(20 * Math.log10(a.level + 1e-6)).toFixed(0)} dB  engine ${a.engineHz.toFixed(0)} Hz (${a.engineVoice})  scrape ${a.scrape.toFixed(2)}  wind ${a.wind.toFixed(2)}  water ${a.water.toFixed(2)}  ${tyres}${a.winchHz ? `  winch ${a.winchHz.toFixed(0)} Hz` : ''}`;
}
