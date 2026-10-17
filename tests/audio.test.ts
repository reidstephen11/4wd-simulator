import { describe, expect, it } from 'vitest';
import { SurfaceId } from '../src/data/surfaces';
import { kookaburraPhrase, magpiePhrase } from '../src/audio/birds';
import {
  engineGain,
  firingHz,
  proximityLevel,
  thumpLevel,
  tyreWeights,
  windLevel,
  winchPitch,
  type WheelSound,
} from '../src/audio/mix';
import { mulberry32 } from '../src/sim/world/rng';
import { makeScene } from './helpers/scenes';

const wheel = (surface: SurfaceId, extra: Partial<WheelSound> = {}): WheelSound => ({
  contact: true,
  surface,
  spin: 0,
  slide: 0,
  water: 0,
  ...extra,
});
const four = (w: WheelSound) => [w, w, w, w];

describe('audio mixing (M6)', () => {
  it('engine pitch follows rpm', () => {
    expect(firingHz(800)).toBeCloseTo(26.7, 1);
    expect(firingHz(3000)).toBeCloseTo(100, 5);
    expect(firingHz(3000)).toBeGreaterThan(firingHz(1500));
  });

  it('engine is louder under load', () => {
    expect(engineGain(2000, 1, 1, 800, 4300)).toBeGreaterThan(engineGain(2000, 0, 0, 800, 4300) * 1.5);
  });

  it('tyres are silent when stopped and follow the surface when moving', () => {
    const still = tyreWeights(four(wheel(SurfaceId.Gravel)), 0);
    expect(Math.max(...Object.values(still))).toBe(0);
    const gravel = tyreWeights(four(wheel(SurfaceId.Gravel)), 8);
    expect(gravel.gravel).toBeGreaterThan(0.5);
    expect(gravel.dirt).toBe(0);
    const mixed = tyreWeights(
      [wheel(SurfaceId.Mud), wheel(SurfaceId.Mud), wheel(SurfaceId.Dirt), wheel(SurfaceId.Dirt)],
      8,
    );
    expect(mixed.mud).toBeCloseTo(mixed.dirt, 5);
  });

  it('wheelspin in mud is heard even when the car is stuck', () => {
    const w = tyreWeights(four(wheel(SurfaceId.Mud, { spin: 1 })), 0.1);
    expect(w.mud).toBeGreaterThan(0.5);
  });

  it('deep water at the wheels switches to the water layer', () => {
    const w = tyreWeights(four(wheel(SurfaceId.Gravel, { water: 0.4 })), 4);
    expect(w.water).toBeGreaterThan(0);
    expect(w.gravel).toBe(0);
  });

  it('sliding sideways adds scrub', () => {
    const w = tyreWeights(four(wheel(SurfaceId.Dirt, { slide: 3 })), 8);
    expect(w.scrub).toBeGreaterThan(0.9);
  });

  it('thumps only above the threshold, louder for harder hits', () => {
    expect(thumpLevel(0.8)).toBe(0);
    expect(thumpLevel(2)).toBeGreaterThan(0);
    expect(thumpLevel(4)).toBeGreaterThan(thumpLevel(2));
  });

  it('winch whine drops in pitch under load', () => {
    expect(winchPitch(1, 1)).toBeLessThan(winchPitch(0, 1));
    expect(winchPitch(1, -1)).toBeGreaterThan(winchPitch(1, 1));
  });

  it('wind rises with altitude and creek noise fades with distance', () => {
    expect(windLevel(20)).toBe(0);
    expect(windLevel(130)).toBe(1);
    expect(windLevel(80)).toBeGreaterThan(windLevel(40));
    expect(proximityLevel(0, 45)).toBe(1);
    expect(proximityLevel(45, 45)).toBe(0);
    expect(proximityLevel(10, 45)).toBeGreaterThan(proximityLevel(30, 45));
  });

  it('bird phrases have sensible lengths and pitches', () => {
    for (let seed = 1; seed < 20; seed++) {
      const k = kookaburraPhrase(mulberry32(seed));
      expect(k.duration).toBeGreaterThan(2.5);
      expect(k.duration).toBeLessThan(5);
      const m = magpiePhrase(mulberry32(seed));
      expect(m.duration).toBeGreaterThan(0.5);
      expect(m.duration).toBeLessThan(4);
      for (const n of [...k.notes, ...m.notes]) {
        expect(n.f0).toBeGreaterThan(300);
        expect(Math.max(n.f0, n.f1, n.f2)).toBeLessThan(3500);
        expect(n.gain).toBeGreaterThan(0);
      }
    }
  });
});

describe('wheel impacts for suspension thumps (M6)', () => {
  it('cruising on flat ground makes no hits, a drop from 1 m does', async () => {
    const s = await makeScene({ speed: 8 });
    let hits = 0;
    for (let i = 0; i < 120; i++) {
      s.run(1 / 60, { throttle: 0.3 });
      hits += s.vehicle.wheelImpacts.filter((x) => x > 0).length;
    }
    expect(hits).toBe(0);
    const p = s.vehicle.body.translation();
    s.vehicle.body.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true);
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      s.run(1 / 60, {});
      peak = Math.max(peak, ...s.vehicle.wheelImpacts);
    }
    expect(thumpLevel(peak)).toBeGreaterThan(0.3);
  });
});
