import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitEngine, waitSim } from './helpers';

test('drives Crawler Creek’s gate trail in the Camel Trophy 4WD', async ({ page }) => {
  // Loads the world on the software renderer and drives over a bridge.
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const drive = page.locator('[data-welcome-drive]');
  await expect(drive).toBeVisible();
  await page.getByRole('button', { name: /Crawler Creek/ }).click();
  await page.getByRole('button', { name: /Camel Trophy 4WD/ }).click();
  await shot(page, 'crawler-creek', 'welcome');
  await drive.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  await waitEngine(page);
  expect(await page.evaluate(() => window.__game!.mapId())).toBe('crawler-creek');
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('camel');
  expect(await page.evaluate(() => window.__game!.lastCampsite())).toBe('trailhead');
  // Starts at the Trailhead facing gate 1, with the section's hint showing.
  const v = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(v.x + 150, v.z - 158)).toBeLessThan(3);
  await expect(page.locator('.course-hint')).toContainText('Start Chute');
  await expect(page.locator('.gate-count')).toHaveText('Gate 1 / 52');
  await shot(page, 'crawler-creek', 'trailhead');

  // Roll over the creek bridge: the car stays up on the deck above the water.
  await page.evaluate(() => window.__game!.teleport(-134, -1.8, 9));
  await waitSim(page, 1);
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.35 }));
  // Over the water in the middle of the creek, the car is well above the creek bed.
  let lowest = Infinity,
    z = 0;
  for (let i = 0; i < 16 && z > -33; i++) {
    await waitSim(page, 0.75);
    const p = await page.evaluate(() => window.__game!.vehicle());
    z = p.z;
    if (p.z < -19 && p.z > -25)
      lowest = Math.min(lowest, p.y - (await page.evaluate((p) => window.__game!.heightAt(p.x, p.z), p)));
  }
  await page.evaluate(() => window.__game!.setInput({ throttle: 0, brake: 1 }));
  expect(z, 'across the bridge').toBeLessThan(-30);
  expect(lowest, 'height above the creek bed').toBeGreaterThan(1.2);
  // The bridge's gates were counted (the count starts at the first one driven through).
  await expect(page.locator('.gate-count')).toHaveText(/^Gate 1[2-4] \/ 52$/);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'crawler-creek', 'creek-bridge');

  for (const [name, cam] of [
    ['switchbacks', [-40, 62, 0, -42, 30, -110]],
    ['skinny-bridge', [179, 23, -150, 168, 19.3, -140]],
    ['ramp-bridge', [157, 23.5, 20, 145.8, 20.5, 28.4]],
    ['rock-garden', [126, 24, 74, 112, 19, 63]],
  ] as const) {
    await page.evaluate((c) => window.__game!.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), cam);
    await page.waitForTimeout(1500);
    await shot(page, 'crawler-creek', name);
  }
  await page.evaluate(() => window.__game!.useChaseCamera());

  // The paper map shows the trail, its bridges and the gate flags.
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(2500);
  await shot(page, 'crawler-creek', 'paper-map');
  await page.keyboard.press('KeyM');
  expect(errors).toEqual([]);
});
