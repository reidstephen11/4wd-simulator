import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, waitReady } from './helpers';

test('cockpit motion responds to physics, keeps mirrors working and can be disabled', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off');
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.headMotion().offset)).toEqual([0, 0, 0]);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.history-card.reading')?.click();
    window.__game!.cameraPreset('cockpit');
    window.__game!.setInput({ throttle: 0.4, handbrake: false, brake: 0 });
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          document.querySelector<HTMLElement>('.history-card.reading')?.click();
          return Math.hypot(...window.__game!.headMotion().offset);
        }),
      { timeout: 120_000 },
    )
    .toBeGreaterThan(0.0001);
  const offset = await page.evaluate(() => window.__game!.headMotion().offset);
  expect(Math.abs(offset[0])).toBeLessThanOrEqual(0.018);
  expect(Math.abs(offset[1])).toBeLessThanOrEqual(0.012);
  expect(Math.abs(offset[2])).toBeLessThanOrEqual(0.022);
  await expect
    .poll(() => page.evaluate(() => window.__game!.mirrors().captures), { timeout: 120_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: '/workspace/scratch/head-motion-cockpit.png' });
  await page.evaluate(() => {
    window.__game!.setInput({ throttle: 0, handbrake: true });
    window.__game!.setHeadMotion(false);
  });
  expect(await page.evaluate(() => window.__game!.headMotion())).toEqual({
    enabled: false,
    offset: [0, 0, 0],
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  expect(await page.evaluate(() => window.__game!.headMotion().offset)).toEqual([0, 0, 0]);
  await page.evaluate(() => document.querySelector<HTMLElement>('.history-card.reading')?.click());
  await page.keyboard.press('Escape');
  await page.locator('[data-act="settings"]').click();
  await expect(page.locator('[data-head-motion="false"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.locator('[data-title-begin]').click();
  await page.locator('[data-group="menu"][data-value="settings"]').click();
  await expect(page.locator('[data-group="headMotion"][data-value="off"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('phone head-motion controls fit and keep Off after reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await lowGraphics(page);
  await page.goto('/?touch');
  const openSettings = async () => {
    await page.locator('[data-title-begin]').click();
    await page.locator('[data-group="menu"][data-value="settings"]').click();
  };
  await openSettings();
  const off = page.locator('[data-group="headMotion"][data-value="off"]');
  await off.click();
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  const box = await off.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/workspace/scratch/head-motion-phone-settings.png' });
  await page.reload();
  await openSettings();
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
