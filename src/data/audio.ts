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

  engine: {
    /** Firing frequency = rpm / 60 × cylinders / 2 (four-stroke). */
    cylinders: 4,
    /** Relative strength of each harmonic of the firing frequency. */
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
    },
    splashGain: 0.5,
  },

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
