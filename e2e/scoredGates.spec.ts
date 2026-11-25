import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, waitReady } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('drives all eight gates, shows the phone score and keeps a per-vehicle best after reload', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  // This checks scoring, display and saving. The scripted driver has no tyre-repair
  // strategy; damage and recovery are exercised by their own simulation tests.
  await page.addInitScript(() => {
    const key = '4wdsim.save.v2';
    const saved = JSON.parse(localStorage.getItem(key) ?? '{"version":1}');
    saved.settings = { ...saved.settings, quality: 'low', damage: 'off' };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.goto('/?touch&track=reopened&surprises=off');
  await waitReady(page);
  await expect(page.locator('.gate-count')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => window.__game!.driveGateCourse())).toBe(true);
  await page.evaluate(() => window.__game!.setStepsPerFrame(120));
  await expect
    .poll(() => page.evaluate(() => window.__game!.gateCourse()?.active), { timeout: 120_000 })
    .toBe(true);
  await expect(page.locator('.gate-count')).toContainText('Knoll rock climb');
  const box = await page.locator('.gate-count').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/workspace/scratch/gates-phone-active.png' });
  await page.evaluate(() => document.querySelector<HTMLElement>('.history-card.reading')?.click());
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          document.querySelector<HTMLElement>('.history-card.reading')?.click();
          return window.__game!.gateCourse()?.best;
        }),
      { timeout: 480_000 },
    )
    .toBeTruthy();
  await expect(page.locator('.run-card')).toContainText('Personal best');
  await expect(page.locator('.run-card')).toContainText('0 missed');
  const best = await page.evaluate(() => window.__game!.gateCourse()!.best);
  await page.screenshot({ path: '/workspace/scratch/gates-phone-finish.png' });
  await page.locator('[data-tap="pause"]').click();
  await expect(page.locator('.pause')).toContainText('Rock climb best');
  await page.screenshot({ path: '/workspace/scratch/gates-best-pause.png' });
  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.gateCourse()!.best)).toEqual(best);
  await expect(page.locator('.gate-count')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});
