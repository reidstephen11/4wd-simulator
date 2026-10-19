import { describe, expect, it } from 'vitest';
import { isMapId, mapOrder, maps } from '../src/data/maps';
import { parkLoopRoute, parkSigns, parkStations, parkTrails } from '../src/data/parkCourse';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import {
  defaultSettings,
  explorationFor,
  loadSave,
  writeSave,
  type KeyValueStore,
} from '../src/sim/save/save';
import { trailProgress } from '../src/sim/world/crawlTrail';
import type { TrailDifficulty } from '../src/sim/world/mapTypes';
import { driveLeg, driver } from './helpers/drive';
import { parkWorld } from './world';

const world = parkWorld();
const { trackOf, scene, drive } = driver(world);
const rank: Record<TrailDifficulty, number> = { easy: 0, moderate: 1, hard: 2, extreme: 3 };

describe('Ironbark 4WD Park', () => {
  it('is a second map with eleven numbered stations, each an easier and a harder line', () => {
    expect(mapOrder).toEqual(['high-country', 'ironbark-park']);
    expect(isMapId('ironbark-park')).toBe(true);
    expect(isMapId('moon')).toBe(false);
    expect(world.map.name).toBe('Ironbark 4WD Park');
    expect(parkStations.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(parkStations.map((s) => s.name)).size).toBe(11);
    for (const s of parkStations) {
      expect(rank[s.harder.grade], s.name).toBeGreaterThan(rank[s.easier.grade]);
      for (const which of ['easier', 'harder'] as const) {
        expect(trackOf(`${s.id}-${which}`).def.name).toMatch(new RegExp(`^${s.n} ${s.name} · `));
        expect(parkTrails.some((t) => t.trackId === `${s.id}-${which}`)).toBe(true);
      }
      // Every station is on the paper map, and its reset puts you at the easier line.
      const poi = world.pois.find((p) => p.id === s.id)!;
      expect(poi.name).toBe(`${s.n}. ${s.name}`);
      expect(trailProgress(trackOf(`${s.id}-easier`), poi.reset!.x, poi.reset!.z).distance).toBeLessThan(0.5);
    }
    // The flat stations are built from rocks, logs, bog holes, ruts and dug ditches.
    expect(world.features.rocks.length).toBeGreaterThan(60);
    expect(world.features.logs.length).toBe(8);
    expect(world.map.bogs.length).toBe(5);
    expect(world.terrain.detail.length).toBeGreaterThanOrEqual(5);
    expect(world.map.pois.find((p) => p.kind === 'campsite')!.id).toBe(world.map.spawnCampsite);
  });

  it('signposts every line where you enter it, clear of the loop and the other lines', () => {
    for (const s of parkStations)
      for (const which of ['easier', 'harder'] as const)
        expect(parkSigns.some((p) => p.text === `${s.n} ${s.name} · ${s[which].grade.toUpperCase()}`)).toBe(
          true,
        );
    const tracks = world.features.tracks;
    for (const sign of parkSigns)
      for (const t of tracks)
        expect(trailProgress(t, sign.x, sign.z).distance, `${sign.text} near ${t.def.id}`).toBeGreaterThan(
          t.def.width / 2,
        );
  });

  it('keeps each map’s progress in the save and starts older saves in the High Country', () => {
    const data = new Map<string, string>();
    const s: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const high = { discovered: ['falls'], lastCampsite: 'mountain-hut' };
    const park = { discovered: ['mud-pits'], lastCampsite: 'park-hq' };
    writeSave(
      {
        version: 1,
        exploration: park,
        settings: defaultSettings,
        map: 'ironbark-park',
        maps: { 'high-country': high, 'ironbark-park': park },
      },
      s,
    );
    const save = loadSave(s)!;
    expect(save.map).toBe('ironbark-park');
    expect(explorationFor(save, 'ironbark-park')).toEqual(park);
    expect(explorationFor(save, 'high-country')).toEqual(high);
    writeSave({ version: 1, exploration: high, settings: defaultSettings }, s);
    expect(loadSave(s)!.map).toBe('high-country');
    expect(explorationFor(loadSave(s), 'high-country')).toEqual(high);
    expect(explorationFor(loadSave(s), 'ironbark-park')).toBeNull();
    const [key] = [...data.keys()];
    data.set(
      key,
      JSON.stringify({ version: 1, exploration: high, settings: {}, map: 'moon', maps: { moon: park } }),
    );
    expect(loadSave(s)!.map).toBe('high-country');
    expect(loadSave(s)!.maps).toEqual({});
    expect(maps[loadSave(s)!.map!].def.id).toBe('high-country');
  });

  for (const tuning of [vehicleTuning, perentieTuning])
    it(`Side Slope leans the ${tuning.name} about 15° on the easier line and 25° on the harder`, async () => {
      const easy = await drive('side-slope-easier', 'open', false, 200, tuning);
      const hard = await drive('side-slope-harder', 'both', false, 200, tuning);
      expect(easy.done && hard.done).toBe(true);
      expect(easy.roll).toBeGreaterThan(12);
      expect(easy.roll).toBeLessThan(20);
      expect(hard.roll).toBeGreaterThan(22);
      expect(hard.roll).toBeLessThan(28);
    }, 120_000);

  it('the harder Hill Climb and Steep Descent pitch the car past 30°', async () => {
    const up = await drive('hill-climb-harder', 'both');
    const down = await drive('steep-descent-harder', 'both', true);
    expect(up.pitch).toBeGreaterThan(30);
    expect(down.pitch).toBeGreaterThan(30);
  }, 120_000);

  it('the loop goes all the way round from Park HQ in high range with open diffs', async () => {
    const s = await scene('hq-track', false, 'high', perentieTuning);
    try {
      const start = { ...s.v.position };
      await driveLeg(s, trackOf('hq-track'), false, 60);
      for (const id of parkLoopRoute) {
        const r = await driveLeg(s, trackOf(id), false, 300);
        expect(r.tilt, id).toBeLessThan(15);
      }
      await driveLeg(s, trackOf('hq-track'), true, 60);
      expect(Math.hypot(s.v.position.x - start.x, s.v.position.z - start.z)).toBeLessThan(4);
    } finally {
      s.sim.physics.free();
    }
  }, 300_000);
});
