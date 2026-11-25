import { expect, test, type Page } from '@playwright/test';
import { openJourney, collectErrors, lowGraphics, shot, waitReady } from './helpers';

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

test('M5: driving into a place shows its card and its note, adds it to the map, and settings survive a reload', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  await recordDiscoveryCards(page);
  await lowGraphics(page);
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  // Starting at Ironbark camp discovers it.
  await expect.poll(() => discoveryCards(page), { timeout: 30_000 }).toContain('Ironbark camp');
  await shot(page, 'M5', 'hud-and-first-discovery');

  // Drive down to the ford, from where its track leaves the west bank track.
  await page.evaluate(() => window.__game!.teleport(-166, 43.5, 97));
  expect(await page.evaluate(() => window.__game!.discovered())).not.toContain('creek-ford');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0.7 }));
  await expect
    .poll(() => page.evaluate(() => window.__game!.discovered()), { timeout: 300_000 })
    .toContain('creek-ford');
  await page.evaluate(() => window.__game!.setInput({ brake: 1 }));
  expect(await discoveryCards(page)).toContain('The ford');
  // Its note comes up too.
  await expect.poll(() => page.evaluate(() => window.__game!.historyShown())).toContain('The ford');
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
  // The speedometer follows the units setting.
  await expect(page.locator('.inst-cluster')).toBeVisible();
  await expect(page.locator('.inst-cluster')).toContainText('mph');

  // Tool menu.
  await page.evaluate(() => window.__game!.teleport(-171, 0, 0));
  await page.waitForTimeout(1000);
  await page.keyboard.down('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().toolMenu)).toBe(true);
  await page.mouse.move(640, 360);
  await page.getByRole('button', { name: 'Place planks', exact: true }).hover();
  await expect(page.locator('.tool-option.selected')).toHaveAttribute('aria-label', 'Place planks');
  await shot(page, 'M5', 'tool-menu');
  await page.keyboard.up('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().mode)).toBe('plankPlace');
  await page.waitForTimeout(1500);
  await shot(page, 'M5', 'plank-placement-prompts');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game!.ui().mode)).toBe('drive');

  // Reload: settings are kept, and the run carries on from its last camp.
  await page.reload();
  await openJourney(page);
  await waitReady(page);
  expect(await page.evaluate(() => window.__game!.episode())).toMatchObject({ camp: 'ironbark-camp' });
  await expect(page.locator('.inst-cluster')).toContainText('mph');
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
  await page.goto('/?surprises=off&track=reopened');
  await openJourney(page);
  await waitReady(page);
  await expect.poll(() => discoveryCards(page), { timeout: 30_000 }).toContain('Daintree Village');
  const t0 = await page.evaluate(() => window.__game!.simTime());
  await page.evaluate(() => window.__game!.setInput({ throttle: 1 }));
  await expect.poll(() => page.evaluate(() => window.__game!.simTime())).toBeGreaterThan(t0 + 1);
  await shot(page, 'M5', 'storage-blocked-still-running');
  expect(errors).toEqual([]);
});
