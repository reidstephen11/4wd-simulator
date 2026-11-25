/**
 * How the in-game HUD and the menus look (Settings). Each style draws the same readings:
 * `dash` is a small cluster of analog dials in one corner, `edge` thin scales along the
 * screen edges, and `kit` a field watch, a brass compass and notebook cards.
 */
export type HudStyle = 'dash' | 'edge' | 'kit';

export const hudStyles = ['dash', 'edge', 'kit'] as const;
export const defaultHudStyle: HudStyle = 'dash';
export const hudStyleLabels: Record<HudStyle, string> = {
  dash: 'Dash cluster',
  edge: 'Edge lines',
  kit: 'Field kit',
};

/** The styles that can be picked in Settings. */
export const pickableHudStyles: readonly HudStyle[] = hudStyles;

export function isHudStyle(v: unknown): v is HudStyle {
  return typeof v === 'string' && (pickableHudStyles as readonly string[]).includes(v);
}

/** Put the style on the page: the stylesheets key off `body[data-hud]` and `#ui[data-hud]`. */
export function applyHudStyle(style: HudStyle): void {
  if (typeof document === 'undefined') return;
  document.body.dataset.hud = style;
  document.getElementById('ui')?.setAttribute('data-hud', style);
}
