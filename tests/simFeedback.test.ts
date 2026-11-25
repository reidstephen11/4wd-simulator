import { describe, expect, it } from 'vitest';
import { Emitter } from '../src/core/events';
import { wireSimFeedback, type FeedbackAudio, type FeedbackSim } from '../src/core/simFeedback';
import { damageMessage } from '../src/core/damageMessages';
import { vehicles } from '../src/data/vehicles';
import type { ControllerType } from '../src/data/controllers';
import type { SimEvents } from '../src/sim/sim';

const ME = 'player-1';

/** A sim with only the event bus, fake HUD and audio that record what they were asked. */
function wired(controller: ControllerType = 'playstation') {
  const toasts: Array<[string, number | undefined]> = [];
  const sounds: Array<[string, ...unknown[]]> = [];
  const audio = new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          sounds.push([name, ...args]),
    },
  ) as FeedbackAudio;
  const condition = { jerryCans: 2, spares: 1, plugs: 3 };
  const sim = {
    events: new Emitter<SimEvents>(),
    surprises: null,
    trailers: new Map(),
    damage: 'realistic',
  } as unknown as FeedbackSim;
  const tuning = vehicles.shortie.tuning;
  wireSimFeedback(sim, { toast: (text: string, ms?: number) => void toasts.push([text, ms]) }, audio, {
    vehicleId: ME,
    vehicle: () => ({ condition, tuning }) as never,
    controller: () => controller,
  });
  return { sim, toasts, sounds, condition, tuning };
}

describe('sim feedback wiring', () => {
  it('a puncture on the player’s car toasts the damage line and plays the damage sound', () => {
    const { sim, toasts, sounds, tuning } = wired();
    const e = { part: 'tyre', wheel: 0, health: 0.4, cause: 'rock', fault: 'none' } as const;
    sim.events.emit('damage', { id: ME, ...e } as SimEvents['damage']);
    expect(toasts).toEqual([[damageMessage(e as never, tuning, 'realistic'), 3200]]);
    expect(sounds).toEqual([['damage', 'tyre', false]]);
  });

  it('another vehicle’s damage, dents and knocks make no toast or sound', () => {
    const { sim, toasts, sounds } = wired();
    sim.events.emit('damage', { id: 'other', part: 'engine', wheel: 0, health: 0 } as SimEvents['damage']);
    sim.events.emit('dent', { id: 'other', impact: 3 });
    sim.events.emit('bodyKnock', { id: 'other', impulse: 900 });
    sim.events.emit('parkBrakeChanged', { id: 'other', on: true });
    expect(toasts).toEqual([]);
    expect(sounds).toEqual([]);
  });

  it('bumps, dents and wheel impacts on the player’s car only sound', () => {
    const { sim, toasts, sounds } = wired();
    sim.events.emit('wheelImpact', { id: ME, wheel: 1, speed: 2 });
    sim.events.emit('dent', { id: ME, impact: 4 });
    sim.events.emit('bodyKnock', { id: ME, impulse: 500 });
    expect(toasts).toEqual([]);
    expect(sounds).toEqual([
      ['wheelImpact', 2],
      ['dent', 4],
      ['bodyKnock', 500],
    ]);
  });

  it('a tyre plug says how many are left', () => {
    const { sim, toasts, sounds } = wired();
    sim.events.emit('repaired', { id: ME, kind: 'plug' });
    expect(toasts).toEqual([['Tyre plugged (3 plugs left)', 2000]]);
    expect(sounds).toEqual([['drivetrainClunk', 'range']]);
  });

  it('running dry points to the jerry cans while there are some', () => {
    const { sim, toasts, sounds, condition } = wired();
    sim.events.emit('engine', { id: ME, event: 'outOfFuel' });
    condition.jerryCans = 0;
    sim.events.emit('engine', { id: ME, event: 'outOfFuel' });
    expect(toasts.map(([t]) => t)).toEqual([
      'Out of fuel — pour in a jerry can from the tool menu',
      'Out of fuel',
    ]);
    expect(sounds).toEqual([
      ['engineEvent', 'stalled'],
      ['engineEvent', 'stalled'],
    ]);
  });

  it('a lugged stall names the accelerate button of the controller in Settings', () => {
    const { sim, toasts } = wired('xbox');
    sim.events.emit('engine', { id: ME, event: 'stalledLugged' });
    expect(toasts).toEqual([['Stalled: press RT to restart', 3200]]);
  });

  it('starting the engine sounds without a toast; a flood stall toasts', () => {
    const { sim, toasts, sounds } = wired();
    sim.events.emit('engine', { id: ME, event: 'starting' });
    sim.events.emit('engine', { id: ME, event: 'stalled' });
    expect(toasts.map(([t]) => t)).toEqual(['Engine stalled — flooded']);
    expect(sounds).toEqual([
      ['engineEvent', 'starting'],
      ['engineEvent', 'stalled'],
    ]);
  });

  it('range, diffs, handbrake and lights toast and clunk', () => {
    const { sim, toasts, sounds } = wired();
    sim.events.emit('transferChanged', { id: ME, mode: '4L' });
    sim.events.emit('diffChanged', { id: ME, axle: 'rear', locked: true });
    sim.events.emit('parkBrakeChanged', { id: ME, on: false });
    sim.events.emit('lightsChanged', { id: ME, mode: 'high' });
    sim.events.emit('diffBlocked', { id: ME, axle: 'front' });
    sim.events.emit('precisionChanged', { id: ME, enabled: false });
    expect(toasts.map(([t]) => t)).toEqual([
      'Transfer case: 4L',
      'Rear differential locked',
      'Handbrake off',
      'Headlights: high beam',
      'Slow below 5 km/h to engage diff locks',
      'Precision crawl off',
    ]);
    expect(sounds).toEqual([
      ['drivetrainClunk', 'range'],
      ['drivetrainClunk', 'lockOn'],
      ['parkBrake', false],
      ['lightSwitch', true],
    ]);
  });

  it('a trailer tipping toasts and sounds with its load; the player’s trailer bumps sound', () => {
    const { sim, sounds, toasts } = wired();
    (sim.trailers as Map<string, unknown>).set('t1', { drums: 3 });
    sim.events.emit('trailer', {
      id: 't1',
      vehicle: null,
      event: { type: 'tipped' },
    } as SimEvents['trailer']);
    sim.events.emit('trailerBump', { id: 't1', vehicle: ME, speed: 1.5 });
    sim.events.emit('trailerBump', { id: 't1', vehicle: 'other', speed: 1.5 });
    expect(toasts.length).toBe(1);
    expect(sounds).toEqual([
      ['trailerEvent', 'tipped', 3],
      ['trailerBump', 1.5, 3],
    ]);
  });
});
