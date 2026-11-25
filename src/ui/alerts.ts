/**
 * Touch-screen warnings. The desktop HUD keeps the full sentence in a banner. On a phone
 * the same warning is a short line, and an advisory one shrinks to a chip after it has
 * been up for a few seconds. Critical ones (the car is being swept away, the intake is
 * under water, the engine is wrecked, the tank is empty) stay as a readable line.
 */

export interface WarningView {
  /** Stable across a countdown, so the minimise timer doesn't restart every second. */
  id: string;
  /** One line, short enough for two of them to sit under the compass. */
  text: string;
  /** Even shorter, once an advisory warning has been up for a while. */
  chip: string;
  /** The sentence a keyboard shows, for the screen reader. */
  full: string;
  critical: boolean;
}

export interface RailItem {
  id: string;
  text: string;
  full: string;
  critical: boolean;
  minimised: boolean;
}

/** How long an advisory stays as a full line before it shrinks to its chip. */
export const ADVISORY_HOLD_MS = 5000;
/** How often a third warning takes a turn in the second slot. */
export const ROTATE_MS = 3200;

interface Rule {
  id: string;
  pattern: RegExp;
  critical: boolean;
  /** Lower shows first when several warnings are up together. */
  rank: number;
  text: string | ((m: RegExpMatchArray) => string);
  chip: string | ((m: RegExpMatchArray) => string);
}

const RULES: Rule[] = [
  {
    id: 'swept',
    pattern: /^The current is taking the car\b/,
    critical: true,
    rank: 0,
    text: 'Shallow water',
    chip: 'Shallow water',
  },
  {
    id: 'flooded',
    pattern: /^Engine flooded — get the air intake\b/,
    critical: true,
    rank: 1,
    text: 'Raise intake',
    chip: 'Raise intake',
  },
  {
    id: 'wrecked',
    pattern: /^Engine wrecked$/,
    critical: true,
    rank: 2,
    text: 'Engine wrecked',
    chip: 'Wrecked',
  },
  {
    id: 'fuel',
    pattern: /^Out of fuel$/,
    critical: true,
    rank: 3,
    text: 'Out of fuel',
    chip: 'No fuel',
  },
  {
    id: 'lifting',
    pattern: /^Deep, fast water\b/,
    critical: false,
    rank: 4,
    text: 'Current lifting you',
    chip: 'Lifting',
  },
  {
    id: 'intake',
    pattern: /^(Water|Bow wave) at the air intake!/,
    critical: false,
    rank: 5,
    text: 'Water at intake',
    chip: 'Intake wet',
  },
  {
    id: 'drying',
    pattern: /^Engine flooded — drying out \((\d+) s\)$/,
    critical: false,
    rank: 6,
    text: (m) => `Drying out (${m[1]} s)`,
    chip: (m) => `Drying ${m[1]}s`,
  },
  {
    id: 'find',
    pattern: /^(.*) on a crate — pull up beside it$/,
    critical: false,
    rank: 7,
    text: (m) => `${shortName(m[1])} — pull up`,
    chip: 'Pull up',
  },
];

function shortName(name: string): string {
  const n = name.trim();
  return n.length <= 16 ? n : `${n.slice(0, 14)}…`;
}

function apply(rule: Rule['text'], m: RegExpMatchArray): string {
  return typeof rule === 'string' ? rule : rule(m);
}

/** The compact form of a `!` prompt. Unknown sentences are cut at the dash. */
export function warningView(full: string): WarningView {
  for (const rule of RULES) {
    const m = full.match(rule.pattern);
    if (!m) continue;
    return {
      id: rule.id,
      critical: rule.critical,
      text: apply(rule.text, m),
      chip: apply(rule.chip, m),
      full,
    };
  }
  const head = full.split(' — ')[0].trim();
  const text = head.length <= 24 ? head : `${head.slice(0, 22)}…`;
  return {
    id: `other:${text}`,
    critical: false,
    text,
    chip: text.length <= 14 ? text : `${text.slice(0, 12)}…`,
    full,
  };
}

const rankOf = (id: string): number => RULES.find((r) => r.id === id)?.rank ?? 50;

/**
 * At most two warnings. Critical ones are kept; anything past the second slot rotates
 * through it. An advisory that has been up for `ADVISORY_HOLD_MS` shows its chip, unless
 * the player tapped it open again (`expandedUntil`).
 */
export function railItems(
  views: readonly WarningView[],
  now: number,
  firstSeen: ReadonlyMap<string, number>,
  expandedUntil: ReadonlyMap<string, number> = new Map(),
): RailItem[] {
  const ranked = [...views].sort((a, b) => rankOf(a.id) - rankOf(b.id) || a.id.localeCompare(b.id));
  return pick(ranked, now).map((v) => {
    const seen = firstSeen.get(v.id) ?? now;
    const expanded = (expandedUntil.get(v.id) ?? 0) > now;
    const minimised = !v.critical && !expanded && now - seen >= ADVISORY_HOLD_MS;
    return {
      id: v.id,
      text: minimised ? v.chip : v.text,
      full: v.full,
      critical: v.critical,
      minimised,
    };
  });
}

function pick(ranked: WarningView[], now: number): WarningView[] {
  if (ranked.length <= 2) return ranked;
  const critical = ranked.filter((v) => v.critical);
  const rest = ranked.filter((v) => !v.critical);
  if (critical.length >= 2) return critical.slice(0, 2);
  if (critical.length === 1) {
    const i = Math.floor(now / ROTATE_MS) % rest.length;
    return [critical[0], rest[i]];
  }
  const i = Math.floor(now / ROTATE_MS) % ranked.length;
  return [ranked[i], ranked[(i + 1) % ranked.length]];
}

const NOTICES: Record<string, string> = {
  'Precision crawl — hold throttle for walking pace': 'Precision crawl',
  'Slow below 5 km/h to engage diff locks': 'Under 5 km/h to lock diffs',
  'Engine stalled — flooded': 'Engine stalled',
};

const NOTICE_LIMIT = 32;

/** A toast cut down so it fits the phone rail on one line. */
export function touchNotice(text: string): string {
  const known = NOTICES[text];
  if (known) return known;
  if (text.length <= NOTICE_LIMIT) return text;
  const head = text.split(' — ')[0].trim();
  if (head.length <= NOTICE_LIMIT && head.length > 0) return head;
  const cut = head.length > 0 ? head : text;
  return `${cut.slice(0, NOTICE_LIMIT - 1)}…`;
}
