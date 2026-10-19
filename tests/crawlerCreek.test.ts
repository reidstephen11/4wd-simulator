import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { camelTuning } from '../src/data/camel';
import { gateTrailBridges, gateTrailGates, gateTrailSections, gateTrailSigns } from '../src/data/gateTrail';
import { isMapId, mapOrder } from '../src/data/maps';
import { perentieTuning } from '../src/data/perentie';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleTuning } from '../src/data/vehicle';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { deckTop, onBridge } from '../src/sim/world/bridges';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import type { TrailDifficulty } from '../src/sim/world/mapTypes';
import { driveLeg, driver } from './helpers/drive';
import { crawlerCreekWorld } from './world';

const world = crawlerCreekWorld();
const { trackOf, scene, drive } = driver(world);
/** Most the car tilts (pitch and roll together) on each grade. */
const maxTilt: Record<TrailDifficulty, number> = { easy: 20, moderate: 34, hard: 43, extreme: 45 };

describe('Crawler Creek gate trail', () => {
  it('is a third map: one loop of twelve sections from the Trailhead, each a crawl trail', () => {
    expect(mapOrder).toEqual(['high-country', 'ironbark-park', 'crawler-creek']);
    expect(isMapId('crawler-creek')).toBe(true);
    expect(world.map.name).toBe('Crawler Creek');
    expect(gateTrailSections).toHaveLength(12);
    expect(world.map.spawnCampsite).toBe('trailhead');
    // Each section starts where the one before it ends, and the last comes home.
    const tracks = gateTrailSections.map((s) => trackOf(s.id));
    tracks.forEach((t, k) => {
      const next = tracks[(k + 1) % tracks.length];
      const end = trailPoint(t, t.poly.length),
        start = trailPoint(next, 0);
      const gap = Math.hypot(end.x - start.x, end.z - start.z);
      if (k + 1 < tracks.length) expect(gap, t.def.id).toBeLessThan(0.01);
      else expect(gap, 'home to the start').toBeLessThan(25);
      expect(world.map.crawlTrails!.some((c) => c.trackId === t.def.id)).toBe(true);
      // The graded track meets the next one at the same height.
      if (k + 1 < tracks.length)
        expect(Math.abs(t.profile[t.profile.length - 1] - next.profile[0]), t.def.id).toBeLessThan(0.15);
    });
    for (const [k, s] of gateTrailSections.entries()) {
      const poi = world.pois.find((p) => p.id === s.id)!;
      expect(poi.name).toBe(`${k + 1}. ${s.name}`);
      expect(gateTrailSigns.some((p) => p.text === `${k + 1} ${s.name} · ${s.grade.toUpperCase()}`)).toBe(
        true,
      );
    }
  });

  it('numbers its gates in driving order, each square across the trail and wide enough to drive through', () => {
    const gates = world.features.gates;
    expect(gates.length).toBeGreaterThan(40);
    expect(gates.map((g) => g.n)).toEqual(gates.map((_, i) => i + 1));
    let section = 0,
      last = -Infinity;
    for (const [i, g] of gateTrailGates.entries()) {
      const k = gateTrailSections.findIndex((s) => s.id === g.trackId);
      expect(k, `gate ${g.n}`).toBeGreaterThanOrEqual(section);
      if (k > section) [section, last] = [k, -Infinity];
      expect(g.at, `gate ${g.n}`).toBeGreaterThan(last);
      last = g.at;
      const track = trackOf(g.trackId);
      expect(g.at).toBeLessThan(track.poly.length);
      expect(g.width, `gate ${g.n}`).toBeGreaterThanOrEqual(3);
      expect(onBridge(track.def, g.at), `gate ${g.n} on a bridge`).toBeUndefined();
      // The red flag is on the driver's left, the blue on the right, both on the ground.
      const { left, right } = gates[i];
      const near = trailProgress(track, (left.x + right.x) / 2, (left.z + right.z) / 2);
      expect(near.distance, `gate ${g.n}`).toBeLessThan(Math.abs(g.lateral ?? 0) + 0.05);
      const p = trailPoint(track, g.at);
      const dir = (p.headingDeg * Math.PI) / 180;
      // Metres to the right of the direction of travel.
      const side = (q: { x: number; z: number }) => Math.cos(dir) * (q.x - p.x) + Math.sin(dir) * (q.z - p.z);
      expect(side(left)).toBeLessThan(0);
      expect(side(right)).toBeGreaterThan(0);
      for (const flag of [left, right]) expect(flag.y).toBeCloseTo(world.terrain.heightAt(flag.x, flag.z), 5);
    }
  });

  it('has three timber bridges whose boards are exactly what the tyres touch, over ground left as it was', async () => {
    expect(gateTrailBridges.map((b) => b.section)).toEqual(['creek-bridge', 'skinny-bridge', 'ramp-bridge']);
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    const R = sim.R;
    // Ray casts see colliders once the world has been stepped.
    sim.physics.world.step();
    const hit = (x: number, z: number) => {
      const ray = new R.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 });
      const h = sim.physics.world.castRay(ray, 100, true);
      return h ? { y: 60 - h.timeOfImpact, surface: sim.physics.surfaceOfCollider(h.collider, x, z) } : null;
    };
    try {
      for (const { section, bridge } of gateTrailBridges) {
        const track = trackOf(section);
        const lanes =
          bridge.kind === 'deck' ? [0] : [-(bridge.gauge ?? 1.48) / 2, (bridge.gauge ?? 1.48) / 2];
        for (let s = bridge.from + 0.3; s < bridge.to; s += 0.9)
          for (const lateral of lanes) {
            const p = trailPoint(track, s, lateral);
            const h = hit(p.x, p.z)!;
            expect(h.surface, `${section} at ${s.toFixed(1)}`).toBe(SurfaceId.Wood);
            expect(h.y, `${section} at ${s.toFixed(1)}`).toBeCloseTo(deckTop(track, bridge, s), 2);
          }
        const mid = trailPoint(track, (bridge.from + bridge.to) / 2, 0);
        const ground = world.terrain.heightAt(mid.x, mid.z);
        // A car put down on a bridge (a teleport, a vehicle swap) lands on the boards.
        const onDeck = trailPoint(track, (bridge.from + bridge.to) / 2, lanes[0]);
        const pose = sim.poseAt(onDeck.x, onDeck.z, 0, vehicleTuning.wheelRadius);
        expect(pose.y - vehicleTuning.wheelRadius).toBeGreaterThan(
          deckTop(track, bridge, (bridge.from + bridge.to) / 2),
        );
        if (section === 'skinny-bridge') {
          // Between the planks is a drop into the bog.
          const gap = hit(mid.x, mid.z)!;
          expect(gap.surface).toBe(SurfaceId.Mud);
          expect(deckTop(track, bridge, (bridge.from + bridge.to) / 2) - gap.y).toBeGreaterThan(0.4);
        } else expect(deckTop(track, bridge, (bridge.from + bridge.to) / 2) - ground).toBeGreaterThan(1);
      }
      // Crawler Creek still runs under the creek bridge.
      const creek = gateTrailBridges[0];
      const under = trailPoint(trackOf(creek.section), (creek.bridge.from + creek.bridge.to) / 2, 0);
      expect(world.terrain.waterDepthAt(under.x, under.z)).toBeGreaterThan(0.4);
    } finally {
      sim.physics.free();
    }
  });

  // Each section in low range, easy and moderate ones with open diffs, hard ones with
  // both lockers, in the direction the gates are numbered.
  for (const s of gateTrailSections)
    for (const tuning of [vehicleTuning, perentieTuning])
      it(`${s.name} goes with the ${tuning.name}`, async () => {
        const lockers = s.grade === 'hard' || s.grade === 'extreme' ? 'both' : 'open';
        const r = await drive(s.id, lockers, false, 300, tuning);
        expect(r.done, `stopped ${r.remaining.toFixed(1)} m from the end`).toBe(true);
        expect(r.tilt).toBeLessThan(maxTilt[s.grade]);
      }, 120_000);

  for (const tuning of [vehicleTuning, perentieTuning])
    it(`the Rock Garden stops the ${tuning.name} with open diffs`, async () => {
      expect((await drive('rock-garden', 'open', false, 150, tuning)).done).toBe(false);
    }, 120_000);

  it('The Drop pitches the car past 25° and Skinny Bridge keeps both wheel tracks on its planks', async () => {
    const drop = await drive('the-drop', 'both');
    expect(drop.pitch).toBeGreaterThan(25);
    const plank = await drive('skinny-bridge', 'both');
    expect(plank.done).toBe(true);
    expect(plank.tilt).toBeLessThan(8);
  }, 120_000);

  it('the Camel Trophy car drives the whole loop from the Trailhead without help, or damage', async () => {
    const s = await scene(gateTrailSections[0].id, false, 'both', camelTuning);
    // Careful driving does no harm, even with realistic damage.
    s.sim.setDamage('realistic');
    const damage: string[] = [];
    s.sim.events.on('damage', (e) => damage.push(`${e.part} ${e.wheel} ${e.cause}`));
    try {
      for (const section of gateTrailSections) {
        const r = await driveLeg(s, trackOf(section.id), false, 300);
        expect(r.tilt, section.id).toBeLessThan(maxTilt[section.grade]);
      }
      const home = world.pois.find((p) => p.id === 'trailhead')!;
      expect(Math.hypot(s.v.position.x - home.x, s.v.position.z - home.z)).toBeLessThan(home.radius);
      expect(damage).toEqual([]);
    } finally {
      s.sim.physics.free();
    }
  }, 300_000);
});
