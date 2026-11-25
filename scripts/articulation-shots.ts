/** Standard studio views and diagonal-block close-ups for the live-axle checks. */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { vehicles } from '../src/data/vehicles';

const [out = '/workspace/scratch/solid-axle-renders', url = 'http://localhost:5173/'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.STUDIO_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const views: Record<string, number[]> = {
  'front-left': [-4.2, 1.6, -5.2],
  'rear-right': [4.4, 2, 5.4],
  side: [-7, 0.9, 0],
  front: [0, 0.9, -7.5],
  rear: [0, 1.2, 7.5],
  top: [-3, 6, 3],
  'wheel-front': [-2.3, 0.3, -2.4, -0.7, -0.1, -1.4, 35],
};
try {
  for (const { tuning } of Object.values(vehicles)) {
    if (process.argv[4] && !process.argv[4].split(',').includes(tuning.id)) continue;
    const dir = `${out}/${tuning.id}`;
    mkdirSync(dir, { recursive: true });
    await page.goto(`${url}scripts/studio/?vehicle=${tuning.id}`);
    await page.waitForFunction(() => window.studio?.ready, null, { timeout: 120_000 });
    for (const [name, [x, y, z, tx = 0, ty = 0.3, tz = 0, fov = 45]] of Object.entries(views)) {
      await page.evaluate(
        (a) => window.studio.view(a[0], a[1], a[2], a[3], a[4], a[5], a[6]),
        [x, y, z, tx, ty, tz, fov],
      );
      await page.screenshot({ path: `${dir}/${name}.png` });
    }
    await page.evaluate(() => window.studio.cockpit());
    await page.screenshot({ path: `${dir}/cockpit.png` });
    const canArticulate = await page.evaluate(() => typeof window.studio.articulate === 'function');
    if (canArticulate) {
      await page.evaluate(() => window.studio.articulate(0.28, 0.4));
      const frontZ = tuning.wheels[0].z,
        rearZ = tuning.wheels[2].z;
      const closeups: Record<string, number[]> = {
        'flex-front': [-2.8, 0.05, frontZ - 2.7, 0, -0.08, frontZ, 36],
        'flex-rear': [2.8, 0.05, rearZ + 2.7, 0, -0.08, rearZ, 36],
        'flex-under': [3.8, -0.28, 0, 0, -0.06, 0, 55],
      };
      for (const [name, a] of Object.entries(closeups)) {
        await page.evaluate((a) => window.studio.view(a[0], a[1], a[2], a[3], a[4], a[5], a[6]), a);
        await page.screenshot({ path: `${dir}/${name}.png` });
      }
    }
    console.log(`saved ${tuning.id}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
