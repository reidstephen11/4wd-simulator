import { expect, test } from '@playwright/test';
import {
  openJourney,
  collectErrors,
  driveFromBriefing,
  lowGraphics,
  shot,
  waitEngine,
  waitReady,
  waitSim,
} from './helpers';

test('changing to the Land Rover from the pause menu restarts from the last camp in it, and is remembered', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('shortie');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  await page.evaluate(() => window.__game!.setInput(null));
  const camp = await page.evaluate(() => window.__game!.pois().find((p) => p.id === 'ironbark-camp')!);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Vehicle/ }).click();
  await page.getByRole('button', { name: /Land Rover 110 Perentie/ }).click();
  await expect.poll(() => page.evaluate(() => window.__game!.vehicleId())).toBe('perentie');
  await waitEngine(page);
  const after = await page.evaluate(() => window.__game!.vehicle());
  expect(Math.hypot(after.x - camp.x, after.z - camp.z)).toBeLessThan(camp.radius);
  expect(after.tilt).toBeLessThan(15);

  // It drives, and the choice is saved.
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'perentie-in-game');
  await page.reload();
  await openJourney(page);
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'perentie',
  );
  expect(errors).toEqual([]);
});

test('the Hilux is chosen on the welcome screen, drives off, and has its own cab', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /Hilux single cab/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'hilux',
  );
  await expect(page.locator('.welcome-card')).toContainText('styleside');
  await shot(page, 'vehicle', 'welcome-hilux');
  // Four vehicles still fit across a phone held upright, without scrolling sideways (the
  // welcome screen scrolls down to them).
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['shortie', 'camel', 'perentie', 'hilux']) {
    const button = page.locator(`[data-group="vehicle"][data-value="${id}"]`);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 0.9 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });

  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('hilux');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'hilux-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'hilux-cockpit');
  expect(errors).toEqual([]);
});

test('the Unimog is chosen on the welcome screen, drives off, and has its own cab', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /Unimog UL1700L/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'unimog',
  );
  await expect(page.locator('.welcome-card')).toContainText('portal axles');
  await shot(page, 'vehicle', 'welcome-unimog');
  // Five vehicles still fit across a phone held upright, without scrolling sideways (the
  // welcome screen scrolls down to them).
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['shortie', 'camel', 'perentie', 'hilux', 'unimog']) {
    const button = page.locator(`[data-group="vehicle"][data-value="${id}"]`);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 0.9 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });

  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('unimog');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 4);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'unimog-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'unimog-cockpit');
  expect(errors).toEqual([]);
});

test('the Troop Carrier is chosen on the welcome screen, starts with its sub-tank and two spares, and drives off', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /Troop Carrier/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'troopy',
  );
  await expect(page.locator('.welcome-card')).toContainText('sub-tank');
  await shot(page, 'vehicle', 'welcome-troopy');
  // All eight vehicles still fit across a phone held upright, without scrolling sideways (the
  // welcome screen scrolls down to them).
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['shortie', 'camel', 'perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79']) {
    const button = page.locator(`[data-group="vehicle"][data-value="${id}"]`);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 0.9 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });

  // The briefing lists the CREB's load with the sub-tank's 60 L and two spares.
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await expect(page.locator('.briefing')).toContainText('110 L of fuel');
  await expect(page.locator('.briefing')).toContainText('2 spare wheels');
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('troopy');
  const load = await page.evaluate(() => window.__game!.health());
  // A little has gone on starting and idling.
  expect(load.fuel).toBeGreaterThan(109);
  expect(load.fuel).toBeLessThanOrEqual(110);
  expect(load.spares).toBe(2);
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'troopy-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'troopy-cockpit');
  expect(errors).toEqual([]);
});

test('the GQ Patrol is chosen on the welcome screen and drives off', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /GQ Patrol/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'patrol',
  );
  await expect(page.locator('.welcome-card')).toContainText('TD42');
  await shot(page, 'vehicle', 'welcome-patrol');
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('patrol');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'patrol-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'patrol-cockpit');
  expect(errors).toEqual([]);
});

test('the LC79 V8 is chosen on the welcome screen and drives off', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  await page.goto('/?track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /LC79 V8/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'lc79',
  );
  await expect(page.locator('.welcome-card')).toContainText('twin-turbo V8');
  await shot(page, 'vehicle', 'welcome-lc79');
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('lc79');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'lc79-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'lc79-cockpit');
  expect(errors).toEqual([]);
});

test('the SR5 Xtra Cab is chosen on the welcome screen from the start and drives off', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('4wdsim.save.v2'))
      localStorage.setItem('4wdsim.save.v2', JSON.stringify({ version: 1, settings: { quality: 'low' } }));
  });
  await page.goto('/?track=reopened');
  await openJourney(page);
  await page.getByRole('button', { name: /Hilux SR5 Xtra Cab/ }).click();
  await expect(page.locator('.welcome-option.on[data-group="vehicle"]')).toHaveAttribute(
    'data-value',
    'xtracab',
  );
  await expect(page.locator('.welcome-card')).toContainText('SR5 Xtra Cab');
  await shot(page, 'vehicle', 'welcome-xtracab');
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await driveFromBriefing(page);
  expect(await page.evaluate(() => window.__game!.vehicleId())).toBe('xtracab');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.6 }));
  await waitSim(page, 3);
  expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
  await page.evaluate(() => window.__game!.setInput(null));
  await shot(page, 'vehicle', 'xtracab-in-game');
  await page.evaluate(() => window.__game!.cameraPreset('cockpit' as never));
  await waitSim(page, 1);
  await shot(page, 'vehicle', 'xtracab-cockpit');
  expect(errors).toEqual([]);
});
