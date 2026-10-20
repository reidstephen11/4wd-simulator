import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { isMapId, mapOrder } from '../src/data/maps';
import { patrolTuning } from '../src/data/patrol';
import { SurfaceId } from '../src/data/surfaces';
import { winchTuning } from '../src/data/tools';
import { vehicleTuning } from '../src/data/vehicle';
import { LEDGE, winchClimbs } from '../src/data/winchClimbs';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import type { TrackInfo } from '../src/sim/world/features';
import { DT, pathFor } from './helpers/drive';
import { stringybarkWorld } from './world';

const world = stringybarkWorld();
const H = (x: number, z: number) => world.terrain.heightAt(x, z);
const deg = (grade: number) => (Math.atan(grade) * 180) / Math.PI;
const tracks = world.features.tracks;
const trackOf = (id: string) => tracks.find((t) => t.def.id === id)!;
const roads = tracks.filter((t) => t.def.surface === 'gravel');
const poiOf = (id: string) => world.pois.find((p) => p.id === id)!;
/** Metres from a point to a track's centreline. */
const distanceTo = (x: number, z: number, t: TrackInfo) => trailProgress(t, x, z).distance;
/** Height of the ground along a track, `s` metres from its start. */
const heightAlong = (t: TrackInfo, s: number) => {
  const p = trailPoint(t, s);
  return H(p.x, p.z);
};

describe('Stringybark Range', () => {
  it('is a fourth map, 2 km across, climbing from the river in two steps to the range top', () => {
    expect(mapOrder).toEqual(['high-country', 'ironbark-park', 'crawler-creek', 'stringybark-range']);
    expect(isMapId('stringybark-range')).toBe(true);
    expect(world.map.name).toBe('Stringybark Range');
    expect(world.map.size).toBe(2048);
    expect(world.map.spawnCampsite).toBe('river-camp');
    const height = (id: string) => H(poiOf(id).x, poiOf(id).z);
    const river = height('river-camp');
    expect(height('shelf-camp') - river).toBeGreaterThan(50);
    expect(height('range-camp') - height('shelf-camp')).toBeGreaterThan(55);
    expect(height('stringybark-peak') - river).toBeGreaterThan(150);
    for (const id of ['river-camp', 'shelf-camp', 'range-camp']) expect(poiOf(id).kind, id).toBe('campsite');
  });

  it('links every place by gravel fire trail no steeper than a low-range pinch', () => {
    // Roads join where one ends on another; together they make one network.
    const group = roads.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
    roads.forEach((t, i) => {
      for (const s of [0, t.poly.length]) {
        const p = trailPoint(t, s);
        roads.forEach((u, j) => {
          if (i !== j && distanceTo(p.x, p.z, u) < 7) group[root(i)] = root(j);
        });
      }
    });
    expect(new Set(roads.map((_, i) => root(i))).size).toBe(1);
    for (const t of roads) {
      let steepest = 0;
      for (let s = 2; s < t.poly.length; s++)
        steepest = Math.max(steepest, Math.abs(heightAlong(t, s) - heightAlong(t, s - 2)) / 2);
      expect(deg(steepest), t.def.id).toBeLessThan(28);
    }
    for (const id of [
      'river-camp',
      'shelf-camp',
      'range-camp',
      'stringybark-peak',
      'wombat-lookout',
      'river-ford',
    ]) {
      const p = poiOf(id);
      expect(Math.min(...roads.map((t) => distanceTo(p.x, p.z, t))), id).toBeLessThan(20);
    }
  });

  it('has eight winch climbs, four up granite steps and four up wet clay, each signed and on the map', () => {
    expect(winchClimbs.filter((c) => c.kind === 'rock')).toHaveLength(4);
    expect(winchClimbs.filter((c) => c.kind === 'mud')).toHaveLength(4);
    const signs = world.map.props.filter((p) => p.kind === 'signpost').map((p) => p.text);
    for (const c of winchClimbs) {
      const t = trackOf(c.id);
      expect(world.map.crawlTrails!.find((x) => x.trackId === c.id)!.difficulty).toBe('extreme');
      expect(poiOf(c.id).note).toMatch(/^WINCH · /);
      expect(
        signs.filter((s) => s === `WINCH · ${c.name}`),
        c.id,
      ).toHaveLength(2);
      // Every climb starts on a fire trail.
      const bottom = trailPoint(t, 0);
      expect(Math.min(...roads.map((r) => distanceTo(bottom.x, bottom.z, r))), c.id).toBeLessThan(1);
      for (const [i, [from, to]] of c.pitchRanges.entries()) {
        const mid = trailPoint(t, (from + to) / 2);
        expect(world.terrain.surfaceAt(mid.x, mid.z), `${c.id} pitch ${i + 1}`).toBe(
          c.kind === 'rock' ? SurfaceId.Rock : SurfaceId.Mud,
        );
        // Granite pitches carry a riser every 5 m; the clay is steeper than any car drives on mud.
        const risers = world.features.rocks.filter(
          (r) =>
            distanceTo(r.x, r.z, t) < 1 &&
            Math.abs(trailProgress(t, r.x, r.z).along - (from + to) / 2) < (to - from) / 2,
        ).length;
        const rise = heightAlong(t, to - 0.5) - heightAlong(t, from + 0.5) - risers * LEDGE.rise;
        const base = deg(rise / (to - from - 1));
        if (c.kind === 'rock') {
          expect(risers, `${c.id} pitch ${i + 1}`).toBeGreaterThanOrEqual(1);
          expect(base, `${c.id} pitch ${i + 1}`).toBeGreaterThan(22);
        } else {
          expect(risers).toBe(0);
          expect(base, `${c.id} pitch ${i + 1}`).toBeGreaterThan(24);
        }
        // The landing above it is close to level, for stopping and turning.
        const landing = c.turns[i];
        expect(
          deg(Math.abs(heightAlong(t, landing + 1) - heightAlong(t, landing - 1)) / 2),
          `${c.id} landing ${i + 1}`,
        ).toBeLessThan(8);
      }
    }
  });

  it('puts each marked anchor straight on from its pitch, in reach of the cable and well clear of other tracks', () => {
    for (const c of winchClimbs) {
      const t = trackOf(c.id);
      for (const [i, a] of c.anchors.entries()) {
        const rock = world.scatter.rocks.find((r) => Math.hypot(r.x - a.x, r.z - a.z) < 0.5)!;
        expect(rock.anchor && rock.solid, `${c.id} anchor ${i + 1}`).toBe(true);
        // From the bumper of a car stopped at the bottom of the pitch.
        const stop = i === 0 ? 5.5 : c.turns[i - 1] + 4.5;
        const w = trailPoint(t, stop);
        const top = rock.y + rock.radius * rock.squash * 0.85;
        const reach = Math.hypot(a.x - w.x, top - (H(w.x, w.z) + 0.6), a.z - w.z);
        expect(reach, `${c.id} anchor ${i + 1}`).toBeLessThan(winchTuning.cableLength - 2);
        const [from, to] = c.pitchRanges[i];
        const p = trailPoint(t, from),
          q = trailPoint(t, to);
        const pitchDir = Math.atan2(q.z - p.z, q.x - p.x),
          anchorDir = Math.atan2(a.z - p.z, a.x - p.x);
        expect(Math.abs(Math.sin(anchorDir - pitchDir)), `${c.id} anchor ${i + 1}`).toBeLessThan(0.05);
        for (const u of tracks)
          if (u !== t)
            expect(
              distanceTo(a.x, a.z, u) - u.def.width / 2,
              `${c.id} anchor ${i + 1} near ${u.def.id}`,
            ).toBeGreaterThan(10);
      }
    }
  });

  it('keeps Eagle Rock and the hut for the winch: cliffs all round the rock, greasy clay all round the knoll', () => {
    for (const [id, climb, from, to, surface, steeper] of [
      ['eagle-rock', 'eagle-rock-climb', 10, 70, null, 45],
      ['stockmans-hut', 'hut-spur', 8, 90, SurfaceId.Mud, 24],
    ] as const) {
      const { x, z } = poiOf(id);
      expect(Math.min(...roads.map((t) => distanceTo(x, z, t))), id).toBeGreaterThan(70);
      // The climb ends at the top.
      const t = trackOf(climb);
      const top = trailPoint(t, t.poly.length);
      expect(Math.hypot(top.x - x, top.z - z), id).toBeLessThan(15);
      // Walking out from the top in any direction, some 10 m stretch is too steep to drive.
      for (let a = 0; a < 360; a += 10) {
        const dx = Math.cos((a * Math.PI) / 180),
          dz = Math.sin((a * Math.PI) / 180);
        let steepest = 0;
        for (let r = from; r < to; r += 0.5) {
          steepest = Math.max(
            steepest,
            (H(x + dx * r, z + dz * r) - H(x + dx * (r + 10), z + dz * (r + 10))) / 10,
          );
          if (surface !== null && r > 15 && r < 60)
            expect(world.terrain.surfaceAt(x + dx * r, z + dz * r), `${id} ${a}° ${r} m`).toBe(surface);
        }
        expect(deg(steepest), `${id} ${a}°`).toBeGreaterThan(steeper);
      }
    }
  });

  it('drives the fire trails up the escarpments and hills and back down in high range', async () => {
    const R = await loadRapier();
    for (const id of ['shelf-road', 'range-road', 'peak-road', 'wombat-road', 'wombat-top'])
      for (const tuning of [vehicleTuning, patrolTuning])
        for (const back of [false, true]) {
          const t = trackOf(id);
          const sim = new Simulation(R, world, lateAfternoon);
          const p = trailPoint(t, back ? t.poly.length : 0);
          const v = sim.addVehicle(
            'p',
            sim.poseAt(p.x, p.z, p.headingDeg + (back ? 180 : 0), tuning.wheelRadius),
            tuning,
          );
          const pilot = new Autopilot(pathFor(t, back), 7);
          const inputs = new Map([['p', emptyInput()]]);
          let time = 0,
            tilt = 0;
          const limit = t.poly.length / 3 + 60;
          for (; time < limit && !pilot.done; time += DT) {
            inputs.set('p', pilot.input(v, DT));
            sim.step(inputs, DT);
            tilt = Math.max(tilt, v.tiltDeg());
          }
          const name = `${id} ${tuning.id} ${back ? 'down' : 'up'}`;
          expect(pilot.done, `${name} stopped ${pilot.remaining(v).toFixed(0)} m short`).toBe(true);
          expect(v.drivetrain.range, name).toBe('high');
          expect(tilt, name).toBeLessThan(35);
          sim.physics.free();
        }
  });
});
