import type { ControllerType } from '../data/controllers';
import { glyphsFor } from '../data/controls';
import { defaultTouchDrive, type TouchDriveScheme } from '../data/touch';
import { floodTuning } from '../data/tools';
import type { Device } from '../sim/input/inputManager';
import { gearLabel } from '../sim/vehicle/drivetrain';
import type { VehicleTools } from '../sim/tools/tools';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { pressurePsi, wheelPsi } from '../sim/vehicle/tyrePressure';
import type { Trailer } from '../sim/trailer';
import type { CrawlCourseDef, CrawlTrailDef, PoiDef } from '../sim/world/mapTypes';
import type { TrackInfo } from '../sim/world/features';
import { trailPoint, trailProgress } from '../sim/world/crawlTrail';
import { RECOVERY_CUE_REACH, lineCue } from './recoveryCue';
import { headingOf, v3 } from '../sim/vehicle/math';
import { anchorPoint } from '../sim/tools/anchors';
import type { CompassPoi, EpisodeHud, GateState, HudState, Prompt, TrailerHud } from '../ui/hud';
import type { RepairKind } from '../sim/tools/tools';
import type { GaugeState } from '../ui/crawlGauges';
import { penaltyPoints, type CrawlRun } from '../sim/crawlRuns';
import { rotate } from '../sim/vehicle/math';
import type { ToolMode } from './toolController';
import { isDamaged } from '../sim/vehicle/damage';
import { clockTime, levelTitle, type EpisodeDef } from '../data/episodes';
import type { EpisodeRun } from '../sim/episode';

export interface HudInputs {
  vehicle: Vehicle;
  tools: VehicleTools;
  device: Device;
  controller?: ControllerType;
  touchDrive?: TouchDriveScheme;
  mode: ToolMode;
  cameraHeading: number;
  discovered: ReadonlySet<string>;
  pois: readonly PoiDef[];
  crawlCourses?: readonly CrawlCourseDef[];
  crawlTrails?: readonly CrawlTrailDef[];
  tracks?: readonly TrackInfo[];
  /**
   * Distance (m) from (x, z) to the nearest track's edge, from the map's 1 m grid: the course
   * hint's track search is skipped when the car is well off every track.
   */
  trackDistanceAt?: (x: number, z: number) => number;
  /** Keeps the course hint's track search to a few times a second (none: every call). */
  hintCache?: CourseHintCache;
  /** Is there a winch anchor in reach (checked a few times a second)? */
  anchorInReach: boolean;
  /** How many anchors are in reach: with two or more, USE opens the chooser. */
  anchorCount?: number;
  /** Scored crawl run in progress, if any. */
  run?: CrawlRun | null;
  /** Gate count on a map with a gate trail. */
  gates?: GateState | null;
  /** What a roadside repair could do now (null when nothing needs one or damage is off). */
  repair?: { kind: RepairKind; possible: boolean } | null;
  /** Pouring in a jerry can, when there's one to pour. */
  refuel?: { kind: RepairKind; possible: boolean } | null;
  /** The episode's mission and clock. */
  episode?: EpisodeHud | null;
  /** Something to load nearby (src/sim/finds.ts), and whether it is in reach. */
  find?: { name: string; inReach: boolean } | null;
  sideTrip?: { text: string; progress: number } | null;
  /** Water lies close ahead and the car is in high range, on a run where low range has not been used yet (src/core/lowRangeHint.ts). */
  teachLowRange?: boolean;
  /** A recovery has just ended off the line: point back to the nearest hinted track (v2.24). */
  recoveryCue?: boolean;
  /** Show the fuel gauge and supplies (an episode is under way). */
  supplies?: boolean;
  /** Fuel is burnt on this level (false on a playground: no fuel gauge or jerry cans). Default true. */
  fuelUsed?: boolean;
  /** A trailer to hitch or unhitch, and whether it can be done now. */
  hitch?: { kind: 'hitch' | 'unhitch'; possible: boolean } | null;
  /** The trailer on the back: its load, and whether it has come round against the car or tipped over. */
  trailer?:
    | (Pick<Trailer, 'jackknifed' | 'tipped' | 'drums' | 'mass' | 'load' | 'tuning'> &
        Partial<Pick<Trailer, 'strain' | 'tyres'>>)
    | null;
  /** Not towing: the nearest trailer standing unhitched, how far away (m) and whether it's over. */
  trailerLeft?: { distance: number; tipped: boolean } | null;
}

/**
 * The HUD's episode block: the title and mission, the clock, the deadline line (the grace
 * time once it is dark) and the hours the clock dial marks (moved out of `Game`, v1.52).
 */
export function episodeHud(
  run: Pick<EpisodeRun, 'missionLine' | 'timed' | 'hour' | 'hoursLeft'>,
  episode: Pick<EpisodeDef, 'number' | 'title' | 'deadline' | 'goal'>,
): EpisodeHud {
  const left = run.hoursLeft();
  const d = episode.deadline;
  return {
    title: levelTitle(episode),
    mission: run.missionLine(),
    clock: run.timed ? clockTime(run.hour) : '',
    deadline: !Number.isFinite(left)
      ? ''
      : left <= 0 && d?.graceHours
        ? `Dark · by ${clockTime(d.hour + d.graceHours)}`
        : (d?.label ?? ''),
    urgent: left < 0.5,
    hour: run.timed ? run.hour : null,
    darkHour: run.timed ? (d?.hour ?? null) : null,
    finishHour: run.timed && d ? d.hour + (d.graceHours ?? 0) : null,
  };
}

/** The HUD's trailer line: what's on the back and how it's going, or where it was left. */
export function trailerHud(towing: HudInputs['trailer'], left: HudInputs['trailerLeft']): TrailerHud | null {
  if (towing)
    return {
      name: towing.tuning.name,
      drums: towing.drums,
      kg: Math.round(towing.mass),
      limit: towing.tuning.mass + towing.tuning.payload,
      overloaded: towing.load.mass > towing.tuning.payload + 0.5,
      state: towing.tipped ? 'tipped' : towing.jackknifed ? 'jackknifed' : 'towing',
      distance: 0,
    };
  if (left)
    return {
      name: 'Trailer',
      drums: 0,
      kg: 0,
      limit: 0,
      overloaded: false,
      state: left.tipped ? 'tipped' : 'left',
      distance: left.distance,
    };
  return null;
}

/** What each roadside job says while it's under way, and as a prompt beforehand. */
const jobText: Record<RepairKind, [string, string]> = {
  field: ['Field repair', 'Field repair (tool menu)'],
  spare: ['Fitting a spare', 'Fit a spare (tool menu)'],
  plug: ['Plugging the tyre', 'Plug the tyre (tool menu)'],
  refuel: ['Pouring in a jerry can', 'Pour in a jerry can (tool menu)'],
  pump: ['Pumping the tyres up', 'Pump the tyres up (tool menu)'],
  hubs: ['Working the front hubs', 'Lock or unlock the hubs (tool menu)'],
  dig: ['Shovelling clear of the wheels', 'Clear the wheels with the shovel (tool menu)'],
};

/** Build what the HUD shows this frame, including context prompts (SPEC §9). */
interface NearTrack {
  track: TrackInfo;
  distance: number;
  along: number;
}

/** The crawl trail and the route-hint track nearest the car, as of the last search. */
interface HintSearch {
  trail: (NearTrack & { trail: CrawlTrailDef }) | null;
  link: NearTrack | null;
}

/** How long the course hint's track search is reused (ms): five searches a second. */
const HINT_SEARCH_MS = 200;
/**
 * Further than this from every track's edge on the 1 m grid (m), no hint can show: a hint
 * needs the car within 1 m of the edge, and the grid sample can be 0.7 m off the car and
 * rounded by 0.5 m.
 */
const HINT_TRACK_REACH = 3;

/**
 * The course hint's search of every crawl trail's and route hint's 1 m polyline was the HUD's
 * costliest work each frame (v1.49): the Bloomfield track alone has 2,300 points. This keeps
 * one search for HINT_SEARCH_MS.
 */
export class CourseHintCache {
  private at = -Infinity;
  last: HintSearch = { trail: null, link: null };

  /** True (and restarts the wait) when the last search is old enough to repeat. */
  due(now: number): boolean {
    if (now - this.at < HINT_SEARCH_MS) return false;
    this.at = now;
    return true;
  }
}

/** The nearest crawl trail (or its bypass) and route-hint track to (x, z). */
export function searchHintTracks(i: HudInputs, x: number, z: number): HintSearch {
  const out: HintSearch = { trail: null, link: null };
  // With the recovery cue up the nearest hinted track is wanted however far off it is.
  if (!i.recoveryCue && i.trackDistanceAt && i.trackDistanceAt(x, z) > HINT_TRACK_REACH) return out;
  const tracks = i.tracks ?? [];
  for (const trail of i.crawlTrails ?? [])
    for (const track of tracks) {
      if (track.def.id !== trail.trackId && track.def.id !== trail.bypassTrackId) continue;
      const hit = trailProgress(track, x, z);
      if (!out.trail || hit.distance < out.trail.distance) out.trail = { trail, track, ...hit };
    }
  for (const track of tracks) {
    if (!track.def.routeHint) continue;
    const hit = trailProgress(track, x, z);
    if (!out.link || hit.distance < out.link.distance) out.link = { track, ...hit };
  }
  return out;
}

export function buildHudState(i: HudInputs): HudState {
  const g = glyphsFor(i.device, i.controller, i.touchDrive ?? defaultTouchDrive);
  const kb = i.device === 'keyboard';
  const touch = i.device === 'touch';
  const v = i.vehicle;
  const t = i.tools;
  const p = v.body.translation();
  const prompts: Prompt[] = [];
  const flood = v.condition.flood;
  const cond = v.condition;
  const wrecked = cond.engine <= 0;

  if (i.mode === 'plankPlace') {
    prompts.push(
      { keys: kb ? 'W / S' : touch ? 'Stick ↕' : 'L-stick ↕', text: 'Move planks' },
      { keys: kb ? 'A / D' : touch ? 'Stick ↔' : 'L-stick ↔', text: 'Turn planks' },
      { keys: g.confirm ?? 'E', text: 'Place planks' },
      { keys: g.back ?? 'Esc', text: 'Cancel' },
    );
  } else if (i.mode === 'winchTarget') {
    const list = t.targeting ?? [];
    const a = list[Math.min(list.length - 1, t.targetIndex)];
    if (a) {
      const m = v.tuning.winchMount;
      const w = v.localToWorld(m.x, m.y, m.z);
      const ap = anchorPoint(a, v3());
      const d = Math.round(Math.hypot(ap.x - w.x, ap.y - w.y, ap.z - w.z));
      prompts.push({ keys: `${t.targetIndex + 1}/${list.length}`, text: `${a.label}, ${d} m` });
    }
    prompts.push(
      {
        keys: kb ? 'A / D' : touch ? 'Stick ↔' : 'D-pad ↔',
        text: touch ? 'Choose anchor, or tap one' : kb ? 'Choose anchor, or click one' : 'Choose anchor',
      },
      { keys: g.confirm ?? 'E', text: 'Attach winch' },
      { keys: g.back ?? 'Esc', text: 'Cancel' },
    );
  } else {
    // Trying to drive off with the park brake on.
    if (v.parkBrake && v.throttle > 0.1)
      prompts.push({ keys: g.handbrake ?? 'Space', text: 'Release the handbrake' });
    if (t.jack.state === 'available')
      prompts.push({ keys: `Hold ${g.jack}`, text: 'Right vehicle', progress: t.jack.holdProgress });
    if (t.repair)
      prompts.push({
        keys: '…',
        text: t.repair.targetPsi ? `Setting tyres to ${t.repair.targetPsi} psi` : jobText[t.repair.kind][0],
        progress: 1 - t.repair.remaining / t.repair.total,
      });
    else if (i.repair?.possible && Math.abs(v.speed) < 0.5)
      prompts.push({ keys: g.toolMenu ?? 'Q', text: jobText[i.repair.kind][1] });
    else if (cond.fuel <= 0 && i.refuel?.possible)
      prompts.push({ keys: g.toolMenu ?? 'Q', text: `Out of fuel — ${jobText.refuel[1].toLowerCase()}` });
    if (v.swept > 0)
      prompts.push({ keys: '!', text: 'The current is taking the car — get to shallow water' });
    else if (v.afloat > 0.25 && Math.hypot(v.current.x, v.current.z) > 0.3)
      prompts.push({ keys: '!', text: 'Deep, fast water — the current is lifting the car' });
    if (wrecked) prompts.push({ keys: '!', text: 'Engine wrecked' });
    else if (cond.fuel <= 0 && !t.repair) prompts.push({ keys: '!', text: 'Out of fuel' });
    else if (flood.stalled) {
      const wait = Math.ceil(floodTuning.restartDryTime - flood.dryTime);
      if (flood.submerged)
        prompts.push({ keys: '!', text: 'Engine flooded — get the air intake out of the water' });
      else if (wait > 0) prompts.push({ keys: '!', text: `Engine flooded — drying out (${wait} s)` });
      else prompts.push({ keys: g.accelerate ?? 'W', text: 'Restart engine' });
    } else if (flood.submerged)
      prompts.push({
        keys: '!',
        text: v.bowWave > 0.05 ? 'Bow wave at the air intake! Slow down' : 'Water at the air intake!',
      });
    else if (v.engineOff)
      prompts.push({
        keys: g.accelerate ?? 'W',
        // In the sim-level 'clutch' mode it starts only in neutral or with the clutch in.
        text:
          v.clutchGearbox && v.gearboxMode === 'clutch' && !v.drivetrain.neutral
            ? 'Start the engine (clutch in, or neutral)'
            : 'Start the engine',
      });
    if (i.teachLowRange && !t.repair && !wrecked)
      prompts.push({
        keys: touch ? '4WD' : (g.range ?? 'L'),
        text: touch ? 'Water ahead: stop, then tap 4WD and LOW' : 'Water ahead: stop, then low range',
      });
    if (i.sideTrip && !t.repair)
      prompts.push({ keys: 'Stop', text: i.sideTrip.text, progress: i.sideTrip.progress });
    if (i.find && !t.repair)
      prompts.push({
        keys: i.find.inReach ? 'Stop' : '!',
        text: i.find.inReach
          ? `Stop here to load the ${i.find.name.toLowerCase()}`
          : `${i.find.name} on a crate — pull up beside it`,
      });
    if (i.trailer?.tyres?.some((h) => h < 1))
      prompts.push({ keys: '!', text: 'Trailer tyre flat — stop and repair it in Tools' });
    if ((i.trailer?.strain ?? 0) >= 0.55)
      prompts.push({ keys: '!', text: 'Load straps loose — stop and tighten them in Tools' });
    if (i.trailer?.tipped) prompts.push({ keys: '!', text: 'The trailer has tipped over' });
    else if (i.trailer?.jackknifed)
      prompts.push({ keys: '!', text: 'Jackknifed — pull forward to straighten the trailer' });
    if (t.planks.inReach(v).length > 0) prompts.push({ keys: g.interact ?? 'E', text: 'Pick up planks' });
    else if (i.hitch?.kind === 'hitch')
      prompts.push(
        i.hitch.possible
          ? { keys: g.interact ?? 'E', text: 'Hitch the trailer' }
          : { keys: 'Stop', text: 'Stop to hitch the trailer' },
      );
    else if (t.winch.attached) {
      prompts.push({ keys: `${g.winchIn} / ${g.winchOut}`, text: 'Winch in / out' });
      prompts.push({ keys: g.winch ?? 'E', text: 'Detach winch' });
    } else if (i.anchorInReach && Math.abs(v.speed) < 1.5)
      prompts.push({
        keys: g.winch ?? 'E',
        text: (i.anchorCount ?? 1) > 1 ? `Choose a winch anchor (${i.anchorCount} in reach)` : 'Attach winch',
      });
  }

  const pois: CompassPoi[] = [];
  for (const poi of i.pois) {
    if (!i.discovered.has(poi.id)) continue;
    const dx = poi.x - p.x;
    const dz = poi.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 400 || d < 8) continue;
    pois.push({ id: poi.id, kind: poi.kind, bearing: headingOf(dx, dz) });
  }

  let courseHint: HudState['courseHint'] = null;
  if (i.mode === 'drive')
    for (const course of i.crawlCourses ?? []) {
      const h = (course.headingDeg * Math.PI) / 180;
      const dx = p.x - course.x;
      const dz = p.z - course.z;
      const along = Math.sin(h) * dx - Math.cos(h) * dz;
      const across = Math.cos(h) * dx + Math.sin(h) * dz;
      const line = course.lines.find((line) => Math.abs(across - line.offset) < 2.5);
      if (!line || along < -6 || along > course.length + 4) continue;
      courseHint = {
        title: `${line.difficulty[0].toUpperCase()}${line.difficulty.slice(1)} · ${line.name}`,
        text: line.hint,
        controls:
          i.device === 'gamepad'
            ? `${g.range} low range · ${g.toolMenu} tools · ${g.toolMenu} + ${g.cameraReset} views`
            : touch
              ? 'LOW range · F / R LOCK · CRAWL · View'
              : `${g.range} low range · ${g.frontDiff} front · ${g.rearDiff} rear · ${g.precision} crawl · C views`,
      };
      break;
    }

  let hintTracks: HintSearch | null = null;
  if (i.mode === 'drive') {
    const cache = i.hintCache;
    if (!cache) hintTracks = searchHintTracks(i, p.x, p.z);
    else {
      if (cache.due(performance.now())) cache.last = searchHintTracks(i, p.x, p.z);
      hintTracks = cache.last;
    }
  }

  if (!courseHint && hintTracks) {
    // The nearest crawl trail, so where one obstacle ends and the next begins the hint
    // follows the one the car is on.
    const near = hintTracks.trail;
    if (near && near.distance <= near.track.def.width / 2 + 1) {
      const trail = near.trail;
      const bypass = near.track.def.id === trail.bypassTrackId;
      const section = trail.sections.find((s) => near.along >= s.from && near.along <= s.to);
      courseHint = {
        title: bypass
          ? `Easy · ${trail.name} bypass`
          : `${trail.name} · ${section?.name ?? 'Technical trail'}`,
        text: bypass
          ? (trail.bypassHint ??
            'Follow the green markers for the wider gravel route between the trail exit and camp. Amber markers lead through the technical rocks.')
          : (section?.hint ?? 'Follow the amber markers. The green gravel bypass connects both ends.'),
        controls: kb
          ? 'L low range · P crawl · Z / X lockers · C views'
          : touch
            ? 'LOW range · CRAWL · F / R LOCK · View'
            : `${g.range} low range · ${g.toolMenu} tools · ${g.toolMenu} + ${g.cameraReset} views`,
      };
    }
  }

  if (!courseHint && hintTracks) {
    const link = hintTracks.link;
    const controls = kb
      ? 'L low range · P crawl · C views'
      : touch
        ? 'LOW range · CRAWL · View'
        : `${g.range} low range · ${g.toolMenu} tools · ${g.toolMenu} + ${g.cameraReset} views`;
    if (link && link.distance < link.track.def.width / 2 + 1)
      courseHint = {
        title: link.track.def.name ?? '4WD Challenge Loop',
        text: link.track.def.routeHint!,
        controls,
      };
    else if (i.recoveryCue && link && link.distance <= RECOVERY_CUE_REACH) {
      // Off the line after a recovery: where it is from the car, then its hint again (v2.24).
      const q = trailPoint(link.track, link.along);
      const f = v.forward();
      courseHint = {
        title: `Back to ${link.track.def.name ?? 'the track'}`,
        text: `The line is ${lineCue(p.x, p.z, f.x, f.z, q.x, q.z)}. ${link.track.def.routeHint!}`,
        controls,
        recovery: true,
      };
    }
  }

  return {
    gauges: gaugeState(v),
    episode: i.episode ?? null,
    trailer: trailerHud(i.trailer, i.trailerLeft),
    supplies: i.supplies
      ? {
          fuel: cond.fuel,
          tank: v.tuning.engine.fuel.tankLitres,
          fuelGauge: i.fuelUsed !== false,
          jerryCans: cond.jerryCans,
          spares: cond.spares,
          plugs: cond.plugs,
          heat: cond.engineHeat ?? 0.5,
          lowPressure: !!cond.lowPressure,
          pressurePsi: pressurePsi(cond),
          tyres: v.tuning.wheels.map((w, k) => ({
            inflation: cond.tyres[k],
            psi: wheelPsi(cond, k),
            fault: cond.tyreFault[k],
            front: w.front,
            left: w.x < 0,
          })),
        }
      : null,
    gates: i.gates
      ? {
          next: i.gates.next,
          total: i.gates.total,
          passed: i.gates.passed,
          missed: i.gates.missed,
          flags: i.gates.flags,
          course: i.gates.course,
        }
      : null,
    run: i.run ? { name: i.run.trail.name, seconds: i.run.seconds, points: penaltyPoints(i.run) } : null,
    heading: i.cameraHeading,
    pois,
    range: v.drivetrain.range,
    transfer: { ...v.transfer, fullTime: v.tuning.transfer === 'fullTime' },
    frontLocked: v.differentials.front,
    rearLocked: v.differentials.rear,
    precisionCrawl: v.precisionCrawl,
    parkBrake: v.parkBrake,
    lights: v.lights,
    courseHint,
    planksCarried: t.planks.carried,
    planksTotal: 2,
    winchAttached: t.winch.attached,
    winchDoubleLine: t.winch.doubleLine,
    treeProtector: t.winch.treeProtector,
    engine: flood.stalled || wrecked || v.clutchStalled ? 2 : flood.timer > 0 ? 1 : 0,
    damage: isDamaged(cond)
      ? {
          engine: cond.engine,
          corners: v.tuning.wheels.map((w, k) => ({
            health: Math.min(cond.tyres[k], cond.tyreTarget[k] < 1 ? 0.9 : 1, cond.suspension[k]),
            front: w.front,
            left: w.x < 0,
          })),
        }
      : null,
    prompts,
  };
}

/** Inclinometer, tyre loads and drivetrain readout for the crawl gauges. */
export function gaugeState(v: Vehicle): GaugeState {
  const q = v.body.rotation();
  const f = rotate(q, 0, 0, -1);
  const r = rotate(q, 1, 0, 0);
  const deg = 180 / Math.PI;
  const parked = (v.tuning.mass * 9.81) / 4;
  const d = v.drivetrain;
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) * deg,
    roll: -Math.asin(Math.max(-1, Math.min(1, r.y))) * deg,
    speedKmh: Math.abs(v.speed) * 3.6,
    gear: gearLabel(d),
    range: d.range,
    rpm: d.rpm,
    redline: v.tuning.engine.redlineRpm,
    wheels: v.wheels.map((w) => ({ load: w.load / parked, contact: w.contact, spin: w.spin })),
    frontLocked: v.differentials.front,
    rearLocked: v.differentials.rear,
    bodyContact: v.bodyContact.force > 0,
  };
}
