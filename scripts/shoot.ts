/**
 * Dev helper: open the game in headless Chromium, run steps, save screenshots.
 * Usage: npx vite-node scripts/shoot.ts <outDir> <url> step...
 * Steps:
 *   shot:<name>                 screenshot
 *   cam:x,y,z,tx,ty,tz          free camera
 *   chase                       chase camera
 *   tp:<poiId> | tpxz:x,z,h     teleport vehicle
 *   input:<json>                scripted input ({} clears)
 *   wait:<ms>
 *   log                         print vehicle state
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, url, ...steps] = process.argv.slice(2);
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
for (const s of steps) {
  const i = s.indexOf(':');
  const cmd = i < 0 ? s : s.slice(0, i);
  const arg = i < 0 ? '' : s.slice(i + 1);
  if (cmd === 'shot') {
    await page.screenshot({ path: `${outDir}/${arg}.png` });
    console.log(`saved ${arg}`);
  } else if (cmd === 'cam') {
    const c = arg.split(',').map(Number);
    await page.evaluate((c) => window.__game?.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), c);
  } else if (cmd === 'chase') await page.evaluate(() => window.__game?.useChaseCamera());
  else if (cmd === 'tp') await page.evaluate((id) => window.__game?.teleportPoi(id), arg);
  else if (cmd === 'tpxz') {
    const c = arg.split(',').map(Number);
    await page.evaluate((c) => window.__game?.teleport(c[0], c[1], c[2]), c);
  } else if (cmd === 'input') {
    const inp = JSON.parse(arg);
    await page.evaluate((inp) => window.__game?.setInput(Object.keys(inp).length ? inp : null), inp);
  } else if (cmd === 'wait') await page.waitForTimeout(Number(arg));
  else if (cmd === 'log') console.log(JSON.stringify(await page.evaluate(() => window.__game?.vehicle())));
}
const stats = await page.evaluate(() => window.__game?.stats());
console.log('stats', JSON.stringify(stats));
console.log(errors.length ? errors.join('\n') : 'no console errors/warnings');
await browser.close();
