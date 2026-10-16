import { winchTuning as W } from '../../data/tools';
import type { Vehicle } from '../vehicle/vehicle';
import { v3, type Vec3 } from '../vehicle/math';
import { anchorPoint, type Anchor } from './anchors';

/**
 * Front winch (SPEC §7.1): 30 m cable, winch in/out at ~1 m/s, and when taut a
 * spring-damper pull capped at 1.5× vehicle weight. Works with the engine off.
 * Dynamic anchors (the Fallen Tree) get the opposite pull.
 */
export class Winch {
  anchor: Anchor | null = null;
  /** Paid-out cable length (m). */
  length = 0;
  /** Current pull (N). */
  tension = 0;
  /** -1 paying out, 0 idle, 1 reeling in. */
  motor = 0;
  readonly mount = v3();
  readonly anchorPos = v3();

  get attached(): boolean {
    return this.anchor !== null;
  }

  attach(v: Vehicle, a: Anchor): void {
    this.anchor = a;
    v.localToWorld(v.tuning.winchMount.x, v.tuning.winchMount.y, v.tuning.winchMount.z, this.mount);
    anchorPoint(a, this.anchorPos);
    const d = dist(this.mount, this.anchorPos);
    this.length = Math.min(W.cableLength, d + W.slackOnAttach);
    this.tension = 0;
  }

  detach(): void {
    this.anchor = null;
    this.tension = 0;
    this.motor = 0;
  }

  /** Apply cable forces for one step (before the physics world steps). */
  step(v: Vehicle, winchIn: boolean, winchOut: boolean, dt: number): void {
    const a = this.anchor;
    if (!a) return;
    const t = v.tuning;
    v.localToWorld(t.winchMount.x, t.winchMount.y, t.winchMount.z, this.mount);
    anchorPoint(a, this.anchorPos);
    const dx = this.anchorPos.x - this.mount.x;
    const dy = this.anchorPos.y - this.mount.y;
    const dz = this.anchorPos.z - this.mount.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > W.cableLength + 3) {
      // Teleported away or something went badly wrong: let go.
      this.detach();
      return;
    }
    const fmax = W.maxForceFactor * t.mass * 9.81;
    this.motor = winchIn ? 1 : winchOut ? -1 : 0;
    // The motor can't reel in against a full-load pull (it stalls), but can always pay out.
    if (this.motor > 0 && this.tension < fmax * 0.98) this.length -= W.speed * dt;
    if (this.motor < 0) this.length += W.speed * dt;
    this.length = Math.max(W.minLength, Math.min(W.cableLength, this.length));

    const stretch = d - this.length;
    if (stretch <= 0 || d < 1e-3) {
      this.tension = 0;
      return;
    }
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    const vm = v.body.velocityAtPoint(this.mount);
    const va = a.body ? a.body.velocityAtPoint(this.anchorPos) : { x: 0, y: 0, z: 0 };
    // Rate the cable is being stretched.
    const rate = (va.x - vm.x) * nx + (va.y - vm.y) * ny + (va.z - vm.z) * nz;
    let f = W.stiffness * stretch + W.damping * rate;
    f = Math.max(0, Math.min(fmax, f));
    this.tension = f;
    const imp = f * dt;
    v.body.applyImpulseAtPoint({ x: nx * imp, y: ny * imp, z: nz * imp }, this.mount, true);
    if (a.body)
      a.body.applyImpulseAtPoint({ x: -nx * imp, y: -ny * imp, z: -nz * imp }, this.anchorPos, true);
  }

  /** Straight-line distance from the winch mount to the anchor (m). */
  distance(): number {
    return this.anchor ? dist(this.mount, this.anchorPos) : 0;
  }
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
