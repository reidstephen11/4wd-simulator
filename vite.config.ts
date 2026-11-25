import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, type Plugin } from 'vite';

/** GitHub Pages project path. Vite assets stay relative (`base: './'`); the PWA uses this. */
const PAGES_BASE = '/4wd-simulator/';
const THEME_COLOR = '#54614B';
const BACKGROUND_COLOR = '#D8D0C0';

// Short commit and UTC build time, shown when hovering the version number
// so a tester can tell exactly which build GitHub Pages is serving.
function buildLabel(): string {
  let commit = process.env.GITHUB_SHA?.slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      commit = 'local';
    }
  }
  const time = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `${commit} · ${time} UTC`;
}

/** The plugin appends the manifest after Workbox transforms, so it misses the Pages prefix. */
function dropUnprefixedManifestEntry(): Plugin {
  return {
    name: 'pwa-drop-unprefixed-manifest',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const swPath = resolve('dist/sw.js');
        if (!existsSync(swPath)) return;
        const source = readFileSync(swPath, 'utf8');
        const next = source.replace(/,\{url:"manifest\.webmanifest",revision:"[a-f0-9]+"\}/g, '');
        if (next !== source) writeFileSync(swPath, next);
      },
    },
  };
}

/**
 * Rapier's compat package inlines its 3 MB WebAssembly as 4.1 MB of base64 inside the game's
 * script, which the browser must download, parse and decode before it can compile any of it.
 * The same package also ships the binary itself, and its init accepts a URL (fetched and
 * compiled while it streams). For the browser build only, swap the inlined bytes for the
 * file's URL, so Vite emits the .wasm as its own asset. Node (unit tests, scripts) keeps the
 * package as it is (v1.46).
 */
function rapierWasmAsFile(): Plugin {
  const inlined = /[A-Za-z_$][\w$]*\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]*"\)\.buffer/;
  return {
    name: 'rapier-wasm-as-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/@dimforge[\\/]rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id)) return null;
      const next = code.replace(inlined, '__rapierWasmUrl');
      // A new Rapier that loads differently must not ship the base64 again unnoticed.
      if (next === code) this.error("Rapier's inlined WebAssembly was not found: check rapierWasmAsFile()");
      return { code: `import __rapierWasmUrl from './rapier_wasm3d_bg.wasm?url';\n${next}`, map: null };
    },
  };
}

// Relative base so the build works under the GitHub Pages project URL
// (/4wd-simulator/) and from any other static host or sub-folder.
export default defineConfig({
  base: './',
  define: { __BUILD_LABEL__: JSON.stringify(buildLabel()) },
  plugins: [
    rapierWasmAsFile(),
    VitePWA({
      // 'prompt': a new build waits until main.ts installs it (title screen or pause menu),
      // instead of reloading the page while someone is driving (v1.23).
      registerType: 'prompt',
      // Register from main.ts so local preview / e2e (served at /) do not 404 /4wd-simulator/sw.js.
      injectRegister: false,
      base: PAGES_BASE,
      scope: PAGES_BASE,
      // globPatterns already picks up public icons; extra includes were stored without the Pages prefix.
      includeManifestIcons: false,
      manifest: {
        id: PAGES_BASE,
        name: '4WD Simulator',
        short_name: '4WD Sim',
        description:
          'A single-player 4WD playground for the browser: climbs, crossings, bog holes and rock, with no route to follow.',
        start_url: PAGES_BASE,
        scope: PAGES_BASE,
        display: 'standalone',
        lang: 'en',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          {
            src: `${PAGES_BASE}pwa-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${PAGES_BASE}pwa-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${PAGES_BASE}pwa-512x512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // wasm: Rapier's physics engine, a file of its own since v1.46 (about 3 MB, under the limit below).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,webmanifest,wasm}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: `${PAGES_BASE}index.html`,
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Vite already hashes files under assets/; a Workbox query string can break large ones.
        dontCacheBustURLsMatching: /\/assets\//,
        // Vite's relative base would leave these as "index.html"; Android and navigateFallback need the Pages path.
        modifyURLPrefix: { '': PAGES_BASE },
        manifestTransforms: [
          async (entries) => ({
            manifest: entries.map((entry) => ({
              ...entry,
              url: entry.url.startsWith(PAGES_BASE)
                ? entry.url
                : `${PAGES_BASE}${entry.url.replace(/^\.?\//, '')}`,
            })),
          }),
        ],
      },
    }),
    dropUnprefixedManifestEntry(),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
