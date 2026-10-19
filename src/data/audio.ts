/**
 * Sound tuning (SPEC §13). All sounds are synthesised with the Web Audio API; these
 * numbers set levels, pitches and ranges. Gains are linear (0..1 before the mix).
 */
export const audioTuning = {
  /** Overall level before the master volume setting. */
  headroom: 0.75,
  /** Settings sliders (0..1) map to gain as slider^curve, which sounds more even. */
  volumeCurve: 2,
  /** Vehicle sounds fade to this level while the game is paused (map, pause menu). */
  pausedVehicleGain: 0,
  pausedAmbienceGain: 0.6,
  /** From the driver's seat the body muffles the vehicle's sounds (low-pass, Hz) a little. */
  cabin: { openHz: 20000, closedHz: 1600, gain: 0.85 },

  engine: {
    /** Firing frequency = rpm / 60 × cylinders / 2 (four-stroke). */
    cylinders: 6,
    /** Gain of the synthesised engine (AudioWorklet) before the engine volume setting. */
    synthGain: 0.9,
    /** Fallback oscillator engine (no AudioWorklet): strength of each firing harmonic. */
    harmonics: [1, 0.62, 0.5, 0.55, 0.3, 0.26, 0.2, 0.17, 0.1, 0.08, 0.06, 0.05],
    /** Crank-rate rumble under the firing note. */
    halfOrderGain: 0.35,
    gain: { idle: 0.3, load: 0.32, throttle: 0.12 },
    /** Combustion noise: quiet at idle, gritty under load. */
    noise: { idle: 0.06, load: 0.4 },
    /** Low-pass cutoff (Hz) = base + rpm × perRpm + load × loadHz. */
    filter: { base: 360, perRpm: 0.42, loadHz: 1700 },
    /** Distortion mix at full load (0 = clean). */
    grit: 0.6,
    /** Level while flooding cuts the power. */
    sputterGain: 0.2,
    starter: { seconds: 0.8, hz: 150, pulseHz: 8, gain: 0.32 },
    stallClunkGain: 0.55,
  },

  horn: { tones: [392, 494], gain: 0.16 },

  /** Transfer-case and gearbox whine level (see engineSynthTuning.whine for the tone). */
  whine: {
    /** Relative level in high range (low range is 1). */
    highRange: 0.3,
    /** Level when coasting, relative to full load. */
    coast: 0.35,
    /** Shaft speed (rev/s) at which the whine reaches full level. */
    fadeInHz: 4,
  },

  tyres: {
    /** Speed (m/s) at which rolling noise is at full level. */
    fullSpeed: 10,
    /** How much wheelspin adds, compared with rolling at full speed. */
    spinWeight: 0.8,
    /** Sideways sliding speed (m/s) for full scrub noise. */
    fullSlide: 3,
    /** Water depth at a wheel (m) where the water layer takes over. */
    waterDepth: 0.08,
    layers: {
      dirt: { gain: 0.32, filterHz: 900, q: 0.7 },
      gravel: { gain: 0.3, filterHz: 2200, q: 0.6 },
      grass: { gain: 0.14, filterHz: 2600, q: 0.6 },
      rock: { gain: 0.26, filterHz: 420, q: 0.8 },
      mud: { gain: 0.45, filterHz: 380, q: 5 },
      water: { gain: 0.38, filterHz: 1300, q: 0.6 },
      wood: { gain: 0.3, filterHz: 520, q: 2.5 },
      scrub: { gain: 0.2, filterHz: 1100, q: 1.2 },
      /** Rubber chirping as a tyre spins on rock or timber. */
      squeal: { gain: 0.16, filterHz: 1150, q: 9 },
    },
    /** Wheelspin above this (0..1) on rock or timber starts the squeal. */
    squealFrom: 0.12,
    splashGain: 0.5,
  },

  /** Chassis scraping over rock: force as a share of vehicle weight and sliding speed (m/s) for full level. */
  scrape: { fullForce: 0.35, fullSlide: 0.6, gain: 0.5 },
  /** Chassis knocking a rock: impulse (N·s) from faint to full. */
  knock: { from: 120, full: 1600, gain: 0.55 },
  /** Leaf springs and body squeak as the axles articulate at low speed. */
  squeak: {
    /** Summed suspension movement (m/s) for the most squeaks. */
    fullArticulation: 0.5,
    /** Squeaks per second at full articulation, and the speed (m/s) above which they stop. */
    rate: 3.5,
    maxSpeed: 4,
    gain: 0.12,
  },
  /** Drivetrain clunks: transfer-case range change, air lockers, selecting drive or reverse. */
  clunk: { range: 0.45, locker: 0.3, gear: 0.22 },

  /** Suspension thumps: compression speed (m/s) from faint to full. */
  thump: { from: 1.2, full: 4.5, gain: 0.7 },
  dent: { gain: 0.6 },

  winch: {
    /** Motor whine pitch (Hz) with no load and at the pull limit. */
    freeHz: 560,
    loadedHz: 290,
    gain: 0.22,
    /** Cable creaks start above this fraction of the maximum pull. */
    creakFrom: 0.2,
    /** Creaks per second at full pull. */
    creakRate: 2.2,
    creakGain: 0.3,
  },

  ambience: {
    wind: {
      /** Terrain heights (m) for the quietest and loudest wind. */
      lowAltitude: 25,
      highAltitude: 130,
      minGain: 0.07,
      maxGain: 0.34,
      /** Whistle layer at full altitude. */
      whistleGain: 0.05,
    },
    /** Creek water is heard within this distance (m) of the water's edge. */
    creek: { range: 45, gain: 0.32 },
    /** The falls POI roars within this range. */
    falls: { poi: 'falls', range: 140, gain: 0.5 },
    birds: {
      /** Seconds between calls. */
      minInterval: 9,
      maxInterval: 32,
      kookaburraChance: 0.3,
      gain: 0.2,
    },
  },

  ui: { chimeGain: 0.22, rustleGain: 0.3 },
} as const;

export type TyreLayer = keyof typeof audioTuning.tyres.layers;

type Pair = readonly [number, number];

/** Settings for the engine synthesiser (src/audio/engine/engineSynth.ts), one per engine. */
export interface EngineSynthTuning {
  idleRpm: number;
  limiterRpm: number;
  /** One entry per cylinder; its length sets the cylinder count. */
  firingOrder: readonly number[];
  runners: { delayMs: readonly number[]; strength: readonly number[] };
  pulse: { riseMs: Pair; decayMs: Pair; minRiseDeg: number; minDecayDeg: number; maxDecayDeg: number };
  turbulence: { idle: number; load: number };
  pressure: { idle: number; compression: number };
  manifoldSeconds: number;
  jitter: { idle: number; load: number; timingDeg: number; lopeRpm: number };
  exhaust: {
    soundSpeed: number;
    headPipe: { length: number; reflection: number; dampingHz: number };
    muffler: { cutoffHz: number; q: number; boomHz: number; boomQ: number; boomDb: number; leak: number };
    tailPipe: { length: number; reflection: number; dampingHz: number };
    radiationHz: number;
    gain: number;
  };
  block: { cutoffHz: number; gain: number };
  valves: { hz: Pair; q: number; gain: number };
  intake: {
    openDeg: number;
    riseDeg: number;
    decayDeg: number;
    noiseHz: number;
    noiseGain: number;
    honkHz: number;
    honkQ: number;
    honkGain: number;
  };
  fan: { hz: number; gain: number };
  overrun: {
    fromRpm: number;
    misfire: number;
    popChance: number;
    popGain: number;
    whistleHz: number;
    whistleGain: number;
  };
  starter: {
    seconds: number;
    rpm: number;
    compressionDip: number;
    meshPerCrankTurn: number;
    toneHz: number;
    brushHz: number;
    gain: number;
  };
  catch: { seconds: number; flareRpm: number; flareSeconds: number; settleSeconds: number };
  whine: { teeth: Pair; second: number; harmonic: number; shaftAm: number; wobble: number; gain: number };
  /**
   * Diesel combustion knock: each firing rings two metallic resonances (Hz), hardest at
   * idle and light load (idle) and less so under full load (load).
   */
  knock?: { hz: Pair; q: number; idle: number; load: number; gain: number };
  outputGain: number;
}

/**
 * Inline-six engine synthesiser (src/audio/engine/engineSynth.ts), modelled on the
 * 4.2 L petrol six of a 1970s 40 Series. Pressures are relative (1 = full throttle).
 */
export const engineSynthTuning: EngineSynthTuning = {
  idleRpm: 800,
  /** Above this the ignition cuts out every other firing (rev limiter). */
  limiterRpm: 4450,
  firingOrder: [1, 5, 3, 6, 2, 4],
  /**
   * Exhaust manifold runners, cylinders 1..6: extra delay (ms) and pulse strength. The
   * outlet sits between cylinders 3 and 4, so the outer cylinders' pulses arrive later
   * and softer; the unevenness gives the six its burble.
   */
  runners: {
    delayMs: [0.45, 0.25, 0.05, 0.1, 0.3, 0.5],
    strength: [0.97, 1.0, 1.04, 1.03, 0.98, 0.95],
  },
  /**
   * Blowdown pulse rise and decay times (ms) at [closed, full] throttle, limited to a
   * range of crank angle (°): distinct pops at idle, a continuous roar at high revs.
   */
  pulse: { riseMs: [0.45, 0.2], decayMs: [1.6, 0.9], minRiseDeg: 2, minDecayDeg: 5, maxDecayDeg: 22 },
  /** Flow noise riding on the exhaust pulses at closed and full throttle. */
  turbulence: { idle: 0.25, load: 0.6 },
  /** Exhaust pulse strength at closed throttle, and from compression alone (no firing). */
  pressure: { idle: 0.22, compression: 0.035 },
  /** How quickly manifold pressure follows the throttle (s). */
  manifoldSeconds: 0.06,
  /** Cycle-to-cycle variation: pulse strength at idle and under load, timing (°), idle rpm wander. */
  jitter: { idle: 0.1, load: 0.035, timingDeg: 3, lopeRpm: 14 },
  exhaust: {
    /** Speed of sound in hot exhaust gas (m/s). */
    soundSpeed: 510,
    headPipe: { length: 1.7, reflection: -0.35, dampingHz: 2600 },
    /** Muffler low-pass, its low boom resonance, and the share of sound that bypasses it. */
    muffler: { cutoffHz: 950, q: 0.6, boomHz: 92, boomQ: 1.3, boomDb: 3.5, leak: 0.22 },
    tailPipe: { length: 1.3, reflection: -0.3, dampingHz: 3600 },
    /** The tailpipe radiates little below this. */
    radiationHz: 38,
    gain: 1,
  },
  /** Combustion thump through the engine block. */
  block: { cutoffHz: 160, gain: 0.35 },
  /** Valve-train tick: two metallic resonances (Hz) excited twelve times per cycle. */
  valves: { hz: [2600, 4300], q: 9, gain: 2.5 },
  /** Intake roar: suction pulses open at this crank angle after exhaust opening (°). */
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 28,
    noiseHz: 650,
    noiseGain: 1.4,
    honkHz: 135,
    honkQ: 4,
    honkGain: 0.5,
  },
  /** Engine-driven fan. */
  fan: { hz: 1100, gain: 0.25 },
  /** Closed throttle at high revs: occasional misfires, rare pops and a thin intake whistle. */
  overrun: {
    fromRpm: 1700,
    misfire: 0.18,
    popChance: 0.03,
    popGain: 1.3,
    whistleHz: 2900,
    whistleGain: 0.15,
  },
  /** Starter motor: crank speed, dip on each compression, ring-gear teeth per crank turn. */
  starter: {
    seconds: 0.95,
    rpm: 190,
    compressionDip: 0.35,
    meshPerCrankTurn: 110,
    toneHz: 900,
    brushHz: 2600,
    gain: 0.25,
  },
  /** After the engine catches it flares to this rpm, then settles to idle. */
  catch: { seconds: 1.6, flareRpm: 1350, flareSeconds: 0.3, settleSeconds: 0.45 },
  /**
   * Transfer case and gearbox whine: gear teeth per shaft turn for two meshes, the
   * second mesh and second harmonic levels, shaft-rate wobble and random flutter.
   */
  whine: { teeth: [43, 31], second: 0.5, harmonic: 0.25, shaftAm: 0.3, wobble: 0.15, gain: 0.05 },
  outputGain: 1,
};

/**
 * The Perentie's 3.9 L Isuzu 4BD1 four-cylinder diesel: a slow, lumpy idle with a hard
 * combustion knock, stronger compression pulses (no throttle plate), no overrun pops,
 * a long exhaust under the 110's floor and plenty of LT95 gearbox whine.
 */
export const dieselSynthTuning: EngineSynthTuning = {
  idleRpm: 700,
  limiterRpm: 3650,
  firingOrder: [1, 3, 4, 2],
  runners: { delayMs: [0.3, 0.1, 0.1, 0.3], strength: [0.98, 1.02, 1.02, 0.97] },
  pulse: { riseMs: [0.35, 0.18], decayMs: [1.9, 1.05], minRiseDeg: 2, minDecayDeg: 6, maxDecayDeg: 28 },
  turbulence: { idle: 0.35, load: 0.65 },
  pressure: { idle: 0.34, compression: 0.06 },
  manifoldSeconds: 0.08,
  jitter: { idle: 0.13, load: 0.04, timingDeg: 2.5, lopeRpm: 10 },
  exhaust: {
    soundSpeed: 500,
    headPipe: { length: 1.5, reflection: -0.35, dampingHz: 2400 },
    muffler: { cutoffHz: 800, q: 0.6, boomHz: 74, boomQ: 1.2, boomDb: 4.5, leak: 0.25 },
    tailPipe: { length: 2.4, reflection: -0.3, dampingHz: 3200 },
    radiationHz: 34,
    gain: 1.05,
  },
  block: { cutoffHz: 190, gain: 0.5 },
  valves: { hz: [2300, 3900], q: 8, gain: 1.6 },
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 34,
    noiseHz: 520,
    noiseGain: 1.0,
    honkHz: 110,
    honkQ: 3,
    honkGain: 0.25,
  },
  fan: { hz: 950, gain: 0.3 },
  // Lifting off cuts the fuel: compression pulses only, no pops or throttle whistle.
  overrun: { fromRpm: 1400, misfire: 0.85, popChance: 0, popGain: 1, whistleHz: 2900, whistleGain: 0 },
  starter: {
    seconds: 1.3,
    rpm: 170,
    compressionDip: 0.5,
    meshPerCrankTurn: 120,
    toneHz: 820,
    brushHz: 2400,
    gain: 0.28,
  },
  catch: { seconds: 1.8, flareRpm: 1150, flareSeconds: 0.35, settleSeconds: 0.6 },
  whine: { teeth: [37, 29], second: 0.55, harmonic: 0.3, shaftAm: 0.3, wobble: 0.15, gain: 0.07 },
  knock: { hz: [1500, 2900], q: 5, idle: 1, load: 0.55, gain: 3 },
  outputGain: 1,
};

/** Engine sound for each vehicle. */
export const engineSynthTunings = { shortie: engineSynthTuning, perentie: dieselSynthTuning } as const;
