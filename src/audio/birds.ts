/**
 * Synthesised bird calls (SPEC §13). The phrase builders are pure (seeded random in,
 * list of notes out) so they can be tested; `playPhrase` turns the notes into sound.
 */

export interface BirdNote {
  /** Start time from the phrase start (s). */
  at: number;
  dur: number;
  /** Pitch at the start, the peak (mid-note) and the end (Hz). */
  f0: number;
  f1: number;
  f2: number;
  gain: number;
}

export interface BirdPhrase {
  kind: 'kookaburra' | 'magpie';
  notes: BirdNote[];
  /** Harsh (sawtooth through a resonant filter) or fluty (sine). */
  timbre: 'harsh' | 'flute';
  duration: number;
}

/**
 * A kookaburra-style laugh: a few low chuckles, a long run of loud alternating
 * "ha-ha" syllables, then a falling, slowing tail. About 3–4 seconds.
 */
export function kookaburraPhrase(rand: () => number): BirdPhrase {
  const notes: BirdNote[] = [];
  let at = 0;
  const base = 520 + rand() * 80;
  // Chuckles.
  const chuckles = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < chuckles; i++) {
    const f = base * (1 + rand() * 0.1);
    notes.push({ at, dur: 0.09, f0: f, f1: f * 1.15, f2: f * 0.9, gain: 0.35 + i * 0.08 });
    at += 0.14 + rand() * 0.04;
  }
  // The laugh: alternating high and low syllables, building up.
  const run = 14 + Math.floor(rand() * 8);
  for (let i = 0; i < run; i++) {
    const high = i % 2 === 0;
    const f = base * (high ? 2.5 + rand() * 0.3 : 1.9 + rand() * 0.2);
    const build = Math.min(1, 0.55 + i / run);
    notes.push({ at, dur: 0.075, f0: f * 0.85, f1: f * 1.12, f2: f * 0.8, gain: build });
    at += 0.105 + rand() * 0.02;
  }
  // Tail: falling and slowing.
  const tail = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < tail; i++) {
    const f = base * (1.9 - i * 0.18);
    notes.push({ at, dur: 0.09, f0: f, f1: f * 1.1, f2: f * 0.85, gain: 0.7 - i * 0.1 });
    at += 0.13 + i * 0.03;
  }
  return { kind: 'kookaburra', notes, timbre: 'harsh', duration: at + 0.1 };
}

/**
 * A magpie-style warble: a run of liquid, fluty notes that slide between pitches,
 * 1.5–3 seconds.
 */
export function magpiePhrase(rand: () => number): BirdPhrase {
  const notes: BirdNote[] = [];
  let at = 0;
  const count = 6 + Math.floor(rand() * 6);
  let f = 1100 + rand() * 600;
  for (let i = 0; i < count; i++) {
    const dur = 0.08 + rand() * 0.22;
    const next = Math.min(2800, Math.max(800, f * (0.7 + rand() * 0.75)));
    const peak = Math.max(f, next) * (1 + rand() * 0.15);
    notes.push({ at, dur, f0: f, f1: peak, f2: next, gain: 0.5 + rand() * 0.5 });
    f = next;
    // Mostly joined notes, sometimes a short gap.
    at += dur + (rand() < 0.35 ? 0.05 + rand() * 0.12 : 0.01);
  }
  return { kind: 'magpie', notes, timbre: 'flute', duration: at + 0.1 };
}

/** Play a phrase through `out`, panned and slightly muffled by distance. */
export function playPhrase(
  ctx: BaseAudioContext,
  out: AudioNode,
  phrase: BirdPhrase,
  level: number,
  pan: number,
  muffleHz: number,
): void {
  const start = ctx.currentTime + 0.05;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = muffleHz;
  lp.connect(panner).connect(out);

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  amp.gain.value = 0;
  if (phrase.timbre === 'harsh') {
    osc.type = 'sawtooth';
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2.5;
    band.frequency.value = 1400;
    osc.connect(band).connect(amp);
  } else {
    osc.type = 'sine';
    // A fast flutter gives the magpie its gurgle.
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 28 + Math.random() * 14;
    const depth = ctx.createGain();
    depth.gain.value = 25;
    flutter.connect(depth).connect(osc.frequency);
    flutter.start(start);
    flutter.stop(start + phrase.duration + 0.1);
    osc.connect(amp);
  }
  amp.connect(lp);

  const f = osc.frequency;
  const g = amp.gain;
  f.setValueAtTime(phrase.notes[0]?.f0 ?? 1000, start);
  for (const n of phrase.notes) {
    const t0 = start + n.at;
    const peak = level * n.gain;
    f.setValueAtTime(n.f0, t0);
    f.linearRampToValueAtTime(n.f1, t0 + n.dur * 0.45);
    f.linearRampToValueAtTime(n.f2, t0 + n.dur);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(peak, t0 + Math.min(0.012, n.dur * 0.2));
    g.setValueAtTime(peak, t0 + n.dur * 0.6);
    g.linearRampToValueAtTime(0, t0 + n.dur);
  }
  osc.start(start);
  osc.stop(start + phrase.duration + 0.1);
}
