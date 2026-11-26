/** Graphics quality presets (SPEC §9 settings). */
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  shadows: boolean;
  shadowMapSize: number;
  /** Half-size of the area around the vehicle that receives sharp shadows (m). */
  shadowExtent: number;
  /** Camera far plane / how far terrain is drawn (m). */
  drawDistance: number;
  /** Distances where terrain switches to the next coarser detail level. */
  terrainLod: readonly [number, number, number];
  /** Fraction of decorative vegetation (grass, shrubs) drawn. Trees with colliders are always drawn. */
  vegetationDensity: number;
  /** Distance trees switch to their low-detail model. */
  treeLodDistance: number;
  /** Distance trees switch to their very simple distant model. */
  treeFarDistance: number;
  /** Distance beyond which grass and shrubs are hidden. */
  grassDistance: number;
  /** Multiplier on particle emission rates (dust, mud, splashes). */
  particles: number;
  /** Max device pixel ratio. */
  pixelRatio: number;
  /** Lowest share of that resolution drawn while the graphics can't keep up (1: never lower). */
  minRenderScale: number;
  antialias: boolean;
}

export const qualityPresets: Record<QualityLevel, QualityPreset> = {
  low: {
    shadows: true,
    // Shadows are soft (radius 3), so 512 looks the same as 1024 here, and drawing the
    // forest into the shadow map was a quarter of a phone's frame under the trees.
    shadowMapSize: 512,
    shadowExtent: 40,
    drawDistance: 1800,
    terrainLod: [64, 160, 360],
    vegetationDensity: 0.45,
    treeLodDistance: 110,
    treeFarDistance: 380,
    grassDistance: 70,
    particles: 0.45,
    pixelRatio: 1,
    minRenderScale: 0.7,
    antialias: false,
  },
  medium: {
    shadows: true,
    shadowMapSize: 2048,
    shadowExtent: 55,
    drawDistance: 2800,
    terrainLod: [96, 230, 520],
    vegetationDensity: 0.75,
    treeLodDistance: 170,
    treeFarDistance: 520,
    grassDistance: 100,
    particles: 1,
    pixelRatio: 1.5,
    minRenderScale: 0.8,
    antialias: true,
  },
  high: {
    shadows: true,
    shadowMapSize: 4096,
    shadowExtent: 55,
    drawDistance: 3600,
    terrainLod: [128, 320, 700],
    vegetationDensity: 1,
    treeLodDistance: 260,
    treeFarDistance: 800,
    grassDistance: 140,
    particles: 1.35,
    pixelRatio: 2,
    // A phone on High (a Pixel 10a draws 2.6 pixels per point) needs room to come down.
    minRenderScale: 0.6,
    antialias: true,
  },
};

export const defaultQuality: QualityLevel = 'medium';

/** The settings in the order the menus offer them. */
export const qualityLevels: readonly QualityLevel[] = ['low', 'medium', 'high'];

/**
 * The highest setting a phone or tablet is given. Over the Cape stopped phones at Medium: a
 * Pixel 10a on High fell to 20–39 fps under its Bloomfield forest. On this game's small, open
 * levels the owner's phone held 60 fps on High at its screen's full resolution at all three
 * places of the headroom test (`?bench`, v0.23), so phones are offered High too (v0.24). A
 * level thick enough to need the limit again lowers it here.
 */
export const phoneMaxQuality: QualityLevel = 'high';

/** The setting as this device plays it: a phone saved above `phoneMaxQuality` plays, and shows, that. */
export function shownQuality(level: QualityLevel, touch: boolean): QualityLevel {
  const max = qualityLevels.indexOf(phoneMaxQuality);
  return touch && qualityLevels.indexOf(level) > max ? phoneMaxQuality : level;
}

/** The settings a device's Graphics row offers: a phone's stop at `phoneMaxQuality`. */
export function offeredQualities(touch: boolean): readonly QualityLevel[] {
  return touch ? qualityLevels.slice(0, qualityLevels.indexOf(phoneMaxQuality) + 1) : qualityLevels;
}

/** The preset as drawn on this device (see `phoneMaxQuality`). */
export function qualityFor(level: QualityLevel, touch: boolean): QualityPreset {
  return qualityPresets[shownQuality(level, touch)];
}
