import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Collect console errors and page errors. Font CDN hiccups are ignored. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const source = m.location().url;
    if (/fonts\.(googleapis|gstatic)\.com/.test(`${text} ${source}`)) return;
    errors.push(source ? `${text} (${source})` : text);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Open episode setup through the console title, retaining a saved camp for gameplay checks. */
export async function openJourney(page: Page): Promise<void> {
  await page.locator('.welcome').waitFor({ state: 'visible' });
  const begin = page.locator('[data-title-begin]');
  if (await begin.isVisible()) await begin.click();
  const journey = page.locator('[data-title-journey]');
  if (await journey.isVisible()) {
    await journey.click();
    const resume = page.locator('[data-group="start"][data-value="resume"]');
    if (await resume.isVisible()) await resume.click();
  }
}

/**
 * Press Drive on the welcome screen (it starts on the saved choices), then Drive again on
 * the episode briefing once the map has built, and wait until the engine has started (it
 * cranks for about a second).
 */
export async function waitReady(page: Page): Promise<void> {
  await openJourney(page);
  await page.locator('[data-welcome-drive]').click({ timeout: 120_000 });
  await driveFromBriefing(page);
}

/**
 * Physics steps run per frame in the browser tests. The software renderer takes seconds
 * to draw a frame of the 6 km map, so at real time the game would crawl.
 */
export const TEST_STEPS_PER_FRAME = 24;

/** Wait for the briefing's Drive button (the map has built), press it and wait for the engine. */
export async function driveFromBriefing(page: Page): Promise<void> {
  await page.locator('[data-briefing-drive]:not(.hidden)').click({ timeout: 300_000 });
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
  await page.evaluate((n) => window.__game!.setStepsPerFrame(n), TEST_STEPS_PER_FRAME);
  await waitEngine(page);
}

/**
 * Start without a save on the low graphics preset (the 6 km map is slow on the software
 * renderer). Leaves any save a test wrote itself alone.
 */
export async function lowGraphics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('4wdsim.save.v2'))
      localStorage.setItem(
        '4wdsim.save.v2',
        JSON.stringify({
          version: 1,
          settings: { quality: 'low' },
        }),
      );
  });
}

/**
 * Wait until the engine has caught after starting (on arrival or after a vehicle swap). On a
 * touch screen a history note stops the game until it's tapped, so tap any that shows.
 */
export async function waitEngine(page: Page): Promise<void> {
  // The engine is off on arrival until the pedal is pressed: start it as the pedal would.
  await page.evaluate(() => {
    if (window.__game!.vehicle().engineOff) window.__game!.startEngine();
  });
  await page.waitForFunction(
    () => {
      document.querySelector<HTMLElement>('.history-card.reading')?.click();
      return window.__game!.vehicle().engineRunning;
    },
    null,
    { timeout: 300_000, polling: 100 },
  );
}

/**
 * Screenshot into docs/screenshots/<milestone>/ when SCREENSHOTS names that milestone
 * (e.g. SCREENSHOTS=M1), otherwise into test-results/screenshots/.
 */
export async function shot(page: Page, milestone: string, name: string): Promise<void> {
  const wanted = (process.env.SCREENSHOTS ?? '').split(',').includes(milestone);
  const dir = wanted ? `docs/screenshots/${milestone}` : `test-results/screenshots/${milestone}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, animations: 'disabled' });
}

/**
 * Wait until the game has simulated `seconds` more. Use this instead of a fixed real-time
 * wait for anything that depends on the car moving: on a slow machine (or a software
 * renderer) the simulation runs slower than real time.
 */
export async function waitSim(page: Page, seconds: number, timeoutMs = 300_000): Promise<void> {
  const t0 = await page.evaluate(() => window.__game!.simTime());
  await page.waitForFunction((end) => window.__game!.simTime() >= end, t0 + seconds, {
    timeout: timeoutMs,
    polling: 100,
  });
}

/**
 * Every visible piece of text in the interface with its size as drawn on screen (CSS px):
 * the font size times any CSS transform on the way, and SVG lettering's font size times its
 * drawing's scale (as scripts/ui-audit.ts measures it).
 */
export function drawnText(page: Page): Promise<{ px: number; text: string; cls: string }[]> {
  return page.evaluate(() => {
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      }
      return true;
    };
    const out: { px: number; text: string; cls: string }[] = [];
    const walker = document.createTreeWalker(document.getElementById('ui')!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest('svg') || !seen(el)) continue;
      // offsetHeight is whole pixels: a ratio within 3% of 1 is rounding, not a transform.
      const r = el.offsetHeight > 0 ? el.getBoundingClientRect().height / el.offsetHeight : 1;
      const k = Math.abs(r - 1) < 0.03 ? 1 : r;
      out.push({
        px: parseFloat(getComputedStyle(el).fontSize) * k,
        text: t,
        cls: el.className || el.tagName,
      });
    }
    for (const el of document.querySelectorAll<SVGTextElement>('#ui svg text')) {
      if (!el.textContent?.trim() || !seen(el)) continue;
      const m = el.getScreenCTM();
      const k = m ? Math.hypot(m.a, m.b) : 1;
      out.push({
        px: parseFloat(getComputedStyle(el).fontSize) * k,
        text: el.textContent.trim(),
        cls: `svg ${el.getAttribute('class') ?? ''}`,
      });
    }
    return out;
  });
}
