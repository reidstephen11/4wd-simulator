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
  antialias: boolean;
}

export const qualityPresets: Record<QualityLevel, QualityPreset> = {
  low: {
    shadows: true,
    shadowMapSize: 1024,
    shadowExtent: 40,
    drawDistance: 1800,
    terrainLod: [64, 160, 360],
    vegetationDensity: 0.45,
    treeLodDistance: 110,
    treeFarDistance: 380,
    grassDistance: 70,
    particles: 0.45,
    pixelRatio: 1,
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
    antialias: true,
  },
};

export const defaultQuality: QualityLevel = 'medium';
