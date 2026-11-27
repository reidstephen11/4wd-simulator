declare const __BUILD_LABEL__: string | undefined;

/** Shown on the loading screen and pause menu. Add 0.01 with every update merged into main. */
export const GAME_VERSION = 'v0.29';

/** Commit and build time stamped in by Vite; 'dev' where nothing defines it (unit tests). */
export const BUILD_LABEL = typeof __BUILD_LABEL__ === 'string' ? __BUILD_LABEL__ : 'dev';

/**
 * The headset's own address (v2.02): `?vr`, which `/vr` leads to. The ordinary game never
 * offers a headset, so nothing for one sits on its screen.
 */
export const VR_PAGE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('vr');
