/**
 * Dev helper: open the game in headless Chromium and save screenshots.
 * Usage: npx vite-node scripts/shoot.ts <outDir> <url> [name:x,y,z,tx,ty,tz ...]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, url, ...shots] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
console.log(`ready after ${Date.now() - t0} ms`);
for (const s of shots) {
  const [name, coords] = s.split(':');
  if (coords) {
    const c = coords.split(',').map(Number);
    await page.evaluate((c) => window.__game?.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), c);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`saved ${name}`);
}
const stats = await page.evaluate(() => window.__game?.stats());
console.log('stats', stats);
console.log(errors.length ? errors.join('\n') : 'no console errors/warnings');
await browser.close();
