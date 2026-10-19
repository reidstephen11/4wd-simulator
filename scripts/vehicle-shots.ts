/**
 * Dev helper: photograph a vehicle from all round in headless Chromium.
 * Usage: npx vite-node scripts/vehicle-shots.ts <outDir> <vehicleId> [url]
 * Needs the dev server running (npm run dev).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, vehicleId, url = 'http://localhost:5173/'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && console.log(`[error] ${m.text()}`));
await page.goto(url);
await page.waitForSelector('[data-welcome-drive]', { timeout: 120_000 });
await page.click('[data-welcome-drive]');
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 180_000 });
await page.evaluate((id) => window.__game!.setVehicle(id as never), vehicleId);
await page.waitForFunction(() => window.__game!.vehicle().engineRunning, null, { timeout: 300_000 });
await page.waitForTimeout(1500);
const v = await page.evaluate(() => window.__game!.vehicle());
const h = (v.heading * Math.PI) / 180;
// Vehicle frame: forward along the heading (0 = north = -z).
const fx = Math.sin(h),
  fz = -Math.cos(h);
const rx = -fz,
  rz = fx;
const views: Record<string, [number, number, number]> = {
  'front-left': [5.2, -3.2, 1.9],
  'rear-right': [-5.2, 3.4, 2.2],
  side: [0, -6.5, 1.3],
  'side-right': [0, 6.5, 1.3],
  front: [6.5, 0, 1.5],
  top: [2.5, -2.5, 5.5],
};
for (const [name, [f, r, up]] of Object.entries(views)) {
  const x = v.x + fx * f + rx * r,
    z = v.z + fz * f + rz * r;
  await page.evaluate(
    ([x, y, z, tx, ty, tz]) => window.__game!.setCamera(x, y, z, tx, ty, tz),
    [x, v.y + up, z, v.x, v.y + 0.5, v.z],
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`saved ${name}`);
}
await page.evaluate(() => window.__game!.useChaseCamera());
await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/cockpit.png` });
console.log('saved cockpit');
await browser.close();
