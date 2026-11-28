import { describe, expect, it } from 'vitest';
import { maps } from '../src/data/maps';
import { SIGN, signLayout, signLineWidth } from '../src/sim/world/signLayout';

/** The tallest lettering a sign could have before v2.31: 30 px on a 64 px board 0.36 m high. */
const OLD_BEST_EM = (0.36 * 30) / 64;

describe('sign lettering (Over the Cape v2.31)', () => {
  it('a short name is one line of full-size lettering, well over the old best', () => {
    const l = signLayout('Fruit Bat Falls');
    expect(l.lines).toEqual(['Fruit Bat Falls']);
    expect(l.em).toBe(SIGN.em);
    expect(l.em).toBeGreaterThan(OLD_BEST_EM * 1.7);
  });

  it('long wording wraps at its dash first, then between words, over up to three lines', () => {
    const canal = signLayout('Canal Creek — between the rocks, exit left').lines;
    expect(canal).toHaveLength(3);
    expect(canal[0]).toBe('Canal Creek');
    expect(canal.slice(1).join(' ')).toBe('between the rocks, exit left');
    expect(signLayout('Steep clay — low range').lines).toEqual(['Steep clay', 'low range']);
    expect(signLayout('Old Telegraph Track north — 4WD only').lines).toHaveLength(3);
  });

  it('keeps an arrow on the line it points from, and splits at a slash', () => {
    expect(signLayout('Survey box / Last pole →').lines).toEqual(['Survey box', 'Last pole →']);
    expect(signLayout('← Granite Link').lines).toEqual(['← Granite Link']);
  });

  it('the board is as tall as its lines need and no wider than its limit', () => {
    const one = signLayout('Gauging station');
    const three = signLayout('Canal Creek — between the rocks, exit left');
    expect(three.height).toBeGreaterThan(one.height * 2);
    for (const l of [one, three]) {
      expect(l.width).toBeLessThanOrEqual(SIGN.maxWidth);
      expect(l.width).toBeGreaterThanOrEqual(SIGN.minWidth);
      for (const line of l.lines)
        expect(signLineWidth(line, l.em)).toBeLessThanOrEqual(l.width - 2 * SIGN.margin);
    }
  });

  it('every sign on every track is lettered at or above the smallest size allowed, in three lines or fewer', () => {
    let count = 0;
    for (const { def } of Object.values(maps))
      for (const p of def.props) {
        if (p.kind !== 'signpost' || !p.text) continue;
        count++;
        const l = signLayout(p.text);
        expect(l.em, `${def.name}: "${p.text}"`).toBeGreaterThanOrEqual(SIGN.minEm);
        expect(l.lines.length, `${def.name}: "${p.text}"`).toBeLessThanOrEqual(3);
        expect(l.width, `${def.name}: "${p.text}"`).toBeLessThanOrEqual(SIGN.maxWidth);
      }
    expect(count).toBeGreaterThan(20);
    // The smallest allowed is still twice the size the longest signs used to be shrunk to.
    expect(SIGN.minEm).toBeGreaterThan(OLD_BEST_EM * 1.3);
  });
});
