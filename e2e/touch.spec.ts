import { expect, test, type Page } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady, waitSim } from './helpers';

/** Real touch points through Chrome's input pipeline, so fingers can be held down. */
async function fingers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const down = new Map<number, { x: number; y: number }>();
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd') =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...down].map(([id, p]) => ({ id, x: p.x, y: p.y })),
    });
  const centre = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    if (!b) throw new Error(`${selector} is not visible`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  return {
    async press(id: number, selector: string, dx = 0, dy = 0) {
      const c = await centre(selector);
      down.set(id, { x: c.x + dx, y: c.y + dy });
      await send('touchStart');
    },
    async move(id: number, selector: string, dx: number, dy: number) {
      const c = await centre(selector);
      down.set(id, { x: c.x + dx, y: c.y + dy });
      await send('touchMove');
    },
    async lift(id: number) {
      down.delete(id);
      await send('touchEnd');
    },
    async tapAt(x: number, y: number) {
      down.set(98, { x, y });
      await send('touchStart');
      down.delete(98);
      await send('touchEnd');
    },
    async tap(selector: string) {
      await this.press(99, selector);
      await this.lift(99);
    },
  };
}

/**
 * Pairs of visible elements matching `selector` whose boxes overlap (one inside the other
 * doesn't count). By default the on-screen buttons (touch controls and HUD).
 */
function overlapping(page: Page, selector = '.touch-btn, .hud button'): Promise<string[]> {
  return page.evaluate((selector) => {
    const boxes = [...document.querySelectorAll<HTMLElement>(selector)]
      .map((el) => ({
        el,
        name: el.textContent?.trim().slice(0, 24) || el.getAttribute('aria-label') || el.className,
        r: el.getBoundingClientRect(),
      }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const hits: string[] = [];
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach((b) => {
        if (a.el.contains(b.el) || b.el.contains(a.el)) return;
        if (a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom)
          hits.push(`${a.name} / ${b.name}`);
      }),
    );
    return hits;
  }, selector);
}

test.describe('phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the title Settings page offers Low and Medium graphics only (v1.23)', async ({ page }) => {
    await page.goto('/?track=reopened');
    await page.locator('[data-title-begin]').click();
    await page.locator('[data-value="settings"]').click();
    await expect(page.locator('[data-group="quality"]')).toHaveCount(2);
    await expect(page.locator('[data-group="quality"][data-value="high"]')).toHaveCount(0);
  });

  test('on-screen controls drive the car, and the layout works in landscape and portrait', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await page.goto('/?surprises=off&track=reopened');
    await openJourney(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await openJourney(page);
    await waitReady(page);
    const controls = page.locator('.touch-controls');
    // The HUD style's instruments sit by the edge of the view. The mission line is filled in
    // and folds away after a few seconds (on a slow machine it may be gone before this looks).
    await expect(page.locator('.inst-cluster')).toBeVisible();
    await expect(page.locator('.inst-compass')).toBeVisible();
    await expect(page.locator('.mission strong')).not.toBeEmpty();
    await expect(page.locator('.crawl-gauges')).toBeHidden();
    await page.waitForTimeout(4800);
    await expect(page.locator('.mission')).toBeHidden();
    await expect(controls).toBeVisible();
    // No saved settings: a phone starts on the low graphics preset.
    expect(await page.evaluate(() => window.__game!.quality())).toBe('low');
    await expect(page.locator('.touch-controls')).toHaveClass(/stick-drive/);
    await expect(page.locator('.touch-pedals.touch-drive')).toBeHidden();
    await shot(page, 'touch', 'landscape');

    const f = await fingers(page);
    // Thumb on the stick: right to steer, forward to drive (Joystick only is the default).
    await f.press(1, '.touch-stick-base');
    await f.move(1, '.touch-stick-base', 80, -80);
    await waitSim(page, 2);
    const moving = await page.evaluate(() => window.__game!.vehicle());
    expect(moving.throttle).toBeGreaterThan(0.5);
    expect(moving.speed).toBeGreaterThan(1);
    await shot(page, 'touch', 'landscape-driving');
    await f.lift(1);
    await waitSim(page, 0.2);
    expect((await page.evaluate(() => window.__game!.vehicle())).throttle).toBe(0);

    // HAND latches the park brake on and off. Let it stop the car while it's on: range
    // (below) only changes under 20 km/h.
    await f.tap('[data-tap="handbrake"]');
    await expect.poll(() => page.evaluate(() => window.__game!.parkBrake())).toBe(true);
    await expect(page.locator('[data-tap="handbrake"]')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => Math.abs((await page.evaluate(() => window.__game!.vehicle())).speed))
      .toBeLessThan(0.5);
    await f.tap('[data-tap="handbrake"]');
    await expect.poll(() => page.evaluate(() => window.__game!.parkBrake())).toBe(false);

    // LOW, CRAWL and the diff locks are tucked behind 4WD, whose letters show which are on.
    const pile = page.locator('.touch-pile');
    await expect(pile).toBeHidden();
    await f.tap('.touch-pile-toggle');
    await expect(pile).toBeVisible();
    await expect(page.locator('.touch-pile-toggle')).toHaveAttribute('aria-expanded', 'true');
    // LOW switches range.
    await f.tap('[data-tap="range"]');
    await expect.poll(async () => (await page.evaluate(() => window.__game!.vehicle())).range).toBe('low');
    await expect(page.locator('[data-mark="lowRange"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('[data-mark="frontLocked"]')).not.toHaveClass(/\bon\b/);
    await f.tap('.touch-pile-toggle');
    await expect(pile).toBeHidden();

    // TOOLS opens the radial menu, which stays open until the space around it is tapped.
    await f.tap('[data-tap="toolMenu"]');
    await expect(page.locator('.tool-menu')).toBeVisible();
    await expect(controls).toBeHidden();
    await shot(page, 'touch', 'tool-menu');
    await f.tap('.tool-heading');
    await expect(page.locator('.tool-menu')).toBeHidden();
    await expect(controls).toBeVisible();

    // MAP and pause cover the controls.
    await f.tap('[data-tap="map"]');
    await expect(page.locator('.paper-map')).toBeVisible();
    await expect(controls).toBeHidden();
    await f.tapAt(10, 200);
    await expect(page.locator('.paper-map')).toBeHidden();
    await expect(controls).toBeVisible();
    await f.tap('[data-tap="pause"]');
    await expect(page.locator('.pause')).toBeVisible();
    await shot(page, 'touch', 'pause');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pause')).toBeHidden();
    // The Escape key handed control to the keyboard; touching the view brings the controls back.
    await expect(controls).toBeHidden();
    await f.tap('#game-canvas');
    await expect(controls).toBeVisible();

    // Two fingers spread apart on the view bring the camera closer.
    const far = (await page.evaluate(() => window.__game!.camera())).distance;
    await f.press(3, '#game-canvas', -90, -50);
    await f.press(4, '#game-canvas', 90, -50);
    await f.move(4, '#game-canvas', 190, -50);
    await f.move(3, '#game-canvas', -190, -50);
    await f.lift(4);
    await f.lift(3);
    await expect
      .poll(async () => (await page.evaluate(() => window.__game!.camera())).distance)
      .toBeLessThan(far - 2);

    await page.setViewportSize({ width: 390, height: 844 });
    await waitSim(page, 0.3);
    await shot(page, 'touch', 'portrait');
    // Upright, the top row (II, MAP, LIGHTS, ⛶) and the camera buttons share a line without overlapping.
    for (const size of [
      { width: 390, height: 844 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(size);
      await waitSim(page, 0.2);
      expect(await overlapping(page), `${size.width}×${size.height}`).toEqual([]);
    }

    // Two warnings at once: short lines under the compass, off the road and the controls.
    await f.tap('.touch-pile-toggle');
    await expect(page.locator('.touch-pile')).toBeVisible();
    await page.evaluate(() => window.__game!.pinHazards({ swept: true, flooded: true }));
    await expect(page.locator('.alert')).toHaveCount(2);
    const warned =
      '.alert, .touch-btn, .touch-stick-base, .hud button, .inst-cluster, .inst-compass, .hud-stack > *, .camera-help, .crawl-gauges, .prompt';
    for (const size of [
      { width: 844, height: 390 },
      { width: 915, height: 412 },
      { width: 390, height: 844 },
      { width: 740, height: 360 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(size);
      await waitSim(page, 0.2);
      const where = `warnings ${size.width}×${size.height}`;
      expect(await overlapping(page, warned), where).toEqual([]);
      const centre = await page.evaluate(() =>
        [...document.querySelectorAll('.alert')].flatMap((el) => {
          const r = el.getBoundingClientRect();
          const hit =
            r.width > 0 &&
            r.left < innerWidth * 0.7 &&
            innerWidth * 0.3 < r.right &&
            r.top < innerHeight * 0.65 &&
            innerHeight * 0.35 < r.bottom;
          return hit ? [el.textContent?.trim() ?? 'alert'] : [];
        }),
      );
      expect(centre, where).toEqual([]);
    }
    await page.evaluate(() => window.__game!.pinHazards(null));
    expect(errors).toEqual([]);
  });

  test('Joystick only is the default; Steer and pedals still shows GAS and BRAKE', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    await expect(page.locator('.touch-controls')).toHaveClass(/stick-drive/);
    await expect(page.locator('.touch-pedals.touch-drive')).toBeHidden();
    await expect(page.locator('.touch-stick-axis')).toBeVisible();
    await shot(page, 'touch', 'stick-drive');

    await page.evaluate(() => window.__game!.setTouchDrive('pedals'));
    await expect(page.locator('.touch-controls')).not.toHaveClass(/stick-drive/);
    await expect(page.locator('[data-hold="accelerate"]')).toBeVisible();
    await expect(page.locator('.touch-stick-axis')).toBeHidden();
    await shot(page, 'touch', 'pedals-drive');

    await page.evaluate(() => window.__game!.setTouchDrive('stick'));
    await expect(page.locator('.touch-controls')).toHaveClass(/stick-drive/);
    await expect(page.locator('.touch-stick')).toHaveAttribute('aria-label', 'Steer, throttle and brake');

    const f = await fingers(page);
    await f.press(1, '.touch-stick-base');
    await f.move(1, '.touch-stick-base', 0, -80);
    await waitSim(page, 1);
    const forward = await page.evaluate(() => window.__game!.vehicle());
    expect(forward.throttle).toBeGreaterThan(0.5);
    expect(forward.brake).toBe(0);
    await f.lift(1);
    await waitSim(page, 0.2);
    expect((await page.evaluate(() => window.__game!.vehicle())).throttle).toBe(0);

    // Back on the stick brakes a rolling car (below a walking pace it selects reverse, so get it
    // rolling first: the camp is level, and one second from a standstill is barely that).
    await f.press(1, '.touch-stick-base');
    await f.move(1, '.touch-stick-base', 0, -80);
    await waitSim(page, 3);
    expect((await page.evaluate(() => window.__game!.vehicle())).speed).toBeGreaterThan(2);
    await f.move(1, '.touch-stick-base', 0, 80);
    await waitSim(page, 0.15);
    const back = await page.evaluate(() => window.__game!.vehicle());
    expect(back.throttle).toBe(0);
    expect(back.brake).toBeGreaterThan(0.5);
    await f.lift(1);
    expect(errors).toEqual([]);
  });

  test('Joystick side swaps the stick and the buttons, and the stick still steers', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    const centreX = async (sel: string) => {
      const b = await page.locator(sel).first().boundingBox();
      return b!.x + b!.width / 2;
    };
    const width = page.viewportSize()!.width;
    expect(await centreX('.touch-stick-base')).toBeLessThan(width / 2);
    expect(await centreX('[data-tap="handbrake"]')).toBeGreaterThan(width / 2);

    await page.evaluate(() => window.__game!.setTouchStickSide('right'));
    await expect(page.locator('.touch-controls')).toHaveClass(/stick-right/);
    expect(await centreX('.touch-stick-base')).toBeGreaterThan(width / 2);
    expect(await centreX('[data-tap="handbrake"]')).toBeLessThan(width / 2);
    await shot(page, 'touch', 'stick-right');

    const f = await fingers(page);
    await f.press(1, '.touch-stick-base');
    await f.move(1, '.touch-stick-base', 0, -80);
    await waitSim(page, 1);
    expect((await page.evaluate(() => window.__game!.vehicle())).throttle).toBeGreaterThan(0.5);
    await f.lift(1);

    await page.evaluate(() => window.__game!.setTouchStickSide('left'));
    await expect(page.locator('.touch-controls')).not.toHaveClass(/stick-right/);
    expect(await centreX('.touch-stick-base')).toBeLessThan(width / 2);
    expect(errors).toEqual([]);
  });
});

test.describe('phone at Ironbark Creek', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the HUD's panels keep clear of each other and the buttons in every view", async ({ page }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await page.goto('/?surprises=off&track=reopened');
    await openJourney(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await openJourney(page);
    await waitReady(page);
    const f = await fingers(page);
    // Low range on the flat does not bring up pitch/roll; GAS against the handbrake still prompts.
    await f.tap('.touch-pile-toggle');
    await f.tap('[data-tap="range"]');
    await f.tap('[data-tap="handbrake"]');
    await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
    await expect(page.locator('.prompt', { hasText: 'Release the handbrake' })).toBeVisible();
    await expect(page.locator('.crawl-gauges')).toBeHidden();
    await expect(page.locator('.inst-cluster')).toBeVisible();
    const panels =
      '.touch-btn, .touch-stick-base, .hud button, .inst-cluster, .inst-compass, .hud-stack > *, .camera-help, .prompt, .crawl-gauges';
    // With 4WD's pile open, then closed.
    for (const open of [true, false]) {
      if (!open) await f.tap('.touch-pile-toggle');
      await expect(page.locator('.touch-pile')).toBeVisible({ visible: open });
      for (const view of ['follow', 'cockpit'] as const) {
        await page.evaluate((v) => window.__game!.cameraPreset(v), view);
        for (const size of [
          { width: 390, height: 844 },
          { width: 375, height: 667 },
          { width: 844, height: 390 },
          { width: 740, height: 360 },
        ]) {
          await page.setViewportSize(size);
          await waitSim(page, 0.2);
          const where = `${open ? 'open' : 'closed'} ${view} ${size.width}×${size.height}`;
          expect(await overlapping(page, panels), where).toEqual([]);
          // The camera buttons stay one row high (they once stretched down the screen).
          expect((await page.locator('.camera-help').boundingBox())!.height, where).toBeLessThan(60);
        }
      }
      await page.evaluate(() => window.__game!.cameraPreset('follow'));
      await page.setViewportSize({ width: 390, height: 844 });
      await waitSim(page, 0.3);
      await shot(page, 'touch', open ? 'portrait-4wd-open' : 'portrait-creb');
    }
    // A history note is a small card in the top right; driving carries on and the buttons
    // stay. Tapping it closes it.
    for (const size of [
      { width: 390, height: 844 },
      { width: 740, height: 360 },
    ]) {
      await page.setViewportSize(size);
      await page.evaluate(() => window.__game!.showNote('knoll-rock-climb'));
      await expect(page.locator('.history-card')).toBeVisible();
      await expect(page.locator('.history-backdrop')).toBeHidden();
      await expect(page.locator('.touch-controls')).toBeVisible();
      expect(await page.evaluate(() => window.__game!.ui().paused)).toBe(false);
      const box = await page.evaluate(() =>
        document.querySelector<HTMLElement>('.history-card')!.getBoundingClientRect().toJSON(),
      );
      expect(box.right, `${size.width}×${size.height}`).toBeGreaterThan(size.width * 0.9);
      expect(box.left, `${size.width}×${size.height}`).toBeGreaterThan(size.width * 0.4);
      expect(box.top, `${size.width}×${size.height}`).toBeLessThan(size.height * 0.4);
      await shot(page, 'touch', `history-${size.width}`);
      await f.tap('.history-card');
      await expect(page.locator('.history-card')).toBeHidden();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__game!.cameraPreset('cockpit'));
    await waitSim(page, 0.3);
    await shot(page, 'touch', 'portrait-driver');
    await page.evaluate(() => window.__game!.setInput(null));
    expect(errors).toEqual([]);
  });
});

test('desktop shows no touch controls', async ({ page }) => {
  test.setTimeout(600_000);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  await expect(page.locator('.touch-controls')).toBeHidden();
  await expect(page.locator('.inst-cluster')).toBeVisible();
});
