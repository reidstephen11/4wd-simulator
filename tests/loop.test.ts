import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/core/loop';

/** Drives a GameLoop with fake screen refreshes `spacingMs` apart for `seconds`. */
function run(spacingMs: number, seconds: number, setup: (loop: GameLoop) => void = () => {}) {
  let pending: FrameRequestCallback | null = null;
  let clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  let steps = 0;
  const draws: number[] = [];
  const dts: number[] = [];
  const loop = new GameLoop({
    step: () => steps++,
    render: (_alpha, dt) => {
      draws.push(clock);
      dts.push(dt);
    },
  });
  setup(loop);
  loop.start();
  const frames = Math.round((seconds * 1000) / spacingMs);
  for (let i = 1; i <= frames; i++) {
    clock = i * spacingMs;
    const cb = pending!;
    pending = null;
    cb(clock);
  }
  loop.stop();
  return { steps, draws, dts, frames };
}

describe('frame cap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws a 120 Hz screen about 60 times a second, once per physics step', () => {
    const r = run(1000 / 120, 10);
    expect(r.frames).toBe(1200);
    expect(r.steps).toBeGreaterThanOrEqual(598);
    expect(r.draws.length / 10).toBeGreaterThan(59);
    expect(r.draws.length / 10).toBeLessThan(62);
    // The frame time handed to the game covers the skipped refresh too, so clocks keep time.
    const total = r.dts.reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(10, 1);
  });

  it('still draws every refresh of a 60 Hz screen', () => {
    const r = run(1000 / 60, 5);
    expect(r.draws.length).toBe(r.frames);
  });

  it('keeps every step drawn on 90 to 165 Hz screens', () => {
    for (const hz of [90, 100, 144, 165]) {
      const r = run(1000 / hz, 5);
      expect(r.draws.length / 5).toBeGreaterThan(59);
      expect(r.draws.length / 5).toBeLessThan(62);
    }
  });

  it('draws every refresh while paused, with fixed test steps, or with the cap off', () => {
    expect(run(1000 / 120, 2, (l) => (l.paused = true)).draws.length).toBe(240);
    expect(run(1000 / 120, 2, (l) => (l.fixedSteps = 2)).draws.length).toBe(240);
    expect(run(1000 / 120, 2, (l) => (l.capFrameRate = false)).draws.length).toBe(240);
  });
});
