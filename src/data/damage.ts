/**
 * Mechanical damage (SPEC §11), chosen in the settings:
 * - off: no mechanical damage (the body still dents and gets dirty);
 * - mild: damage slows you down but never strands you;
 * - realistic: a tyre can go flat and the engine can fail.
 */
export type DamageMode = 'off' | 'mild' | 'realistic';

export const damageModes: readonly DamageMode[] = ['off', 'mild', 'realistic'];

export const damageLabels: Record<DamageMode, string> = {
  off: 'Off',
  mild: 'Mild',
  realistic: 'Realistic',
};

export const isDamageMode = (x: unknown): x is DamageMode => damageModes.includes(x as DamageMode);

/** Health ranges from 1 (as new) to 0 (flat tyre, collapsed corner, dead engine). */
export const damageTuning = {
  tyre: {
    /**
     * A tyre landing on rock with its corner of the body falling faster than this (m/s)
     * is cut and starts to go down: a drop of about a metre. Crawling up, over and down
     * the trails' rocks stays below it (at most 3.6 m/s, measured with both vehicles).
     */
    punctureSpeed: 4.4,
    /** Seconds from a cut to fully down. */
    deflateSeconds: { mild: 14, realistic: 6 },
    /** How far down a cut tyre goes. */
    floor: { mild: 0.5, realistic: 0 },
    /** A flat tyre (health 0): its rolling radius drops this much (m). */
    flatDrop: 0.075,
    /** ...and it drags: rolling resistance per newton of load. */
    flatDrag: 0.15,
  },
  suspension: {
    /** Landing with a corner falling faster than this (m/s), about a 1.6 m drop, bends it. */
    bendSpeed: 5.6,
    /** Health lost per m/s above it. */
    perSpeed: 0.22,
    floor: { mild: 0.6, realistic: 0.15 },
    /** A bent front corner pulls the steering towards its side (degrees at health 0). */
    toeDeg: 4,
  },
  engine: {
    /**
     * A chassis knock harder than this (impulse, N·s) cracks the sump or bends the steering
     * arms. Belly scrapes on the trails and park lines reach about 4400; a 50 km/h crash
     * into a wall about 20000.
     */
    knockImpulse: 8000,
    perImpulse: 0.00004,
    /** A crash: the body's speed changed by more than this in one step (m/s) on the nose. */
    crashSpeed: 6,
    perSpeed: 0.09,
    /** Running upside down starves the engine of oil: health lost per second. */
    invertedPerSecond: 0.06,
    /** In realistic mode, water drawn in through the intake bends a rod: health lost per flooding stall. */
    floodStall: 0.35,
    floor: { mild: 0.5, realistic: 0 },
  },
  /** Field repairs from the tool menu: seconds stopped while you work. */
  repair: { fieldSeconds: 6, spareSeconds: 8 },
  /** Below this health a part counts as damaged on the HUD. */
  shown: 0.97,
};
