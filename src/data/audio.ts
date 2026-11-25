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
  /** Drivetrain clunks: transfer-case range change, air lockers, selecting drive or reverse, handbrake. */
  clunk: { range: 0.45, locker: 0.3, gear: 0.22, handbrake: 0.25, lightSwitch: 0.2 },

  /** Suspension thumps: compression speed (m/s) from faint to full. */
  thump: { from: 1.2, full: 4.5, gain: 0.7 },
  dent: { gain: 0.6 },
  /** A tyre cut on a rock: a sharp crack, then air hissing out over a few seconds. */
  puncture: { crack: 0.5, hiss: 0.12, hissSeconds: 3 },
  /** Surprises up ahead: a dead tree cracking and crashing down, rocks coming off a bank. */
  surprise: { treeGain: 0.8, rockGain: 0.6 },

  /** A trailer on the back (docs/NEXT.md). */
  trailer: {
    /** Summed spring movement of its wheels (m/s) and speed (m/s) for the loudest rattle. */
    fullRoughness: 0.8,
    rattleSpeed: 6,
    rattleGain: 0.22,
    /** Full drums sit the box down and damp the rattle to this share. */
    loadedRattle: 0.55,
    /** Spring compression speed (m/s) from a faint bang to a full one. */
    bumpFrom: 1.2,
    bumpFull: 4,
    bumpGain: 0.5,
    /** The coupling dropping onto the ball or lifted off it, and the jockey wheel's handle. */
    couplingGain: 0.4,
  },

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
    /** Rain levels: the far hiss, the near patter, and the roof drumming heard inside. */
    rain: { hiss: 0.16, patter: 0.1, roof: 0.22 },
    /** The falls POI roars within this range. */
    falls: { poi: 'falls', range: 140, gain: 0.5 },
    birds: {
      /** Seconds between calls. */
      minInterval: 9,
      maxInterval: 32,
      kookaburraChance: 0.3,
      gain: 0.2,
    },
    /** At night the birds are quiet and crickets chirp: short trills of a few pulses. */
    crickets: {
      gain: 0.035,
      /** Pitch range (Hz), pulses per trill and seconds between trills. */
      hz: [4300, 4900],
      pulses: [3, 5],
      pulseSeconds: 0.018,
      gapSeconds: [0.25, 0.9],
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
  /**
   * A V engine's two banks: which bank each cylinder (1..n) is on, and each bank's own
   * head pipe and level. On a cross-plane V8 each bank fires unevenly (90°, 180° and 270°
   * apart), so with the banks piped apart the exhaust burbles instead of droning.
   */
  banks?: {
    of: readonly (0 | 1)[];
    headPipe: readonly [PipeTuning, PipeTuning];
    gain: Pair;
  };
  /**
   * Long-duration camshaft: at idle the revs surge and sag at `lopeHz` by `lopeRpm`,
   * firings swell and fade with it (`chop`), and some burn only partly (`weak` chance).
   */
  cam?: { lopeHz: number; lopeRpm: number; chop: number; weak: number };
  /**
   * Turbocharger: boost builds over `spoolSeconds` with throttle above `fromRpm`; the
   * compressor whistles from hz[0] to hz[1] as it spins up and flutters when the throttle
   * snaps shut on boost.
   */
  turbo?: {
    fromRpm: number;
    spoolSeconds: number;
    hz: Pair;
    gain: number;
    hiss: number;
    flutterHz: number;
    flutterGain: number;
  };
  /**
   * Extra limiter character near `limiterRpm` (bounce rhythm, strain, lift-off crackle).
   * Without this, every other firing is dropped at random above the limiter.
   */
  limiter?: {
    /** Rpm below limiterRpm where strain and intake start to build. */
    approach: number;
    kind: 'ignition' | 'fuel';
    /** Repeating cycle: 0 fire, 1 cut, 2 a weak burn. */
    pattern: readonly number[];
    bouncePop: number;
    intake: number;
    valves: number;
    grit: number;
    block: number;
    overrunPop: number;
    dump: number;
  };
  outputGain: number;
}

type PipeTuning = { length: number; reflection: number; dampingHz: number };

/**
 * Inline-six engine synthesiser (src/audio/engine/engineSynth.ts), modelled on the
 * 4.2 L petrol six of a 1970s 40 Series. Pressures are relative (1 = full throttle).
 */
export const engineSynthTuning: EngineSynthTuning = {
  idleRpm: 800,
  /** Matches the 40 Series' 4300 rpm redline so the bounce is heard while the physics cuts. */
  limiterRpm: 4300,
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
  /**
   * Petrol ignition-cut bounce at the limiter: an uneven fire/cut stutter, intake roar and
   * valvetrain thrash on the way in, and pops / crackles if you lift off still at redline.
   */
  limiter: {
    approach: 260,
    kind: 'ignition',
    pattern: [0, 1, 0, 0, 1, 0, 1, 1],
    bouncePop: 0.2,
    intake: 0.7,
    valves: 0.85,
    grit: 0.22,
    block: 0.18,
    overrunPop: 0.14,
    dump: 0,
  },
  outputGain: 1,
};

/**
 * The Perentie's 3.9 L Isuzu 4BD1 four-cylinder diesel: a slow, lumpy idle with a hard
 * combustion knock, stronger compression pulses (no throttle plate), no overrun pops and
 * a long exhaust under the 110's floor. The 4BD1 has no turbo, so nothing here whistles:
 * the knock and valve clatter ring low (1 to 3 kHz) and the gearbox whine is faint.
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
  valves: { hz: [1700, 2900], q: 4, gain: 0.8 },
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
  fan: { hz: 650, gain: 0.1 },
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
  whine: { teeth: [37, 29], second: 0.55, harmonic: 0.1, shaftAm: 0.3, wobble: 0.15, gain: 0.008 },
  knock: { hz: [1050, 1900], q: 2.5, idle: 1, load: 0.3, gain: 4 },
  outputGain: 1,
};

/**
 * The Hilux's 2.0 L 18R single-cam petrol four: a quicker, buzzier idle than the six
 * (two firings a turn, evenly spaced, so less burble), a chain-driven valve train that
 * ticks a little higher, a short exhaust from a cast four-into-one manifold, and a
 * smaller starter that spins it faster.
 */
export const petrolFourSynthTuning: EngineSynthTuning = {
  idleRpm: 750,
  limiterRpm: 5650,
  firingOrder: [1, 3, 4, 2],
  runners: { delayMs: [0.35, 0.12, 0.1, 0.33], strength: [0.98, 1.02, 1.03, 0.97] },
  pulse: { riseMs: [0.4, 0.18], decayMs: [1.4, 0.8], minRiseDeg: 2, minDecayDeg: 5, maxDecayDeg: 24 },
  turbulence: { idle: 0.28, load: 0.62 },
  pressure: { idle: 0.24, compression: 0.035 },
  manifoldSeconds: 0.05,
  jitter: { idle: 0.09, load: 0.03, timingDeg: 2.5, lopeRpm: 12 },
  exhaust: {
    soundSpeed: 510,
    headPipe: { length: 1.4, reflection: -0.35, dampingHz: 2700 },
    muffler: { cutoffHz: 1050, q: 0.6, boomHz: 105, boomQ: 1.3, boomDb: 3, leak: 0.24 },
    tailPipe: { length: 1.1, reflection: -0.3, dampingHz: 3700 },
    radiationHz: 42,
    gain: 1,
  },
  block: { cutoffHz: 180, gain: 0.32 },
  valves: { hz: [2900, 4600], q: 9, gain: 2.2 },
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 28,
    noiseHz: 720,
    noiseGain: 1.3,
    honkHz: 160,
    honkQ: 4,
    honkGain: 0.45,
  },
  fan: { hz: 1200, gain: 0.22 },
  overrun: {
    fromRpm: 1900,
    misfire: 0.15,
    popChance: 0.025,
    popGain: 1.2,
    whistleHz: 3100,
    whistleGain: 0.14,
  },
  starter: {
    seconds: 0.85,
    rpm: 210,
    compressionDip: 0.3,
    meshPerCrankTurn: 100,
    toneHz: 980,
    brushHz: 2700,
    gain: 0.24,
  },
  catch: { seconds: 1.4, flareRpm: 1500, flareSeconds: 0.28, settleSeconds: 0.45 },
  whine: { teeth: [41, 29], second: 0.5, harmonic: 0.22, shaftAm: 0.3, wobble: 0.15, gain: 0.04 },
  outputGain: 1,
};

/**
 * The Unimog's 5.7 L OM352A turbo-diesel six: a slow idle, six evenly spaced firings
 * smoother than the four but with the same diesel knock, a deeper exhaust through a long
 * pipe under the tray, a turbo that soaks up the sharpest of the pulses, a big starter that
 * turns it over slowly, and loud gear whine from the portal hub gears.
 */
export const dieselSixSynthTuning: EngineSynthTuning = {
  idleRpm: 650,
  limiterRpm: 2850,
  firingOrder: [1, 5, 3, 6, 2, 4],
  runners: {
    delayMs: [0.5, 0.28, 0.06, 0.1, 0.32, 0.55],
    strength: [0.97, 1.0, 1.03, 1.03, 0.99, 0.96],
  },
  pulse: { riseMs: [0.45, 0.25], decayMs: [2.2, 1.3], minRiseDeg: 2, minDecayDeg: 6, maxDecayDeg: 26 },
  turbulence: { idle: 0.35, load: 0.7 },
  pressure: { idle: 0.32, compression: 0.06 },
  manifoldSeconds: 0.12,
  jitter: { idle: 0.1, load: 0.035, timingDeg: 2, lopeRpm: 8 },
  exhaust: {
    soundSpeed: 500,
    headPipe: { length: 1.9, reflection: -0.3, dampingHz: 2000 },
    muffler: { cutoffHz: 650, q: 0.6, boomHz: 58, boomQ: 1.2, boomDb: 5, leak: 0.2 },
    tailPipe: { length: 3.2, reflection: -0.3, dampingHz: 2800 },
    radiationHz: 28,
    gain: 1.1,
  },
  block: { cutoffHz: 150, gain: 0.55 },
  valves: { hz: [1500, 2600], q: 4, gain: 0.7 },
  intake: {
    openDeg: 380,
    riseDeg: 34,
    decayDeg: 40,
    noiseHz: 430,
    noiseGain: 1.1,
    honkHz: 90,
    honkQ: 3,
    honkGain: 0.2,
  },
  fan: { hz: 520, gain: 0.16 },
  // Lifting off cuts the fuel; the turbo whistles as it spins down.
  overrun: { fromRpm: 1200, misfire: 0.85, popChance: 0, popGain: 1, whistleHz: 3400, whistleGain: 0.08 },
  starter: {
    seconds: 1.5,
    rpm: 150,
    compressionDip: 0.5,
    meshPerCrankTurn: 130,
    toneHz: 700,
    brushHz: 2100,
    gain: 0.3,
  },
  catch: { seconds: 2, flareRpm: 1000, flareSeconds: 0.4, settleSeconds: 0.7 },
  whine: { teeth: [37, 23], second: 0.6, harmonic: 0.2, shaftAm: 0.3, wobble: 0.15, gain: 0.03 },
  knock: { hz: [900, 1700], q: 2.5, idle: 0.85, load: 0.3, gain: 3.5 },
  outputGain: 1,
};

/**
 * The Troop Carrier's 4.2 L 1HZ diesel six: the Perentie's diesel knock and clatter, but
 * six firings every two turns, so a smoother, deeper idle with less lope, softer knock
 * (indirect injection), a long exhaust under the body out to the back, and a big starter
 * that turns it slowly against the compression.
 */
export const troopyDieselSynthTuning: EngineSynthTuning = {
  ...dieselSynthTuning,
  idleRpm: 700,
  limiterRpm: 4050,
  firingOrder: [1, 5, 3, 6, 2, 4],
  runners: {
    delayMs: [0.42, 0.24, 0.06, 0.1, 0.28, 0.46],
    strength: [0.97, 1.0, 1.03, 1.03, 0.99, 0.96],
  },
  jitter: { idle: 0.1, load: 0.035, timingDeg: 2.5, lopeRpm: 8 },
  exhaust: {
    soundSpeed: 500,
    headPipe: { length: 1.8, reflection: -0.35, dampingHz: 2400 },
    muffler: { cutoffHz: 760, q: 0.6, boomHz: 68, boomQ: 1.2, boomDb: 4, leak: 0.22 },
    tailPipe: { length: 2.8, reflection: -0.3, dampingHz: 3100 },
    radiationHz: 32,
    gain: 1.05,
  },
  block: { cutoffHz: 180, gain: 0.45 },
  valves: { hz: [1600, 2700], q: 4, gain: 0.7 },
  fan: { hz: 600, gain: 0.12 },
  starter: {
    seconds: 1.4,
    rpm: 165,
    compressionDip: 0.45,
    meshPerCrankTurn: 120,
    toneHz: 780,
    brushHz: 2300,
    gain: 0.28,
  },
  catch: { seconds: 1.9, flareRpm: 1100, flareSeconds: 0.35, settleSeconds: 0.6 },
  whine: { teeth: [39, 29], second: 0.55, harmonic: 0.12, shaftAm: 0.3, wobble: 0.15, gain: 0.012 },
  knock: { hz: [1000, 1800], q: 2.5, idle: 0.8, load: 0.25, gain: 3.2 },
};

/**
 * The 60 Series' 4.0 L 2H: an older indirect-injection diesel six than the Troop Carrier's
 * 1HZ, so the same smooth six-cylinder firing with a lower, looser idle, a little more
 * clatter, and a slow, labouring starter on its glow plugs. Its exhaust runs back under the
 * wagon to a tailpipe behind the right rear wheel.
 */
export const twoHSynthTuning: EngineSynthTuning = {
  ...troopyDieselSynthTuning,
  idleRpm: 650,
  limiterRpm: 4000,
  jitter: { idle: 0.12, load: 0.04, timingDeg: 3, lopeRpm: 10 },
  exhaust: {
    ...troopyDieselSynthTuning.exhaust,
    tailPipe: { length: 2.4, reflection: -0.3, dampingHz: 3000 },
  },
  valves: { hz: [1500, 2600], q: 4, gain: 0.8 },
  starter: {
    seconds: 1.5,
    rpm: 155,
    compressionDip: 0.5,
    meshPerCrankTurn: 120,
    toneHz: 760,
    brushHz: 2200,
    gain: 0.28,
  },
  catch: { seconds: 2, flareRpm: 1000, flareSeconds: 0.4, settleSeconds: 0.7 },
  knock: { hz: [950, 1750], q: 2.5, idle: 0.85, load: 0.28, gain: 3.4 },
};

/**
 * The MQ Patrol's SD33: a 3.3 L indirect-injection diesel six, smaller and busier than the
 * 2H, with a harder knock at idle, a short exhaust under the short wheelbase to a tailpipe
 * behind the left rear wheel, and a long, slow crank on its 24 V starter.
 */
export const sd33SynthTuning: EngineSynthTuning = {
  ...twoHSynthTuning,
  idleRpm: 650,
  limiterRpm: 4100,
  jitter: { idle: 0.14, load: 0.05, timingDeg: 3.5, lopeRpm: 12 },
  exhaust: {
    ...twoHSynthTuning.exhaust,
    tailPipe: { length: 1.9, reflection: -0.32, dampingHz: 3200 },
  },
  valves: { hz: [1700, 2900], q: 4, gain: 0.85 },
  starter: {
    seconds: 1.6,
    rpm: 150,
    compressionDip: 0.5,
    meshPerCrankTurn: 120,
    toneHz: 720,
    brushHz: 2100,
    gain: 0.28,
  },
  catch: { seconds: 2.2, flareRpm: 1050, flareSeconds: 0.4, settleSeconds: 0.7 },
  knock: { hz: [1050, 1900], q: 2.5, idle: 0.95, load: 0.3, gain: 3.5 },
};

/**
 * The GQ Patrol's TD42: a 4.2 L six-cylinder diesel with no turbo. Six cylinders fire
 * three times a crank turn, so it idles smoother and deeper than the Perentie's four,
 * with the same hard combustion knock, a gruff valve clatter and a long exhaust run
 * back under the wagon to a tailpipe behind the rear wheel.
 */
export const td42SynthTuning: EngineSynthTuning = {
  idleRpm: 650,
  limiterRpm: 4050,
  firingOrder: [1, 5, 3, 6, 2, 4],
  runners: {
    delayMs: [0.5, 0.3, 0.1, 0.1, 0.3, 0.5],
    strength: [0.97, 1.0, 1.03, 1.03, 0.99, 0.96],
  },
  pulse: { riseMs: [0.4, 0.2], decayMs: [1.8, 1.0], minRiseDeg: 2, minDecayDeg: 5, maxDecayDeg: 24 },
  turbulence: { idle: 0.3, load: 0.6 },
  pressure: { idle: 0.3, compression: 0.05 },
  manifoldSeconds: 0.08,
  jitter: { idle: 0.11, load: 0.035, timingDeg: 2.5, lopeRpm: 8 },
  exhaust: {
    soundSpeed: 500,
    headPipe: { length: 1.8, reflection: -0.35, dampingHz: 2400 },
    muffler: { cutoffHz: 750, q: 0.6, boomHz: 68, boomQ: 1.2, boomDb: 4.5, leak: 0.22 },
    tailPipe: { length: 2.0, reflection: -0.3, dampingHz: 3200 },
    radiationHz: 32,
    gain: 1.05,
  },
  block: { cutoffHz: 180, gain: 0.5 },
  valves: { hz: [1500, 2700], q: 4, gain: 0.7 },
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 32,
    noiseHz: 480,
    noiseGain: 1.0,
    honkHz: 95,
    honkQ: 3,
    honkGain: 0.3,
  },
  fan: { hz: 600, gain: 0.12 },
  // Lifting off cuts the fuel: compression pulses only, no pops or throttle whistle.
  overrun: { fromRpm: 1400, misfire: 0.85, popChance: 0, popGain: 1, whistleHz: 2900, whistleGain: 0 },
  starter: {
    seconds: 1.15,
    rpm: 160,
    compressionDip: 0.45,
    meshPerCrankTurn: 120,
    toneHz: 780,
    brushHz: 2300,
    gain: 0.28,
  },
  catch: { seconds: 1.7, flareRpm: 1100, flareSeconds: 0.35, settleSeconds: 0.6 },
  whine: { teeth: [39, 31], second: 0.5, harmonic: 0.12, shaftAm: 0.3, wobble: 0.15, gain: 0.012 },
  knock: { hz: [950, 1750], q: 2.5, idle: 1, load: 0.3, gain: 4.5 },
  outputGain: 1,
};

/**
 * The LC79's 4.5 L 1VD-FTV twin-turbo diesel V8, tuned, on a 3 inch straight-through
 * exhaust. Cross-plane crank: each bank fires 90°, 180° and 270° apart, so each bank's
 * pipe burbles; the two turbos (one per bank) join in a Y-pipe and the far bank's gas
 * travels further to get there. Common-rail injection keeps the knock softer than the
 * old indirect-injection diesels'. The turbos whistle as they spool and whoosh when the
 * throttle shuts on boost.
 */
export const v8DieselSynthTuning: EngineSynthTuning = {
  idleRpm: 680,
  /** Matches the 1VD's 4100 rpm cut so the fuel-cut chop is heard while the physics limits. */
  limiterRpm: 4100,
  firingOrder: [1, 8, 7, 3, 6, 5, 4, 2],
  runners: {
    delayMs: [0.3, 1.9, 0.15, 1.75, 0.15, 1.75, 0.3, 1.9],
    strength: [0.97, 0.95, 1.02, 1.0, 1.03, 1.01, 0.98, 0.96],
  },
  pulse: { riseMs: [0.5, 0.25], decayMs: [2.1, 1.2], minRiseDeg: 2, minDecayDeg: 6, maxDecayDeg: 26 },
  turbulence: { idle: 0.3, load: 0.65 },
  pressure: { idle: 0.32, compression: 0.05 },
  manifoldSeconds: 0.09,
  jitter: { idle: 0.12, load: 0.035, timingDeg: 2.5, lopeRpm: 10 },
  exhaust: {
    soundSpeed: 500,
    headPipe: { length: 1.4, reflection: -0.3, dampingHz: 1900 },
    // Straight through: little muffling, so more of the pulse gets out, and a deep boom.
    muffler: { cutoffHz: 1150, q: 0.6, boomHz: 60, boomQ: 1.1, boomDb: 5.5, leak: 0.42 },
    tailPipe: { length: 2.9, reflection: -0.32, dampingHz: 3000 },
    radiationHz: 30,
    gain: 1.15,
  },
  block: { cutoffHz: 170, gain: 0.5 },
  valves: { hz: [1600, 2800], q: 4, gain: 0.55 },
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 34,
    noiseHz: 500,
    noiseGain: 0.9,
    honkHz: 100,
    honkQ: 3,
    honkGain: 0.2,
  },
  fan: { hz: 560, gain: 0.12 },
  // Lifting off cuts the fuel: compression pulses only, and the turbos spin down.
  overrun: { fromRpm: 1300, misfire: 0.85, popChance: 0, popGain: 1, whistleHz: 3300, whistleGain: 0.06 },
  starter: {
    seconds: 1.1,
    rpm: 170,
    compressionDip: 0.4,
    meshPerCrankTurn: 120,
    toneHz: 800,
    brushHz: 2300,
    gain: 0.27,
  },
  catch: { seconds: 1.8, flareRpm: 1250, flareSeconds: 0.3, settleSeconds: 0.6 },
  whine: { teeth: [39, 29], second: 0.55, harmonic: 0.12, shaftAm: 0.3, wobble: 0.15, gain: 0.012 },
  knock: { hz: [1150, 2100], q: 2.5, idle: 0.6, load: 0.2, gain: 2.6 },
  banks: {
    of: [0, 1, 0, 1, 0, 1, 0, 1],
    headPipe: [
      { length: 1.2, reflection: -0.3, dampingHz: 1900 },
      { length: 2.1, reflection: -0.3, dampingHz: 1700 },
    ],
    gain: [1, 0.82],
  },
  turbo: {
    fromRpm: 1100,
    spoolSeconds: 0.7,
    hz: [2600, 7400],
    gain: 0.035,
    hiss: 0.5,
    flutterHz: 15,
    flutterGain: 0.09,
  },
  /**
   * Diesel fuel-cut chop at the limiter: a steadier on-off than petrol, extra turbo dump
   * and a bit of mechanical strain. Pops stay rare and small — not petrol backfires.
   */
  limiter: {
    approach: 240,
    kind: 'fuel',
    pattern: [0, 0, 1, 1],
    bouncePop: 0.04,
    intake: 0.45,
    valves: 0.55,
    grit: 0.16,
    block: 0.14,
    overrunPop: 0.03,
    dump: 0.7,
  },
  outputGain: 0.85,
};

/**
 * A 6.2 L LS-style petrol V8 swapped into the LC79, with a long-duration cam, long-tube
 * headers and true twin 3 inch pipes. Cross-plane crank and the banks piped apart give
 * the classic burble; the cam makes the idle surge and chop, and lifting off at high
 * revs crackles.
 */
export const v8PetrolSynthTuning: EngineSynthTuning = {
  idleRpm: 860,
  limiterRpm: 6100,
  firingOrder: [1, 8, 7, 2, 6, 5, 4, 3],
  runners: {
    delayMs: [0.35, 1.45, 0.15, 1.25, 0.15, 1.25, 0.35, 1.45],
    strength: [0.98, 0.96, 1.02, 1.0, 1.03, 1.01, 0.99, 0.97],
  },
  pulse: { riseMs: [0.4, 0.17], decayMs: [1.5, 0.8], minRiseDeg: 2, minDecayDeg: 5, maxDecayDeg: 24 },
  turbulence: { idle: 0.3, load: 0.6 },
  pressure: { idle: 0.3, compression: 0.04 },
  manifoldSeconds: 0.05,
  jitter: { idle: 0.2, load: 0.035, timingDeg: 4, lopeRpm: 18 },
  exhaust: {
    soundSpeed: 510,
    headPipe: { length: 1.0, reflection: -0.4, dampingHz: 3200 },
    muffler: { cutoffHz: 1300, q: 0.6, boomHz: 82, boomQ: 1.2, boomDb: 4.5, leak: 0.4 },
    tailPipe: { length: 2.3, reflection: -0.32, dampingHz: 3600 },
    radiationHz: 36,
    gain: 1.1,
  },
  block: { cutoffHz: 160, gain: 0.4 },
  valves: { hz: [2500, 4100], q: 8, gain: 1.4 },
  intake: {
    openDeg: 380,
    riseDeg: 30,
    decayDeg: 26,
    noiseHz: 620,
    noiseGain: 1.6,
    honkHz: 118,
    honkQ: 4,
    honkGain: 0.55,
  },
  fan: { hz: 1000, gain: 0.18 },
  overrun: {
    fromRpm: 1800,
    misfire: 0.22,
    popChance: 0.07,
    popGain: 1.5,
    whistleHz: 2900,
    whistleGain: 0.1,
  },
  starter: {
    seconds: 0.8,
    rpm: 200,
    compressionDip: 0.32,
    meshPerCrankTurn: 105,
    toneHz: 950,
    brushHz: 2700,
    gain: 0.25,
  },
  catch: { seconds: 1.5, flareRpm: 1700, flareSeconds: 0.25, settleSeconds: 0.5 },
  whine: { teeth: [39, 29], second: 0.55, harmonic: 0.12, shaftAm: 0.3, wobble: 0.15, gain: 0.02 },
  banks: {
    of: [0, 1, 0, 1, 0, 1, 0, 1],
    headPipe: [
      { length: 1.0, reflection: -0.4, dampingHz: 3200 },
      { length: 1.6, reflection: -0.4, dampingHz: 2800 },
    ],
    gain: [1, 0.7],
  },
  cam: { lopeHz: 1.7, lopeRpm: 45, chop: 0.28, weak: 0.1 },
  outputGain: 0.85,
};

/**
 * The two-door Range Rover's 3.5 L Rover V8 on twin SU carburettors: the 40's petrol
 * tuning with eight cylinders in two banks, each bank's four pulses down its own head pipe
 * into a single system under the car, a softer, lower idle and a higher limiter.
 */
export const roverV8SynthTuning: EngineSynthTuning = {
  ...engineSynthTuning,
  idleRpm: 750,
  limiterRpm: 5200,
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
  runners: {
    delayMs: [0.35, 0.3, 0.1, 0.15, 0.1, 0.15, 0.35, 0.3],
    strength: [0.97, 0.98, 1.03, 1.02, 1.03, 1.02, 0.96, 0.97],
  },
  pulse: { riseMs: [0.4, 0.18], decayMs: [1.5, 0.85], minRiseDeg: 2, minDecayDeg: 5, maxDecayDeg: 20 },
  jitter: { idle: 0.08, load: 0.03, timingDeg: 2.5, lopeRpm: 10 },
  exhaust: {
    ...engineSynthTuning.exhaust,
    headPipe: { length: 1.1, reflection: -0.33, dampingHz: 2500 },
    muffler: { cutoffHz: 900, q: 0.6, boomHz: 75, boomQ: 1.2, boomDb: 4, leak: 0.2 },
    tailPipe: { length: 1.6, reflection: -0.3, dampingHz: 3400 },
  },
  block: { cutoffHz: 150, gain: 0.32 },
  valves: { hz: [2400, 4100], q: 8, gain: 1.8 },
  starter: { ...engineSynthTuning.starter, seconds: 1.0, rpm: 180 },
  catch: { seconds: 1.5, flareRpm: 1300, flareSeconds: 0.3, settleSeconds: 0.45 },
  whine: { teeth: [37, 29], second: 0.5, harmonic: 0.2, shaftAm: 0.3, wobble: 0.15, gain: 0.04 },
  banks: {
    of: [0, 1, 0, 1, 0, 1, 0, 1],
    headPipe: [
      { length: 1.1, reflection: -0.33, dampingHz: 2500 },
      { length: 1.3, reflection: -0.33, dampingHz: 2400 },
    ],
    gain: [1, 0.85],
  },
};

/**
 * The SR5 Xtra Cab's 2.4 L 22R-E: the Hilux's single-cam four with fuel injection. The idle
 * is steadier and the engine catches sooner on the starter; the air box hushes the intake
 * that honks through the 18R's carburettor; lifting off cuts the fuel, so it pops far less;
 * and the longer truck's exhaust sounds a little lower.
 */
export const efiFourSynthTuning: EngineSynthTuning = {
  ...petrolFourSynthTuning,
  limiterRpm: 5700,
  runners: { delayMs: [0.33, 0.14, 0.12, 0.31], strength: [0.99, 1.01, 1.02, 0.98] },
  jitter: { idle: 0.05, load: 0.025, timingDeg: 1.5, lopeRpm: 6 },
  exhaust: {
    ...petrolFourSynthTuning.exhaust,
    headPipe: { length: 1.5, reflection: -0.35, dampingHz: 2600 },
    muffler: { cutoffHz: 980, q: 0.6, boomHz: 94, boomQ: 1.3, boomDb: 3.5, leak: 0.22 },
    tailPipe: { length: 1.7, reflection: -0.3, dampingHz: 3500 },
    radiationHz: 39,
  },
  block: { cutoffHz: 170, gain: 0.34 },
  intake: { ...petrolFourSynthTuning.intake, noiseHz: 640, noiseGain: 0.95, honkHz: 135, honkGain: 0.22 },
  overrun: { ...petrolFourSynthTuning.overrun, misfire: 0.5, popChance: 0.006, popGain: 0.8 },
  starter: { ...petrolFourSynthTuning.starter, seconds: 0.8, rpm: 220 },
  catch: { seconds: 1.1, flareRpm: 1350, flareSeconds: 0.24, settleSeconds: 0.4 },
};

/** Engine sound for each vehicle. */
export const engineSynthTunings = {
  shortie: engineSynthTuning,
  forty: engineSynthTuning,
  ute40: engineSynthTuning,
  camel: dieselSynthTuning,
  perentie: dieselSynthTuning,
  hilux: petrolFourSynthTuning,
  unimog: dieselSixSynthTuning,
  troopy: troopyDieselSynthTuning,
  hj60: twoHSynthTuning,
  mq: sd33SynthTuning,
  patrol: td42SynthTuning,
  sooty80: {
    ...td42SynthTuning,
    turbo: v8DieselSynthTuning.turbo,
  },
  lc79: v8DieselSynthTuning,
  rangie: roverV8SynthTuning,
  xtracab: efiFourSynthTuning,
} as const;
