import { controllers, type ControllerType } from '../data/controllers';
import { loadFj40Glb } from '../render/fj40Glb';
import type { ControlInstruction } from '../data/controlInstructions';
import * as THREE from 'three';
import { maps } from '../data/maps';
import { devEnvironment, devFlood, isDevMode, type DevWeather } from '../data/devWeather';
import { environmentFor, presetHours, type Conditions } from '../data/environment';
import { episodeWeatherAt } from '../data/weatherTimeline';
import { scoreRun, type RunScore } from '../sim/runScore';
import { SectionTimes, timedSections, type SectionTime } from '../sim/sectionTimes';
import { GhostGap, GhostRecorder, loadGhost, minSec, saveGhost, type GhostTrace } from '../sim/ghost';
import { GhostView } from '../render/ghostView';
import { strandedPose } from '../sim/stranded';
import {
  clockTime,
  levelTitle,
  episodes,
  type EpisodeDef,
  type EpisodeId,
  type EpisodeLoadout,
  type StrandedDriverDef,
} from '../data/episodes';
import { usePalette } from '../render/colors';
import { qualityFor, qualityPresets } from '../data/quality';
import type { DamageMode } from '../data/damage';
import type { VehicleId } from '../data/vehicle';
import { vehicleLoadout, vehicles } from '../data/vehicles';
import { packWeights, rememberPack, type SavedPacks } from '../data/packing';
import { cameraTuning } from '../data/camera';
import { buildWorldSteps, type World } from '../sim/world/world';
import { SeenGround } from '../sim/seenGround';
import { addPuddles } from '../sim/world/puddles';
import { prepareFlood } from '../sim/world/flood';
import {
  conditionById,
  conditionFor,
  isTrackConditionId,
  mapForCondition,
  rollTrackCondition,
  stormFor,
  type TrackCondition,
} from '../data/trackConditions';
import { loadRapier } from '../sim/physics';
import { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { repairAll } from '../sim/vehicle/damage';
import { pressurePsi, tyrePressures } from '../sim/vehicle/tyrePressure';
import { InputManager } from '../sim/input/inputManager';
import type { Autopilot } from '../sim/input/autopilot';
import type { VehicleInput } from '../sim/input/vehicleInput';
import type { PoiDef } from '../sim/world/mapTypes';
import { poiApproach } from '../sim/world/poiApproach';
import { headingOf } from '../sim/vehicle/math';
import { Exploration } from '../sim/exploration';
import { SideTrips } from '../sim/sideTrips';
import { Finds } from '../sim/finds';
import { FindMarkers } from '../render/finds';
import { StuckVehicleView } from '../render/stuckVehicleView';
import { RutsView } from '../render/ruts';
import { WheelMarksView } from '../render/wheelMarks';
import { wheelMarkSpots } from '../sim/world/wheelMarks';
import type { TrailerTuning } from '../data/trailers';
import { hitchSupplyTrailer, supplyDelivered, supplyRun } from '../sim/supplyRun';
import { applyCheckpoint, checkpointAt, EpisodeRun, startCheckpoint, type Checkpoint } from '../sim/episode';
import { planSurprises } from '../sim/world/surprisePlan';
import { defaultSettings, loadSave, writeSave, type EpisodeProgress, type Settings } from '../sim/save/save';
import { CrawlRuns, type CrawlBests, type CrawlRunEvent } from '../sim/crawlRuns';
import { GateCount, footprintSize, type GateEvent } from '../sim/gateCount';
import { ScoredGates, gateScore, type ScoredGateEvent } from '../sim/scoredGates';
import { clock, gateLapDetail } from '../ui/hud';
import type { ToolEvent } from '../sim/tools/tools';
import { GameRenderer } from '../render/renderer';
import { VehicleModel } from '../render/vehicleModel';
import { ChaseCamera } from '../render/chaseCamera';
import { VrMode } from '../render/vrMode';
import { VrDash } from '../render/vrDash';
import { CameraDrag } from '../render/cameraDrag';
import { ToolsView } from '../render/tools';
import { Hud } from '../ui/hud';
import { ToolMenu, type ToolOption } from '../ui/toolMenu';
import { TouchControls, isTouchDevice } from '../ui/touchControls';
import { touchTuning } from '../data/touch';
import { PaperMap } from '../ui/paperMap';
import { Fade, PauseMenu, showGearboxSetting, type PauseStatusCell } from '../ui/menus';
import { HistoryCard, ResultCard, type ResultButton } from '../ui/episodeCards';
import { FreeCamera } from '../debug/freeCamera';
import { DebugOverlay } from '../debug/overlay';
import { DebugTools } from '../debug/debugTools';
import { DevPanel } from '../debug/devPanel';
import { AudioSystem } from '../audio/audioSystem';
import { buildAudioFrame } from '../audio/frame';
import { GameLoop } from './loop';
import { wireSimFeedback } from './simFeedback';
import { TrafficCars } from './trafficCars';
import { AnchorPicker } from './anchorPicker';
import { LowRangeHint, waterAhead } from './lowRangeHint';
import { RecoveryCue } from './recoveryCue';
import { DeliveryViews } from './deliveryViews';
import { ToolController } from './toolController';
import { pendingUpdate } from './update';
import { VR_PAGE } from './buildInfo';
import { buildHudState, CourseHintCache, episodeHud } from './hudState';
import { applyHudStyle } from '../data/hudStyles';
import { applyUiSize } from '../ui/uiScale';
import { installHook } from './testHook';
import { Bench } from '../debug/bench';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export const LOCAL_VEHICLE = 'player-1';

/** What the welcome screen chose: which episode, in what, and how to start it. */
export interface LaunchChoice {
  episode: EpisodeId;
  vehicle: VehicleId;
  /** Carry on from the last camp reached (else start the episode afresh). */
  resume: boolean;
  /** Replay a finished episode in chosen conditions (null: the story's own). */
  replay: Conditions | null;
  /** The damage setting picked on the welcome screen (else the saved one). */
  damage?: DamageMode;
  /** Title-screen settings, also applied in test mode without writing to the real save. */
  settings?: Settings;
  /** What a new run sets out with (else the standard load). */
  load?: EpisodeLoadout;
  /** A new run is the Army supply run, towing fuel drums to Wujal Wujal. */
  supply?: boolean;
}

/** The episode being played: its story, where this run starts, and progress on them all. */
interface EpisodeSetup {
  def: EpisodeDef;
  /** How the track was found today (src/data/trackConditions.ts). */
  condition: TrackCondition;
  checkpoint: Checkpoint;
  replay: Conditions | null;
  progress: Partial<Record<EpisodeId, EpisodeProgress>>;
  /** The load last packed for each vehicle. */
  packs: SavedPacks;
}

/**
 * Orchestrates the simulation, rendering, UI and input for the local player.
 */
export class Game {
  readonly debug: boolean;
  readonly loop: GameLoop;
  readonly input: InputManager;
  readonly freeCam: FreeCamera;
  readonly chase: ChaseCamera;
  /** Headset play (v1.98): the driver's seat in a headset, with its hand controllers. */
  readonly vr: VrMode;
  readonly vrDash = new VrDash();
  /** The headset session was left for a menu: go back into it when the menu closes. */
  private vrResume = false;
  /** The headset page's cover over the window (v2.02): a press on it starts the headset. */
  private vrPrompt: HTMLButtonElement | null = null;
  private readonly cameraDrag: CameraDrag;
  /** Winch anchors in reach, the chooser on USE, and a tap on one to pick it. */
  private readonly anchors: AnchorPicker;
  /** Teaches low range before the first water, once a run. */
  private readonly lowRangeHint = new LowRangeHint();
  /** After a winch pull or righting the car: the way back to the line (v2.24). */
  private readonly recoveryCue = new RecoveryCue();
  private showRecoveryCue = false;
  /** A warning or a recovery was up last frame: the history note makes way when one starts. */
  private wasUrgent = false;
  private readonly waterDepthAt = (x: number, z: number): number => this.world.terrain.waterDepthAt(x, z);
  readonly overlay: DebugOverlay | null;
  private readonly debugTools: DebugTools | null;
  /** Test mode (`?dev`): weather, clock, place and vehicle set by hand; nothing is saved. */
  readonly dev: boolean;
  private readonly devPanel: DevPanel | null;
  /** The weather set by hand in test mode (null: the episode's own). */
  private devWeather: DevWeather | null = null;
  /** Test mode has set the clock or the weather, so a replay's fixed conditions give way. */
  private devTookOver = false;
  model: VehicleModel;
  /** Other people's bogged vehicles, as drawn. */
  private readonly stuckViews: StuckVehicleView[] = [];
  /** The trailers and loose drums drawn (the supply run, test mode's hitch). */
  private readonly delivery: DeliveryViews;
  /** Which vehicle the player drives (saved). */
  vehicleId: VehicleId;
  /** The episode being played, and this run of it: clock, mission and how it ends. */
  readonly episode: EpisodeDef;
  /** How the track was found today: rolled from the run's seed. */
  readonly condition: TrackCondition;
  readonly run: EpisodeRun;
  /** Replaying in chosen conditions: the clock stands still and there's no deadline. */
  readonly replay: Conditions | null;
  /** Where this run restarts from: the last camp reached. */
  checkpoint: Checkpoint;
  /** Progress on every episode, kept in the save. */
  private readonly progress: Partial<Record<EpisodeId, EpisodeProgress>>;
  private readonly packs: SavedPacks;
  /** Ground the car has been near this run: all the paper map shows. */
  private seen: SeenGround;
  readonly history: HistoryCard;
  readonly result: ResultCard;
  /** The clock time the light was last set for, and whether it was dark enough for the lamps. */
  private envHour: number;
  /** The clock time the storm's HUD notes were last checked at. */
  private noteHour: number;
  private lampBeams: boolean;
  readonly toolsView: ToolsView;
  readonly tool: ToolController;
  readonly exploration: Exploration;
  /** Things to load off the main line, and what's been taken since the start. */
  readonly finds: Finds;
  readonly sideTrips: SideTrips;
  private readonly findMarkers: FindMarkers;
  /** Optional scored runs on the crawl trails. */
  readonly crawlRuns: CrawlRuns;
  readonly sectionTimes: SectionTimes;
  /** This run's path, and the best run's car following its own (null before a first finish). */
  private readonly ghostRecorder: GhostRecorder;
  private ghostTrace: GhostTrace | null;
  private ghost: GhostView | null = null;
  private ghostGap: GhostGap | null = null;
  /** Seconds behind the ghost (negative: ahead). */
  private ghostBehind = 0;
  /** Cars coming the other way on a narrow track, as simulated and drawn. */
  private readonly trafficCars: TrafficCars;
  private churnNoted = false;
  private readonly ruts: RutsView;
  /** Stranded drivers winched out so far this run. */
  private strandedFreed = new Set<string>();
  /** The supply run's drums are delivered (shown once). */
  private supplyDone = false;
  /** The winch has been used this run (since the start, through restarts from camp). */
  private winched = false;
  /** Gates driven on a gate trail (Crawler Creek). */
  readonly gateCount: GateCount;
  readonly scoredGates: ScoredGates | null;
  readonly hud: Hud;
  readonly toolMenu: ToolMenu;
  readonly touch: TouchControls;
  readonly map: PaperMap;
  readonly pause: PauseMenu;
  private readonly fade: Fade;
  readonly audio: AudioSystem;
  settings: Settings;
  freeCamOn = false;
  scriptedInput: Partial<VehicleInput> | null = null;
  /** Drives the car along a path (scripted test drives). */
  autopilot: Autopilot | null = null;
  /** The phone test (`?bench`), once it starts. */
  private bench: Bench | null = null;
  /** The course hint's track search, a few times a second (v1.49). */
  private readonly hintCache = new CourseHintCache();
  private readonly trackDistanceAt = (x: number, z: number): number =>
    this.world.features.trackDistance[this.world.terrain.index(x, z)];
  /** `?bench` times every refresh, so it runs without the frame cap. */
  private readonly benchMode = new URLSearchParams(location.search).has('bench');
  /** Main-thread time spent in three.js rendering per frame (ms, smoothed). */
  sceneMs = 0;
  /** Called when settings change (audio hooks in here). */
  onSettings: ((s: Settings) => void) | null = null;
  private readonly inputs = new Map<string, VehicleInput>();
  private frameCount = 0;
  private clock = 0;
  /** Layout checks: keep the swept and flooded warnings up, then put the car back. */
  private pinnedHazards: { swept?: boolean; flooded?: boolean } | null = null;
  private hazardSnapshot: {
    swept: number;
    stalled: boolean;
    submerged: boolean;
    timer: number;
    dryTime: number;
  } | null = null;
  private storageOk = true;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly motionRotation = new THREE.Quaternion();
  private readonly camDir = new THREE.Vector3();

  private constructor(
    readonly world: World,
    readonly sim: Simulation,
    readonly view: GameRenderer,
    uiRoot: HTMLElement,
    settings: Settings,
    exploration: Exploration,
    crawlBests: CrawlBests,
    vehicleId: VehicleId,
    setup: EpisodeSetup,
    audioContext?: AudioContext,
  ) {
    this.debug = new URLSearchParams(location.search).has('debug');
    this.dev = isDevMode();
    this.settings = settings;
    this.exploration = exploration;
    this.vehicleId = vehicleId;
    this.episode = setup.def;
    this.condition = setup.condition;
    this.replay = setup.replay;
    this.checkpoint = setup.checkpoint;
    this.strandedFreed = new Set(setup.checkpoint.stranded);
    this.winched = setup.checkpoint.winched === true;
    this.progress = { ...setup.progress };
    this.packs = setup.packs;
    this.seen = this.seenFrom(setup.checkpoint, world);
    this.run = new EpisodeRun(setup.def, setup.checkpoint, !setup.replay);
    // Test mode: no deadline, and a replay's clock starts at the hour its light shows.
    if (this.dev) {
      this.run.noTimeLimit = true;
      const preset = presetHours.find(([, t]) => t === setup.replay?.time);
      if (preset) this.run.hour = preset[0];
    }
    this.envHour = this.run.hour;
    this.noteHour = this.run.hour;
    this.lampBeams = sim.env.lampBeams;
    const tuning = vehicles[vehicleId].tuning;
    this.crawlRuns = new CrawlRuns(world.map.crawlTrails ?? [], world.features.tracks, crawlBests);
    // Both follow the generated tracks' dense centrelines, not the authored control points.
    this.sectionTimes = new SectionTimes(
      timedSections(setup.def.timedSections ?? [], world.features.tracks),
      setup.progress[setup.def.id]?.sectionBests ?? {},
    );
    this.trafficCars = new TrafficCars(
      setup.def.traffic,
      world.features.tracks,
      sim,
      view.scene,
      (x, z) => world.terrain.heightAt(x, z),
      (text, ms) => this.hud.toast(text, ms),
    );
    this.gateCount = new GateCount(world.features.gates);
    const gateCourse = world.map.gateCourse;
    const gateTrack = world.features.tracks.find((t) => t.def.id === gateCourse?.trackId);
    this.scoredGates =
      gateCourse && gateTrack
        ? new ScoredGates(gateCourse, this.gateCount, gateTrack, this.crawlRuns.bests)
        : null;
    this.input = new InputManager(window);
    this.input.setSteering(tuning.steering);
    this.audio = new AudioSystem(settings, window, audioContext);
    this.audio.setVehicle(vehicleId);
    // The run starts at its checkpoint's camp, with what was on board there.
    const camp = exploration.lastCampsite || world.map.spawnCampsite;
    sim.addVehicle(LOCAL_VEHICLE, sim.campsitePose(camp, tuning.wheelRadius), tuning);
    this.vehicle.packing = packWeights(setup.def.loadout, vehicleId);
    sim.setDamage(settings.damage);
    sim.fuelScale = setup.def.fuelScale;
    applyCheckpoint(this.vehicle, this.checkpoint);
    if (this.checkpoint.delivery) sim.restoreDelivery(this.checkpoint.delivery, LOCAL_VEHICLE);
    else if (this.checkpoint.supply) {
      hitchSupplyTrailer(sim, tuning, LOCAL_VEHICLE);
      this.checkpoint.delivery = sim.deliveryState();
    }
    this.delivery = new DeliveryViews(
      sim,
      view.scene,
      LOCAL_VEHICLE,
      () => this.vehicle,
      (text, ms) => this.hud.toast(text, ms),
    );
    this.delivery.sync();

    // Arriving at dusk or night, the headlights are already on.
    if (sim.env.lampBeams) this.vehicle.lights = 'low';
    this.model = new VehicleModel(tuning, sim.env.lampBeams);
    view.mirrors.setVehicle(this.model);
    view.scene.add(this.model.root);
    this.sideTrips = new SideTrips(setup.def.sideTrips ?? [], world.pois, this.checkpoint.sideTrips);
    this.finds = new Finds(world.map.finds ?? [], this.checkpoint.taken);
    for (const s of sim.stuck.values()) {
      const look = setup.def.stranded?.find((d) => d.id === s.def.id)?.look ?? 'shortie';
      const drawn = new StuckVehicleView(s, vehicles[look].tuning);
      drawn.model.root.name = `stuck-${s.def.id}`;
      this.stuckViews.push(drawn);
      view.scene.add(drawn.model.root);
    }
    this.ghostRecorder = new GhostRecorder(setup.checkpoint.elapsed);
    this.ghostTrace = loadGhost(setup.def.id);
    if (this.ghostTrace) {
      this.ghost = new GhostView(this.ghostTrace, vehicles[this.ghostTrace.vehicle].tuning);
      this.ghost.update(this.run.elapsed);
      this.ghostGap = new GhostGap(this.ghostTrace, setup.checkpoint.elapsed);
      view.scene.add(this.ghost.model.root);
    }
    this.ruts = new RutsView(sim.churn, (x, z) => world.terrain.heightAt(x, z));
    view.scene.add(this.ruts.mesh);
    // Worn wheel lines where the map has them: which way others have driven (v2.25).
    const wheelMarks = wheelMarkSpots(world.features.tracks, (x, z) => world.terrain.waterDepthAt(x, z));
    if (wheelMarks.length)
      view.scene.add(new WheelMarksView(wheelMarks, (x, z) => world.terrain.heightAt(x, z)).mesh);
    this.findMarkers = new FindMarkers(world);
    this.findMarkers.show(this.finds.defs, this.finds.taken);
    view.scene.add(this.findMarkers.group);
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
    this.chase.seat = vehicles[vehicleId].cabin;
    this.chase.headMotionEnabled = settings.headMotion;
    this.chase.scale = vehicles[vehicleId].cameraScale ?? 1;
    this.freeCam = new FreeCamera(view.camera, view.renderer.domElement);
    this.vr = new VrMode(view.renderer, view.scene, view.camera);
    this.vr.cab.add(this.vrDash.mesh);
    this.input.headsetPad = () => this.vr.virtualPad();
    this.vr.onChange((on) => this.headsetChanged(on));

    this.hud = new Hud(uiRoot, (action) => this.input.requestDriveAction(action));
    this.hud.units = settings.units;
    this.hud.style = settings.hudStyle;
    applyHudStyle(settings.hudStyle);
    this.hud.setControllerType(settings.controller);
    this.hud.onCameraReset = () => this.chase.recenter();
    this.hud.onToast = (text, ms) => this.vrDash.toast(text, ms);
    this.hud.onCameraPreset = () => this.chase.cyclePreset();
    this.toolMenu = new ToolMenu(uiRoot);
    this.toolMenu.onPick = (id) => this.pickTool(id);
    this.touch = new TouchControls(uiRoot, this.input);
    this.input.setTouchDrive(settings.touchDrive);
    this.touch.setDriveScheme(settings.touchDrive);
    this.touch.setStickSide(settings.touchStickSide);
    if (isTouchDevice()) this.input.usePointer('touch');
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
          void this.restartFromCamp();
        },
        changeSettings: (s) => this.changeSettings(s),
        changeVehicle: (id) => {
          this.closePause();
          void this.changeVehicle(id);
        },
        mainMenu: () => {
          this.closePause();
          void this.toMainMenu();
        },
        restartForUpdate: () => void this.restartForUpdate(),
      },
      settings,
    );
    this.pause.setVehicle(vehicleId);
    this.pause.setEpisode(setup.def);
    this.history = new HistoryCard(uiRoot, this.hud.notices, () => {
      this.loop.paused = this.pause.isOpen || this.map.isOpen || this.result.isOpen;
    });
    this.result = new ResultCard(uiRoot);
    // A new build downloaded during the drive waits for the pause menu (v1.23).
    pendingUpdate.onReady(() => {
      this.pause.setUpdateReady(true);
      this.hud.toast('A new version is ready: restart for it from the pause menu when you like', 6000);
    });
    this.fade = new Fade(uiRoot);

    this.overlay = this.debug ? new DebugOverlay(uiRoot) : null;
    this.debugTools = this.debug
      ? new DebugTools(uiRoot, view.scene, sim, tuning, () => this.vehicle, world.pois, {
          teleport: (p) => this.teleportToPoi(p),
          toggleFreeCam: () => this.toggleFreeCam(),
          bird: (kind) => this.audio.bird(kind),
          // Jump the clock to try the storm and the dusk (the light and weather follow).
          addTime: (hours) => {
            if (this.run.timed) this.run.hour += hours;
          },
        })
      : null;
    this.devPanel = this.dev
      ? new DevPanel(uiRoot, world.pois, (setup.def.storm ?? devFlood).creeks.maxRise, {
          hour: () => this.run.hour,
          setHour: (hour) => {
            this.run.hour = hour;
            this.noteHour = hour;
            this.devTookOver = true;
            this.updateEnvironment(true);
          },
          stopClock: (stopped) => (this.run.clockStopped = stopped),
          setWeather: (w) => {
            this.devWeather = w;
            this.devTookOver = true;
            this.updateEnvironment(true);
          },
          teleport: (p) => this.teleportToPoi(p),
          vehicle: (id) => {
            if (id === this.vehicleId) return;
            void this.fade.run(() => this.swapVehicle(id));
            this.hud.toast(vehicles[id].tuning.name, 1800);
          },
          mainMenu: () => void this.toMainMenu(),
          trailer: (drums, kind) => this.devTrailer(drums, kind),
        })
      : null;
    window.addEventListener('keydown', (e) => {
      if (this.debug && e.code === 'Backquote' && !e.repeat) this.toggleFreeCam();
    });

    sim.events.on('tool', ({ event }) => this.onToolEvent(event));
    sim.events.on('rescued', ({ id }) => {
      const stranded = this.episode.stranded?.find((d) => d.id === id);
      if (stranded) this.onStrandedFreed(stranded);
    });
    wireSimFeedback(sim, this.hud, this.audio, {
      vehicleId: LOCAL_VEHICLE,
      vehicle: () => this.vehicle,
      controller: () => this.controllerShown,
    });

    this.loop = new GameLoop(
      {
        step: (dt) => this.step(dt),
        render: (alpha, frameDt) => this.renderFrame(alpha, frameDt),
      },
      view.renderer,
    );
    if (VR_PAGE) this.addVrPrompt(uiRoot);
    this.applyFrameRate();
    this.cameraDrag = new CameraDrag(
      view.renderer.domElement,
      () => !this.freeCamOn && !this.loop.paused && !this.toolMenu.isOpen,
      (yaw, pitch, pointerType) => {
        this.input.usePointer(pointerType);
        this.chase.orbit(yaw, pitch);
      },
      (steps) => {
        this.input.usePointer('touch');
        this.chase.zoom(steps);
      },
    );
    // Touching the view brings the touch controls back after a key or gamepad hid them.
    view.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.input.usePointer('touch');
    });
    this.anchors = new AnchorPicker(
      sim,
      this.tool,
      LOCAL_VEHICLE,
      () => this.vehicle,
      view.camera,
      view.renderer.domElement,
    );
    installHook(this);
    // Draw the paper map in the background so the first open is instant.
    setTimeout(() => void this.map.prepare(), 2500);
  }

  /**
   * Start loading the physics engine (a 3 MB WebAssembly file) ahead of create(), from the
   * title screen once this script has downloaded (v1.46). create() waits for the same load,
   * and asks again if this one failed.
   */
  static preload(): void {
    void loadRapier().catch(() => undefined);
    void loadFj40Glb();
  }

  /**
   * Load the chosen world and start. `audioContext` is created by the click that chose
   * it, so sound can start with the engine (browsers only allow that from a gesture).
   */
  static async create(
    appEl: HTMLElement,
    uiEl: HTMLElement,
    choice: LaunchChoice,
    progress: (p: number, label: string) => void,
    audioContext?: AudioContext,
  ): Promise<Game> {
    const save = loadSave();
    // Phones and tablets start on the lightest graphics preset.
    const settings = {
      ...(save?.settings ?? {
        ...defaultSettings,
        quality: isTouchDevice() ? touchTuning.defaultQuality : defaultSettings.quality,
      }),
      ...choice.settings,
      ...(choice.damage ? { damage: choice.damage } : {}),
    };
    const def = episodes[choice.episode];
    const mapDef = maps[def.mapId].def;
    const episodeProgress = save?.episodes ?? {};
    const saved = episodeProgress[def.id]?.checkpoint;
    // ?seed=N starts a new run with that run's surprises; ?surprises=off leaves them out.
    const params = new URLSearchParams(location.search);
    const seed = Math.floor(Number(params.get('seed')));
    const checkpoint =
      choice.resume && saved && mapDef.pois.some((p) => p.id === saved.camp && p.kind === 'campsite')
        ? saved
        : startCheckpoint(
            def,
            mapDef.spawnCampsite,
            choice.vehicle,
            seed > 0 ? seed : undefined,
            choice.load,
          );
    // The Army supply run needs the camp it delivers to: no map here has it.
    if (choice.supply && checkpoint !== saved && mapDef.pois.some((p) => p.id === supplyRun.goal))
      checkpoint.supply = true;
    // A load packed by hand is remembered for this episode and vehicle; the standard one is not.
    const packs = choice.load
      ? rememberPack(save?.packs, def.id, def.loadout, choice.vehicle, choice.load)
      : { ...save?.packs };
    // How the track is found today, rolled from the run's seed, so a restart from a camp
    // (which keeps the seed) meets the same day. Replays pick their conditions by hand.
    // ?track=dry|reopened|wet pins the day, for comparing one against another and so the
    // browser tests meet a fixed track; otherwise it is rolled from the run's seed.
    const pinned = params.get('track');
    const condition = conditionFor(
      pinned && isTrackConditionId(pinned) ? conditionById(pinned) : rollTrackCondition(checkpoint.seed),
      def.conditions,
    );
    // Replays keep the conditions picked; the story's own run has its storm (if any).
    const storm = choice.replay ? undefined : stormFor(def.storm, condition);
    const weather = choice.replay
      ? { env: environmentFor(choice.replay), creekRise: 0, flowScale: 1 }
      : episodeWeatherAt(checkpoint.hour, def.weather, storm);
    const env = weather.env;
    // The map's own colours (red clay, greener grass) before any mesh is built.
    usePalette(mapDef.palette);
    const rapier = loadRapier();
    // A dry track's bogs have shrunk back; a wet one's are deeper. Same hollows either way.
    const gen = buildWorldSteps(choice.replay ? mapDef : mapForCondition(mapDef, condition));
    let r = gen.next();
    while (!r.done) {
      progress(r.value.progress, r.value.label);
      await nextFrame();
      r = gen.next();
    }
    const world = r.value;
    // Wet weather leaves puddles on the tracks (before physics and meshes read the ground).
    addPuddles(world, env);
    // A storm can raise the creeks over their low banks (in test mode, whatever the weather).
    const flood = storm ?? (isDevMode() ? (def.storm ?? devFlood) : undefined);
    if (flood) prepareFlood(world, flood);
    const exploration = new Exploration(world.pois, {
      discovered: checkpoint.discovered,
      lastCampsite: checkpoint.camp,
    });
    progress(0.86, 'Starting physics');
    await nextFrame();
    // fj40-blender-test: the Blender FJ40 must be loaded before the shortie is built.
    await loadFj40Glb();
    const sim = new Simulation(await rapier, world, env);
    sim.setWeather(env, weather.creekRise, weather.flowScale);
    // This run's surprises, from its seed: the same ones again after a restart from camp.
    if (def.surprises && params.get('surprises') !== 'off')
      sim.addSurprises(planSurprises(world, def.surprises, checkpoint.seed), checkpoint.surprises);
    for (const d of def.stranded ?? []) {
      const track = world.map.tracks.find((t) => t.id === d.track);
      const points = track?.points.map(([x, z]) => [x, z] as const);
      if (points) sim.addStuckVehicle(strandedPose(d, points), checkpoint.stranded?.includes(d.id));
    }
    progress(0.92, 'Building meshes');
    await nextFrame();
    // Sign lettering uses the web font; wait for it (but never block on a slow network).
    await Promise.race([document.fonts?.ready, new Promise((res) => setTimeout(res, 1500))]);
    const view = new GameRenderer(
      appEl,
      world,
      env,
      qualityFor(settings.quality, isTouchDevice()),
      sim.dynamics.values(),
    );
    view.setCreeks(weather.creekRise, weather.flowScale);
    return new Game(
      world,
      sim,
      view,
      uiEl,
      settings,
      exploration,
      save?.crawlBests ?? {},
      choice.vehicle,
      {
        // The storm as this condition meets it, so the run's weather follows the roll.
        def: storm === def.storm ? def : { ...def, storm },
        condition,
        checkpoint,
        replay: choice.replay,
        progress: episodeProgress,
        packs,
      },
      audioContext,
    );
  }

  get vehicle(): Vehicle {
    return this.sim.vehicles.get(LOCAL_VEHICLE) as Vehicle;
  }

  /**
   * Pose the car and the camera as the first frame will, build the ground and trees round
   * them, and compile every shader that frame needs, without blocking the page where the
   * browser can compile in parallel (v1.46). The first frames after Drive then draw at once
   * instead of stalling on dozens of shader compiles.
   */
  async precompile(): Promise<void> {
    this.model.update(this.vehicle, 1, 0);
    this.followVehicle(0);
    await this.view.precompile();
  }

  start(): void {
    // The Drive press on the briefing (Space, Enter, Cross or Options) is not a game press.
    this.input.clearEdges();
    this.loop.start();
    // On the headset page that press also starts the headset, while the browser still counts it.
    if (VR_PAGE && navigator.userActivation?.isActive) this.enterHeadset(true);
    // The engine is off as you arrive: the first press of the pedal starts it.
    this.sim.switchOffEngine(LOCAL_VEHICLE);
    // A run under way can be continued from the main menu, even before the first camp.
    this.keepCheckpoint();
    if (this.checkpoint.supply && this.checkpoint.elapsed === 0)
      this.hud.toast(
        `Army supply run: tow the trailer and its ${supplyRun.drums} drums of diesel to the camp at Wujal Wujal`,
        5000,
      );
    else if (this.ghostTrace)
      this.hud.toast(`Your best run (${minSec(this.ghostTrace.seconds)}) drives with you as a ghost`, 4000);
  }

  /** Turn the engine over on the starter, as the first press of the pedal does. */
  startEngine(): void {
    this.sim.startEngine(LOCAL_VEHICLE);
  }

  // --- Saving ---------------------------------------------------------------

  /** This episode's progress as saved. */
  private get episodeProgress(): EpisodeProgress {
    return this.progress[this.episode.id] ?? { completed: false };
  }

  /** Remember where this run restarts from (and save). */
  private keepCheckpoint(): void {
    this.progress[this.episode.id] = { ...this.episodeProgress, checkpoint: this.checkpoint };
    this.save();
  }

  /** Save, with the welcome screen to open on this episode. */
  save(): boolean {
    // Test mode leaves the real save alone.
    if (this.dev) return true;
    const ok = writeSave({
      version: 1,
      settings: this.settings,
      vehicle: this.vehicleId,
      episode: this.episode.id,
      episodes: this.progress,
      replay: this.replay,
      crawlBests: this.crawlRuns.bests,
      packs: this.packs,
    });
    if (!ok && this.storageOk) {
      this.storageOk = false;
      console.warn('4WD Simulator: browser storage is unavailable, progress will not be saved.');
    }
    return ok;
  }

  /**
   * Hold the "current is taking the car" and "engine flooded" warnings for a layout check.
   * Pass null to put the car back as it was.
   */
  pinHazards(pin: { swept?: boolean; flooded?: boolean } | null): void {
    if (pin) {
      if (!this.hazardSnapshot) {
        const f = this.vehicle.condition.flood;
        this.hazardSnapshot = {
          swept: this.vehicle.swept,
          stalled: f.stalled,
          submerged: f.submerged,
          timer: f.timer,
          dryTime: f.dryTime,
        };
      }
      this.pinnedHazards = pin;
      this.applyPinnedHazards();
      return;
    }
    this.pinnedHazards = null;
    const saved = this.hazardSnapshot;
    this.hazardSnapshot = null;
    if (!saved) return;
    const f = this.vehicle.condition.flood;
    this.vehicle.swept = saved.swept;
    f.stalled = saved.stalled;
    f.submerged = saved.submerged;
    f.timer = saved.timer;
    f.dryTime = saved.dryTime;
  }

  private applyPinnedHazards(): void {
    const pin = this.pinnedHazards;
    if (!pin) return;
    if (pin.swept) this.vehicle.swept = Math.max(this.vehicle.swept, 0.5);
    if (pin.flooded) {
      const f = this.vehicle.condition.flood;
      f.stalled = true;
      f.submerged = true;
      f.dryTime = 0;
    }
  }

  /** The frame cap (v1.49): on unless Settings says Screen, and off for the phone test. */
  private applyFrameRate(): void {
    // A headset needs a picture for every one of its frames.
    this.loop.capFrameRate = this.settings.frameRate !== 'screen' && !this.benchMode && !this.vr.presenting;
  }

  /** Button names as the player holds them: the headset's controllers while it is on. */
  private get controllerShown(): ControllerType {
    return this.vr.presenting ? 'quest' : this.settings.controller;
  }

  /**
   * The headset page (`?vr`, v2.02) is played in the headset, not in the window: while the
   * headset is off and no menu is open, a cover over the whole window waits for the press a
   * browser needs before it starts a headset. The ordinary page has no such thing.
   */
  private addVrPrompt(uiRoot: HTMLElement): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vr-enter hidden';
    b.innerHTML = `<span class="paper"><strong>4WD Simulator VR</strong><span class="vr-enter-how">Pull the trigger or click to take the driver's seat</span></span>`;
    b.addEventListener('click', () => this.enterHeadset());
    uiRoot.appendChild(b);
    this.vrPrompt = b;
    // A click that closes a menu is the press that lets the headset start again: ask at the
    // click, after the menu's own handler, not at the next frame, which on a slow machine can
    // come after the browser has stopped counting the press.
    window.addEventListener('click', () => this.syncHeadset());
    void VrMode.supported().then((ok) => {
      if (ok) return;
      const how = b.querySelector('.vr-enter-how') as HTMLElement;
      how.textContent = "This browser has no headset. Open this address in the headset's own browser.";
    });
  }

  /** Start the headset. `quiet`: an attempt the player did not ask for says nothing if refused. */
  private enterHeadset(quiet = false): void {
    this.vrResume = false;
    this.vr.enter().catch((err: unknown) => {
      if (!quiet) this.hud.toast(`The headset could not start: ${String(err)}`, 5000);
    });
  }

  /**
   * Menus are page panels a headset cannot show (v1.98): the headset session ends while one
   * is open, so it shows in the browser window, and starts again when it closes. Closing it
   * is a press (a controller click on the window), which lets the page start the headset.
   */
  private syncHeadset(): void {
    const menu = this.pause.isOpen || this.map.isOpen || this.result.isOpen;
    this.vrPrompt?.classList.toggle('hidden', this.vr.presenting || menu);
    if (this.vr.presenting && menu) {
      this.vrResume = true;
      void this.vr.exit();
    } else if (this.vrResume && !menu && !this.vr.presenting) {
      if (navigator.userActivation?.isActive ?? true) this.enterHeadset();
      else this.vrResume = false;
    }
  }

  /** The headset went on or came off. */
  private headsetChanged(on: boolean): void {
    this.applyFrameRate();
    // Two eyes at the headset's rate: the lightest graphics (the 3S's chip is a phone's).
    this.view.setQuality(on ? qualityPresets.low : qualityFor(this.settings.quality, isTouchDevice()));
    this.hud.setControllerType(this.controllerShown);
    this.chase.headMotion.reset();
    document.body.classList.toggle('vr-on', on);
    if (!on) {
      // Back to the screen camera at once, even with a menu stopping the game.
      this.view.resize();
      this.chase.reset();
      this.followVehicle(0);
    }
  }

  changeSettings(s: Partial<Settings>): void {
    const prevQuality = this.settings.quality;
    this.settings = { ...this.settings, ...s };
    this.chase.headMotionEnabled = this.settings.headMotion;
    if (!this.settings.headMotion) this.chase.headMotion.reset();
    if (this.settings.quality !== prevQuality)
      this.view.setQuality(qualityFor(this.settings.quality, isTouchDevice()));
    if (this.settings.damage !== this.sim.damage) this.sim.setDamage(this.settings.damage);
    this.syncGearbox();
    this.pause.setSettings(this.settings);
    this.hud.units = this.settings.units;
    this.hud.style = this.settings.hudStyle;
    applyHudStyle(this.settings.hudStyle);
    applyUiSize(this.settings.uiSize);
    this.hud.setControllerType(this.controllerShown);
    this.input.setTouchDrive(this.settings.touchDrive);
    this.touch.setDriveScheme(this.settings.touchDrive);
    this.touch.setStickSide(this.settings.touchStickSide);
    this.audio.setSettings(this.settings);
    this.applyFrameRate();
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

  /**
   * The ground seen by a checkpoint's camp. A save from before v1.02 kept none: the
   * ground round each place found by then stands in for it.
   */
  private seenFrom(c: Checkpoint, world: World): SeenGround {
    const [hx, hz] = world.map.wall;
    const seen = new SeenGround(hx + 20, hz + 20, c.seen);
    if (c.seen === undefined)
      for (const p of world.pois) if (c.discovered.includes(p.id)) seen.mark(p.x, p.z);
    return seen;
  }

  openMap(): void {
    if (this.map.isOpen) return;
    const p = this.vehicle.body.translation();
    this.seen.mark(p.x, p.z);
    this.map.open(
      this.exploration.discovered,
      { x: p.x, z: p.z, heading: this.cameraHeading() },
      this.input.activeDevice,
      this.controllerShown,
      // Test mode shows the whole map.
      this.dev ? null : this.seen,
      // Finds still there, unless an unfound place beside one already has its own mark.
      this.finds.defs.filter(
        (f) =>
          !this.finds.taken.has(f.id) &&
          !this.world.pois.some(
            (q) => !this.exploration.discovered.has(q.id) && Math.hypot(q.x - f.x, q.z - f.z) < 30,
          ),
      ),
    );
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
    this.pause.setStatus(this.pauseStatus());
    this.pause.setTrips(this.sideTrips.journal(), this.history.log);
    this.pause.open(camp?.name ?? '', this.input.activeDevice === 'touch');
    this.loop.paused = true;
  }

  /** The time, fuel, spares and tyres, at the top of the pause menu. */
  private pauseStatus(): PauseStatusCell[] {
    const c = this.vehicle.condition;
    const d = this.episode.deadline;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const cells: PauseStatusCell[] = [];
    if (this.run.timed) {
      const dark = d && this.run.hour >= d.hour;
      cells.push({
        label: 'Time',
        value: clockTime(this.run.hour),
        note: !d
          ? ''
          : dark
            ? `Finish by ${clockTime(d.hour + (d.graceHours ?? 0))}`
            : `Dark at ${clockTime(d.hour)}`,
      });
    }
    // Where no fuel is burnt (a playground) the tank is not worth a cell.
    if (this.episode.fuelScale > 0)
      cells.push({ label: 'Fuel', value: `${Math.round(c.fuel)} L`, note: plural(c.jerryCans, 'jerry can') });
    const planks = this.sim.toolsOf(LOCAL_VEHICLE).planks.carried;
    cells.push({
      label: 'On board',
      value: plural(c.spares, 'spare'),
      note: `${plural(c.plugs, 'plug')} · ${plural(planks, 'plank')}`,
    });
    if (this.ghostTrace) {
      const gap = Math.round(this.ghostBehind);
      cells.push({
        label: 'Ghost',
        value: gap === 0 ? 'Level' : `${minSec(gap)} ${gap > 0 ? 'behind' : 'ahead'}`,
        note: `Best run ${minSec(this.ghostTrace.seconds)}`,
      });
    }
    const flats = c.tyres.filter((t) => t <= 0.05).length;
    const gateBest = this.scoredGates?.best(this.vehicleId);
    if (gateBest)
      cells.push({
        label: 'Rock climb best',
        value: `${gateScore(gateBest.points)} / 1000`,
        note: `${clock(gateBest.seconds)} · ${vehicles[this.vehicleId].tuning.name}`,
      });
    const leaking = c.tyres.filter((t, i) => t > 0.05 && (t < 0.97 || c.tyreFault[i] !== 'none')).length;
    cells.push({
      label: 'Tyres',
      value: `${pressurePsi(c)} psi`,
      note: flats ? plural(flats, 'flat') : leaking ? `${leaking} losing air` : 'All holding air',
    });
    return cells;
  }

  closePause(): void {
    this.pause.close();
    this.loop.paused = this.map.isOpen;
  }

  /**
   * Back to the last camp reached, as things were when you got there: the clock, the fuel,
   * the spares and plugs, and the tyres (pause menu, or after the episode ends early).
   */
  async restartFromCamp(): Promise<void> {
    await this.fade.run(() => {
      this.tool.cancel();
      this.result.close();
      this.history.clear();
      this.recoveryCue.clear();
      this.sim.returnToCampsite(LOCAL_VEHICLE, this.checkpoint.camp);
      this.sim.surprises?.reset(this.checkpoint.surprises);
      this.strandedFreed = new Set(this.checkpoint.stranded);
      this.winched = this.checkpoint.winched === true;
      for (const s of this.sim.stuck.values()) s.reset(this.strandedFreed.has(s.def.id));
      applyCheckpoint(this.vehicle, this.checkpoint);
      if (this.checkpoint.delivery) this.sim.restoreDelivery(this.checkpoint.delivery, LOCAL_VEHICLE);
      this.delivery.sync();
      // What was taken after the camp is back where it was found.
      this.finds.reset(this.checkpoint.taken);
      this.sideTrips.reset(this.checkpoint.sideTrips ?? []);
      this.findMarkers.show(this.finds.defs, this.finds.taken);
      // Places found and sections timed after the camp are new again, and any car coming
      // the other way is gone: the track sends one afresh.
      this.exploration.reset(this.checkpoint.discovered);
      this.exploration.lastCampsite = this.checkpoint.camp;
      this.sectionTimes.reset();
      this.trafficCars.clear();
      this.seen = this.seenFrom(this.checkpoint, this.world);
      this.run.restart(this.checkpoint);
      this.ghostRecorder.rewind(this.checkpoint.elapsed);
      this.ghostGap?.reset();
      this.noteHour = this.run.hour;
      this.updateEnvironment(true);
      this.crawlRuns.cancel();
      this.scoredGates?.cancel();
      this.chase.reset();
      this.view.snap();
      this.loop.paused = this.pause.isOpen || this.map.isOpen;
    });
    this.sim.switchOffEngine(LOCAL_VEHICLE);
  }

  /** Back to the welcome screen: save and reload without starting. */
  async toMainMenu(): Promise<void> {
    this.save();
    await this.fade.run(() => {
      this.loop.paused = true;
      location.reload();
    });
  }

  /** Install the downloaded version (pause menu): saved first, then the page reloads into it. */
  async restartForUpdate(): Promise<void> {
    this.save();
    await this.fade.run(() => {
      this.loop.paused = true;
      if (!pendingUpdate.install()) location.reload();
      // The reload comes when the new worker takes over; if it never does, reload anyway.
      window.setTimeout(() => location.reload(), 5000);
    });
  }

  /** Change vehicle (pause menu): the run goes back to the last camp in the new one. */
  async changeVehicle(id: VehicleId): Promise<void> {
    if (id === this.vehicleId) return;
    await this.fade.run(() => this.swapVehicle(id));
    await this.restartFromCamp();
    this.hud.toast(vehicles[id].tuning.name, 1800);
  }

  /** Rebuild the simulated vehicle, its model, steering, seat and engine sound. */
  swapVehicle(id: VehicleId): void {
    const def = vehicles[id];
    this.tool.cancel();
    this.crawlRuns.cancel();
    this.scoredGates?.cancel();
    this.sim.replaceVehicle(LOCAL_VEHICLE, def.tuning);
    this.vehicle.packing = packWeights(this.episode.loadout, id);
    this.sim.switchOffEngine(LOCAL_VEHICLE);
    this.view.scene.remove(this.model.root);
    this.view.mirrors.setVehicle(null);
    this.model.dispose();
    this.model = new VehicleModel(def.tuning, this.lampBeams);
    this.view.mirrors.setVehicle(this.model);
    this.view.scene.add(this.model.root);
    this.vehicleId = id;
    this.input.setSteering(def.tuning.steering);
    this.chase.seat = def.cabin;
    this.chase.scale = def.cameraScale ?? 1;
    this.chase.reset();
    this.pause.setVehicle(id);
    this.audio.setVehicle(id);
    this.view.snap();
    this.save();
  }

  /** Test mode: hitch a trailer with this many drums behind the car, or take it away (null). */
  devTrailer(drums: number | null, kind: TrailerTuning['id'] = 'box6x4'): void {
    this.delivery.devTrailer(drums, kind);
  }

  teleportToPoi(p: PoiDef): void {
    this.crawlRuns.cancel();
    this.scoredGates?.cancel();
    const r = p.reset ?? { x: p.x, z: p.z + 12, headingDeg: 0 };
    this.vehicle.teleport(this.sim.poseAt(r.x, r.z, r.headingDeg, this.vehicle.tuning.wheelRadius));
    this.sim.bringTrailer(LOCAL_VEHICLE);
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
    const next = path[Math.max(0, Math.min(path.length - 1, path.length - 10))];
    this.vehicle.teleport(
      this.sim.poseAt(
        park[0],
        park[1],
        headingOf(next[0] - park[0], next[1] - park[1]),
        this.vehicle.tuning.wheelRadius,
      ),
    );
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

  /** The find the HUD points out, if one is close (none once the episode is over). */
  private findNearby(): { name: string; inReach: boolean } | null {
    if (this.run.status !== 'driving') return null;
    const p = this.vehicle.body.translation();
    const n = this.finds.near(p.x, p.z);
    return n && { name: n.find.name, inReach: n.inReach };
  }

  private toolOptions(): ToolOption[] {
    const t = this.sim.toolsOf(LOCAL_VEHICLE);
    const v = this.vehicle;
    const fix = this.sim.repairOption(LOCAL_VEHICLE);
    const refuel = this.sim.refuelOption(LOCAL_VEHICLE);
    const planks: ToolOption =
      t.planks.carried > 0
        ? { id: 'planks', label: 'Place planks', icon: 'planks', enabled: true }
        : t.planks.canRecall(v)
          ? { id: 'recall', label: 'Recall planks', icon: 'planks', enabled: true }
          : { id: 'planks', label: 'Planks are out', icon: 'planks', enabled: false };
    const hitch = this.sim.hitchOption(LOCAL_VEHICLE);
    const nearbyTrailer = this.sim.nearbyTrailer(LOCAL_VEHICLE);
    const cargo: ToolOption[] = [];
    if (nearbyTrailer?.drums)
      cargo.push({ id: 'secureLoad', label: 'Tighten load straps', icon: 'wrench', enabled: true });
    if (this.sim.drumToLoad(LOCAL_VEHICLE, false))
      cargo.push({ id: 'loadDrum', label: 'Load loose drum', icon: 'fuel', enabled: true });
    if (nearbyTrailer?.tyres.some((h) => h < 1))
      cargo.push({ id: 'trailerTyre', label: 'Repair trailer tyre', icon: 'wrench', enabled: true });
    const trailer: ToolOption[] =
      hitch?.kind === 'unhitch'
        ? [{ id: 'unhitch', label: 'Unhitch the trailer', icon: 'detach', enabled: true }]
        : [];
    const tools: ToolOption[] = [
      {
        id: 'transfer',
        label: `Transfer: ${v.transfer.mode} (change)`,
        icon: 'feature',
        enabled: !v.rangeShiftReason(),
      },
      ...(v.tuning.transfer === 'fullTime'
        ? [
            {
              id: 'centre',
              label: v.transfer.centreLocked ? 'Unlock centre diff' : 'Lock centre diff',
              icon: 'feature' as const,
              enabled: v.transfer.centreLocked || Math.abs(v.speed) < 0.5,
            },
          ]
        : v.tuning.autoHubs
          ? []
          : [
              {
                id: 'hubs',
                label: v.transfer.hubsLocked ? 'Unlock front hubs (20 s)' : 'Lock front hubs (20 s)',
                icon: 'feature' as const,
                enabled:
                  v.transfer.mode === '2H' && Math.abs(v.speed) < 0.5 && v.tiltDeg() <= 30 && !t.repair,
              },
            ]),
      ...cargo,
      ...trailer,
      t.winch.attached
        ? { id: 'detach', label: 'Detach winch', icon: 'detach', enabled: true }
        : { id: 'winch', label: 'Winch', icon: 'winch', enabled: this.anchors.inReach },
      { id: 'recovery', label: 'Recovery gear', icon: 'winch', enabled: true },
      {
        id: 'frontDiff',
        label: v.differentials.front ? 'Unlock front diff' : 'Lock front diff',
        icon: 'frontDiff',
        enabled: v.differentials.front || Math.abs(v.speed) <= v.tuning.crawling.diffLockMaxKmh / 3.6,
      },
      { id: 'tyres', label: `Tyres: ${pressurePsi(v.condition)} psi`, icon: 'tyre', enabled: true },
      {
        id: 'refuel',
        label: refuel ? `Pour in a jerry can (${v.condition.jerryCans})` : 'No jerry cans',
        icon: 'fuel',
        enabled: refuel !== null,
      },
      {
        id: 'rearDiff',
        label: v.differentials.rear ? 'Unlock rear diff' : 'Lock rear diff',
        icon: 'rearDiff',
        enabled: v.differentials.rear || Math.abs(v.speed) <= v.tuning.crawling.diffLockMaxKmh / 3.6,
      },
      planks,
      {
        id: 'precision',
        label: v.precisionCrawl ? 'Disable precision crawl' : 'Enable precision crawl',
        icon: 'crawl',
        enabled: true,
      },
      {
        id: 'lights',
        label: { off: 'Headlights on', low: 'High beam', high: 'Headlights off' }[v.lights],
        icon: 'headlight',
        enabled: true,
      },
      {
        id: 'repair',
        label: fix
          ? {
              field: 'Field repair',
              spare: 'Fit a spare',
              plug: 'Plug the tyre',
              refuel: '',
              pump: '',
              hubs: '',
              dig: '',
            }[fix.kind]
          : 'Nothing to repair',
        icon: 'wrench',
        // Needed but not possible here: picking it says why (stop first, spare used...).
        enabled: fix !== null,
      },
    ];
    // Where no fuel is burnt (a playground) there are no jerry cans to pour.
    return tools.filter((o) => o.id !== 'refuel' || this.episode.fuelScale > 0);
  }

  private pickTool(id: string): void {
    const v = this.vehicle;
    const t = this.sim.toolsOf(LOCAL_VEHICLE);
    if (id === 'tyres' || id === 'recovery' || id === 'toolsBack') {
      const back: ToolOption = { id: 'toolsBack', label: 'Back to tools', icon: 'feature', enabled: true };
      this.toolMenu.open(
        id === 'toolsBack'
          ? this.toolOptions()
          : id === 'tyres'
            ? [
                ...tyrePressures.map((psi): ToolOption => ({
                  id: `pressure:${psi}`,
                  label: `${psi} psi · ${{ 18: 'rock / mud', 24: 'trail', 36: 'road' }[psi]}${pressurePsi(v.condition) === psi ? ' (set)' : ''}`,
                  icon: 'tyre',
                  enabled: Math.abs(v.speed) < 0.5 && !t.repair && pressurePsi(v.condition) !== psi,
                })),
                back,
              ]
            : [
                {
                  id: 'snatch',
                  label: t.winch.doubleLine ? 'Single-line winch (30 m)' : 'Snatch block (double line, 14 m)',
                  icon: 'winch',
                  enabled: !t.winch.attached && !t.repair && Math.abs(v.speed) < 0.5,
                },
                {
                  id: 'dig',
                  label: 'Shovel: clear the wheels (20 s)',
                  icon: 'wrench',
                  enabled: this.sim.canDig(LOCAL_VEHICLE),
                },
                back,
              ],
        true,
      );
      return;
    }
    if (id === 'transfer') this.input.requestDriveAction('range');
    else if (id === 'centre') {
      if (this.vehicle.toggleCentre()) {
        this.hud.toast(this.vehicle.transfer.centreLocked ? 'Centre diff locked' : 'Centre diff open');
        this.audio.drivetrainClunk(this.vehicle.transfer.centreLocked ? 'lockOn' : 'lockOff');
      } else this.hud.toast('Stop before locking the centre diff');
    } else if (id === 'hubs') {
      if (!this.sim.startHubs(LOCAL_VEHICLE)) this.hud.toast('Select 2H and stop on level ground first');
    } else if (id === 'secureLoad')
      this.hud.toast(
        this.sim.secureTrailerLoad(LOCAL_VEHICLE)
          ? 'Load straps tightened'
          : 'Stop alongside the upright trailer first',
      );
    else if (id === 'loadDrum')
      this.hud.toast(
        this.sim.recoverDrum(LOCAL_VEHICLE)
          ? 'Drum loaded and secured'
          : 'Bring the stopped trailer alongside the drum',
      );
    else if (id === 'trailerTyre')
      this.hud.toast(
        this.sim.repairTrailerTyre(LOCAL_VEHICLE)
          ? 'Trailer tyre repaired'
          : 'Stop alongside it with a plug or spare left',
      );
    else if (id.startsWith('pressure:')) {
      if (!this.sim.startPressure(LOCAL_VEHICLE, Number(id.slice(9))))
        this.hud.toast('Stop on level ground first');
    } else if (id === 'snatch') {
      const w = this.sim.toolsOf(LOCAL_VEHICLE).winch;
      if (!w.attached) {
        w.doubleLine = !w.doubleLine;
        this.hud.toast(
          w.doubleLine
            ? 'Double line: twice the pull, half the speed. Fixed anchors within 14 m'
            : 'Single line: 30 m cable',
        );
      }
    } else if (id === 'dig') {
      if (!this.sim.startDig(LOCAL_VEHICLE))
        this.hud.toast('Stop in shallow mud or sand on level ground first');
    } else if (id === 'winch' && !this.tool.startWinchTarget()) this.hud.toast('No anchor in reach');
    else if (id === 'planks') this.tool.startPlanks();
    else if (id === 'recall') this.sim.recallPlanks(LOCAL_VEHICLE);
    else if (id === 'detach') this.sim.detachWinch(LOCAL_VEHICLE);
    else if (id === 'unhitch' && !this.sim.unhitchTrailer(LOCAL_VEHICLE))
      this.hud.toast(this.sim.hitchOption(LOCAL_VEHICLE)?.reason ?? 'No trailer on the back');
    else if (id === 'repair' && !this.sim.startRepair(LOCAL_VEHICLE))
      this.hud.toast(this.sim.repairOption(LOCAL_VEHICLE)?.reason ?? 'Nothing to repair');
    else if (id === 'refuel' && !this.sim.startRepair(LOCAL_VEHICLE, true))
      this.hud.toast(this.sim.refuelOption(LOCAL_VEHICLE)?.reason ?? 'No jerry cans left');
    else if (id === 'frontDiff' || id === 'rearDiff' || id === 'precision' || id === 'lights')
      this.input.requestDriveAction(id);
  }

  private onToolEvent(e: ToolEvent): void {
    switch (e.type) {
      case 'winchAttached':
        this.winched = true;
        this.hud.toast(
          `Winch attached to ${e.anchor.label.toLowerCase()}${e.anchor.kind === 'tree' ? ' with tree protector' : ''}${this.sim.toolsOf(LOCAL_VEHICLE).winch.doubleLine ? ' · double line' : ''}`,
        );
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

  // --- The episode ------------------------------------------------------------

  /** A place's history note or a lesson: a small card in the top right; driving carries on. */
  showHistory(note: { title: string; text: string; instruction?: ControlInstruction }): void {
    this.history.setInput(this.input.activeDevice, this.controllerShown);
    this.history.show(note.title, note.text, false, note.instruction);
  }

  /**
   * Set the light and weather for the clock (every few game minutes, or now): the sky, the
   * rain, the ground's grip and the creeks follow a storm. Dusk turns the lamps on.
   */
  private updateEnvironment(force = false): void {
    if (this.replay && !this.devTookOver) return;
    if (!this.devWeather) this.stormNotes();
    if (!force && Math.abs(this.run.hour - this.envHour) < 0.05) return;
    this.envHour = this.run.hour;
    const { env, creekRise, flowScale } = this.devWeather
      ? devEnvironment(this.run.hour, this.devWeather, this.episode.storm ?? devFlood)
      : episodeWeatherAt(this.run.hour, this.episode.weather, this.episode.storm);
    this.view.setEnvironment(env);
    this.view.setCreeks(creekRise, flowScale);
    this.sim.setWeather(env, creekRise, flowScale);
    if (env.lampBeams === this.lampBeams) return;
    this.lampBeams = env.lampBeams;
    // The same car gains (or loses) its beams' two spot lights, shown once every lit
    // material's shader is ready for them (v1.46: dusk used to rebuild the car and stall).
    const model = this.model;
    const beams = model.setBeams(env.lampBeams);
    if (beams) void this.view.showLights(beams.group, () => this.model === model && model.beams === beams);
    if (env.lampBeams && this.vehicle.lights === 'off') {
      this.vehicle.lights = 'low';
      this.hud.toast('Dusk — headlights on', 2200);
    }
  }

  /** The storm's HUD notes, each once as the clock passes it (the first drops, the rain easing). */
  private stormNotes(): void {
    const from = this.noteHour;
    this.noteHour = this.run.hour;
    for (const n of this.episode.storm?.notes ?? [])
      if (from < n.hour && n.hour <= this.run.hour) this.hud.toast(n.text, 6000);
    const d = this.episode.deadline;
    if (d?.graceNote && this.run.timed && !this.run.deadlineMet && from < d.hour && d.hour <= this.run.hour)
      this.hud.toast(d.graceNote, 8000);
  }

  /** How the run went, for the result card. */
  private runStats(): string[] {
    const c = this.vehicle.condition;
    const minutes = Math.round(this.run.elapsed / 60);
    return [
      `${minutes} minute${minutes === 1 ? '' : 's'} of driving`,
      ...(this.run.timed ? [`Arrived ${clockTime(this.run.hour)}`] : []),
      `${Math.round(c.fuel)} L in the tank, ${c.jerryCans} jerry can${c.jerryCans === 1 ? '' : 's'}`,
      ...this.sideTrips.defs
        .filter((trip) => this.sideTrips.complete(trip))
        .map((trip) => `Side trip: ${trip.name} · complete`),
      `${c.spares} spare${c.spares === 1 ? '' : 's'} and ${c.plugs} plug${c.plugs === 1 ? '' : 's'} left`,
    ];
  }

  /** The finish screen's score lines, with the previous bests for comparison. */
  private scoreStats(score: RunScore, was: EpisodeProgress, minutes: number): string[] {
    const medal = score.medal[0].toUpperCase() + score.medal.slice(1);
    const newScore = score.points > (was.bestScore ?? -1);
    const newTime = minutes < (was.bestMinutes ?? Infinity);
    return [
      `${medal} · ${score.points} / 1000${newScore && was.bestScore !== undefined ? ' · new best score' : ''}`,
      score.parts.map((p) => `${p.label} ${p.points}`).join(' · '),
      ...(was.bestScore !== undefined && !newScore ? [`Best score ${was.bestScore}`] : []),
      ...(was.bestMinutes !== undefined
        ? [newTime ? 'New best time' : `Best time ${Math.round(was.bestMinutes)} minutes`]
        : []),
      ...this.sectionTimes.times.map(
        (t) =>
          `${t.name} ${clock(t.seconds)}${t.best === null || t.seconds < t.best ? ' · best' : ` · best ${clock(t.best)}`}`,
      ),
    ];
  }

  /** The episode's bypass, if this run took it: a fixed deduction from the score. */
  private bypassPenalty(): { label: string; points: number }[] {
    const b = this.episode.bypass;
    return b && this.exploration.discovered.has(b.poi) ? [{ label: b.label, points: b.penalty }] : [];
  }

  private onComplete(): void {
    const minutes = this.run.elapsed / 60;
    const was = this.episodeProgress;
    const deadline = this.episode.deadline?.hour;
    const score = scoreRun({
      condition: this.vehicle.condition,
      packed: this.checkpoint.packed ?? vehicleLoadout(this.episode.loadout, this.vehicleId),
      minutes,
      hoursSpare: this.run.timed && deadline !== undefined ? deadline - this.run.hour : null,
      targetMinutes: 30,
      penalties: this.bypassPenalty(),
    });
    const scoreLines = [
      ...this.scoreStats(score, was, minutes),
      ...(score.parts.some((p) => p.points < 0)
        ? score.parts.filter((p) => p.points < 0).map((p) => `${p.label}: ${p.points}`)
        : []),
      ...this.keepGhost(),
    ];
    this.progress[this.episode.id] = {
      completed: true,
      bestMinutes: Math.min(was.bestMinutes ?? Infinity, Math.round(minutes * 10) / 10),
      bestScore: Math.max(was.bestScore ?? 0, score.points),
      sectionBests: { ...this.sectionTimes.bests },
      checkpoint: null,
    };
    this.save();
    this.audio.discovery();
    this.loop.paused = true;
    const buttons: ResultButton[] = [
      { id: 'menu', label: 'Main menu', note: 'Episodes' },
      { id: 'drive', label: 'Keep driving', note: 'Look around the map' },
    ];
    this.result.open(
      'complete',
      `Episode ${this.episode.number} · Mission complete`,
      this.episode.title,
      this.episode.wrapUp,
      [...scoreLines, ...this.runStats()],
      buttons,
      (id) => {
        if (id === 'menu') void this.toMainMenu();
        else this.loop.paused = this.pause.isOpen || this.map.isOpen;
      },
    );
  }

  /** Add this run's pose to its ghost trace. */
  private recordGhost(): void {
    const v = this.vehicle;
    const p = v.body.translation();
    const q = v.body.rotation();
    const suspension = v.wheels.reduce((sum, w) => sum + w.suspension, 0) / v.wheels.length;
    this.ghostRecorder.record(this.run.elapsed, {
      x: p.x,
      y: p.y,
      z: p.z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      suspension,
    });
  }

  /** At the finish: keep this run as the ghost if it's the first or the quickest. Returns the finish line. */
  private keepGhost(): string[] {
    const was = this.ghostTrace;
    if (was && this.run.elapsed >= was.seconds) {
      const behind = Math.round(this.run.elapsed - was.seconds);
      return [`Ghost ahead by ${minSec(behind)}`];
    }
    const trace = this.ghostRecorder.trace(this.vehicleId, this.run.elapsed);
    if (!trace) return ['Ghost not saved: this run was resumed from a camp after the game was closed'];
    // Test mode leaves the real save alone.
    if (!this.dev && !saveGhost(this.episode.id, trace))
      return ['Ghost not saved: browser storage is full or blocked'];
    this.ghostTrace = trace;
    if (!was) return ['Ghost saved: race this run next time'];
    return [`Ghost beaten by ${minSec(was.seconds - this.run.elapsed)}: this run is the new ghost`];
  }

  private onFailed(): void {
    const reason = this.run.reason ?? 'time';
    this.loop.paused = true;
    this.audio.engineEvent('stalled');
    const camp = this.world.pois.find((q) => q.id === this.checkpoint.camp);
    this.result.open(
      'failed',
      levelTitle(this.episode),
      this.episode.goal ? 'Episode over' : 'Back to camp',
      [this.episode.failures[reason]],
      [
        this.run.timed
          ? `Last camp: ${camp?.name ?? 'the start'}, at ${clockTime(this.checkpoint.hour)}`
          : `Last camp: ${camp?.name ?? 'the start'}`,
      ],
      [
        { id: 'restart', label: 'Restart from camp', note: camp?.name },
        { id: 'menu', label: 'Main menu', note: this.episode.goal ? 'Episodes' : 'Levels' },
      ],
      (id) => {
        if (id === 'restart') void this.restartFromCamp();
        else void this.toMainMenu();
      },
    );
  }

  /** Put the spare wheel and tyre plugs back to what the level set out with, and mend every tyre. */
  private restockAtCamp(): void {
    const c = this.vehicle.condition;
    const kit = this.checkpoint.packed ?? this.episode.loadout;
    const torn = c.tyreFault.some((f) => f === 'sidewall');
    if (!torn && c.spares >= kit.spares && c.plugs >= kit.plugs) return;
    if (torn) repairAll(c);
    c.spares = Math.max(c.spares, kit.spares);
    c.plugs = Math.max(c.plugs, kit.plugs);
    this.hud.toast('Camp: spare wheel and tyre plugs restocked', 2600);
  }

  cameraHeading(): number {
    this.view.camera.getWorldDirection(this.camDir);
    return headingOf(this.camDir.x, this.camDir.z);
  }

  // --- Loop -----------------------------------------------------------------

  private step(dt: number): void {
    const inp = this.input.vehicleInput(dt);
    // USE / E with two or more anchors in reach opens the chooser instead of hooking the
    // best one straight away (v1.18). Planks and a trailer to hitch still come first.
    if (
      inp.winchAttach &&
      this.tool.mode === 'drive' &&
      !this.toolMenu.isOpen &&
      this.anchors.offerChoice()
    ) {
      inp.winchAttach = false;
      inp.interact = false;
    }
    if (this.scriptedInput) Object.assign(inp, this.scriptedInput);
    if (this.autopilot) Object.assign(inp, this.autopilot.input(this.vehicle, dt));
    // Park on the handbrake while placing planks, choosing an anchor or in the tool menu.
    if (this.tool.mode !== 'drive' || this.toolMenu.isOpen) {
      inp.throttle = 0;
      inp.brake = 0;
      inp.steer = 0;
      inp.handbrake = true;
      inp.winchAttach = false;
      inp.interact = false;
      inp.toggleFrontDiff = false;
      inp.toggleRearDiff = false;
      inp.togglePrecision = false;
    }
    this.inputs.set(LOCAL_VEHICLE, inp);
    this.trafficCars.snapshot();
    this.sim.step(this.inputs, dt);
    // Physics-time sampling keeps the inertial response independent of the screen's
    // refresh rate and of the browser test's accelerated steps per frame.
    if (
      this.chase.headMotionEnabled &&
      this.chase.preset === 'cockpit' &&
      !this.freeCamOn &&
      !this.vr.presenting
    ) {
      const body = this.vehicle.body;
      this.motionRotation.copy(body.rotation());
      this.tmpPos.copy(this.chase.seat.eye).applyQuaternion(this.motionRotation).add(body.translation());
      this.chase.headMotion.step(dt, {
        velocity: body.velocityAtPoint(this.tmpPos),
        position: body.translation(),
        rotation: this.motionRotation,
      });
    } else this.chase.headMotion.reset();
    this.run.tick(dt);
    // History notes count down in simulated time: not while paused, and the same in the
    // browser tests, which run a fixed number of steps a frame on the slow software renderer.
    this.history.tick(dt, this.vehicle.body.translation());
    if (this.run.status === 'driving') this.recordGhost();
    const p = this.vehicle.body.translation();
    if (this.ghostGap) this.ghostBehind = this.ghostGap.update(p.x, p.z, this.run.elapsed);
    // A campsite puts the engine and suspension right and patches punctures.
    const inCamp = this.world.pois.some(
      (q) => q.kind === 'campsite' && Math.hypot(q.x - p.x, q.z - p.z) < q.radius,
    );
    if (inCamp && this.sim.damage !== 'off') this.sim.repairAtCamp(LOCAL_VEHICLE);
    // A playground's camps are a workshop too: a torn sidewall is replaced and the spare and
    // plugs are put back, at any camp, as often as the car comes in (before the camp is saved below).
    if (inCamp && !this.episode.goal) this.restockAtCamp();
    this.seen.mark(p.x, p.z);
    const found = this.exploration.check(p.x, p.z);
    for (const poi of found.discovered) {
      this.run.reach(poi.id);
      this.hud.discovered(poi.name, poi.kind);
      const note = this.episode.notes[poi.id];
      if (note) this.showHistory(note);
    }
    if (found.discovered.length > 0) this.audio.discovery();
    const loaded = this.run.status === 'driving' ? this.finds.update(this.vehicle) : null;
    if (loaded) {
      this.findMarkers.show(this.finds.defs, this.finds.taken);
      this.hud.toast(`${loaded.taken}: loaded`, 2600);
      this.audio.discovery();
    }
    const velocity = this.vehicle.body.linvel();
    const tripEvent =
      this.run.status === 'driving'
        ? this.sideTrips.update(
            dt,
            p.x,
            p.z,
            Math.hypot(velocity.x, velocity.y, velocity.z) < 0.6 &&
              this.vehicle.tiltDeg() < 35 &&
              Math.abs(p.y - this.world.terrain.heightAt(p.x, p.z)) < 3,
          )
        : null;
    if (tripEvent) {
      const { trip, stop, complete } = tripEvent;
      if (complete) {
        this.vehicle.condition.jerryCans += trip.reward.jerryCans ?? 0;
        this.vehicle.condition.plugs += trip.reward.plugs ?? 0;
      }
      this.hud.toast(complete ? `${trip.name} complete · ${trip.rewardLabel}` : `${stop.task}: done`, 5000);
      this.showHistory({
        title: complete ? `${trip.name} · complete` : trip.name,
        text: complete
          ? trip.finished
          : `${stop.entry ?? `${stop.task}: done.`} ${
              this.sideTrips
                .journal()
                .find((entry) => entry.name === trip.name)
                ?.stops.find((s) => s.available)?.directions ?? 'Choose another stop in the trip journal.'
            }`,
      });
      this.audio.discovery();
    }
    // A handover takes longer than entering camp. Save its reward and stop together.
    const tripCamp =
      tripEvent &&
      this.world.pois.find((q) => q.kind === 'campsite' && Math.hypot(q.x - p.x, q.z - p.z) <= q.radius)?.id;
    const reachedCamp = found.campsite || tripCamp;
    if (reachedCamp && reachedCamp !== this.episode.goal && this.run.status === 'driving') {
      const supply = this.checkpoint.supply;
      const camp = this.world.pois.find((q) => q.id === reachedCamp);
      this.checkpoint = checkpointAt(
        reachedCamp,
        this.run,
        this.vehicle,
        this.exploration.discovered,
        this.finds.taken,
        this.sim.surprises?.happened(),
        this.sim.deliveryState(),
        this.checkpoint.packed,
      );
      if (this.episode.stranded) this.checkpoint.stranded = [...this.strandedFreed];
      this.checkpoint.sideTrips = [...this.sideTrips.done];
      this.checkpoint.seen = this.seen.encode();
      if (supply) this.checkpoint.supply = true;
      if (this.winched) this.checkpoint.winched = true;
      this.keepCheckpoint();
      if (camp)
        this.hud.toast(
          this.episode.goal
            ? `${camp.name}: camp reached, progress saved`
            : `${camp.name}: repaired and restocked. This is the camp you return to`,
          2600,
        );
    } else if (found.discovered.length > 0) this.save();
    if (
      this.checkpoint.supply &&
      !this.supplyDone &&
      supplyDelivered(this.sim.trailers.values(), this.world.pois)
    ) {
      this.supplyDone = true;
      this.hud.runResult('Supply run', 'Drums delivered', `All ${supplyRun.drums} drums are at Wujal Wujal.`);
      this.audio.discovery();
    }
    const goal = this.world.pois.find((q) => q.id === this.episode.goal);
    const status = goal ? this.run.check(this.vehicle, this.sim.damage, goal) : null;
    if (status === 'complete') this.onComplete();
    else if (status === 'failed') this.onFailed();
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
    const section = this.sectionTimes.update(p.x, p.z, dt);
    if (section) this.onSectionTime(section);
    this.trafficCars.update(dt, p);
    if (!this.churnNoted && this.sim.churn.peak > 0.5) {
      this.churnNoted = true;
      this.hud.toast('The ground is cutting up under the wheels: spinning here makes it slipperier', 3200);
    }
    this.trafficCars.place();
    if (this.gateCount.total) {
      const f = v.forward();
      const flat = Math.hypot(f.x, f.z) || 1;
      const car = { fx: f.x / flat, fz: f.z / flat, ...footprintSize(v.tuning) };
      if (this.scoredGates) {
        if (this.run.status !== 'driving') this.scoredGates.cancel();
        else
          for (const e of this.scoredGates.update({
            x: p.x,
            z: p.z,
            car,
            vehicle: this.vehicleId,
            tilt: v.tiltDeg(),
            knock: v.bodyContact.knock > 0,
            winch: this.sim.toolsOf(LOCAL_VEHICLE).winch.attached,
            dt,
          }))
            this.onScoredGate(e);
      } else for (const e of this.gateCount.update(p.x, p.z, car)) this.onGate(e);
    }
  }

  private onGate(e: GateEvent): void {
    if (e.type === 'passed') this.audio.gate();
    else if (e.type === 'flag') {
      this.audio.flag();
      this.hud.toast(`Touched gate ${e.n}'s ${e.side === 'left' ? 'red' : 'blue'} flag`, 1800);
    } else if (e.type === 'missed')
      this.hud.toast(
        e.gates.length === 1 ? `Missed gate ${e.gates[0]}` : `Missed gates ${e.gates[0]}–${e.gates.at(-1)}`,
        2400,
      );
    else {
      this.hud.runResult(
        'Gates',
        `${e.passed} of ${this.gateCount.total} gates`,
        gateLapDetail(e.missed, e.flags),
      );
      this.audio.discovery();
    }
  }

  private onScoredGate(e: ScoredGateEvent): void {
    if (e.type === 'gate') this.onGate(e.event);
    else if (e.type === 'started')
      this.hud.toast('Rock climb started · 1000 points · keep the flags clear', 3000);
    else if (e.type === 'failed')
      this.hud.toast(`Rock climb abandoned: ${e.reason}. Return to gate 1 to retry`, 3200);
    else {
      const r = e.result;
      this.hud.runResult(
        r.missed
          ? 'Rock climb · gates missed'
          : e.best
            ? 'Rock climb · Personal best'
            : 'Rock climb complete',
        `${r.score} / 1000 · ${clock(r.seconds)}`,
        `${r.flags} flags · ${r.missed} missed · ${r.reverses} reverses · ${r.knocks} knocks · ${r.winches} winches`,
        15000,
      );
      this.audio.discovery();
      if (e.best) this.save();
    }
  }

  private onStrandedFreed(d: StrandedDriverDef): void {
    this.strandedFreed.add(d.id);
    const c = this.vehicle.condition;
    const r = d.reward;
    c.jerryCans += r.jerryCans ?? 0;
    c.plugs += r.plugs ?? 0;
    c.spares += r.spares ?? 0;
    const given = [
      r.jerryCans && `${r.jerryCans} jerry can${r.jerryCans === 1 ? '' : 's'}`,
      r.plugs && `${r.plugs} tyre plug${r.plugs === 1 ? '' : 's'}`,
      r.spares && `${r.spares} spare wheel${r.spares === 1 ? '' : 's'}`,
    ].filter(Boolean);
    this.hud.toast(`${d.name}: out of the bog. They give you ${given.join(' and ')}`, 3200);
    this.showHistory(d.freed);
    this.audio.discovery();
  }

  private onSectionTime(t: SectionTime): void {
    const best = t.best === null || t.seconds < t.best;
    this.hud.runResult(
      best ? (t.best === null ? 'Section time' : 'New best') : 'Section time',
      `${t.name} · ${clock(t.seconds)}`,
      t.best === null ? 'First time up' : best ? `Was ${clock(t.best)}` : `Best ${clock(t.best)}`,
    );
    this.progress[this.episode.id] = {
      ...this.episodeProgress,
      sectionBests: { ...this.sectionTimes.bests },
    };
    this.save();
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
    if (this.result.isOpen) {
      if (inp.pressCount('menuLeft') + inp.pressCount('menuUp') > 0) this.result.navigate('prev');
      if (inp.pressCount('menuRight') + inp.pressCount('menuDown') > 0) this.result.navigate('next');
      if (inp.pressed('confirm')) this.result.navigate('confirm');
      return;
    }
    if (this.history.reading) {
      if (inp.pressed('confirm') || inp.pressed('back') || inp.pressed('pause')) this.history.next();
      return;
    }
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
      const s = inp.toolStick();
      const kx = (inp.held('menuRight') ? 1 : 0) - (inp.held('menuLeft') ? 1 : 0);
      const ky = (inp.held('menuDown') ? 1 : 0) - (inp.held('menuUp') ? 1 : 0);
      if (inp.activeDevice === 'gamepad' || kx || ky) this.toolMenu.pointAt(s.x + kx, s.y + ky, 0.4);
      if (inp.pressed('back') || inp.pressed('pause')) this.toolMenu.close(false);
      else if (this.toolMenu.sticky && (inp.pressed('confirm') || inp.pressed('toolMenu')))
        this.toolMenu.close(true);
      else if (!inp.held('toolMenu') && !this.toolMenu.sticky) this.toolMenu.close(true);
      return;
    }
    if (this.tool.mode !== 'drive') return;
    if (inp.pressed('pause')) this.openPause();
    else if (inp.pressed('map')) this.openMap();
    else if (inp.pressed('toolMenu')) {
      const pad = controllers[this.controllerShown];
      this.toolMenu.open(
        this.toolOptions(),
        inp.activeDevice === 'touch',
        inp.activeDevice === 'gamepad'
          ? `Hold ${pad.toolMenu} · Right stick to select · Release ${pad.toolMenu} to use · ${pad.back} to cancel`
          : undefined,
      );
    }
  }

  /**
   * The gearbox the car drives with: the saved setting while a controller is connected
   * (not on a phone or tablet), otherwise automatic, so the keyboard and touch never need gears.
   */
  private syncGearbox(): void {
    const mode = showGearboxSetting(this.input.gamepadConnected) ? this.settings.gearbox : 'automatic';
    this.input.gearboxMode = mode;
    if (this.sim.gearboxMode !== mode) this.sim.setGearboxMode(mode);
    this.pause.setGamepadConnected(this.input.gamepadConnected);
  }

  private renderFrame(alpha: number, frameDt: number): void {
    this.input.poll();
    this.syncHeadset();
    this.syncGearbox();
    this.map.updateInput(this.input.activeDevice, this.controllerShown);
    this.pause.setInputDevice(this.input.activeDevice);
    this.history.setInput(this.input.activeDevice, this.controllerShown);
    this.clock += frameDt;
    this.updateEnvironment();
    this.devPanel?.update();
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
      // Counted, not just seen: several quick presses in one slow frame each take a step.
      if (this.tool.mode === 'drive')
        for (let k = this.input.pressCount('cameraPreset'); k > 0; k--) this.chase.cyclePreset();
      const gaugePresses = this.input.pressCount('gauges');
      if (gaugePresses > 0) {
        const modes = ['auto', 'on', 'off'] as const;
        this.hud.gaugeMode = modes[(modes.indexOf(this.hud.gaugeMode) + gaugePresses) % modes.length];
        this.hud.toast(
          { auto: 'Crawl gauges: in low range', on: 'Crawl gauges: always', off: 'Crawl gauges: off' }[
            this.hud.gaugeMode
          ],
          1400,
        );
      }
    }
    this.hud.cockpitView = (this.chase.preset === 'cockpit' || this.vr.presenting) && !this.freeCamOn;
    this.model.setCockpitView(this.hud.cockpitView);
    this.hud.cameraHelp(
      this.input.activeDevice,
      cameraEnabled,
      this.tool.mode === 'drive',
      this.chase.preset,
    );
    const v = this.vehicle;
    const tools = this.sim.toolsOf(LOCAL_VEHICLE);
    this.anchors.update(frameDt);
    // Everything with a physics body is drawn part way between the last two steps, so it
    // all glides with the car and the camera (paused, it stands where it is).
    const between = this.loop.paused ? 1 : alpha;
    this.model.update(v, between, frameDt);
    this.delivery.sync();
    for (const s of this.stuckViews) s.update(between);
    this.trafficCars.render(between);
    this.ghost?.update(this.run.elapsed);
    this.ruts.update(frameDt);
    this.delivery.render(between);
    this.model.applyCondition(v.condition);
    this.model.setPlanksOnRack(tools.planks.carried);
    this.toolsView.update(v, tools, this.sim.probeGroundFor(LOCAL_VEHICLE), this.clock, between);
    this.view.particles.update(v, this.loop.paused ? 0 : frameDt);
    if (this.freeCamOn) this.freeCam.update(frameDt);
    // The headset's seat follows the car even while a note stops the game.
    else if (!this.loop.paused || this.vr.presenting) this.followVehicle(frameDt, between);
    this.view.focus.copy(this.model.root.position);
    this.view.shelter.copy(this.model.root.matrixWorld);
    const t0 = performance.now();
    this.view.render(between, this.hud.cockpitView && this.settings.mirrors);
    this.sceneMs += (performance.now() - t0 - this.sceneMs) * 0.1;
    // Not while tests drive a fixed number of steps a frame on the slow software renderer.
    const cpuMs = this.loop.timings.sim + this.loop.timings.render;
    if (this.bench) this.bench.update(frameDt, cpuMs);
    else if (this.loop.fixedSteps === 0) this.view.adaptResolution(frameDt, cpuMs);
    this.audio.update(
      buildAudioFrame(
        v,
        tools.winch,
        this.world,
        this.loop.paused,
        frameDt,
        this.hud.cockpitView,
        this.sim.env.rain,
        this.replay ? this.replay.time === 'night' : this.run.hour >= 19 || this.run.hour < 6,
        this.sim.trailerOf(LOCAL_VEHICLE),
      ),
    );
    this.touch.update({
      covered:
        this.map.isOpen ||
        this.pause.isOpen ||
        this.toolMenu.isOpen ||
        this.history.reading ||
        this.freeCamOn,
      mode: this.tool.mode,
      lowRange: v.drivetrain.range === 'low',
      transferMode: v.transfer.mode,
      parkBrake: v.parkBrake,
      frontLocked: v.differentials.front,
      rearLocked: v.differentials.rear,
      precision: v.precisionCrawl,
      lightsOn: v.lights !== 'off',
      winchAttached: tools.winch.attached,
      jackAvailable: tools.jack.state === 'available',
    });
    this.hud.el.classList.toggle('tool-menu-open', this.toolMenu.isOpen);
    // After dusk the HUD dims like a dash's lights.
    this.hud.night = this.replay ? this.replay.time === 'night' : this.run.hour >= 18.4 || this.run.hour < 6;
    this.applyPinnedHazards();
    const hudState = buildHudState({
      vehicle: v,
      tools,
      device: this.input.activeDevice,
      controller: this.controllerShown,
      touchDrive: this.settings.touchDrive,
      mode: this.tool.mode,
      cameraHeading: this.cameraHeading(),
      discovered: this.exploration.discovered,
      pois: this.world.pois,
      crawlCourses: this.world.map.crawlCourses,
      crawlTrails: this.world.map.crawlTrails,
      tracks: this.world.features.tracks,
      trackDistanceAt: this.trackDistanceAt,
      hintCache: this.hintCache,
      anchorInReach: this.anchors.inReach,
      anchorCount: this.anchors.count,
      run: this.crawlRuns.run,
      gates: this.scoredGates ? this.scoredGates.hud() : this.gateCount.total ? this.gateCount : null,
      repair: this.sim.repairOption(LOCAL_VEHICLE),
      refuel: this.sim.refuelOption(LOCAL_VEHICLE),
      find: this.findNearby(),
      sideTrip: this.run.status === 'driving' ? this.sideTrips.prompt(v.position.x, v.position.z) : null,
      // Not at a side trip's stop: the water in front of a lookout is not a crossing.
      recoveryCue: this.showRecoveryCue,
      teachLowRange: this.lowRangeHint.show(v.drivetrain.range, this.run.status === 'driving', () => {
        if (this.sideTrips.prompt(v.position.x, v.position.z)) return false;
        const f = v.forward();
        const flat = Math.hypot(f.x, f.z) || 1;
        return waterAhead(this.waterDepthAt, v.position.x, v.position.z, f.x / flat, f.z / flat);
      }),
      hitch: this.sim.hitchOption(LOCAL_VEHICLE),
      trailer: this.sim.trailerOf(LOCAL_VEHICLE),
      trailerLeft: this.delivery.trailerLeft(),
      episode: episodeHud(this.run, this.episode),
      supplies: true,
      fuelUsed: this.episode.fuelScale > 0,
    });
    this.hud.update(hudState);
    // A recovery under way: the winch on, or the car over and waiting to be righted. Once it
    // ends off the line, the HUD points back to it until the car is on it again.
    const recovering = tools.winch.attached || tools.jack.state === 'available';
    const onLine = !!hudState.courseHint && !hudState.courseHint.recovery;
    this.showRecoveryCue =
      this.run.status === 'driving' && this.recoveryCue.update(frameDt, recovering, onLine);
    // A warning, the winch chooser or a recovery starting: the history note gets out of the way.
    const urgent =
      recovering ||
      this.tool.mode === 'winchTarget' ||
      hudState.prompts.some((prompt) => prompt.keys === '!');
    if (urgent && !this.wasUrgent) this.history.makeWay();
    this.wasUrgent = urgent;
    if (this.vr.presenting) this.vrDash.update(hudState, this.toolMenu.view, this.history.words);
    if (this.overlay) {
      const w = tools.winch;
      const fl = v.condition.flood;
      this.overlay.setLines([
        ...(this.debugTools?.update(v) ?? []),
        `winch ${w.anchor ? `${w.anchor.label} ${w.length.toFixed(1)} m ${(w.tension / 1000).toFixed(1)} kN` : 'off'}  planks ${tools.planks.carried}/2  jack ${tools.jack.state}`,
        `flood ${fl.timer.toFixed(1)} s${fl.stalled ? ' STALLED' : ''}  dirt ${v.condition.dirt.sides.toFixed(2)}  dents ${v.condition.dents.length}  mode ${this.tool.mode}`,
        `cpu ${(this.loop.timings.sim + this.loop.timings.render).toFixed(1)} ms: sim ${this.loop.timings.sim.toFixed(1)} ms (${this.loop.timings.steps.toFixed(1)} steps)  frame ${this.loop.timings.render.toFixed(1)} ms (three.js ${this.sceneMs.toFixed(1)} ms)  resolution ${Math.round(this.view.resolutionScale * 100)}%`,
        audioLine(this.audio),
        `particles: ${this.view.particles.counts()}`,
      ]);
      this.overlay.frame(frameDt, this.view.renderer);
    }
    this.input.consumeUi();
    this.frameCount++;
    if (this.frameCount === 3 && window.__game) window.__game.ready = true;
    if (this.frameCount === 30 && this.benchMode) this.bench = new Bench(this);
  }

  /** The chase camera follows the car (each frame, and once before the first). */
  private followVehicle(frameDt: number, alpha = 1): void {
    const v = this.vehicle;
    if (this.vr.presenting) {
      this.vr.place(this.model.root.position, this.model.root.quaternion, this.chase.seat.eye);
      this.vrDash.seat(this.chase.seat.eye.x);
      return;
    }
    this.chase.toolView = this.tool.mode !== 'drive';
    this.chase.towing = this.sim.trailerOf(LOCAL_VEHICLE) !== null;
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
      alpha,
    });
  }
}

function audioLine(audio: AudioSystem): string {
  const a = audio.info();
  if (a.state !== 'running') return `audio ${a.state}${a.state === 'off' ? ' (click or press a key)' : ''}`;
  const tyres = Object.entries(a.tyres)
    .map(([k, w]) => `${k} ${w.toFixed(2)}`)
    .join(' ');
  return `audio ${(20 * Math.log10(a.level + 1e-6)).toFixed(0)} dB  engine ${a.engineHz.toFixed(0)} Hz (${a.engineVoice})  scrape ${a.scrape.toFixed(2)}  wind ${a.wind.toFixed(2)}  water ${a.water.toFixed(2)}  ${tyres}${a.winchHz ? `  winch ${a.winchHz.toFixed(0)} Hz` : ''}${a.trailer ? `  trailer ${a.trailer.toFixed(2)}` : ''}`;
}
