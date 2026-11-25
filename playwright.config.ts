import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // A container whose preinstalled Chromium is not the build this Playwright expects can
      // point at it (CHROMIUM_PATH=/opt/pw-browsers/chromium), as scripts/studio-shots.ts does.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    // vite build alone: the full type check is `npm run typecheck`, not something to repeat
    // before every browser run (v1.44).
    command: 'npx vite build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
