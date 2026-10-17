/** Colour tokens (SPEC §4). All world colours derive from these. */
export const palette = {
  dirtTrack: '#A87450',
  dirtDark: '#79533B',
  grassDry: '#B6A367',
  grassSage: '#8C9A6B',
  foliage: '#7E8F6A',
  foliageDark: '#48634F',
  barkPale: '#D8D0C0',
  barkOchre: '#C58B5C',
  rock: '#9A948A',
  rockDark: '#6F6A63',
  mud: '#6B4A33',
  waterDeep: '#3D686A',
  waterShallow: '#799A8F',
  vehicleBody: '#D9C6A0',
  vehicleRoof: '#EDE8DC',
  vehicleTrim: '#3A3A38',
} as const;

export type PaletteToken = keyof typeof palette;

/** Per-vertex / per-instance variation (SPEC §4: ±4% brightness, small hue shift). */
export const colourVariation = {
  brightness: 0.04,
  hue: 0.012,
};

/** UI paper-and-ink tones (SPEC §9). */
export const uiPalette = {
  paper: '#F3EBDA',
  paperDark: '#E4D6BA',
  ink: '#3B2A1E',
  inkSoft: '#6B5442',
  accent: '#B5653A',
  water: '#5E8E98',
} as const;
