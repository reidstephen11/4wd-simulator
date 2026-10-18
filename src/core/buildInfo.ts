declare const __BUILD_LABEL__: string | undefined;

/** Commit and build time stamped in by Vite; 'dev' where nothing defines it (unit tests). */
export const BUILD_LABEL = typeof __BUILD_LABEL__ === 'string' ? __BUILD_LABEL__ : 'dev';
