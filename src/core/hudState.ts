import { glyphs } from '../data/controls';
import { floodTuning } from '../data/tools';
import type { Device } from '../sim/input/inputManager';
import type { VehicleTools } from '../sim/tools/tools';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { CrawlCourseDef, PoiDef } from '../sim/world/mapTypes';
import { headingOf } from '../sim/vehicle/math';
import type { CompassPoi, HudState, Prompt } from '../ui/hud';
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
  /** Is there a winch anchor in reach (checked a few times a second)? */
  anchorInReach: boolean;
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
            ? 'Y low range · Hold LB for lockers and precision crawl'
            : `${g.range} low range · ${g.frontDiff} front · ${g.rearDiff} rear · ${g.precision} crawl`,
      };
      break;
    }

  return {
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
