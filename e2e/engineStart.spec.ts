import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney, TEST_STEPS_PER_FRAME } from './helpers';

test('the engine is off on arrival until the accelerator starts it, then the car moves off', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await page.locator('[data-briefing-drive]:not(.hidden)').click({ timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
  await page.evaluate((n) => window.__game!.setStepsPerFrame(n), TEST_STEPS_PER_FRAME);
  // A history note can stop the game until it's read.
  await page
    .locator('.history-card.reading')
    .click({ timeout: 5_000 })
    .catch(() => {});

  // Off, silent and still, with a prompt to press the accelerator.
  await expect.poll(() => page.evaluate(() => window.__game!.vehicle().engineOff)).toBe(true);
  expect(await page.evaluate(() => window.__game!.vehicle().engineRunning)).toBe(false);
  await expect(page.locator('.prompts')).toContainText('Start the engine');
  const start = await page.evaluate(() => window.__game!.vehicle());

  // The accelerator turns it over; once it fires the car drives off.
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await expect
    .poll(() => page.evaluate(() => window.__game!.vehicle().engineRunning), { timeout: 120_000 })
    .toBe(true);
  await expect(page.locator('.prompts')).not.toContainText('Start the engine');
  await expect
    .poll(
      async () => {
        const v = await page.evaluate(() => window.__game!.vehicle());
        return Math.hypot(v.x - start.x, v.z - start.z);
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(1);
  await page.evaluate(() => window.__game!.setInput(null));
  expect(errors).toEqual([]);
});
