import { describe, expect, it } from 'vitest';
import { BRIEF_SECONDS, readingSeconds } from '../src/ui/episodeCards';

describe('history note timing (v1.23)', () => {
  it('a short card stays 7 s; a note gets at least 12 s, longer for more words', () => {
    expect(BRIEF_SECONDS).toBe(7);
    expect(readingSeconds('A few words.')).toBe(12);
    const long = Array.from({ length: 100 }, () => 'word').join(' ');
    expect(readingSeconds(long)).toBeCloseTo(34, 5);
  });
});
