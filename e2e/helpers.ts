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

/**
 * Press Drive on the welcome screen (it starts on the saved choices), then wait until the
 * world is loaded and the engine has started (it cranks for about a second). After a map
 * change from the pause menu the game loads without the welcome screen.
 */
export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__game?.ready === true || document.querySelector('[data-welcome-drive]') !== null,
    null,
    { timeout: 120_000 },
  );
  const drive = page.locator('[data-welcome-drive]');
  if (await drive.count()) await drive.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
  await waitEngine(page);
}

/** Wait until the engine has caught after starting (on arrival or after a vehicle swap). */
export async function waitEngine(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game!.vehicle().engineRunning, null, {
    timeout: 300_000,
    polling: 100,
  });
}

/**
 * Screenshot into docs/screenshots/<milestone>/ when SCREENSHOTS names that milestone
 * (e.g. SCREENSHOTS=M1), otherwise into test-results/screenshots/.
 */
export async function shot(page: Page, milestone: string, name: string): Promise<void> {
  const wanted = (process.env.SCREENSHOTS ?? '').split(',').includes(milestone);
  const dir = wanted ? `docs/screenshots/${milestone}` : `test-results/screenshots/${milestone}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
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
