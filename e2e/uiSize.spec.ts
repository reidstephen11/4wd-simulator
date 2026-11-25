import { expect, test, type Page } from '@playwright/test';
import { collectErrors, drawnText, lowGraphics, shot, waitReady, waitSim } from './helpers';

/**
 * Text big enough to read where the owner plays (v1.75): a 1080p television from the couch
 * (no touch, keyboard or controller) and a phone held upright. The interface scales with the
 * screen (src/ui/uiScale.ts); these check the driving screen as drawn.
 */

/** Drive up the deep crossing's west bank with an action prompt and a note up. */
async function drivingScreen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__game!;
    g.teleport(-128, -61, 270);
    // Held on the handbrake: the car stays by the boulder it can winch from, so that prompt
    // stays up however long the slow renderer takes to look.
    g.setInput({ handbrake: true });
  });
  await waitSim(page, 1);
  await page.evaluate(() => window.__game!.showNote('knoll-rock-climb'));
  await expect(page.locator('.history-card')).toBeVisible();
  await expect(page.locator('.prompt').first()).toBeVisible();
}

const under = (texts: { px: number; text: string; cls: string }[], min: number) =>
  texts.filter((t) => t.px < min - 0.05).map((t) => `${t.px.toFixed(1)} px ${t.cls}: ${t.text.slice(0, 30)}`);

test.describe('television', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, hasTouch: false });

  test('1920×1080: every piece of driving text is 18 px or more; prompts, notes and the road name 24 px', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui')),
    ).toBe('1.875');
    await drivingScreen(page);
    await shot(page, 'uiSize', 'tv-driving');
    const texts = await drawnText(page);
    expect(texts.length).toBeGreaterThan(20);
    expect(under(texts, 18)).toEqual([]);
    const big = texts.filter(
      (t) => /prompt|history-text|history-do|hud-stack|course-hint|mission/.test(t.cls) || t.cls === 'STRONG',
    );
    expect(big.length).toBeGreaterThan(2);
    expect(under(big, 24)).toEqual([]);
    // The middle of the picture (the road ahead and the car) stays clear of panels.
    const middle = await page.evaluate(() => {
      const [w, h] = [innerWidth, innerHeight];
      const mid = { left: w / 3, right: (w * 2) / 3, top: h / 3, bottom: (h * 2) / 3 };
      return [
        ...document.querySelectorAll<HTMLElement>('.inst-cluster, .hud-stack > *, .notices > *, .prompt'),
      ]
        .filter((e) => e.offsetParent)
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.left < mid.right && r.right > mid.left && r.top < mid.bottom && r.bottom > mid.top)
        .length;
    });
    expect(middle).toBe(0);
    await page.evaluate(() => window.__game!.setInput(null));
    expect(errors).toEqual([]);
  });
});

test.describe('phone held upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('390×844: driving text is 12 px or more, buttons 44 px, and the prompt and note keep off the road', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    await drivingScreen(page);
    await shot(page, 'uiSize', 'portrait-driving');
    expect(under(await drawnText(page), 12)).toEqual([]);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#ui button')]
        .filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
        .map((b) => ({ r: b.getBoundingClientRect(), label: b.getAttribute('aria-label') ?? b.textContent }))
        .filter(({ r }) => r.width > 0 && Math.min(r.width, r.height) < 44)
        .map(({ r, label }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
    // The prompt and the note stay in the band under the dials, above the road and the car.
    // (A note folds away after a few seconds on a phone: show it again to measure it.)
    await page.evaluate(() => window.__game!.showNote('knoll-rock-climb'));
    await expect(page.locator('.history-card')).toBeVisible();
    for (const sel of ['.prompt', '.history-card']) {
      const box = (await page.locator(sel).first().boundingBox())!;
      expect(box.y + box.height, sel).toBeLessThan(844 * 0.3);
    }
    await page.evaluate(() => window.__game!.setInput(null));
    expect(errors).toEqual([]);
  });
});

test.describe('phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('844×390: dial numbers and the pitch and roll panel read at 12 px or more; buttons 44 px', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    await drivingScreen(page);
    await page.evaluate(() => window.__game!.setCrawlGauges('on'));
    await expect(page.locator('.crawl-gauges')).toBeVisible();
    await waitSim(page, 0.3);
    await shot(page, 'uiSize', 'landscape-driving');
    expect(under(await drawnText(page), 12)).toEqual([]);
    // The panel is a canvas: its lettering is drawn 19.5 units high on a phone (crawlGauges.ts),
    // so the panel must be shown at 12 / 19.5 of its drawn size or more.
    const shown = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.crawl-gauges canvas')!;
      return c.getBoundingClientRect().width / 318;
    });
    expect(shown * 19.5).toBeGreaterThanOrEqual(12);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('#ui button')]
        .filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
        .map((b) => ({ r: b.getBoundingClientRect(), label: b.getAttribute('aria-label') ?? b.textContent }))
        .filter(({ r }) => r.width > 0 && Math.min(r.width, r.height) < 44)
        .map(({ r, label }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
    await page.evaluate(() => window.__game!.setInput(null));
    expect(errors).toEqual([]);
  });
});

/** Pairs of the given boxes that overlap by more than a pixel, named for the failure message. */
function overlaps(boxes: { name: string; r: DOMRect }[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i].r, boxes[j].r];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
        out.push(`${boxes[i].name} × ${boxes[j].name}`);
    }
  return out;
}

test.describe('phone held upright, every HUD style and UI size', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a history note keeps clear of the road name and hint, and every vehicle description stays inside its button', async ({
    page,
  }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await lowGraphics(page);
    await page.goto('/?surprises=off&track=reopened');
    await waitReady(page);
    // At the start the road name and its hint show under the dials (v1.79 screenshot).
    await page.evaluate(() => window.__game!.showNote('knoll-rock-climb'));
    await expect(page.locator('.history-card')).toBeVisible();
    await expect(page.locator('.hud-stack .course-hint')).toBeVisible();
    const styles = ['dash', 'edge', 'kit'] as const;
    const sizes = [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
    ];
    for (const style of styles)
      for (const size of sizes)
        for (const ui of ['normal', 'large'] as const) {
          await page.setViewportSize(size);
          await page.evaluate(
            ({ style, ui }) => window.__game!.changeSettings({ hudStyle: style, uiSize: ui }),
            { style, ui },
          );
          // The note closes itself after a few seconds: open it again for each check.
          await page.evaluate(() => window.__game!.showNote('knoll-rock-climb'));
          await waitSim(page, 0.2);
          await expect(page.locator('.history-card')).toBeVisible();
          const where = `${style} ${size.width}×${size.height} ui ${ui}`;
          const found = await page.evaluate(() => {
            const near = [
              ...document.querySelectorAll<HTMLElement>('.hud-stack > *, .inst-cluster > *, .inst-compass'),
            ]
              .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0)
              .map((e) => ({ name: e.className.split(' ')[0], r: e.getBoundingClientRect().toJSON() }));
            const card = document.querySelector<HTMLElement>('.history-card')!;
            return { near, card: { name: 'history-card', r: card.getBoundingClientRect().toJSON() } };
          });
          const hits = overlaps([found.card, ...found.near]).filter((p) => p.startsWith('history-card'));
          expect(hits, where).toEqual([]);
          // The hint's text shows for a few seconds after a new road, so also check the widest the
          // road name and hint may grow: it must stop short of the note.
          const reach = await page.evaluate(() => {
            const stack = document.querySelector<HTMLElement>('.hud-stack')!;
            const card = document.querySelector<HTMLElement>('.history-card')!.getBoundingClientRect();
            return {
              right: stack.getBoundingClientRect().left + parseFloat(getComputedStyle(stack).maxWidth),
              cardLeft: card.left,
            };
          });
          expect(reach.right, where).toBeLessThanOrEqual(reach.cardLeft);
          if (style === 'dash' && size.width === 390 && ui === 'large')
            await shot(page, 'uiSize', 'portrait-note-hint');
        }
    await page.setViewportSize({ width: 390, height: 844 });

    // The vehicle list in the pause menu: each description stays inside its own button.
    // The note closes itself after a while; close it if it is still up.
    await page.evaluate(() => document.querySelector<HTMLElement>('.history-card:not(.hidden)')?.click());
    await page.keyboard.press('Escape');
    await expect(page.locator('.pause-card h2')).toHaveText('Paused');
    await page.locator('.pause-card [data-act="vehicle"]').click();
    await expect(page.locator('.vehicle-choice').first()).toBeVisible();
    for (const style of styles)
      for (const size of sizes)
        for (const ui of ['normal', 'large'] as const) {
          await page.setViewportSize(size);
          await page.evaluate(
            ({ style, ui }) => window.__game!.changeSettings({ hudStyle: style, uiSize: ui }),
            { style, ui },
          );
          const where = `${style} ${size.width}×${size.height} ui ${ui}`;
          const spilled = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.vehicle-choice')]
              .filter((b) => b.scrollHeight > b.clientHeight + 1)
              .map((b) => b.firstChild?.textContent ?? ''),
          );
          expect(spilled, where).toEqual([]);
          const boxes = await page.evaluate(() =>
            // The rows of the page's body, which scrolls under its heading and foot (v1.84).
            [...document.querySelectorAll<HTMLElement>('.pause-body > *')].map((e, i) => ({
              name: `${i} ${e.textContent?.slice(0, 20)}`,
              r: e.getBoundingClientRect().toJSON(),
            })),
          );
          expect(overlaps(boxes), where).toEqual([]);
          if (style === 'dash' && size.width === 390 && ui === 'large')
            await shot(page, 'uiSize', 'portrait-vehicle-list');
        }
    expect(errors).toEqual([]);
  });
});
