import * as THREE from 'three';
import { colourVariation, palette, type PaletteToken } from '../data/palette';

const cache = new Map<string, THREE.Color>();

/** Palette colour as a linear-space THREE.Color (cached; do not mutate). */
export function pal(token: PaletteToken): THREE.Color {
  let c = cache.get(token);
  if (!c) {
    c = new THREE.Color(palette[token]);
    cache.set(token, c);
  }
  return c;
}

/** Hex string to a new linear-space colour. */
export function hexColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

const hsl = { h: 0, s: 0, l: 0 };

/** Apply the SPEC §4 per-vertex variation (±4% brightness, small hue shift) using a 0..1 random pair. */
export function varyColor(c: THREE.Color, r1: number, r2: number, out: THREE.Color): THREE.Color {
  out.copy(c);
  out.getHSL(hsl);
  out.setHSL(hsl.h + (r2 - 0.5) * 2 * colourVariation.hue, hsl.s, hsl.l);
  out.multiplyScalar(1 + (r1 - 0.5) * 2 * colourVariation.brightness);
  return out;
}

/** Mix of two palette colours. */
export function mixPal(a: PaletteToken, b: PaletteToken, t: number): THREE.Color {
  return pal(a).clone().lerp(pal(b), t);
}
