/**
 * Dev helper: close-ups of one vehicle in the studio page, for looking at a part added or moved
 * (reference/vehicles/README.md, "Close-ups of every part added or moved"). Each view is
 * name:x,y,z,lookX,lookY,lookZ[,fov] in the vehicle frame (x right, y up, z back).
 * Usage: npx vite-node scripts/studio-closeups.ts <outDir> <vehicleId> <url> name:x,y,z,tx,ty,tz,fov ...
 * Needs the dev server running; STUDIO_CHROMIUM points at a Chromium outside Playwright's cache.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, vehicle, url, ...views] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.STUDIO_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${url}scripts/studio/?vehicle=${vehicle}`);
await page.waitForFunction(() => window.studio?.ready === true, null, { timeout: 120_000 });
for (const view of views) {
  const [name, numbers] = view.split(':');
  const a = numbers.split(',').map(Number);
  await page.evaluate((a) => window.studio.view(a[0], a[1], a[2], a[3], a[4], a[5], a[6] ?? 40), a);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`saved ${name}`);
}
await browser.close();
