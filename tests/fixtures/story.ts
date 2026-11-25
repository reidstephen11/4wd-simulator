import type { EpisodeDef } from '../../src/data/episodes';
import { ironbarkLevel } from '../../src/data/levels/ironbark';
import type { WeatherTimeline } from '../../src/data/weatherTimeline';

/**
 * An afternoon storm for the engine's weather tests (Over the Cape's CREB storm, less its
 * per-creek shares): dry until 3 pm, heavy rain by 5 pm, easing at dusk.
 */
export const stormFixture: WeatherTimeline = {
  rain: [
    [15, 0],
    [15.33, 0.6],
    [16.5, 0.7],
    [17, 1],
    [17.75, 1],
    [18.25, 0.4],
    [18.75, 0],
  ],
  ground: { before: 0.7, soakHours: 0.4, dryHours: 3 },
  creeks: { risePerHour: 0.15, maxRise: 0.5, fallPerHour: 0.3, flowPerMetre: 2 },
  notes: [
    { hour: 15, text: 'Rain coming in — the clay will turn greasy and the creeks will rise' },
    { hour: 16.75, text: 'Heavy rain — the creeks are coming up fast' },
    { hour: 18, text: 'The rain is easing, but the creeks are still high' },
  ],
  forecast: 'storms from 3 pm',
};

/**
 * A story episode for the engine's tests: the game's levels are playgrounds (no goal, no
 * clock, no fuel burnt), so this is the playground level with what an episode of a story
 * has: a goal, a clock and a deadline with time allowed in the dark, a storm, fuel that
 * burns and a fuller load.
 */
export const storyLevel: EpisodeDef = {
  ...ironbarkLevel,
  mission: 'Reach the far camp before dark',
  goal: 'goal',
  startHour: 12.5,
  weather: 'wet',
  storm: stormFixture,
  deadline: {
    hour: 18.25,
    label: 'Dark at 6:15 pm',
    graceHours: 1.75,
    graceNote: 'Dark. Keep going on the headlights',
  },
  clockRate: 4.5,
  fuelScale: 6,
  loadout: { fuel: 50, jerryCans: 1, spares: 2, plugs: 3 },
  failures: { ...ironbarkLevel.failures, time: 'Dark, and the camp not reached.' },
};
