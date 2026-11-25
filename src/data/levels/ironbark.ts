import type { EpisodeDef } from '../episodes';

/**
 * Ironbark Creek, the first playground level. The engine it runs on (Over the Cape's) calls
 * a level an episode; a playground level is one with no goal, no clock and no fuel burnt.
 */
export const ironbarkLevel: EpisodeDef = {
  id: 'ironbark',
  number: 1,
  title: 'Ironbark Creek',
  route: 'A knoll, a creek and a bog hole',
  mapId: 'ironbark',
  mission: 'Drive anything you like the look of',
  startHour: 10,
  weather: 'clear',
  clockRate: 0,
  // Nothing is burnt: the tank stays as it was filled.
  fuelScale: 0,
  loadout: { fuel: 60, jerryCans: 0, spares: 1, plugs: 3 },
  briefing: [
    'Half a kilometre of country to play in. A track loops round the knoll in the middle, and every signed line leaves that loop or the track along the creek’s far bank. None of it has to be driven in any order, and the ground between the lines is open.',
    'On the knoll: the rock climb (eight scored gates), the switchbacks, the side slope, the drop, the steep descent, the axle twisters and the bog trench. On the creek: the ford, the deep crossing with its shallow bar, and the chute. On the west bank: the bog hole and the rock garden.',
  ],
  notes: {},
  wrapUp: [],
  failures: {
    time: '',
    fuel: 'Out of fuel.',
    tyre: 'A flat tyre and nothing left to fix it with.',
    engine: 'The engine is wrecked.',
    swept: 'The creek took the car.',
  },
};
