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
  // A short note the first time each obstacle is reached: what it is, and the control that
  // helps (worded for the keyboard, controller or phone in use). Kept in Pause → Trip journal.
  notes: {
    'creek-ford': {
      title: 'The ford',
      text: 'Shallow water over gravel: any gear will do. In deeper water go slowly, because above a walking pace the bow wave reaches the air intake and floods the engine.',
    },
    'creek-deep': {
      title: 'The deep crossing',
      instruction: 'range',
      text: 'Over a metre deep on the straight line: low range and a walking pace. The gravel bar just downstream carries about half the depth, between boulders.',
    },
    'creek-chute': {
      title: 'The chute',
      instruction: 'locks',
      text: 'They only engage below a walking pace. Straddle the rut on the way down, and crawl the climb out. Coming back up the chute takes the winch.',
    },
    'bog-hole': {
      title: 'The bog hole',
      instruction: 'winch',
      text: 'Two holes of sticky black mud, deepest in the middle. Keep moving; spinning the wheels digs you in. After rain it takes the winch.',
    },
    'rock-garden': {
      title: 'The rock garden',
      instruction: 'precision',
      text: 'Crawl holds a walking pace: hold the throttle and it creeps, let go and it stops. Put a wheel on each rock rather than straddling it.',
    },
    'knoll-rock-climb': {
      title: 'Rock climb',
      instruction: 'precision',
      text: 'Crawl holds a walking pace: hold the throttle and it creeps, let go and it stops. Low range and both diff locks first. Gate 1 at the foot starts a scored run.',
    },
    'knoll-axle-twisters': {
      title: 'Axle twisters',
      instruction: 'locks',
      text: 'They only engage below a walking pace. The holes lift a front wheel and the opposite rear: an open diff sends the drive to the wheel in the air.',
    },
    'knoll-bog-trench': {
      title: 'Bog trench',
      instruction: 'winch',
      text: 'A long bog between clay walls: once in, the only way out is along it. Marked rocks stand on the banks beside each hole.',
    },
    'knoll-drop': {
      title: 'The drop',
      instruction: 'range',
      text: 'Low range first, wheels straight, then crawl off the lip and let the nose drop into the mud hole. It is not a way up.',
    },
    'knoll-steep-descent': {
      title: 'Steep descent',
      instruction: 'range',
      text: 'Low range holds the car back on the engine. Straddle the ruts, and never lock the wheels on the clay.',
    },
    'knoll-side-slope': {
      title: 'Side slope',
      text: 'It leans the car out past 20°. Crawl, steer smoothly, and if it starts to slide turn uphill, never down.',
    },
    'knoll-switchbacks': {
      title: 'Switchbacks',
      text: 'Three tight hairpins. Swing wide, use full lock, and back up for a second go if you need to.',
    },
  },
  wrapUp: [],
  failures: {
    time: '',
    fuel: 'Out of fuel.',
    tyre: 'A flat tyre and nothing left to fix it with.',
    engine: 'The engine is wrecked.',
    swept: 'The creek took the car.',
  },
};
