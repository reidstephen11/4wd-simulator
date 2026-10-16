import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages project URL
// (/4wd-simulator/) and from any other static host or sub-folder.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
