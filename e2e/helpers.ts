import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Collect console errors and page errors. Font CDN hiccups are ignored. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/fonts\.(googleapis|gstatic)\.com/.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 120_000 });
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
