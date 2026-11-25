import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

test('the built site ships a Pages-scoped manifest and service worker', async ({ page, request }) => {
  const errors = collectErrors(page);
  await page.goto('/?track=reopened');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#54614B');
  await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute(
    'href',
    /apple-touch-icon\.png/,
  );
  const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestRes = await request.get(new URL(manifestHref!, page.url()).href);
  // Local preview serves the file at the site root; the injected Pages link 404s here.
  const manifest = manifestRes.ok()
    ? await manifestRes.json()
    : await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Over the Cape');
  expect(manifest.short_name).toBe('Cape');
  expect(manifest.start_url).toBe('/over-the-cape/');
  expect(manifest.scope).toBe('/over-the-cape/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBeUndefined();
  expect(manifest.theme_color).toBe('#54614B');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBe(true);
  const worker = await sw.text();
  expect(worker).toContain('/over-the-cape/');
  // A new build waits for the game to ask for it (v1.23) instead of taking over at once.
  expect(worker).toContain('SKIP_WAITING');
  expect(errors).toEqual([]);
});
