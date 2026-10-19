import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

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

// Relative base so the build works under the GitHub Pages project URL
// (/4wd-simulator/) and from any other static host or sub-folder.
export default defineConfig({
  base: './',
  define: { __BUILD_LABEL__: JSON.stringify(buildLabel()) },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
