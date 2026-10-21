import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitReady } from './helpers';

test('M3: every POI exists, with a screenshot of each', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await waitReady(page);
  const pois = await page.evaluate(() => window.__game!.pois());
  expect(pois.length).toBe(25);
  for (const p of pois) {
    await page.evaluate((id) => window.__game!.showPoi(id), p.id);
    await page.waitForTimeout(2500);
    await shot(page, 'M3', p.id);
  }
  // Chase view in the forest with the final vehicle model.
  await page.evaluate(() => window.__game!.teleport(-300, 110, 230));
  await page.evaluate(() => window.__game!.useChaseCamera());
  await page.waitForTimeout(2000);
  await shot(page, 'M3', 'vehicle-in-the-valley');
  expect(errors).toEqual([]);
});
