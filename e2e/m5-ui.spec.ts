import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot, waitReady } from './helpers';

declare global {
  interface Window {
    __discoveryCards?: string[];
  }
}

/**
 * Record the name on every "Discovered" card as it is added to the page. The card is removed
 * 4.5 s of real time after it appears, which on a slow machine (software renderer) can be
 * shorter than one frame, so waiting for it in the DOM can miss it.
 */
async function recordDiscoveryCards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    window.__discoveryCards = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement) || n.classList.contains('run-card')) continue;
          const name = n.querySelector('.discovery-name');
          if (name) seen.push(name.textContent ?? '');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

function discoveryCards(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__discoveryCards ?? []);
}

test('M5: driving into a POI shows the toast, adds it to the map, and survives a reload', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await recordDiscoveryCards(page);
  await page.goto('/');
  await waitReady(page);
  // Simulate up to a second per frame: the software renderer takes seconds per frame.
  await page.evaluate(() => window.__game!.setCatchUp(true));
  // Spawning at River Flat Camp discovers it.
  await expect.poll(() => discoveryCards(page), { timeout: 30_000 }).toContain('River Flat Camp');
  await shot(page, 'M5', 'hud-and-first-discovery');

  // Drive into the Gravel Ford's radius.
  await page.evaluate(() => window.__game!.teleport(-212, 228, 320));
  expect(await page.evaluate(() => window.__game!.discovered())).not.toContain('gravel-ford');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.7 }));
  await expect
    .poll(() => page.evaluate(() => window.__game!.discovered()), { timeout: 300_000 })
    .toContain('gravel-ford');
  await page.evaluate(() => window.__game!.setInput({ brake: 1 }));
  expect(await discoveryCards(page)).toContain('Gravel Ford');
  await shot(page, 'M5', 'discovery-toast');
  await page.evaluate(() => window.__game!.setInput(null));

  // The map shows it (and nothing undiscovered).
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().map)).toBe(true);
  expect(await page.evaluate(() => window.__game!.ui().paused)).toBe(true);
  await page.waitForTimeout(6000);
  await shot(page, 'M5', 'paper-map');
  await page.keyboard.press('KeyM');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().map)).toBe(false);

  // Pause menu, settings and controls.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await shot(page, 'M5', 'pause-menu');
  await page.locator('[data-act="settings"]').click();
  await page.locator('[data-quality="low"]').click();
  await page.locator('[data-units="mph"]').click();
  await shot(page, 'M5', 'settings');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-act="controls"]').click();
  await shot(page, 'M5', 'controls');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-act="resume"]').click();
  expect(await page.evaluate(() => window.__game!.ui().paused)).toBe(false);
  // The speed in the status strip follows the units setting.
  await expect(page.locator('.status-speed-value')).toBeVisible();
  await expect(page.locator('.status-speed-value')).toContainText('mph');

  // Tool menu.
  await page.evaluate(() => window.__game!.teleport(-188, 225, 315));
  await page.waitForTimeout(1000);
  await page.keyboard.down('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().toolMenu)).toBe(true);
  await page.mouse.move(640, 360);
  await page.locator('.tool-option', { hasText: 'Place planks' }).hover();
  await expect(page.locator('.tool-option.selected')).toHaveText('Place planks');
  await shot(page, 'M5', 'tool-menu');
  await page.keyboard.up('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().mode)).toBe('plankPlace');
  await page.waitForTimeout(1500);
  await shot(page, 'M5', 'plank-placement-prompts');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().mode)).toBe('drive');

  // Reload: discoveries and settings are kept.
  await page.reload();
  await waitReady(page);
  const disc = await page.evaluate(() => window.__game!.discovered());
  expect(disc).toContain('gravel-ford');
  expect(disc).toContain('river-flat-camp');
  await expect(page.locator('.status-speed-value')).toContainText('mph');
  expect(errors).toEqual([]);
});

test('M5: with storage blocked the game still runs', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is disabled', 'SecurityError');
      },
    });
  });
  await recordDiscoveryCards(page);
  await page.goto('/');
  await waitReady(page);
  await expect.poll(() => discoveryCards(page), { timeout: 30_000 }).toContain('River Flat Camp');
  const t0 = await page.evaluate(() => window.__game!.simTime());
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  // Poll rather than wait a fixed time: the software renderer can take longer than 3 s per frame.
  await expect
    .poll(() => page.evaluate(() => window.__game!.simTime()), { timeout: 60_000 })
    .toBeGreaterThan(t0);
  await shot(page, 'M5', 'storage-blocked-still-running');
  expect(errors).toEqual([]);
});
