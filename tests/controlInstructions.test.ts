import { describe, expect, it } from 'vitest';
import { controlInstruction } from '../src/data/controlInstructions';

describe('device-aware tutorial instructions', () => {
  it('follows the chosen controller and restores the keyboard binding', () => {
    expect(controlInstruction('precision', 'gamepad', 'xbox')).toContain('Hold LB');
    expect(controlInstruction('precision', 'gamepad', 'generic')).toContain('Hold Button 5');
    expect(controlInstruction('precision', 'keyboard')).toBe('Press P.');
    expect(controlInstruction('precision', 'touch')).toBe('Tap 4WD, then CRAWL.');
  });

  it('gives low-range, diff-lock and winch instructions that match the actual bindings', () => {
    expect(controlInstruction('range', 'gamepad', 'playstation')).toBe('Press △.');
    expect(controlInstruction('range', 'gamepad', 'xbox')).toBe('Press Y.');
    expect(controlInstruction('locks', 'keyboard')).toContain(
      'Z to lock the front diff, then X for the rear',
    );
    expect(controlInstruction('locks', 'gamepad', 'playstation')).toContain('choose Lock front diff');
    expect(controlInstruction('locks', 'touch')).toContain('F LOCK and R LOCK');
    expect(controlInstruction('winch', 'gamepad', 'playstation')).toMatch(/R1.*D-pad ↑.*D-pad ↓/);
    expect(controlInstruction('winch', 'keyboard')).toMatch(/press E.*R winds in.*F winds out/);
    expect(controlInstruction('winch', 'touch')).toMatch(/USE.*IN.*OUT/);
  });
});
