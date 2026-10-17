import { plankTuning, winchTuning } from '../../data/tools';
import type { VehicleInput } from '../input/vehicleInput';
import type { Vehicle } from '../vehicle/vehicle';
import { rotate, v3 } from '../vehicle/math';
import type { Anchor } from './anchors';
import { Jack } from './jack';
import { PlankKit } from './planks';
import { Winch } from './winch';

export type ToolEvent =
  | { type: 'winchAttached'; anchor: Anchor }
  | { type: 'winchDetached' }
  | { type: 'planksPlaced'; count: number }
  | { type: 'planksPickedUp'; count: number }
  | { type: 'planksRecalled' }
  | { type: 'righted' }
  | { type: 'noAnchor' };

/** What a vehicle carries: winch, planks and jack. */
export class VehicleTools {
  readonly winch = new Winch();
  readonly planks = new PlankKit();
  readonly jack = new Jack();
  /** Manual winch targeting (tool menu): the candidate list and the highlighted one. */
  targeting: Anchor[] | null = null;
  targetIndex = 0;

  /** Pick the best anchor in range, preferring ones in front of the vehicle. */
  bestAnchor(v: Vehicle, anchors: Anchor[]): Anchor | null {
    const mount = v.localToWorld(v.tuning.winchMount.x, v.tuning.winchMount.y, v.tuning.winchMount.z);
    const f = rotate(v.body.rotation(), 0, 0, -1);
    let best: Anchor | null = null;
    let bestScore = Infinity;
    for (const a of anchors) {
      const dx = a.point.x - mount.x;
      const dz = a.point.z - mount.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const cos = (dx * f.x + dz * f.z) / (d * (Math.hypot(f.x, f.z) || 1));
      const score = d * (cos < 0 ? winchTuning.behindPenalty : 1) * (1.6 - 0.6 * Math.max(0, cos));
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /** Anchors sorted left-to-right in front of the vehicle, for manual targeting. */
  sortForTargeting(v: Vehicle, anchors: Anchor[]): Anchor[] {
    const p = v.body.translation();
    const f = rotate(v.body.rotation(), 0, 0, -1);
    const base = Math.atan2(f.x, -f.z);
    const angle = (a: Anchor) => {
      let d = Math.atan2(a.point.x - p.x, -(a.point.z - p.z)) - base;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return d;
    };
    return [...anchors].sort((a, b) => angle(a) - angle(b));
  }

  get busy(): boolean {
    return this.jack.state === 'righting';
  }

  /** Hold brake off while the winch is doing the work. */
  updateFreeRoll(v: Vehicle, input: VehicleInput): void {
    v.freeRoll = this.winch.attached && (input.winchIn || this.winch.tension > 0);
  }
}

/** Default rear tow point for vehicle-to-vehicle anchors (future co-op). */
export const TOW_POINT = v3(0, 0.05, 1.95);
export const PLANK_REACH = plankTuning.pickupRange;
