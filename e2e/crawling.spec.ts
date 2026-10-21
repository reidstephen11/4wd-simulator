import { expect, test } from '@playwright/test';
import { vehicleTuning } from '../src/data/vehicle';
import { collectErrors, shot, waitReady, waitSim } from './helpers';

test('crawl controls work from keyboard, HUD and gamepad; course hints explain the selected line', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => window.__game!.setQuality('low'));
  const front = page.getByRole('button', { name: 'Front differential lock', exact: true });
  const rear = page.getByRole('button', { name: 'Rear differential lock', exact: true });
  const crawl = page.getByRole('button', { name: 'Precision crawl', exact: true });
  await page.keyboard.press('KeyL');
  await page.keyboard.press('KeyZ');
  await page.keyboard.press('KeyX');
  await page.keyboard.press('KeyP');
  await expect(front).toHaveAttribute('aria-pressed', 'true');
  await expect(rear).toHaveAttribute('aria-pressed', 'true');
  await expect(crawl).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.__game!.vehicle())).range).toBe('low');

  await front.click();
  await expect(front).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => {
    const pad = {
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    Object.assign(window, { crawlPad: pad });
  });
  const chooseWithPad = async (label: string, x: number, y: number) => {
    await page.evaluate(
      ({ x, y }) => {
        const pad = (
          window as unknown as {
            crawlPad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
          }
        ).crawlPad;
        pad.axes = [x, y, 0, 0];
        pad.buttons[4] = { pressed: true, value: 1 };
      },
      { x, y },
    );
    await expect(page.locator('.tool-option.selected')).toHaveText(label);
    await page.evaluate(() => {
      const pad = (
        window as unknown as {
          crawlPad: { axes: number[]; buttons: { pressed: boolean; value: number }[] };
        }
      ).crawlPad;
      pad.axes = [0, 0, 0, 0];
      pad.buttons[4] = { pressed: false, value: 0 };
    });
    await expect(page.locator('.tool-menu')).toHaveClass(/hidden/);
  };
  // Stick direction of the i-th of the menu's eight options, clockwise from the top.
  const toward = (i: number): [number, number] => {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  };
  await chooseWithPad('Lock front diff', ...toward(1));
  await expect(front).toHaveAttribute('aria-pressed', 'true');
  await chooseWithPad('Unlock rear diff', ...toward(3));
  await expect(rear).toHaveAttribute('aria-pressed', 'false');
  await chooseWithPad('Disable precision crawl', ...toward(5));
  await expect(crawl).toHaveAttribute('aria-pressed', 'false');
  await crawl.click();
  await expect(crawl).toHaveAttribute('aria-pressed', 'true');
  await rear.click();
  await expect(rear).toHaveAttribute('aria-pressed', 'true');

  // Keys pressed in a paused menu must not become vehicle commands on resume.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-card h2')).toHaveText('Paused');
  await page.keyboard.press('KeyZ');
  await page.keyboard.press('KeyP');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause')).toHaveClass(/hidden/);
  await waitSim(page, 0.2);
  await expect(front).toHaveAttribute('aria-pressed', 'true');
  await expect(crawl).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => window.__game!.teleportPoi('camp-rock-course'));
  await expect(page.locator('.course-hint strong')).toHaveText('Moderate · Cross-axle');
  await expect(page.locator('.course-hint small')).toContainText('P crawl');
  const before = await page.evaluate(() => window.__game!.vehicle());
  await page.keyboard.down('KeyW');
  await waitSim(page, 1.5);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__game!.vehicle());
  expect(after.z).toBeLessThan(before.z - 0.3);
  expect(Math.abs(after.speed)).toBeLessThan(vehicleTuning.crawling.forwardKmh / 3.6 + 0.4);
  await page.evaluate(() => {
    const g = window.__game!;
    const h = g.heightAt(-116, 247);
    g.setCamera(-100, h + 14, 274, -116, h + 0.3, 247);
  });
  await shot(page, 'crawling', 'camp-course-and-controls');
  expect(errors).toEqual([]);
});
