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
     * is cut and starts to go down: a drop of about 1.3 m. Crawling up, over and down
     * the trails' rocks stays well below it (at most 3.6 m/s, measured with both vehicles).
     */
    punctureSpeed: 5,
    /**
     * Tyres let down: grip times this, and a soft tyre gives over a rock or a hole edge
     * instead of being cut, so landings and hole strikes need this much more to cut it.
     */
    lowPressureGrip: 1.15,
    lowPressureCut: 1.2,
    /** Landing harder than this (m/s), about a 1.9 m drop, tears the sidewall instead. */
    sidewallSpeed: 6,
    /**
     * Seconds from a cut to fully down: mild damage's soft tyre, a realistic puncture's
     * slow leak, a torn sidewall, or a tyre rolled off its rim (all at once).
     */
    deflateSeconds: { mild: 14, puncture: 40, sidewall: 5, rim: 1 },
    /**
     * Spinning a wheel hard on rock wears through the tread: this many seconds of full
     * spin (less spin counts for less) punctures the tyre. Crawling in low range barely spins.
     */
    abrasionSeconds: 6,
    /** Spin (0..1) below this on rock does no harm. */
    abrasionSpin: 0.45,
    /**
     * A wheel dropping into a pothole or washout pinches the tyre (a puncture) when the
     * strike (the vehicle's speed in m/s times the hole's depth in m, give or take a
     * quarter) is over this. Hit squarely, a 25 cm pothole pinches from 46 km/h and a 30 cm
     * washout from 38; glancing, from 77 and 64.
     */
    strike: 4,
    /**
     * A sharp stone can puncture a tyre at any pace, by chance: about this many punctures
     * per kilometre one tyre rolls at 20 km/h on each surface (none on soft ground or the
     * concrete strips). Slower is a little safer (half the chance at a walk), faster a lot
     * worse (twice at 45 km/h). With four tyres, a run up the CREB at normal pressure
     * picks one up about one time in three.
     */
    sharpRockPerKm: { rock: 0.25, gravel: 0.05, firm: 0.015 },
    /** Let down, a tyre wraps round a sharp rock instead of being pierced: chance times this. */
    sharpRockLowPressure: 0.35,
    /**
     * Let down, a tyre can roll off its rim in a hard corner. Past this sideways
     * acceleration (m/s², about 0.43 g; the tyres let go near 4.7 on flat dirt, and a
     * moderate corner stays under 4) the heavier-loaded tyre of each axle (the outside
     * one) may come off...
     */
    rimRollAccel: 4.2,
    /** ...with this chance per second for each m/s² over it. */
    rimRollPerSecond: 0.5,
    /** How far down a cut tyre goes. */
    floor: { mild: 0.5, realistic: 0 },
    /** A flat tyre (health 0): its rolling radius drops this much (m), leaving the rim a few centimetres off the ground. */
    flatDrop: 0.12,
    /** ...rising and falling this much (m) once a turn as the folded tyre flaps round, which shakes the car at speed... */
    flatThump: 0.02,
    /** ...it drags: rolling resistance per newton of load... */
    flatDrag: 0.3,
    /** ...its sidewall folds under a sideways load, keeping only 1 − this of its cornering grip... */
    flatSideLoss: 0.6,
    /** ...and a flat front tyre drags the steering towards its side (degrees). */
    flatToeDeg: 1.5,
  },
  suspension: {
    /** Landing with a corner falling faster than this (m/s), about a 1.6 m drop, bends it. */
    bendSpeed: 5.6,
    /** Health lost per m/s above it. */
    perSpeed: 0.22,
    floor: { mild: 0.6, realistic: 0.15 },
    /** Hitting a hole harder still (a strike, as for tyres: 25 cm squarely at 55 km/h) bends that corner... */
    strike: 4.8,
    /** ...losing this much health. */
    strikeLoss: 0.15,
    /** A bent front corner pulls the steering towards its side (degrees at health 0). */
    toeDeg: 4,
  },
  engine: {
    /**
     * Engine heat (src/sim/vehicle/damage.ts). Load is the pedal × (a quarter plus three
     * quarters of the rev share), times `lowRangeHeat` in low range, times extra `bogHeat`
     * when the wheels are spinning at high revs with little ground speed. Airflow subtracts
     * `airflowCool` per m/s; water subtracts up to `waterCool` (full at `waterFull` metres
     * at the tyres, plus `submergedCool` if the intake is under). It climbs over
     * `heatSeconds` and cools over `coolSeconds` (faster in water). Bogged in low range
     * warns in about half a minute; the same revs while moving take about a minute; a
     * gentle crawl and high-range driving stay under the warning.
     */
    heatGain: 0.85,
    lowRangeHeat: 1.3,
    airflowCool: 0.035,
    bogHeat: 0.85,
    /** Below this speed (m/s), spinning wheels count as bogged. */
    bogSpeed: 2.5,
    waterCool: 0.9,
    waterFull: 0.5,
    submergedCool: 0.35,
    heatSeconds: 150,
    coolSeconds: 200,
    /** Share of `coolSeconds` dropped when fully wet (0.45 → cooling about twice as fast). */
    waterCoolFactor: 0.45,
    /** Heat stops rising here (the dial's end stop is 1.2). */
    maxHeat: 1.3,
    /** Above full heat the engine loses power, down to this share at `maxHeat`. */
    hotPower: 0.75,
    /** Above full heat the engine loses this much health per second, and warns at `heatWarn`. */
    overheatPerSecond: 0.01,
    heatWarn: 0.85,
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
  /** Roadside jobs from the tool menu: seconds stopped while you work. */
  /** Pumping all four tyres back up takes a minute: about 4½ minutes on the CREB's clock. */
  repair: { fieldSeconds: 6, spareSeconds: 8, plugSeconds: 10, refuelSeconds: 12, pumpSeconds: 60 },
  /** Fuel in one jerry can (L). */
  jerryCanLitres: 20,
  /** Below this health a part counts as damaged on the HUD. */
  shown: 0.97,
};
