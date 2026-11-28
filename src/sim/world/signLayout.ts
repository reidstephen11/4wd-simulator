/**
 * How a signpost's wording is set out on its board (v2.31). Pure, so every sign on every
 * track can be checked for lettering large enough to read from the driver's seat without
 * drawing anything; `worldProps.ts` draws the board and the lettering from this.
 *
 * Before v2.31 every sign was one line on a board 1.45 m by 0.36 m, with long wording shrunk
 * to fit: at best the lettering was 0.17 m high (its em), at worst 0.07 m.
 */
export const SIGN = {
  /** Lettering height (the font's em, m) when the wording allows it, and the smallest allowed. */
  em: 0.3,
  minEm: 0.24,
  /** Line spacing, in ems. */
  lineHeight: 1.12,
  /** Clear board round the lettering (m). */
  margin: 0.1,
  minWidth: 1.2,
  maxWidth: 2.2,
  maxLines: 3,
  /** The board's top edge above the ground (m): just under the top of the 2.1 m post. */
  top: 2.05,
} as const;

export interface SignLayout {
  lines: string[];
  /** Lettering height (em, m). */
  em: number;
  /** The board (m). */
  width: number;
  height: number;
}

/** Roughly how wide a character of the hand-lettered face is, in ems. */
function charEm(c: string): number {
  if (c === ' ') return 0.26;
  if ('—←→'.includes(c)) return 0.8;
  if ('mwMW'.includes(c)) return 0.72;
  if ("iIjlt.,:;'!|°".includes(c)) return 0.26;
  if (c >= 'A' && c <= 'Z') return 0.56;
  if (c >= '0' && c <= '9') return 0.48;
  return 0.44;
}

/** The width of a line of lettering (m), near enough to set it out. */
export function signLineWidth(line: string, em: number): number {
  let w = 0;
  for (const c of line) w += charEm(c);
  return w * em;
}

/** Wrap the wording at this size: at each dash, slash or dot, then between words. */
function wrap(text: string, em: number): string[] {
  const room = SIGN.maxWidth - 2 * SIGN.margin;
  const lines: string[] = [];
  for (const part of text.split(/\s+[—/·]\s+/)) {
    let line = '';
    for (const word of part.split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word;
      // An arrow stays with the word beside it.
      const arrow = word === '→' || line === '←';
      if (line && !arrow && signLineWidth(longer, em) > room) {
        lines.push(line);
        line = word;
      } else line = longer;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Set a sign's wording out: full-size lettering if it fits in three lines, otherwise a
 * little smaller, down to the smallest allowed. Wording that still does not fit comes back
 * smaller than `SIGN.minEm`, which tests/signLayout.test.ts refuses: reword the sign.
 */
export function signLayout(text: string): SignLayout {
  let em: number = SIGN.em;
  let lines = wrap(text, em);
  const fits = () =>
    lines.length <= SIGN.maxLines &&
    lines.every((l) => signLineWidth(l, em) <= SIGN.maxWidth - 2 * SIGN.margin);
  while (!fits() && em > 0.1) {
    em = Math.round((em - 0.02) * 100) / 100;
    lines = wrap(text, em);
  }
  const widest = Math.max(...lines.map((l) => signLineWidth(l, em)));
  return {
    lines,
    em,
    width: Math.min(SIGN.maxWidth, Math.max(SIGN.minWidth, widest + 2 * SIGN.margin)),
    height: lines.length * em * SIGN.lineHeight + 2 * SIGN.margin,
  };
}

/** The height of the board's centre above the ground (m). */
export function signCentre(layout: SignLayout): number {
  return SIGN.top - layout.height / 2;
}
