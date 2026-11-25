import { expect, test, type Page } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney, shot, TEST_STEPS_PER_FRAME } from './helpers';

async function controller(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0, touched: false }));
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons }],
    });
    (window as unknown as { testController: typeof buttons }).testController = buttons;
  });
}

async function button(page: Page, index: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ({ index, pressed }) => {
      const b = (window as unknown as { testController: { pressed: boolean; value: number }[] })
        .testController[index];
      b.pressed = pressed;
      b.value = pressed ? 1 : 0;
    },
    { index, pressed },
  );
}

test('controller type changes title prompts, persists, and switches back to keyboard hints', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await controller(page);
  await lowGraphics(page);
  await page.goto('/?track=reopened');
  await button(page, 0, true);
  await expect(page.locator('.title-menu')).toBeVisible();
  await button(page, 0, false);
  await page.locator('[data-value="settings"]').click();
  await expect(page.locator('[data-group="controller"][aria-pressed="true"]')).toHaveAttribute(
    'data-value',
    'playstation',
  );
  for (const [type, confirm, back] of [
    ['xbox', 'A', 'B'],
    ['generic', '1', '2'],
    ['playstation', '✕', '○'],
  ] as const) {
    await page.locator(`[data-group="controller"][data-value="${type}"]`).click();
    await button(page, 13, true);
    await expect(page.locator('.title-input-hint b').first()).toHaveText(confirm);
    await expect(page.locator('.title-input-hint b').last()).toHaveText(back);
    await button(page, 13, false);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('4wdsim.save.v2')!).settings.controller),
    ).toBe(type);
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('.title-input-hint')).toContainText('Enter');
  await expect(page.locator('.title-input-hint')).toContainText('Esc');
  await page.locator('[data-group="controller"][data-value="xbox"]').click();
  await page.reload();
  await page.keyboard.press('Enter');
  await page.locator('[data-value="settings"]').click();
  await expect(page.locator('[data-group="controller"][aria-pressed="true"]')).toHaveAttribute(
    'data-value',
    'xbox',
  );
  for (const viewport of [
    { width: 390, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const option = page.locator('[data-group="controller"][data-value="generic"]');
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeInViewport({ ratio: 1 });
    expect(await page.locator('.welcome').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await shot(page, 'controller', 'settings');
  expect(errors).toEqual([]);
});

test('pause settings change live driving, camera, map and help prompts, while keyboard input restores keys', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await controller(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.locator('[data-welcome-drive]').click();
  await page.locator('[data-briefing-drive]:not(.hidden)').click({ timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300_000 });
  await page.evaluate((n) => window.__game!.setStepsPerFrame(n), TEST_STEPS_PER_FRAME);
  // An unused D-pad direction selects the controller without starting the engine.
  await button(page, 13, true);
  await expect(page.locator('.prompts')).toContainText('R2');
  await page.evaluate(() => window.__game!.showNote('orient-crawl'));
  await expect(page.locator('.history-card p')).toContainText('Hold L1, choose Enable precision crawl');
  await expect(page.locator('.history-card p')).not.toContainText('Press P');
  await button(page, 13, false);
  await page.keyboard.press('Tab');
  await expect(page.locator('.prompts .key').first()).toHaveText('W');
  await expect(page.locator('.history-card p')).toContainText('Press P.');
  for (const [type, pedal, tools, back, map] of [
    ['xbox', 'RT', 'LB', 'B', 'View'],
    ['generic', 'Button 8', 'Button 5', 'Button 2', 'Button 9'],
  ] as const) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator(`[data-controller="${type}"]`).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await expect(page.locator('.controls thead')).toContainText(type === 'xbox' ? 'Xbox' : 'Generic');
    await expect(page.locator('.controls tr').filter({ hasText: 'Accelerate' })).toContainText(pedal);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await button(page, 13, true);
    await expect(page.locator('.prompts')).toContainText(pedal);
    await page.evaluate(() => window.__game!.showNote('orient-crawl'));
    await expect(page.locator('.history-card p')).toContainText(
      `Hold ${tools}, choose Enable precision crawl`,
    );
    await expect(page.locator('.history-card p')).not.toContainText('Press P');
    await expect(page.locator('.camera-preset kbd')).toContainText(tools);
    await button(page, 13, false);
    await button(page, 8, true);
    await expect(page.locator('.paper-map')).toBeVisible();
    await expect(page.locator('.paper-map-hint')).toHaveText(`${back} or ${map} to close`);
    await button(page, 8, false);
    await page.keyboard.press('Tab');
    await expect(page.locator('.paper-map-hint')).toContainText('M or Esc');
    await page.keyboard.press('Escape');
    await expect(page.locator('.paper-map')).toBeHidden();
  }
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('4wdsim.save.v2')!).settings.controller),
  ).toBe('generic');
  expect(errors).toEqual([]);
});
