import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { collectErrors, lowGraphics, waitReady } from './helpers';

/** Where pictures go (SHOT_DIR, or Playwright's results folder). */
const SHOTS = process.env.SHOT_DIR ?? 'test-results';

type Ctl = 'left' | 'right';
/** Set a button or stick on the pretend headset's controllers (iwer, `?vrsim`). */
async function xr(page: Page, hand: Ctl, id: string, value: number | [number, number]): Promise<void> {
  await page.evaluate(
    ({ hand, id, value }) => {
      const d = (window as unknown as { __xr: { controllers: Record<string, unknown> } }).__xr;
      const c = d.controllers[hand] as {
        updateButtonValue(id: string, v: number): void;
        updateAxes(id: string, x: number, y: number): void;
      };
      if (Array.isArray(value)) c.updateAxes(id, value[0], value[1]);
      else c.updateButtonValue(id, value);
    },
    { hand, id, value },
  );
}

const vr = (page: Page) => page.evaluate(() => window.__game!.vr());

test('headset play: in the seat, driven by the hand controllers, menus in the window', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await lowGraphics(page);
  // The headset game is its own address (v2.02).
  await page.goto('/?vr&surprises=off&vrsim');
  await waitReady(page);
  // A note read with the game stopped would be closed with A in the headset: close it here first.
  await page.evaluate(() => document.querySelector<HTMLElement>('.history-card.reading')?.click());

  // The briefing's Drive press starts the headset where the browser still counts it; if not,
  // the cover over the window takes a press.
  if (!(await vr(page)).presenting) await page.locator('.vr-enter').click({ timeout: 60_000 });
  await expect.poll(async () => (await vr(page)).presenting, { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.vr-enter')).toBeHidden();

  // The eye sits at the driver's seat, in the cab: within a couple of metres of the body.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const e = window.__game!.vr().eye;
          const c = window.__game!.vehicle();
          return Math.hypot(e[0] - c.x, e[1] - c.y, e[2] - c.z);
        }),
      { timeout: 60_000 },
    )
    .toBeLessThan(2.5);

  // Right trigger is the accelerator, the left stick steers.
  await xr(page, 'right', 'trigger', 0.7);
  await xr(page, 'left', 'thumbstick', [0.5, 0]);
  await expect
    .poll(async () => (await page.evaluate(() => window.__game!.vehicle())).speed, { timeout: 300_000 })
    .toBeGreaterThan(2);
  await xr(page, 'right', 'trigger', 0);
  await xr(page, 'left', 'thumbstick', [0, 0]);
  // Left trigger brakes.
  await xr(page, 'left', 'trigger', 1);
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.__game!.vehicle())).speed), {
      timeout: 300_000,
    })
    .toBeLessThan(0.5);
  await xr(page, 'left', 'trigger', 0);

  const s = await vr(page);
  writeFileSync(`${SHOTS}/vr-dash.png`, Buffer.from(s.dash.split(',')[1], 'base64'));
  await page.screenshot({ path: `${SHOTS}/vr-seat.png` });

  // Holding the left grip opens the tool wheel on the dash card; the right stick points.
  await xr(page, 'left', 'squeeze', 1);
  await xr(page, 'right', 'thumbstick', [0.9, 0]);
  await page.waitForTimeout(1500);
  const tools = await vr(page);
  writeFileSync(`${SHOTS}/vr-tools.png`, Buffer.from(tools.dash.split(',')[1], 'base64'));
  await xr(page, 'right', 'thumbstick', [0, 0]);
  await page.waitForTimeout(300);
  await xr(page, 'left', 'squeeze', 0);

  // Left stick click pauses: the headset session ends so the menu shows in the browser window.
  await xr(page, 'left', 'thumbstick', 1);
  await page.waitForTimeout(500);
  await xr(page, 'left', 'thumbstick', 0);
  await expect.poll(async () => (await vr(page)).presenting, { timeout: 60_000 }).toBe(false);
  await expect(page.locator('.pause:not(.hidden)')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/vr-paused-window.png` });
  // Resuming with a click (a controller's trigger on the window) goes straight back into the headset.
  await page.locator('.pause:not(.hidden) [data-act="resume"]').click();
  await expect.poll(async () => (await vr(page)).presenting, { timeout: 60_000 }).toBe(true);

  // Leaving the headset view with no menu open (the headset's own quit): the cover over the
  // window waits for a press, and a click on it takes the seat again.
  await page.evaluate(() => window.__game!.leaveHeadset());
  await expect(page.locator('.vr-enter')).toBeVisible({ timeout: 60_000 });
  expect((await vr(page)).presenting).toBe(false);
  await page.screenshot({ path: `${SHOTS}/vr-cover.png` });
  await page.locator('.vr-enter').click();
  await expect.poll(async () => (await vr(page)).presenting, { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.vr-enter')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the ordinary address offers no headset, even with one present (v2.02)', async ({ page }) => {
  test.setTimeout(900_000);
  await lowGraphics(page);
  await page.goto('/?surprises=off&vrsim');
  await waitReady(page);
  await expect(page.locator('.vr-enter')).toHaveCount(0);
  expect((await vr(page)).presenting).toBe(false);
});

test('/vr leads to the headset game and keeps the address options', async ({ page }) => {
  await page.goto('/vr.html?surprises=off');
  await page.waitForURL(/\/\?vr&surprises=off$/);
});
