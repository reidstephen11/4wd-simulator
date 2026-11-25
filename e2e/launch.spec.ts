import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney, shot } from './helpers';
import { ironbarkLevel } from '../src/data/levels/ironbark';
import { startCheckpoint } from '../src/sim/episode';

test('the camp title opens to three main actions and fits desktop and phones', async ({ page }) => {
  const errors = collectErrors(page);
  const engineRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/src\/core\/game\.ts|\/assets\/game-/.test(r.url())) engineRequests.push(r.url());
  });
  // The title never waits for the driving engine: held back here, the menus still work. It
  // starts downloading in the background once the title is up (v1.46).
  await page.route(/\/src\/core\/game\.ts|\/assets\/game-/, () => undefined);
  await lowGraphics(page);
  await page.goto('/?track=reopened');
  await expect(page.locator('[data-title-begin]')).toBeVisible();
  await expect(page.locator('[data-welcome-drive]')).toHaveCount(0);
  await expect(page.locator('#game-canvas')).toHaveCount(0);
  await shot(page, 'title', 'press-any-button');
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-menu button')).toHaveCount(3);
  await expect(page.locator('[data-title-continue]')).toBeDisabled();
  await expect(page.locator('[data-title-journey]')).toBeFocused();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const action of ['[data-title-continue]', '[data-title-journey]', '[data-value="settings"]'])
      await expect(page.locator(action)).toBeInViewport({ ratio: 1 });
    expect(await page.locator('.welcome').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await shot(page, 'title', `menu-${viewport.width}`);
  }
  await expect.poll(() => engineRequests.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('New drive opens level setup and keeps the vehicle, damage and conditions chosen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      '4wdsim.save.v2',
      JSON.stringify({
        version: 1,
        episode: 'ironbark',
        vehicle: 'perentie',
        settings: { quality: 'low', damage: 'realistic' },
        episodes: { ironbark: { completed: true } },
        replay: { time: 'dusk', weather: 'rain' },
      }),
    ),
  );
  await page.goto('/?track=reopened');
  await openJourney(page);
  // The vehicle, damage and conditions are open from the start: they are the choices here.
  await expect(page.locator('#welcome-setup')).toBeVisible();
  // A playground has no story conditions to offer, and nothing to pack.
  await expect(page.locator('[data-group="time"][data-value="story"]')).toHaveCount(0);
  await expect(page.locator('[data-group="pack"]')).toHaveCount(0);
  await expect(page.locator('[data-group="vehicle"]')).toHaveCount(15);
  await expect(page.locator('[data-group="time"].on')).toHaveAttribute('data-value', 'dusk');
  await expect(page.locator('[data-group="weather"].on')).toHaveAttribute('data-value', 'rain');
  await page.locator('[data-group="vehicle"][data-value="perentie"]').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-group="vehicle"].on')).toHaveAttribute('data-value', 'hilux');
  // One level so far.
  await expect(page.locator('[data-group="episode"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.title-menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('title Settings persist sound and graphics without replacing a saved camp', async ({ page }) => {
  const checkpoint = startCheckpoint(ironbarkLevel, 'top-paddock-camp', 'perentie');
  await page.addInitScript((checkpoint) => {
    if (!localStorage.getItem('4wdsim.save.v2'))
      localStorage.setItem(
        '4wdsim.save.v2',
        JSON.stringify({
          version: 1,
          episode: 'ironbark',
          vehicle: 'perentie',
          settings: { quality: 'low' },
          episodes: { ironbark: { checkpoint } },
        }),
      );
  }, checkpoint);
  await page.goto('/?track=reopened');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-title-continue]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-settings')).toBeVisible();
  await page.locator('[data-group="quality"][data-value="high"]').click();
  await page.locator('#title-volume').fill('0.3');
  // The phone settings are only on a touch screen (tested below).
  await expect(page.locator('.phone-driving-setting')).toHaveCount(0);
  await page.locator('[data-group="units"][data-value="mph"]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('4wdsim.save.v2')!));
  expect(saved.settings).toMatchObject({
    quality: 'high',
    masterVolume: 0.3,
    units: 'mph',
  });
  expect(saved.episodes.ironbark.checkpoint.camp).toBe('top-paddock-camp');
  expect(saved.vehicle).toBe('perentie');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-title-continue]')).toBeEnabled();
  await page.reload();
  await page.keyboard.press('Enter');
  await page.locator('[data-value="settings"]').click();
  await expect(page.locator('#title-volume')).toHaveValue('0.3');
});

test('New drive starts fresh without deleting the existing checkpoint while browsing', async ({ page }) => {
  const checkpoint = startCheckpoint(ironbarkLevel, 'top-paddock-camp', 'perentie');
  await page.addInitScript(
    (checkpoint) =>
      localStorage.setItem(
        '4wdsim.save.v2',
        JSON.stringify({
          version: 1,
          episode: 'ironbark',
          vehicle: 'perentie',
          settings: { quality: 'low' },
          episodes: { ironbark: { checkpoint } },
        }),
      ),
    checkpoint,
  );
  await page.goto('/?track=reopened');
  await page.keyboard.press('Enter');
  await page.locator('[data-title-journey]').click();
  await expect(page.locator('[data-group="start"].on')).toHaveAttribute('data-value', 'new');
  await expect(page.locator('[data-welcome-drive]')).toHaveText('Load level');
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('4wdsim.save.v2')!).episodes.ironbark.checkpoint.camp,
    ),
  ).toBe('top-paddock-camp');
});

test('a held controller button opens only the menu, with directions to select and B to return', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false }));
    // A real controller always reports its sticks; the menus read them every frame.
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ connected: true, buttons, axes: [0, 0, 0, 0] }],
    });
    (window as unknown as { titlePad: typeof buttons }).titlePad = buttons;
  });
  await page.goto('/?track=reopened');
  const setButton = (index: number, pressed: boolean) =>
    page.evaluate(
      ({ index, pressed }) => {
        (window as unknown as { titlePad: { pressed: boolean }[] }).titlePad[index].pressed = pressed;
      },
      { index, pressed },
    );
  await setButton(0, true);
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.welcome')).toHaveAttribute('data-input', 'gamepad');
  await expect(page.locator('.title-input-hint [aria-label="Cross"]')).toHaveText('✕');
  await expect(page.locator('.title-input-hint [aria-label="Circle"]')).toHaveText('○');
  await expect(page.locator('[data-welcome-drive]')).toHaveCount(0);
  await setButton(0, false);
  await page.waitForTimeout(60);
  await setButton(13, true);
  await expect(page.locator('[data-value="settings"]')).toBeFocused();
  await setButton(13, false);
  await page.waitForTimeout(60);
  await setButton(0, true);
  await expect(page.locator('.title-settings')).toBeVisible();
  await setButton(0, false);
  await page.waitForTimeout(60);
  await setButton(1, true);
  await expect(page.locator('.title-menu')).toBeVisible();
});

test('touch titles use tap prompts and respect reduced motion', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 667 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/?track=reopened');
  await expect(page.locator('[data-title-begin]')).toHaveText('Tap to begin');
  expect(
    await page.locator('.welcome').evaluate((el) => getComputedStyle(el, '::before').animationName),
  ).toBe('none');
  await page.locator('[data-title-begin]').tap();
  await expect(page.locator('.title-input-hint')).toHaveText('Tap to select');
  await expect(page.locator('[data-title-journey]')).toBeInViewport({ ratio: 1 });
  await context.close();
});

test('test mode keeps title settings and journey browsing out of the real save', async ({ page }) => {
  await lowGraphics(page);
  await page.goto('/?dev&track=reopened');
  const saved = await page.evaluate(() => localStorage.getItem('4wdsim.save.v2'));
  await page.keyboard.press('Enter');
  await page.locator('[data-value="settings"]').click();
  await page.locator('[data-group="quality"][data-value="high"]').click();
  await page.locator('#title-volume').fill('0.2');
  await page.keyboard.press('Escape');
  await page.locator('[data-title-journey]').click();
  await expect(page.locator('[data-group="episode"][disabled]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('4wdsim.save.v2'))).toBe(saved);
});

test.describe('title Settings on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Phone driving sits on the Settings page in view', async ({ page }) => {
    await page.goto('/?touch&track=reopened');
    await page.locator('[data-title-begin]').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Phone driving' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Joystick side' })).toBeVisible();
    await expect(page.locator('[data-group="touchDrive"][data-value="stick"]')).toBeInViewport();
    await expect(page.locator('[data-group="touchDrive"][data-value="stick"]')).toHaveClass(/\bon\b/);
    await page.locator('[data-group="touchDrive"][data-value="pedals"]').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('4wdsim.save.v2')!));
    expect(saved.settings.touchDrive).toBe('pedals');
    await page.reload();
    await page.locator('[data-title-begin]').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('[data-group="touchDrive"][data-value="pedals"]')).toHaveClass(/\bon\b/);
  });
});
