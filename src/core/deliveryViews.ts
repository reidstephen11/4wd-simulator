import type * as THREE from 'three';
import { canCouple, trailers, type TrailerTuning } from '../data/trailers';
import { CargoDrumView } from '../render/cargoDrumView';
import { TrailerView } from '../render/trailerView';
import type { Simulation } from '../sim/sim';
import type { Vehicle } from '../sim/vehicle/vehicle';

/**
 * The trailers and loose fuel drums as drawn (moved out of `Game`, v1.52): the Army supply
 * run's trailer and the drums it spills, test mode's hitch, and where a trailer was left.
 */
export class DeliveryViews {
  /** The trailers drawn, by trailer id. */
  private readonly trailerViews = new Map<string, TrailerView>();
  private readonly drumViews = new Map<string, CargoDrumView>();

  constructor(
    private readonly sim: Pick<
      Simulation,
      'trailers' | 'looseDrums' | 'addTrailer' | 'removeTrailer' | 'trailerOf'
    >,
    private readonly scene: THREE.Object3D,
    private readonly vehicleId: string,
    private readonly vehicle: () => Vehicle,
    private readonly toast: (text: string, ms?: number) => void,
  ) {}

  /** Spilled drums and restored trailers get their own views; retired physics bodies lose theirs. */
  sync(): void {
    for (const [id, view] of this.trailerViews) {
      if (view.trailer === this.sim.trailers.get(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.trailerViews.delete(id);
    }
    for (const [id, t] of this.sim.trailers) {
      if (this.trailerViews.has(id)) continue;
      const view = new TrailerView(t);
      this.trailerViews.set(id, view);
      this.scene.add(view.root);
    }
    for (const [id, view] of this.drumViews) {
      if (view.drum === this.sim.looseDrums.get(id)) continue;
      this.scene.remove(view.root);
      view.dispose();
      this.drumViews.delete(id);
    }
    for (const [id, d] of this.sim.looseDrums) {
      if (this.drumViews.has(id)) continue;
      const view = new CargoDrumView(d);
      this.drumViews.set(id, view);
      this.scene.add(view.root);
    }
  }

  /** Each frame: draw the trailers and drums part way between the last two steps. */
  render(alpha: number): void {
    for (const t of this.trailerViews.values()) t.update(alpha);
    for (const d of this.drumViews.values()) d.update(alpha);
  }

  /** The nearest trailer standing unhitched, while the car isn't towing one: how far back it is. */
  trailerLeft(): { distance: number; tipped: boolean } | null {
    if (this.sim.trailerOf(this.vehicleId)) return null;
    const p = this.vehicle().body.translation();
    let best: { distance: number; tipped: boolean } | null = null;
    for (const t of this.sim.trailers.values()) {
      if (t.hitchedTo) continue;
      const q = t.body.translation();
      const distance = Math.hypot(q.x - p.x, q.z - p.z);
      if (!best || distance < best.distance) best = { distance, tipped: t.tipped };
    }
    return best;
  }

  /**
   * Test mode: hitch a trailer behind the car (the box trailer, or the Army's No. 5 behind a
   * vehicle with a pintle hook), with this many 200 L drums of diesel in it, or take the
   * trailer away (null).
   */
  devTrailer(drums: number | null, kind: TrailerTuning['id'] = 'box6x4'): void {
    const tuning = trailers[kind];
    if (drums !== null && !canCouple(tuning, this.vehicle().tuning)) {
      this.toast(`The ${tuning.name}'s ring needs a pintle hook: the Land Rover or the Unimog`, 3000);
      return;
    }
    for (const id of [...this.sim.trailers.keys()]) {
      this.sim.removeTrailer(id);
      const view = this.trailerViews.get(id);
      if (view) {
        this.scene.remove(view.root);
        view.dispose();
      }
      this.trailerViews.delete(id);
    }
    if (drums === null) return;
    const t = this.sim.addTrailer(kind, tuning, this.vehicleId);
    t.loadDrums(drums);
    const view = new TrailerView(t);
    view.setDrums(t.drums);
    this.trailerViews.set(t.id, view);
    this.scene.add(view.root);
  }
}
