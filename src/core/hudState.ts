import { glyphs } from '../data/controls';
import { floodTuning } from '../data/tools';
import type { Device } from '../sim/input/inputManager';
import type { VehicleTools } from '../sim/tools/tools';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { CrawlCourseDef, CrawlTrailDef, PoiDef } from '../sim/world/mapTypes';
import type { TrackInfo } from '../sim/world/features';
import { trailProgress } from '../sim/world/crawlTrail';
import { headingOf } from '../sim/vehicle/math';
import type { CompassPoi, HudState, Prompt } from '../ui/hud';
import type { GaugeState } from '../ui/crawlGauges';
import { penaltyPoints, type CrawlRun } from '../sim/crawlRuns';
import { rotate } from '../sim/vehicle/math';
import type { ToolMode } from './toolController';

export interface HudInputs {
  vehicle: Vehicle;
  tools: VehicleTools;
  device: Device;
  mode: ToolMode;
  cameraHeading: number;
  discovered: ReadonlySet<string>;
  pois: readonly PoiDef[];
  crawlCourses?: readonly CrawlCourseDef[];
  crawlTrails?: readonly CrawlTrailDef[];
  tracks?: readonly TrackInfo[];
  /** Is there a winch anchor in reach (checked a few times a second)? */
  anchorInReach: boolean;
  /** Scored crawl run in progress, if any. */
  run?: CrawlRun | null;
}

/** Build what the HUD shows this frame, including context prompts (SPEC §9). */
export function buildHudState(i: HudInputs): HudState {
  const g = glyphs[i.device];
  const kb = i.device === 'keyboard';
  const v = i.vehicle;
  const t = i.tools;
  const p = v.body.translation();
  const prompts: Prompt[] = [];
  const flood = v.condition.flood;

  if (i.mode === 'plankPlace') {
    prompts.push(
      { keys: kb ? 'W / S' : 'L-stick ↕', text: 'Move planks' },
      { keys: kb ? 'A / D' : 'L-stick ↔', text: 'Turn planks' },
      { keys: g.confirm ?? 'E', text: 'Place planks' },
      { keys: g.back ?? 'Esc', text: 'Cancel' },
    );
  } else if (i.mode === 'winchTarget') {
    prompts.push(
      { keys: kb ? 'A / D' : 'D-pad ↔', text: 'Choose anchor' },
      { keys: g.confirm ?? 'E', text: 'Attach winch' },
      { keys: g.back ?? 'Esc', text: 'Cancel' },
    );
  } else {
    if (t.jack.state === 'available')
      prompts.push({ keys: `Hold ${g.jack}`, text: 'Right vehicle', progress: t.jack.holdProgress });
    if (flood.stalled) {
      const wait = Math.ceil(floodTuning.restartDryTime - flood.dryTime);
      if (flood.submerged)
        prompts.push({ keys: '!', text: 'Engine flooded — get the air intake out of the water' });
      else if (wait > 0) prompts.push({ keys: '!', text: `Engine flooded — drying out (${wait} s)` });
      else prompts.push({ keys: g.accelerate ?? 'W', text: 'Restart engine' });
    } else if (flood.submerged) prompts.push({ keys: '!', text: 'Water at the air intake!' });
    if (t.planks.inReach(v).length > 0) prompts.push({ keys: g.interact ?? 'E', text: 'Pick up planks' });
    else if (t.winch.attached) {
      prompts.push({ keys: `${g.winchIn} / ${g.winchOut}`, text: 'Winch in / out' });
      prompts.push({ keys: g.winch ?? 'E', text: 'Detach winch' });
    } else if (i.anchorInReach && Math.abs(v.speed) < 1.5)
      prompts.push({ keys: g.winch ?? 'E', text: 'Attach winch' });
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
            ? 'Y low range · LB tools · LB + R3 views'
            : `${g.range} low range · ${g.frontDiff} front · ${g.rearDiff} rear · ${g.precision} crawl · C views`,
      };
      break;
    }

  if (!courseHint && i.mode === 'drive') {
    // The nearest crawl trail, so where one obstacle ends and the next begins the hint
    // follows the one the car is on.
    const near = (i.crawlTrails ?? [])
      .flatMap((trail) =>
        (i.tracks ?? [])
          .filter((t) => t.def.id === trail.trackId || t.def.id === trail.bypassTrackId)
          .map((track) => ({ trail, track, ...trailProgress(track, p.x, p.z) })),
      )
      .sort((a, b) => a.distance - b.distance)[0];
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
          : 'Y low range · LB tools · LB + R3 views',
      };
    }
  }

  if (!courseHint && i.mode === 'drive') {
    const link = (i.tracks ?? [])
      .filter((t) => t.def.routeHint)
      .map((track) => ({ track, ...trailProgress(track, p.x, p.z) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (link && link.distance < link.track.def.width / 2 + 1)
      courseHint = {
        title: link.track.def.name ?? '4WD Challenge Loop',
        text: link.track.def.routeHint!,
        controls: kb ? 'L low range · P crawl · C views' : 'Y low range · LB tools · LB + R3 views',
      };
  }

  return {
    gauges: gaugeState(v),
    run: i.run ? { name: i.run.trail.name, seconds: i.run.seconds, points: penaltyPoints(i.run) } : null,
    heading: i.cameraHeading,
    pois,
    range: v.drivetrain.range,
    frontLocked: v.differentials.front,
    rearLocked: v.differentials.rear,
    precisionCrawl: v.precisionCrawl,
    courseHint,
    planksCarried: t.planks.carried,
    planksTotal: 2,
    winchAttached: t.winch.attached,
    engine: flood.stalled ? 2 : flood.timer > 0 ? 1 : 0,
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
    gear: d.gear < 0 ? 'R' : String(d.gear + 1),
    range: d.range,
    rpm: d.rpm,
    redline: v.tuning.engine.redlineRpm,
    wheels: v.wheels.map((w) => ({ load: w.load / parked, contact: w.contact, spin: w.spin })),
    frontLocked: v.differentials.front,
    rearLocked: v.differentials.rear,
    bodyContact: v.bodyContact.force > 0,
  };
}
