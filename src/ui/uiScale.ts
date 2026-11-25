/**
 * The interface scale (Settings → UI size). Every length in the stylesheets is a multiple of
 * `--u` (1px × `--ui`), so this one number sizes the whole interface: menus, HUD, cards,
 * prompts and the tool menu.
 *
 * Normal is 1 on a phone and on a window up to 1280×720 (the size the layouts were drawn
 * for). On a larger screen without touch it grows with the screen so it reads from a couch:
 * 1.875 at 1920×1080 (body text 13 px becomes 24 px, the ten-foot guidance at 1080p) and
 * twice that at 4K, the same apparent size. Small and Large take a step either side.
 */
import { defaultUiSize, type UiSize } from '../data/uiSize';

const STEP: Record<UiSize, number> = { small: 0.8, normal: 1, large: 1.2 };
/** A screen this many interface units tall or less is laid out as a short one. */
const SHORT_UNITS = 640;

/** The screen's own part of the scale: 1 on touch and up to 1280×720, 1.875 at 1080p, 3.75 at 4K. */
function screenScale(width: number, height: number, touch: boolean): number {
  if (touch) return 1;
  const r = Math.min(width / 1280, height / 720);
  return r <= 1 ? 1 : r <= 1.5 ? 1 + (r - 1) * 1.75 : r * 1.25;
}

/**
 * The scale for a screen (CSS px) and size. `touch`: a phone or tablet, held close, whose
 * layouts are already drawn for its size. Above 1280×720 a screen without touch grows to
 * 1.875 at 1.5× that (1080p), then in proportion (3.75 at 4K).
 */
export function uiScaleFor(
  width: number,
  height: number,
  touch: boolean,
  size: UiSize = defaultUiSize,
): number {
  return Math.round(screenScale(width, height, touch) * STEP[size] * 1000) / 1000;
}

/**
 * The dash cluster's scale: the interface scale, but on a big screen 0.8 of it, so the
 * binnacle stays in its corner, clear of the car (its lettering has a larger floor to match,
 * instruments.ts): 1.5 at 1080p, 3 at 4K.
 */
export function dashScaleFor(
  width: number,
  height: number,
  touch: boolean,
  size: UiSize = defaultUiSize,
): number {
  const base = screenScale(width, height, touch);
  const k = 1 - 0.2 * Math.min(1, Math.max(0, (base - 1) / 0.875));
  return Math.round(base * k * STEP[size] * 1000) / 1000;
}

let size: UiSize = defaultUiSize;
let current = 1;
const listeners = new Set<(scale: number) => void>();

const isTouch = () =>
  typeof window !== 'undefined' &&
  (new URLSearchParams(location.search).has('touch') ||
    (window.matchMedia?.('(pointer: coarse)').matches ?? false));

function apply(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const [w, h, touch] = [window.innerWidth, window.innerHeight, isTouch()];
  const next = uiScaleFor(w, h, touch, size);
  const root = document.documentElement;
  root.style.setProperty('--ui', String(next));
  root.style.setProperty('--ui-dash', String(dashScaleFor(w, h, touch, size)));
  root.dataset.uiSize = size;
  // A screen without touch that is short once everything is drawn at this scale (576 units
  // at 1080p): the stylesheets lay the pause pages out for it, as they do for a short window.
  root.toggleAttribute('data-short', !touch && h / next <= SHORT_UNITS);
  if (next === current) return;
  current = next;
  for (const l of listeners) l(next);
}

let watching = false;

/** Set the size from Settings and keep the scale matched to the window. */
export function applyUiSize(s: UiSize): void {
  size = s;
  if (!watching && typeof window !== 'undefined') {
    watching = true;
    window.addEventListener('resize', apply);
  }
  apply();
}

/** The scale now (1 = the layouts as drawn). */
export const uiScale = (): number => current;

/** Run `fn` whenever the scale changes; returns a function that stops it. */
export function onUiScale(fn: (scale: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
