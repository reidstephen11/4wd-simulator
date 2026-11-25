import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/sim/input/inputManager';
import { ToolController } from '../src/core/toolController';
import type { Simulation } from '../src/sim/sim';

const DT = 1 / 60;

function keyboard() {
  const target = new EventTarget();
  const input = new InputManager(target as unknown as Window);
  const key = (code: string, type = 'keydown') => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, repeat: false });
    target.dispatchEvent(e);
  };
  return { input, key };
}

function pad(held: number[]) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: held.includes(i),
    value: held.includes(i) ? 1 : 0,
  }));
  vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, axes: [0, 0, 0, 0], buttons }] });
}

afterEach(() => vi.unstubAllGlobals());

describe('the press that started the drive (v1.23)', () => {
  it('a Start (or Cross) still held on the first poll is not a pause or confirm press', () => {
    const { input } = keyboard();
    pad([9, 0]);
    input.poll();
    expect(input.pressed('pause')).toBe(false);
    expect(input.pressed('confirm')).toBe(false);
    expect(input.vehicleInput(DT).interact).toBe(false);
    // Let go and press again: that one counts.
    input.consumeUi();
    pad([]);
    input.poll();
    pad([9]);
    input.poll();
    expect(input.pressed('pause')).toBe(true);
  });

  it('a button first pressed after the first poll counts at once', () => {
    const { input } = keyboard();
    pad([]);
    input.poll();
    pad([9]);
    input.poll();
    expect(input.pressed('pause')).toBe(true);
  });

  it('Space or Enter pressed on the briefing is dropped when the game starts', () => {
    const { input, key } = keyboard();
    key('Space');
    key('Enter');
    input.clearEdges();
    expect(input.pressed('handbrake')).toBe(false);
    expect(input.pressed('confirm')).toBe(false);
    expect(input.vehicleInput(DT).toggleParkBrake).toBe(false);
    key('Space');
    expect(input.vehicleInput(DT).toggleParkBrake).toBe(true);
  });
});

describe('II and MAP while placing planks (v1.23)', () => {
  function tool() {
    const { input, key } = keyboard();
    const tools = { planks: { carried: 2, previewing: false }, targeting: null };
    const sim = { toolsOf: () => tools } as unknown as Simulation;
    const ctl = new ToolController(sim, input, 'local');
    return { ctl, input, key, tools };
  }

  it('the pause press leaves the tool and is left for the menu to handle', () => {
    const { ctl, input, tools } = tool();
    expect(ctl.startPlanks()).toBe(true);
    expect(ctl.mode).toBe('plankPlace');
    pad([]);
    input.poll();
    pad([9]);
    input.poll();
    expect(input.pressed('pause')).toBe(true);
    expect(ctl.update(DT)).toBe(false);
    expect(ctl.mode).toBe('drive');
    expect(tools.planks.previewing).toBe(false);
  });

  it('so does the map press', () => {
    const { ctl, key } = tool();
    ctl.startPlanks();
    key('KeyM');
    expect(ctl.update(DT)).toBe(false);
    expect(ctl.mode).toBe('drive');
  });

  it('Esc still just cancels the tool', () => {
    const { ctl, key } = tool();
    ctl.startPlanks();
    key('Escape');
    expect(ctl.update(DT)).toBe(true);
    expect(ctl.mode).toBe('drive');
  });
});
