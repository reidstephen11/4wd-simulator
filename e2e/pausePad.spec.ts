import { expect, test, type Page } from '@playwright/test';
import { collectErrors, lowGraphics, openJourney, shot, TEST_STEPS_PER_FRAME } from './helpers';

/**
 * The pause menu on the television with a controller (v1.84). Before, Down stepped through
 * every option of every setting (33 presses to cross Settings), any change put the highlight
 * back at the top, Back always returned to Resume, the main page ran off the bottom of the
 * screen, and the Controls page opened at its end and could not be scrolled.
 */

const Pad = { A: 0, B: 1, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

async function controller(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // The 3D picture at a third of its size: the menus are what is tested, and the software
    // renderer takes seconds over a full 1080p frame. The page and its menus stay 1920×1080.
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 0.34 });
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0, touched: false }));
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons }],
    });
    (window as unknown as { testController: typeof buttons }).testController = buttons;
  });
}

/** Press and release a button, each held for two drawn frames so the game's polling sees it. */
async function press(page: Page, index: number): Promise<void> {
  for (const down of [true, false])
    await page.evaluate(
      ({ index, down }) =>
        new Promise<void>((done) => {
          const b = (window as unknown as { testController: { pressed: boolean; value: number }[] })
            .testController[index];
          b.pressed = down;
          b.value = down ? 1 : 0;
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
      { index, down },
    );
}

const focused = (page: Page) => page.locator('.pause-card .focused');

test('the pause menu on a television with a controller: rows, values, Back and scrolling', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors = collectErrors(page);
  await controller(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off');
  await openJourney(page);
  await page.locator('[data-welcome-drive]').click();
  await page.locator('[data-briefing-drive]:not(.hidden)').click({ timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 300_000 });
  await page.evaluate((n) => window.__game!.setStepsPerFrame(n), TEST_STEPS_PER_FRAME);

  await press(page, Pad.Start);
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await shot(page, 'pausePad', 'main');
  // The whole main page is on the screen: every button, the readings and the foot.
  const offScreen = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pause-card button, .pause-status div, .pause-foot')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth;
      })
      .map((e) => e.textContent?.slice(0, 24)),
  );
  expect(offScreen).toEqual([]);
  // Nothing of the driving screen shows over the card.
  await expect(page.locator('.inst-compass').first()).toBeHidden();

  // Eight buttons, two abreast: Down goes down a row, Right goes across.
  await expect(focused(page)).toContainText('Resume');
  await press(page, Pad.Down);
  await expect(focused(page)).toContainText('Trip journal');
  await press(page, Pad.Right);
  await expect(focused(page)).toContainText('Restart from last camp');
  await press(page, Pad.Down);
  await expect(focused(page)).toHaveText('Settings');
  await press(page, Pad.A);
  await expect(page.locator('.pause-card h2')).toHaveText('Settings');

  // No phone settings on a screen without touch.
  await expect(page.locator('.phone-driving-setting')).toHaveCount(0);
  // Down moves a setting at a time, landing on the option in use: far fewer presses than options.
  const options = await page.locator('.pause-card [data-focus]').count();
  const rows: string[] = [];
  for (let i = 0; i < options; i++) {
    const text = (await focused(page).first().textContent()) ?? '';
    if (text === 'Back') break;
    rows.push(text);
    await expect(focused(page)).toHaveCount(1);
    await press(page, Pad.Down);
  }
  expect(rows.length).toBeGreaterThan(8);
  expect(rows.length).toBeLessThan(options * 0.6);
  // Back is in the foot, on the screen, and one more Down is the top of the page again.
  await expect(focused(page)).toHaveText('Back');
  await press(page, Pad.Down);
  await expect(focused(page)).toHaveText(rows[0]);
  expect(await page.locator('.pause-body').evaluate((b) => b.scrollTop)).toBe(0);

  // Speed units: Right changes it, and the highlight stays on that row, not back at the top.
  for (let i = 0; i < rows.length && (await focused(page).textContent()) !== 'km/h'; i++)
    await press(page, Pad.Down);
  await expect(focused(page)).toHaveText('km/h');
  await press(page, Pad.Right);
  await expect(focused(page)).toHaveText('mph');
  await expect(focused(page)).toHaveClass(/\bon\b/);
  await expect(page.locator('.setting-row.focused-row')).toContainText('Units');
  // At the end of the row Right stays put: it does not run on into the next setting.
  await press(page, Pad.Right);
  await expect(focused(page)).toHaveText('mph');
  await shot(page, 'pausePad', 'settings-units');
  await press(page, Pad.Left);
  await expect(focused(page)).toHaveText('km/h');
  await expect(focused(page)).toHaveClass(/\bon\b/);
  // The highlighted row is in view inside the body.
  const inView = await page.evaluate(() => {
    const row = document.querySelector('.setting-row.focused-row')!.getBoundingClientRect();
    const body = document.querySelector('.pause-body')!.getBoundingClientRect();
    return row.top >= body.top - 1 && row.bottom <= body.bottom + 1;
  });
  expect(inView).toBe(true);

  // Circle goes back to the main page, onto Settings, where this page was opened from.
  await press(page, Pad.B);
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await expect(focused(page)).toHaveText('Settings');

  // Controls: opens at the top of the table, and Down turns its pages.
  await press(page, Pad.Down);
  await expect(focused(page)).toContainText('Main menu');
  await press(page, Pad.Left);
  await expect(focused(page)).toHaveText('Controls');
  await press(page, Pad.A);
  await expect(page.locator('.pause-card h2')).toHaveText('Controls');
  await expect(page.locator('.controls thead')).toBeInViewport();
  await expect(focused(page)).toHaveText('Back');
  await press(page, Pad.Down);
  await expect.poll(() => page.locator('.pause-body').evaluate((b) => b.scrollTop)).toBeGreaterThan(50);
  await expect(focused(page)).toBeInViewport();
  await press(page, Pad.B);
  await expect(focused(page)).toHaveText('Controls');

  // Circle on the main page resumes the drive.
  await press(page, Pad.B);
  await expect(page.locator('.pause')).toBeHidden();
  expect(errors).toEqual([]);
});
