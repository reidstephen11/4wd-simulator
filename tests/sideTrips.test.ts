import { describe, expect, it } from 'vitest';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { startCheckpoint } from '../src/sim/episode';
import { loadSave, writeSave } from '../src/sim/save/save';
import { SideTrips, type SideTripDef } from '../src/sim/sideTrips';
import type { PoiDef } from '../src/sim/world/mapTypes';
import { MemoryStore, saveData } from './helpers/saves';

// The game's level has no side trips, so the engine's are tested on three of its own: a
// delivery (collect, then deliver), a survey out and back to where it started, and three
// sightseeing stops in any order.
const place = (id: string, x: number, z: number): PoiDef => ({
  id,
  name: id,
  kind: 'landmark',
  x,
  z,
  radius: 16,
});
const pois: PoiDef[] = [
  place('line-camp', 76, 936),
  place('river-camp', 80, -660),
  place('linesmans-hut', -95, -85),
  place('last-pole-clearing', -184, 4),
  place('gorge-falls', 150, 420),
  place('range-lookout', 20, -300),
  place('river-falls', -40, -700),
];
const sideTrips: readonly SideTripDef[] = [
  {
    id: 'lost-logbook',
    name: 'The lost logbook',
    description: 'Pick up the logbook at the line camp and leave it at the river camp.',
    stops: [
      { id: 'collect', poi: 'line-camp', task: 'Collect the lost logbook', directions: 'By the hut.' },
      { id: 'deliver', poi: 'river-camp', task: 'Leave the logbook in the returns box', directions: 'On.' },
    ],
    reward: { jerryCans: 1 },
    rewardLabel: 'One full 20 L jerry can',
    finished: 'Logbook returned.',
  },
  {
    id: 'last-pole',
    name: 'The last pole',
    description: 'Follow the poles, record what is left, then bring the sketch back to the hut.',
    stops: [
      { id: 'sketch', poi: 'linesmans-hut', task: 'Pick up the old line sketch', directions: 'The hut.' },
      {
        id: 'survey',
        poi: 'last-pole-clearing',
        task: 'Record the last standing pole',
        entry: 'Three empty insulators on the crossarm.',
        directions: 'Beyond the hut.',
      },
      { id: 'return', poi: 'linesmans-hut', task: 'Return the marked sketch', directions: 'Back.' },
    ],
    reward: { plugs: 2 },
    rewardLabel: 'Two tyre plugs from the survey box',
    finished: 'Sketch returned.',
  },
  {
    id: 'scrapbook',
    name: 'Falls and high country',
    description: 'Three stops worth remembering. Any order.',
    anyOrder: true,
    stops: [
      {
        id: 'gorge',
        poi: 'gorge-falls',
        task: 'Sketch the gorge',
        entry: 'White water below the ford.',
        directions: 'The falls spur.',
        radius: 14,
      },
      {
        id: 'range',
        poi: 'range-lookout',
        task: 'Sketch the view from the range',
        entry: 'A gap in the canopy opens onto fold after fold of green hills.',
        directions: 'The lookout.',
        radius: 12,
      },
      {
        id: 'river',
        poi: 'river-falls',
        task: 'Sketch the river falls',
        entry: 'The falls fill the view.',
        directions: 'The falls track.',
        radius: 18,
      },
    ],
    reward: {},
    rewardLabel: 'A completed trip scrapbook',
    finished: 'Scrapbook complete.',
  },
];

function stop(trips: SideTrips, poiId: string, seconds = 3, parked = true) {
  const poi = pois.find((p) => p.id === poiId)!;
  return trips.update(seconds, poi.x, poi.z, parked);
}

describe('Optional side trips', () => {
  it('requires collection before delivery, a continuous stop, and pays only once', () => {
    const trips = new SideTrips(sideTrips, pois);
    expect(stop(trips, 'river-camp', 10)).toBeNull();
    expect(stop(trips, 'line-camp', 2)).toBeNull();
    expect(stop(trips, 'line-camp', 1, false)).toBeNull();
    expect(stop(trips, 'line-camp', 2)).toBeNull();
    expect(stop(trips, 'line-camp', 1)).toMatchObject({ complete: false, stop: { id: 'collect' } });
    const delivery = stop(trips, 'river-camp');
    expect(delivery).toMatchObject({ complete: true, trip: { reward: { jerryCans: 1 } } });
    expect(stop(trips, 'river-camp', 20)).toBeNull();
    expect(stop(trips, 'line-camp', 20)).toBeNull();
    expect(trips.journal()[0].complete).toBe(true);
  });

  it('requires the full survey out and back, not just a visit to the hut', () => {
    const trips = new SideTrips(sideTrips, pois);
    expect(stop(trips, 'last-pole-clearing', 10)).toBeNull();
    expect(stop(trips, 'linesmans-hut')).toMatchObject({ complete: false });
    expect(stop(trips, 'linesmans-hut', 10)).toBeNull();
    expect(stop(trips, 'last-pole-clearing')).toMatchObject({ complete: false });
    expect(stop(trips, 'linesmans-hut')).toMatchObject({ complete: true, trip: { reward: { plugs: 2 } } });
    expect(trips.journal()[1].stops[1].entry).toContain('insulators');
  });

  it('records scenic stops in any order, retains their pages, and resets partial dwell on leaving', () => {
    const trips = new SideTrips(sideTrips, pois);
    stop(trips, 'river-falls');
    stop(trips, 'range-lookout', 2);
    trips.update(1, 500, 500, true);
    expect(stop(trips, 'range-lookout', 2)).toBeNull();
    expect(stop(trips, 'range-lookout', 1)).toMatchObject({ complete: false });
    expect(trips.journal()[2].stops[1].entry).toContain('canopy');
    expect(stop(trips, 'gorge-falls')).toMatchObject({ complete: true });
    expect(trips.journal()[2].stops.every((s) => s.done)).toBe(true);
  });

  it('restores camp progress, puts later jobs back, and rejects skipped stages in damaged saves', () => {
    const trips = new SideTrips(sideTrips, pois);
    stop(trips, 'line-camp');
    const camp = [...trips.done];
    stop(trips, 'river-camp');
    trips.reset(camp);
    expect(trips.journal()[0].complete).toBe(false);
    expect(stop(trips, 'river-camp')).toMatchObject({ complete: true });
    trips.reset(['unknown/stop', 'lost-logbook/deliver', 'scrapbook/river']);
    expect([...trips.done]).toEqual(['scrapbook/river']);
    // At the line camp the logbook is there to collect again, with no dwell carried over.
    expect(trips.prompt(76, 936)?.progress).toBe(0);
  });

  it('round-trips optional progress and accepts older checkpoints without it', () => {
    const store = new MemoryStore();
    const checkpoint = startCheckpoint(ironbarkLevel, 'first-camp', 'shortie');
    checkpoint.sideTrips = ['lost-logbook/collect', 'scrapbook/gorge'];
    writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), store);
    expect(loadSave(store)?.episodes.ironbark?.checkpoint?.sideTrips).toEqual(checkpoint.sideTrips);
    delete checkpoint.sideTrips;
    writeSave(saveData({ episodes: { ironbark: { completed: false, checkpoint } } }), store);
    expect(loadSave(store)?.episodes.ironbark?.checkpoint?.sideTrips).toBeUndefined();
  });
});
