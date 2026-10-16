import { glyphs } from '../data/controls';
import { floodTuning } from '../data/tools';
import type { Device } from '../sim/input/inputManager';
import type { VehicleTools } from '../sim/tools/tools';
import type { Vehicle } from '../sim/vehicle/vehicle';
import type { PoiDef } from '../sim/world/mapTypes';
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

  return {
    heading: i.cameraHeading,
    pois,
    range: v.drivetrain.range,
    planksCarried: t.planks.carried,
    planksTotal: 2,
    winchAttached: t.winch.attached,
    engine: flood.stalled ? 2 : flood.timer > 0 ? 1 : 0,
    prompts,
  };
}
