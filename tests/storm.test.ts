import { describe, expect, it } from 'vitest';
import { environmentAt } from '../src/data/environment';
import { surfaceGrip, SurfaceId } from '../src/data/surfaces';
import { episodeWeatherAt, weatherAt } from '../src/data/weatherTimeline';
import { prepareFlood, riseShare } from '../src/sim/world/flood';
import { addPuddles } from '../src/sim/world/puddles';
import { NO_WATER } from '../src/sim/world/terrain';
import { buildWorld } from '../src/sim/world/world';
import { highCountryMap } from './fixtures/maps/map';
import { stormFixture as storm, storyLevel } from './fixtures/story';

// The game's level has no storm, so the engine's is tested with the story fixture's (an
// afternoon storm on a wet day that starts at 12:30 pm) over the fixture map and its creek.
// Its own world: the flood is spread into it.
// The fixture map's roads are smooth; one is given mud holes, which the rain fills.
const world = buildWorld({
  ...highCountryMap,
  tracks: highCountryMap.tracks.map((t) =>
    t.id === 'main-track' ? { ...t, rough: { bumps: 0.08, bogs: 4, bogDepth: 0.3 } } : t,
  ),
});
const start = episodeWeatherAt(storyLevel.startHour, storyLevel.weather, storm);
addPuddles(world, start.env);
const { halfX, halfZ } = world.terrain;
// Water depth before the banks are spread, to check that spreading them changes nothing.
const depths = Array.from({ length: 4000 }, (_, k) => {
  const x = ((k * 37) % (2 * halfX - 40)) - (halfX - 20) + 0.37;
  const z = ((k * 1201) % (2 * halfZ - 40)) - (halfZ - 20) + 0.61;
  return { x, z, depth: world.terrain.waterDepthAt(x, z, start.env.waterLevelOffset) };
});
const spread = prepareFlood(world, storm);

const at = (hour: number) => episodeWeatherAt(hour, storyLevel.weather, storm);

describe('an afternoon storm', () => {
  it('starts dry, rains from 3 pm, heavily by 5 pm, and eases at dusk', () => {
    expect(weatherAt(storm, 14.9).rain).toBe(0);
    expect(weatherAt(storm, 15.5).rain).toBeGreaterThan(0.5);
    expect(weatherAt(storm, 17.25).rain).toBe(1);
    expect(weatherAt(storm, 18.5).rain).toBeLessThan(0.3);
    expect(weatherAt(storm, 19).rain).toBe(0);
    // The HUD notes the first drops.
    expect(storm.notes[0].hour).toBe(15);
  });

  it('soaks the clay and raises the creeks the longer it rains', () => {
    const clay = (h: number) => surfaceGrip(SurfaceId.Clay, at(h).env.wetness);
    expect(at(storyLevel.startHour).env.wetness).toBeCloseTo(0.7, 5);
    expect(clay(16.5)).toBeLessThan(clay(14.5) * 0.85);
    expect(clay(17.5)).toBeCloseTo(surfaceGrip(SurfaceId.Clay, 1), 1);
    expect(at(14.9).creekRise).toBe(0);
    let last = 0;
    for (let h = 15.25; h <= 18; h += 0.25) {
      const r = at(h).creekRise;
      expect(r, `at ${h}`).toBeGreaterThan(last);
      last = r;
    }
    expect(at(16).creekRise).toBeLessThan(0.1);
    expect(at(17).creekRise).toBeGreaterThan(0.12);
    expect(at(17).creekRise).toBeLessThan(0.18);
    expect(at(17.75).creekRise).toBeGreaterThan(0.2);
    expect(at(17.75).flowScale).toBeGreaterThan(1.4);
    // The sky and the rain follow it.
    expect(at(14.5).env.rain).toBe(0);
    expect(at(17.25).env.rain).toBe(1);
    expect(at(17.25).env.sun.intensity).toBeLessThan(environmentAt(17.25, 'wet').sun.intensity);
    // The puddles were laid for the after-rain creek offset, which stays.
    expect(at(17.25).env.waterLevelOffset).toBe(start.env.waterLevelOffset);
  });

  it('spreads the creeks over their low banks without wetting anything until they rise', () => {
    expect(spread).toBeGreaterThan(1000);
    for (const d of depths)
      expect(world.terrain.waterDepthAt(d.x, d.z, start.env.waterLevelOffset), `${d.x}, ${d.z}`).toBeCloseTo(
        d.depth,
        5,
      );
    // The creek rises in full, out to its banks; a creek the storm gives a smaller share rises
    // by that much; the rain-filled mud holes keep their level.
    const t = world.terrain;
    const share = (x: number, z: number) => riseShare(world, t.index(x, z));
    const creek = world.features.creeks[0];
    const mid = Math.floor(creek.poly.count / 2);
    const [cx, cz] = [creek.poly.xs[mid], creek.poly.zs[mid]];
    expect(t.water[t.index(cx, cz)]).toBeGreaterThan(NO_WATER);
    expect(share(cx, cz)).toBe(1);
    prepareFlood(world, { ...storm, creeks: { ...storm.creeks, shares: { [creek.def.id]: 0.35 } } });
    expect(share(cx, cz)).toBeCloseTo(0.35, 5);
    const holes = world.features.mudHoles.filter((b) => t.water[t.index(b.x, b.z)] > NO_WATER);
    expect(holes.length).toBeGreaterThan(0);
    for (const b of holes) expect(share(b.x, b.z)).toBe(0);
  });
});
