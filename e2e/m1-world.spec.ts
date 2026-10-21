import { expect, test } from '@playwright/test';
import { collectErrors, shot, waitReady } from './helpers';

test('M1: world loads without console errors and looks right', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/?debug');
  await waitReady(page);
  const views: Record<string, number[]> = {
    'valley-from-camp': [-200, 52, 316, -60, 30, 60],
    'escarpment-and-creek': [-100, 60, 120, 60, 70, -180],
    'high-plain': [-300, 120, -300, 100, 90, -600],
    'valley-from-lookout': [60, 104, -250, -60, 20, 260],
    'falls-and-bench': [250, 45, 60, 345, 30, -20],
  };
  for (const [name, c] of Object.entries(views)) {
    await page.evaluate((c) => window.__game?.setCamera(c[0], c[1], c[2], c[3], c[4], c[5]), c);
    await page.waitForTimeout(1200);
    await shot(page, 'M1', name);
  }
  expect(errors).toEqual([]);
});
