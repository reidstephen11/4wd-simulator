import { describe } from 'vitest';
import { winchClimbs } from '../src/data/winchClimbs';
import { climbTests } from './helpers/climbs';

describe('Stringybark Range clay climbs', () => {
  climbTests(winchClimbs.filter((c) => c.kind === 'mud'));
});
