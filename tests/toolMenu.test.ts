import { orderTools, toolGroup } from '../src/data/toolMenu';
import { describe, expect, it } from 'vitest';
describe('tool families', () => {
  it('puts both diff locks together and keeps recovery gear together when cargo appears', () => {
    const options = [
      'loadDrum',
      'planks',
      'rearDiff',
      'repair',
      'winch',
      'frontDiff',
      'secureLoad',
      'recall',
      'precision',
      'pressure',
      'lights',
      'refuel',
    ].map((id) => ({ id }));
    const result = orderTools(options);
    expect(result.map((o) => o.id)).toEqual([
      'frontDiff',
      'rearDiff',
      'precision',
      'pressure',
      'winch',
      'planks',
      'recall',
      'repair',
      'refuel',
      'lights',
      'secureLoad',
      'loadDrum',
    ]);
    expect(result.map((o) => toolGroup(o.id))).toEqual([
      'drive',
      'drive',
      'drive',
      'drive',
      'recovery',
      'recovery',
      'recovery',
      'service',
      'service',
      'service',
      'cargo',
      'cargo',
    ]);
    expect(options[0].id).toBe('loadDrum');
  });
});
