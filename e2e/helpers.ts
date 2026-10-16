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
