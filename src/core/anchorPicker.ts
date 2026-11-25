import * as THREE from 'three';
import type { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';
import { v3 } from '../sim/vehicle/math';
import { anchorPoint } from '../sim/tools/anchors';
import type { ToolController } from './toolController';

/**
 * Choosing a winch anchor (moved out of `Game`, v1.52): how many are in reach, counted a
 * few times a second for the HUD and the tool menu; USE with two or more opens the chooser;
 * and a short tap or click on the view while choosing picks the one under it. While choosing,
 * an arrow at the edge of the view points to the selected anchor when it is out of view (v2.19).
 */
/** Where a point stands in the view: x, y in -1..1 (y up), and whether it is in front of the camera. */
export interface ViewPoint {
  x: number;
  y: number;
  ahead: boolean;
}

/**
 * Where to put the arrow for an anchor at `p` in the view, or null when the anchor can be
 * seen (inside `inset` of the view's edge). `x`, `y` are -1..1 with y up, on the edge of a
 * frame `edge` of the way out; `turn` is the arrow's direction in radians, clockwise from up.
 */
export function edgeArrow(
  p: ViewPoint,
  inset = 0.92,
  edge = 0.84,
): { x: number; y: number; turn: number } | null {
  if (p.ahead && Math.abs(p.x) <= inset && Math.abs(p.y) <= inset) return null;
  // Behind the camera the projection is mirrored through the centre: turn it back.
  let dx = p.ahead ? p.x : -p.x;
  let dy = p.ahead ? p.y : -p.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  // Dead behind: point down, towards the driver's own back.
  if (reach < 1e-4) [dx, dy] = [0, -1];
  const k = edge / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: dx * k, y: dy * k, turn: Math.atan2(dx, dy) };
}

export class AnchorPicker {
  /** Is there a winch anchor in reach (checked every 0.4 s)? */
  inReach = false;
  /** How many anchors are in reach. */
  count = 0;
  private check = 0;
  private tapStart: { id: number; x: number; y: number; t: number } | null = null;
  private readonly tapVec = new THREE.Vector3();
  private readonly anchorTmp = v3();
  /** The arrow at the view's edge, with the distance under it (none where there is no page). */
  private readonly arrow: HTMLElement | null = null;
  private readonly arrowLabel: HTMLElement | null = null;

  constructor(
    private readonly sim: Pick<Simulation, 'toolsOf' | 'hitchOption' | 'findAnchors'>,
    private readonly tool: Pick<ToolController, 'mode' | 'startWinchTarget' | 'pick'>,
    private readonly vehicleId: string,
    private readonly vehicle: () => Vehicle,
    private readonly camera: THREE.Camera,
    private readonly canvas: HTMLElement,
  ) {
    if (typeof document !== 'undefined') {
      this.arrow = document.createElement('div');
      this.arrow.className = 'anchor-arrow hidden';
      this.arrow.innerHTML =
        '<span class="anchor-arrow-head"></span><span class="anchor-arrow-label"></span>';
      this.arrowLabel = this.arrow.querySelector('.anchor-arrow-label');
      (document.getElementById('ui') ?? document.body).appendChild(this.arrow);
    }
    canvas.addEventListener('pointerdown', (e) => {
      this.tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    });
    // A short tap that didn't drag the camera picks a winch anchor while choosing one.
    canvas.addEventListener('pointerup', (e) => {
      const s = this.tapStart;
      this.tapStart = null;
      if (!s || s.id !== e.pointerId || performance.now() - s.t > 500) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) return;
      this.tapAnchor(e.clientX, e.clientY, e.pointerType === 'touch');
    });
  }

  /** Each frame: point to the selected anchor, and recount the anchors in reach every 0.4 s. */
  update(frameDt: number): void {
    this.pointToSelected();
    this.check -= frameDt;
    if (this.check > 0) return;
    this.check = 0.4;
    this.count = this.sim.findAnchors(this.vehicleId).length;
    this.inReach = this.count > 0;
  }

  /** While choosing: an arrow at the view's edge towards the selected anchor, when it is out of view. */
  private pointToSelected(): void {
    const arrow = this.arrow;
    if (!arrow) return;
    const t = this.sim.toolsOf(this.vehicleId);
    const list = t.targeting;
    const a =
      this.tool.mode === 'winchTarget' && list ? list[Math.min(list.length - 1, t.targetIndex)] : null;
    if (!a) {
      arrow.classList.add('hidden');
      return;
    }
    const p = anchorPoint(a, this.anchorTmp);
    // In the camera's own frame first: is it in front?
    this.tapVec.set(p.x, p.y + 0.3, p.z).applyMatrix4(this.camera.matrixWorldInverse);
    const ahead = this.tapVec.z < 0;
    this.tapVec.set(p.x, p.y + 0.3, p.z).project(this.camera);
    const at = edgeArrow({ x: this.tapVec.x, y: this.tapVec.y, ahead });
    if (!at) {
      arrow.classList.add('hidden');
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    arrow.classList.remove('hidden');
    arrow.style.left = `${rect.left + ((at.x + 1) / 2) * rect.width}px`;
    arrow.style.top = `${rect.top + ((1 - at.y) / 2) * rect.height}px`;
    arrow.style.setProperty('--turn', `${at.turn}rad`);
    // The same distance the prompt gives: from the winch on the bumper to the anchor.
    const v = this.vehicle();
    const m = v.tuning.winchMount;
    const w = v.localToWorld(m.x, m.y, m.z);
    if (this.arrowLabel)
      this.arrowLabel.textContent = `${Math.round(Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z))} m`;
  }

  /** Open the anchor chooser for a USE press, when there is a choice to make. */
  offerChoice(): boolean {
    const t = this.sim.toolsOf(this.vehicleId);
    if (t.winch.attached || t.planks.inReach(this.vehicle()).length > 0) return false;
    if (this.sim.hitchOption(this.vehicleId)?.kind === 'hitch') return false;
    if (this.sim.findAnchors(this.vehicleId).length < 2) return false;
    return this.tool.startWinchTarget();
  }

  /** A tap or click on the view while choosing an anchor: pick the one under it. */
  private tapAnchor(clientX: number, clientY: number, touch: boolean): void {
    const list = this.sim.toolsOf(this.vehicleId).targeting;
    if (this.tool.mode !== 'winchTarget' || !list) return;
    const rect = this.canvas.getBoundingClientRect();
    const reach = touch ? 64 : 40;
    let best = -1;
    let bestD = reach;
    list.forEach((a, i) => {
      const p = anchorPoint(a, this.anchorTmp);
      this.tapVec.set(p.x, p.y + 0.3, p.z).project(this.camera);
      if (this.tapVec.z > 1) return;
      const x = rect.left + ((this.tapVec.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - this.tapVec.y) / 2) * rect.height;
      const d = Math.hypot(x - clientX, y - clientY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) this.tool.pick(best);
  }
}
