import { describe, expect, it } from 'vitest';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import type { MapDef } from '../src/sim/world/mapTypes';
import {
  conditionById,
  mapForCondition,
  rollTrackCondition,
  stormFor,
  trackConditions,
  type TrackConditionId,
} from '../src/data/trackConditions';
import { weatherAt } from '../src/data/weatherTimeline';
import { stormFixture as storm } from './fixtures/story';

// The level's map with a bog dug into its first two tracks (it has none of its own), the
// second with a sump as well.
const map: MapDef = {
  ...ironbarkMap,
  tracks: ironbarkMap.tracks.map((t, i) =>
    i < 2
      ? { ...t, rough: { bumps: 0, ...t.rough, bogDepth: 0.3 + i * 0.1, ...(i ? { sumpDepth: 0.2 } : {}) } }
      : t,
  ),
};

describe('track conditions', () => {
  it('rolls the same day from the same seed, and all three come up', () => {
    for (const seed of [1, 7, 42, 1234, 99999])
      expect(rollTrackCondition(seed).id).toBe(rollTrackCondition(seed).id);
    const seen = new Set<TrackConditionId>();
    for (let seed = 1; seed <= 400; seed++) seen.add(rollTrackCondition(seed).id);
    expect([...seen].sort()).toEqual(['dry', 'reopened', 'wet']);
  });

  it('rolls each condition about as often as its weight says', () => {
    const counts: Record<string, number> = { dry: 0, reopened: 0, wet: 0 };
    const runs = 6000;
    for (let seed = 1; seed <= runs; seed++) counts[rollTrackCondition(seed).id]++;
    const total = trackConditions.reduce((t, c) => t + c.weight, 0);
    for (const c of trackConditions) expect(counts[c.id] / runs, c.id).toBeCloseTo(c.weight / total, 1);
  });

  it('leaves a just-reopened track exactly as the game had it before', () => {
    // v1.32's numbers are this condition's, so that roll must change nothing at all.
    const reopened = conditionById('reopened');
    expect(stormFor(storm, reopened)).toEqual(storm);
    expect(mapForCondition(map, reopened)).toBe(map);
  });

  it('scales the storm: drier rains less and wetter rains harder, and the rain is still capped', () => {
    const dry = stormFor(storm, conditionById('dry'));
    const wet = stormFor(storm, conditionById('wet'));
    const peak = (t: typeof storm) => Math.max(...t.rain.map(([, a]) => a));
    expect(peak(dry)).toBeLessThan(peak(storm));
    expect(peak(wet)).toBeLessThanOrEqual(1);
    expect(dry.ground.before).toBeLessThan(storm.ground.before);
    expect(wet.ground.before).toBeGreaterThan(storm.ground.before);
    expect(dry.creeks.maxRise).toBeLessThan(storm.creeks.maxRise);
    expect(wet.creeks.maxRise).toBeGreaterThan(storm.creeks.maxRise);
    // The shape of the afternoon is untouched: the storm still arrives at the same times.
    expect(wet.rain.map(([h]) => h)).toEqual(storm.rain.map(([h]) => h));
    expect(wet.notes).toEqual(storm.notes);
  });

  it('starts a wet track with its creeks already up and running, before a drop falls', () => {
    const wet = stormFor(storm, conditionById('wet'));
    // 12:30 pm, the start, is well before the 3 pm rain.
    const before = weatherAt(wet, 12.5);
    expect(before.rain).toBe(0);
    expect(before.creekRise).toBeCloseTo(conditionById('wet').creekRise, 5);
    expect(before.flowScale).toBeGreaterThan(1);
    const dryStart = weatherAt(stormFor(storm, conditionById('dry')), 12.5);
    expect(dryStart.creekRise).toBe(0);
    expect(dryStart.flowScale).toBe(1);
  });

  it('greases the clay in order: dry grips best, wet least, at the start and in the storm', () => {
    for (const hour of [12.5, 17]) {
      const wetness = (id: TrackConditionId) => weatherAt(stormFor(storm, conditionById(id)), hour).wetness;
      expect(wetness('dry'), `dry at ${hour}`).toBeLessThan(wetness('reopened'));
      expect(wetness('reopened'), `reopened at ${hour}`).toBeLessThan(wetness('wet'));
    }
  });

  it('digs the bogs deeper or shallower in the same places, and moves nothing else', () => {
    const bogged = (map: MapDef) =>
      map.tracks.filter((t) => t.rough?.bogDepth !== undefined).map((t) => t.rough!.bogDepth!);
    const dry = mapForCondition(map, conditionById('dry'));
    const wet = mapForCondition(map, conditionById('wet'));
    expect(bogged(map).length).toBeGreaterThan(0);
    expect(bogged(dry).length).toBe(bogged(map).length);
    for (let i = 0; i < bogged(map).length; i++) {
      expect(bogged(dry)[i]).toBeLessThan(bogged(map)[i]);
      expect(bogged(wet)[i]).toBeGreaterThan(bogged(map)[i]);
    }
    // The track itself is where it was: same ids, same points, same creeks.
    expect(dry.tracks.map((t) => t.id)).toEqual(map.tracks.map((t) => t.id));
    expect(dry.tracks.map((t) => t.points.length)).toEqual(map.tracks.map((t) => t.points.length));
    expect(dry.creeks).toBe(map.creeks);
    // The other roughness of each track is untouched.
    for (let i = 0; i < map.tracks.length; i++)
      expect({ ...dry.tracks[i].rough, bogDepth: 0, sumpDepth: 0 }).toEqual({
        ...map.tracks[i].rough,
        bogDepth: 0,
        sumpDepth: 0,
      });
  });
});
