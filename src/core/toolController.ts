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
  /** The press that opened the chooser is still in this frame's input: don't let it confirm. */
  private fresh = false;

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
    this.fresh = true;
    return true;
  }

  /**
   * Tapping or clicking an anchor in the view: the first tap picks it, a second tap on
   * the one already picked hooks the winch to it.
   */
  pick(index: number): void {
    const t = this.tools;
    if (this.mode !== 'winchTarget' || !t.targeting || !t.targeting[index]) return;
    if (index === t.targetIndex) this.confirm();
    else t.targetIndex = index;
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
    if (this.fresh) {
      this.fresh = false;
      return true;
    }
    if (inp.pressed('back')) {
      this.cancel();
      return true;
    }
    // Pause (II, Options, Esc) and the map leave the tool and open as usual.
    if (inp.pressed('pause') || inp.pressed('map')) {
      this.cancel();
      return false;
    }
    if (inp.pressed('confirm') || inp.pressed('interact') || inp.pressed('winch')) {
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
        t.targetIndex =
          (t.targetIndex + inp.pressCount('menuRight') + n * 10 - inp.pressCount('menuLeft')) % n;
      }
    }
    return true;
  }
}
