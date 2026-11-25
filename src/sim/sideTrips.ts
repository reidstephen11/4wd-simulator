import type { PoiDef } from './world/mapTypes';

export interface SideTripStop {
  id: string;
  poi: string;
  task: string;
  /** Directions from the main route, also available before finding the place. */
  directions: string;
  radius?: number;
  /** A fictional observation recorded at the stop, readable again in the journal. */
  entry?: string;
}

export interface SideTripDef {
  id: string;
  name: string;
  description: string;
  stops: readonly SideTripStop[];
  /** A sightseeing trip can be done in any order. Jobs follow their listed stops. */
  anyOrder?: boolean;
  reward: { jerryCans?: number; plugs?: number };
  rewardLabel: string;
  finished: string;
}

export interface TripJournalEntry {
  name: string;
  description: string;
  complete: boolean;
  reward: string;
  stops: { task: string; directions: string; done: boolean; available: boolean; entry?: string }[];
}

const STOP_SECONDS = 3;

/** Optional jobs: stop at a place for three seconds, then carry on. No input bindings. */
export class SideTrips {
  readonly done = new Set<string>();
  private waiting = '';
  private seconds = 0;

  constructor(
    readonly defs: readonly SideTripDef[],
    private readonly pois: readonly PoiDef[],
    saved: Iterable<string> = [],
  ) {
    this.reset(saved);
  }

  private key(trip: SideTripDef, stop: SideTripStop): string {
    return `${trip.id}/${stop.id}`;
  }

  reset(saved: Iterable<string>): void {
    const keys = new Set(saved);
    this.done.clear();
    for (const trip of this.defs)
      for (const stop of trip.stops) {
        const key = this.key(trip, stop);
        // A damaged save cannot skip the collection half of a delivery.
        if (!keys.has(key)) {
          if (!trip.anyOrder) break;
        } else this.done.add(key);
      }
    this.waiting = '';
    this.seconds = 0;
  }

  complete(trip: SideTripDef): boolean {
    return trip.stops.every((stop) => this.done.has(this.key(trip, stop)));
  }

  private available(trip: SideTripDef): SideTripStop[] {
    const todo = trip.stops.filter((stop) => !this.done.has(this.key(trip, stop)));
    return trip.anyOrder ? todo : todo.slice(0, 1);
  }

  private near(x: number, z: number) {
    for (const trip of this.defs)
      for (const stop of this.available(trip)) {
        const poi = this.pois.find((p) => p.id === stop.poi);
        if (poi && Math.hypot(poi.x - x, poi.z - z) <= (stop.radius ?? 10))
          return { trip, stop, key: this.key(trip, stop) };
      }
    return null;
  }

  prompt(x: number, z: number): { text: string; progress: number } | null {
    const near = this.near(x, z);
    return (
      near && {
        text: `${near.stop.task} · stop for 3 seconds`,
        progress: this.waiting === near.key ? this.seconds / STOP_SECONDS : 0,
      }
    );
  }

  /** `parked` requires low total speed, an upright car and proximity to the ground. */
  update(
    dt: number,
    x: number,
    z: number,
    parked: boolean,
  ): {
    trip: SideTripDef;
    stop: SideTripStop;
    complete: boolean;
  } | null {
    const near = parked ? this.near(x, z) : null;
    if (!near) {
      this.waiting = '';
      this.seconds = 0;
      return null;
    }
    if (this.waiting !== near.key) {
      this.waiting = near.key;
      this.seconds = 0;
    }
    this.seconds += Math.max(0, dt);
    if (this.seconds + 1e-6 < STOP_SECONDS) return null;
    this.done.add(near.key);
    this.waiting = '';
    this.seconds = 0;
    return { trip: near.trip, stop: near.stop, complete: this.complete(near.trip) };
  }

  journal(): TripJournalEntry[] {
    return this.defs.map((trip) => {
      const available = this.available(trip);
      return {
        name: trip.name,
        description: trip.description,
        complete: this.complete(trip),
        reward: trip.rewardLabel,
        stops: trip.stops.map((stop) => ({
          task: stop.task,
          directions: stop.directions,
          done: this.done.has(this.key(trip, stop)),
          available: available.includes(stop),
          ...(this.done.has(this.key(trip, stop)) && stop.entry ? { entry: stop.entry } : {}),
        })),
      };
    });
  }
}
