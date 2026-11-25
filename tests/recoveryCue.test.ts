import { describe, expect, it } from 'vitest';
import { searchHintTracks, type HudInputs } from '../src/core/hudState';
import { RECOVERY_CUE_REACH, RECOVERY_CUE_SECONDS, RecoveryCue, lineCue } from '../src/core/recoveryCue';
import { trailPoint } from '../src/sim/world/crawlTrail';
import { parkWorld } from './world';

/** After a recovery, the HUD points back to the line (v2.24). */
describe('the recovery cue', () => {
  it('starts when a recovery ends, lasts 45 s, and stops as soon as the car is back on the line', () => {
    const cue = new RecoveryCue();
    // Nothing before a recovery, on the line or off it.
    expect(cue.update(1, false, false)).toBe(false);
    expect(cue.update(1, false, true)).toBe(false);
    // Not while the winch is on.
    expect(cue.update(1, true, false)).toBe(false);
    expect(cue.update(30, true, false)).toBe(false);
    // From the moment it comes off, while off the line.
    expect(cue.update(0.1, false, false)).toBe(true);
    expect(cue.update(RECOVERY_CUE_SECONDS - 1, false, false)).toBe(true);
    expect(cue.update(2, false, false)).toBe(false);
    // A second recovery starts it again; getting back on the line ends it at once and for good.
    cue.update(1, true, false);
    expect(cue.update(0.1, false, false)).toBe(true);
    expect(cue.update(0.1, false, true)).toBe(false);
    expect(cue.update(0.1, false, false)).toBe(false);
    // A restart from camp clears it.
    cue.update(1, true, false);
    cue.clear();
    expect(cue.update(0.1, false, false)).toBe(false);
  });

  it('says where the line is from the car: ahead, behind, left or right, in whole metres', () => {
    // Heading north (x east, z south): forward is (0, -1).
    expect(lineCue(0, 0, 0, -1, 6, 0)).toBe('6 m to your right');
    expect(lineCue(0, 0, 0, -1, -6.4, 1)).toBe('6 m to your left');
    expect(lineCue(0, 0, 0, -1, 1, -9)).toBe('9 m ahead');
    expect(lineCue(0, 0, 0, -1, -1, 12)).toBe('12 m behind you');
    // Heading east: north is to the left.
    expect(lineCue(0, 0, 1, 0, 0, -5)).toBe('5 m to your left');
    expect(lineCue(0, 0, 1, 0, 0, 5)).toBe('5 m to your right');
    // Never "0 m", and the heading need not be a unit vector.
    expect(lineCue(0, 0, 0, -3, 0.2, 0)).toBe('1 m to your right');
  });

  it('finds the nearest hinted track from off the track only while the cue is up', () => {
    const world = parkWorld();
    const tracks = world.features.tracks;
    // The east leg of the park's loop, which runs north here.
    const line = tracks.find((t) => t.def.id === 'loop-east')!;
    // On the line, then 6 m west of it, as after winching out sideways.
    const on = trailPoint(line, 65);
    const off = { x: on.x - 6, z: on.z };
    const trackDistanceAt = (x: number, z: number) => {
      let best = Infinity;
      for (let s = 0; s <= line.poly.length; s += 0.5) {
        const p = trailPoint(line, s);
        best = Math.min(best, Math.hypot(p.x - x, p.z - z) - line.def.width / 2);
      }
      return best;
    };
    const inputs = (recoveryCue: boolean) =>
      ({ tracks, trackDistanceAt, recoveryCue }) as unknown as HudInputs;
    expect(searchHintTracks(inputs(false), off.x, off.z).link).toBeNull();
    const found = searchHintTracks(inputs(true), off.x, off.z).link!;
    expect(found.track.def.id).toBe('loop-east');
    expect(found.distance).toBeGreaterThan(line.def.width / 2 + 1);
    expect(found.distance).toBeLessThan(RECOVERY_CUE_REACH);
    const q = trailPoint(found.track, found.along);
    // Heading north there, the line is to the right.
    expect(lineCue(off.x, off.z, 0, -1, q.x, q.z)).toMatch(/^\d+ m to your right$/);
    // On the line the ordinary hint is found either way.
    expect(searchHintTracks(inputs(false), on.x, on.z).link?.track.def.id).toBe('loop-east');
  });
});
