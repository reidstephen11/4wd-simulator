/**
 * Dev helper: photograph one vehicle from all round in the studio page (no map), in
 * headless Chromium. Usage: npx vite-node scripts/studio-shots.ts <outDir> <vehicleId> [url]
 * Needs the dev server running (npm run dev). `trailer:no5` (or `trailer:box6x4`) photographs
 * that trailer on its own; `perentie+no5` the trailer hitched behind the vehicle.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, vehicleId, url = 'http://localhost:5173/'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  // A Chromium outside Playwright's cache (a container's preinstalled one, say).
  executablePath: process.env.STUDIO_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[error] ${m.text()}`));
const [vehicle, trailer] = vehicleId.startsWith('trailer:')
  ? [null, vehicleId.slice(8)]
  : vehicleId.split('+');
const query = [vehicle && `vehicle=${vehicle}`, trailer && `trailer=${trailer}`].filter(Boolean).join('&');
await page.goto(`${url}scripts/studio/?${query}`);
await page.waitForFunction(() => window.studio?.ready === true, null, { timeout: 120_000 });
// Camera position and look-at point in the vehicle frame (x right, y up, z back).
const views: Record<string, number[]> = {
  'front-left': [-4.2, 1.6, -5.2],
  'rear-right': [4.4, 2.0, 5.4],
  side: [-7, 0.9, 0],
  front: [0, 0.9, -7.5],
  rear: [0, 1.2, 7.5],
  top: [-3, 6, 3],
  'wheel-front': [-2.3, 0.3, -2.4, -0.7, -0.1, -1.4, 35],
};
for (const [name, [x, y, z, tx = 0, ty = 0.3, tz = 0, fov = 45]] of Object.entries(views)) {
  await page.evaluate(
    (a) => window.studio.view(a[0], a[1], a[2], a[3], a[4], a[5], a[6]),
    [x, y, z, tx, ty, tz, fov],
  );
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`saved ${name}`);
}
if (vehicle) {
  await page.evaluate(() => window.studio.cockpit());
  await page.screenshot({ path: `${outDir}/cockpit.png` });
  console.log('saved cockpit');
}
await browser.close();
