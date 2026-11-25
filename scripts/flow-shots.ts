/**
 * Dev helper: pictures of the screens a player passes on the way into a drive (title, main
 * menu, the new-drive page, the briefing, the first frame, the pause menu), on a chosen
 * graphics preset. Usage: npx vite-node scripts/flow-shots.ts <outDir> [url] [quality=high]
 * PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir, url = 'http://localhost:5173/', quality = 'high'] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: flow-shots.ts <outDir> [url] [quality]');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript((q) => {
  if (!localStorage.getItem('4wdsim.save.v2'))
    localStorage.setItem('4wdsim.save.v2', JSON.stringify({ version: 1, settings: { quality: q } }));
}, quality);
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name: string) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`saved ${name}`);
};
await page.goto(url);
await page.locator('.welcome').waitFor({ state: 'visible' });
await page.waitForTimeout(800);
await shot('1-title');
await page.locator('[data-title-begin]').click();
await page.waitForTimeout(400);
await shot('2-menu');
await page.locator('[data-title-journey]').click();
await page.waitForTimeout(400);
await shot('3-new-drive');
await page.locator('[data-welcome-drive]').click();
await page.locator('[data-briefing-drive]:not(.hidden)').waitFor({ timeout: 300_000 });
await shot('4-briefing');
await page.locator('[data-briefing-details]').click();
await page.waitForTimeout(300);
await shot('5-briefing-details');
await page.locator('[data-briefing-drive]').click();
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
await page.waitForTimeout(2500);
await shot('6-drive');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await shot('7-pause');
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
