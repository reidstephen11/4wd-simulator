import { expect, test } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney } from './helpers';

test('Expedition tools fit, group related actions, and reject disabled choices', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?tool-menu-preview');
  await expect(page.locator('.tool-option')).toHaveCount(12);
  for (const cargo of [false, true]) {
    if (cargo) await page.locator('[data-preview-cargo]').click();
    await expect(page.locator('.tool-option')).toHaveCount(cargo ? 16 : 12);
    // Each tool's family, icon and name (the wedges themselves are clipped shapes whose
    // rectangles overlap a few pixels once there are sixteen of them).
    const boxes = await page.locator('.tool-option').evaluateAll((buttons) =>
      buttons.map((b) => {
        const rs = [...b.children].map((c) => c.getBoundingClientRect());
        return {
          left: Math.min(...rs.map((r) => r.left)),
          right: Math.max(...rs.map((r) => r.right)),
          top: Math.min(...rs.map((r) => r.top)),
          bottom: Math.max(...rs.map((r) => r.bottom)),
        };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      expect(a.left).toBeGreaterThanOrEqual(0);
      expect(a.right).toBeLessThanOrEqual(1280);
      expect(a.top).toBeGreaterThanOrEqual(0);
      expect(a.bottom).toBeLessThanOrEqual(720);
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
    if (cargo) await page.locator('[data-preview-cargo]').click();
  }
  await page.getByRole('button', { name: 'Winch', exact: true }).click({ force: true });
  await expect(page.locator('.tool-centre')).toContainText('Unavailable');
  await expect(page.locator('.tool-preview-status')).toBeEmpty();
  await page.getByRole('button', { name: 'Lock rear diff', exact: true }).hover();
  await expect(page.locator('.tool-centre strong')).toHaveText('Lock rear diff');
  await page.mouse.move(640, 360);
  await expect(page.locator('.tool-option.selected')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.tool-menu')).toHaveClass(/tool-grid/);
  await page.getByRole('button', { name: 'Place planks', exact: true }).click();
  await expect(page.locator('.tool-preview-status')).toHaveText('Selected: planks');
  expect(errors).toEqual([]);
});

test('on a phone held upright every tool shows above the hint bar without scrolling, at every UI size', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/?tool-menu-preview');
  for (const size of [
    { width: 390, height: 844 },
    { width: 384, height: 785 },
    { width: 360, height: 740 },
  ])
    for (const ui of [0.8, 1, 1.2]) {
      await page.setViewportSize(size);
      await page.evaluate((ui) => document.documentElement.style.setProperty('--ui', String(ui)), ui);
      await expect(page.locator('.tool-menu')).toHaveClass(/tool-grid/);
      const where = `${size.width}×${size.height} ui ${ui}`;
      const hidden = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.tool-hint')!.getBoundingClientRect();
        return [...document.querySelectorAll<HTMLElement>('.tool-option')]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > bar.top;
          })
          .map((b) => b.getAttribute('aria-label') ?? b.textContent);
      });
      expect(hidden, where).toEqual([]);
      // Labels fit inside their tiles.
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.tool-option *')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
          .map((e) => e.textContent),
      );
      expect(clipped, where).toEqual([]);
    }
  expect(errors).toEqual([]);
});

test('controller uses the right stick, cancels at centre, and leaves the camera alone', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const pad = {
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as unknown as { radialPad: typeof pad }).radialPad = pad;
  });
  const pad = async (axes: number[], lb: boolean) =>
    page.evaluate(
      ({ axes, lb }) => {
        const pad = (
          window as unknown as {
            radialPad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
          }
        ).radialPad;
        pad.axes = axes;
        pad.buttons[4] = { pressed: lb, value: Number(lb) };
      },
      { axes, lb },
    );
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await page.locator('[data-welcome-drive]').click();
  await page.locator('[data-briefing-drive]:not(.hidden)').click({ timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300_000 });
  await page.waitForFunction(() => {
    document.querySelector<HTMLElement>('.history-card.reading')?.click();
    return !document.querySelector('.history-card.reading');
  });
  await pad([0, 0, 0, 0], true);
  await expect(page.locator('.tool-menu')).toBeVisible();
  await expect(page.locator('.tool-hint')).toContainText('Right stick');
  // Allow the chase camera's opening-frame interpolation to settle first.
  await page.waitForTimeout(2000);
  const camera = await page.evaluate(() => window.__game!.camera());
  await pad([1, 0, 0, 0], true);
  await page.waitForTimeout(1000);
  await expect(page.locator('.tool-option.selected')).toHaveCount(0);
  await pad([0, 0, 0, -1], true);
  await expect(page.locator('.tool-option.selected')).toHaveAttribute('aria-label', 'Lock front diff');
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => window.__game!.camera());
  // Vehicle settling and chase interpolation continue; a stick orbit would turn about 1.8 radians.
  for (let i = 0; i < 3; i++) expect(Math.abs(after.direction[i] - camera.direction[i])).toBeLessThan(0.03);
  expect(after.distance).toBe(camera.distance);
  expect(after.preset).toBe(camera.preset);
  // Release at centre must cancel even when both arrive in the same frame.
  await pad([0, 0, 0, 0], false);
  await expect(page.locator('.tool-menu')).toBeHidden();
  await pad([0, 0, 0, -1], true);
  await expect(page.locator('.tool-option.selected')).toHaveAttribute('aria-label', 'Lock front diff');
  await pad([0, 0, 0, -1], false);
  await expect(page.locator('.tool-menu')).toBeHidden();
  await pad([0, 0, 0, 0], true);
  await expect(page.getByRole('button', { name: 'Unlock front diff', exact: true })).toBeVisible();
  await pad([0, 0, 0, 0], false);
  expect(errors).toEqual([]);
});
