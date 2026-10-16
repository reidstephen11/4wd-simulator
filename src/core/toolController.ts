import { plankTuning } from '../data/tools';
import type { InputManager } from '../sim/input/inputManager';
import type { Simulation } from '../sim/sim';

export type ToolMode = 'drive' | 'plankPlace' | 'winchTarget';

/**
 * Game-side state for tool modes (SPEC §7): placing planks (nudge distance and angle,
 * then confirm) and choosing a winch anchor by hand. While a mode is active the
 * vehicle is held on the handbrake and steering keys drive the mode instead.
 */
export class ToolController {
  mode: ToolMode = 'drive';

  constructor(
    private readonly sim: Simulation,
    private readonly input: InputManager,
    private readonly vehicleId: string,
  ) {}

  private get tools() {
    return this.sim.toolsOf(this.vehicleId);
  }

  startPlanks(): boolean {
    const t = this.tools;
    if (t.planks.carried <= 0) return false;
    this.cancel();
    t.planks.previewing = true;
    this.mode = 'plankPlace';
    return true;
  }

  startWinchTarget(): boolean {
    const t = this.tools;
    const anchors = this.sim.findAnchors(this.vehicleId);
    if (anchors.length === 0) return false;
    this.cancel();
    const v = this.sim.vehicles.get(this.vehicleId);
    if (!v) return false;
    t.targeting = t.sortForTargeting(v, anchors);
    // Start on the one quick attach would pick.
    const best = t.bestAnchor(v, anchors);
    t.targetIndex = Math.max(
      0,
      t.targeting.findIndex((a) => a === best),
    );
    this.mode = 'winchTarget';
    return true;
  }

  cancel(): void {
    const t = this.tools;
    t.planks.previewing = false;
    t.targeting = null;
    this.mode = 'drive';
  }

  confirm(): void {
    const t = this.tools;
    if (this.mode === 'plankPlace') this.sim.placePlanks(this.vehicleId);
    else if (this.mode === 'winchTarget' && t.targeting) {
      const a = t.targeting[t.targetIndex];
      if (t.winch.attached) t.winch.detach();
      if (a) this.sim.attachTo(this.vehicleId, a);
    }
    this.cancel();
  }

  /** Per-frame handling of mode keys. Returns true if the mode used the input this frame. */
  update(dt: number): boolean {
    if (this.mode === 'drive') return false;
    const inp = this.input;
    if (inp.pressed('back')) {
      this.cancel();
      return true;
    }
    if (inp.pressed('confirm') || inp.pressed('interact')) {
      this.confirm();
      return true;
    }
    const stick = inp.stick();
    if (this.mode === 'plankPlace') {
      const fwd = (inp.held('menuUp') ? 1 : 0) - (inp.held('menuDown') ? 1 : 0) - stick.y;
      const turn = (inp.held('menuRight') ? 1 : 0) - (inp.held('menuLeft') ? 1 : 0) + stick.x;
      this.tools.planks.adjust(fwd * plankTuning.adjustSpeed * dt, turn * plankTuning.angleSpeedDeg * dt);
    } else if (this.mode === 'winchTarget') {
      const t = this.tools;
      const n = t.targeting?.length ?? 0;
      if (n > 0) {
        if (inp.pressed('menuRight')) t.targetIndex = (t.targetIndex + 1) % n;
        if (inp.pressed('menuLeft')) t.targetIndex = (t.targetIndex + n - 1) % n;
      }
    }
    return true;
  }
}
