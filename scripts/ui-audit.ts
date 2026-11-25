/**
 * UI audit: the real game at the screens the owner plays on, with a screenshot of each
 * screen of the interface and a measurement of every piece of text and every button on it.
 * The pictures are for a reviewer to read; the numbers flag text too small to read and
 * buttons too small to press.
 *
 * Views: `tv` (1920×1080, keyboard or controller, read from a couch: the Batocera box),
 * `portrait` (390×844 touch) and `landscape` (844×390 touch).
 * Usage (against `npx vite build && npx vite preview --port 4173`):
 *   npx vite-node scripts/ui-audit.ts <outDir> [views=tv,portrait,landscape] [url=http://localhost:4173/]
 * PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 *
 * Text is measured as drawn on screen: an element's font size times any CSS transform on it
 * (the tool wheel scales itself to fit), and SVG lettering's font size times the drawing's
 * scale. Each screen also reports `cover`, the share of the screen under the interface
 * (panels, cards, text and buttons), and `coverMiddle`, the same for the middle third of the
 * picture, where the road ahead and the vehicle are.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: ui-audit.ts <outDir> [key=value...]');
const arg = (key: string, fallback: string) =>
  rest.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const views = arg('views', 'tv,portrait,landscape').split(',');
const url = arg('url', 'http://localhost:4173/');

/**
 * Smallest text (CSS px) a player can read: on a 1080p television from a couch about 24 px
 * (the usual ten-foot guidance), on a phone in the hand about 12 px.
 */
const MIN_TEXT = { tv: 24, portrait: 12, landscape: 12 } as const;
/** Smallest side (CSS px) of a button a thumb can hit reliably. */
const MIN_TOUCH = 44;

interface Measured {
  text: { px: number; text: string; cls: string }[];
  buttons: { w: number; h: number; label: string }[];
  cover: number;
  coverMiddle: number;
}

/** Every visible piece of text with its font size, and every visible button with its size. */
const measure = (page: Page) =>
  page.evaluate(() => {
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
    /**
     * How much an element is drawn larger or smaller than its own size: a CSS transform on it
     * or an ancestor (the tool wheel fits itself to the screen with scale()).
     */
    const drawnScale = (el: HTMLElement) => {
      const h = el.offsetHeight;
      // offsetHeight is whole pixels: a ratio within 3% of 1 is rounding, not a transform.
      const k = h > 0 ? el.getBoundingClientRect().height / h : 1;
      return Math.abs(k - 1) < 0.03 ? 1 : k;
    };
    const text: { px: number; text: string; cls: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      // SVG lettering is measured below, as drawn: its font size is in drawing units.
      if (!t || !el || el.closest('svg') || !seen(el)) continue;
      text.push({
        px: +(parseFloat(getComputedStyle(el).fontSize) * drawnScale(el)).toFixed(1),
        text: t.slice(0, 40),
        cls: (el.getAttribute('class') ?? el.tagName).slice(0, 40),
      });
    }
    // SVG gauge lettering scales with its drawing: its font size times the drawing's scale on screen.
    for (const el of document.querySelectorAll<SVGTextElement>('svg text')) {
      if (!seen(el) || !el.textContent?.trim()) continue;
      const m = el.getScreenCTM();
      const k = m ? Math.hypot(m.a, m.b) : 1;
      text.push({
        px: +(parseFloat(getComputedStyle(el).fontSize) * k).toFixed(1),
        text: el.textContent.trim().slice(0, 40),
        cls: `svg ${el.getAttribute('class') ?? 'text'}`.slice(0, 40),
      });
    }
    const buttons = [...document.querySelectorAll('button')].filter(seen).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        label: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 30),
      };
    });
    // What the interface covers: every visible panel, card, button, picture or line of text
    // under #ui, marked on an 8 px grid. Full-screen layers (menus' dimmers) are left out.
    const G = 8;
    const cols = Math.ceil(innerWidth / G);
    const rows = Math.ceil(innerHeight / G);
    const grid = new Uint8Array(cols * rows);
    const ui = document.getElementById('ui');
    for (const el of ui ? ui.querySelectorAll<HTMLElement>('*') : []) {
      const r = el.getBoundingClientRect();
      if (r.width * r.height > innerWidth * innerHeight * 0.6 || !seen(el)) continue;
      const s = getComputedStyle(el);
      const filled =
        (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') ||
        s.backgroundImage !== 'none' ||
        el instanceof SVGSVGElement ||
        el instanceof HTMLCanvasElement ||
        [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim());
      if (!filled) continue;
      for (let y = Math.max(0, Math.floor(r.top / G)); y < Math.min(rows, Math.ceil(r.bottom / G)); y++)
        for (let x = Math.max(0, Math.floor(r.left / G)); x < Math.min(cols, Math.ceil(r.right / G)); x++)
          grid[y * cols + x] = 1;
    }
    let all = 0;
    let mid = 0;
    let midCells = 0;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const inMid = x >= cols / 3 && x < (cols * 2) / 3 && y >= rows / 3 && y < (rows * 2) / 3;
        all += grid[y * cols + x];
        if (inMid) {
          midCells++;
          mid += grid[y * cols + x];
        }
      }
    return { text, buttons, cover: all / (cols * rows), coverMiddle: mid / midCells };
  });

const report: Record<string, unknown> = {};
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

for (const view of views) {
  if (view !== 'tv' && view !== 'portrait' && view !== 'landscape') throw new Error(`Unknown view ${view}`);
  const touch = view !== 'tv';
  const size =
    view === 'tv'
      ? { width: 1920, height: 1080 }
      : view === 'portrait'
        ? { width: 390, height: 844 }
        : { width: 844, height: 390 };
  const page = await browser.newPage({
    viewport: size,
    hasTouch: touch,
    isMobile: touch,
    // A phone screenshot at 1× is too coarse to judge lettering by eye.
    deviceScaleFactor: touch ? 2 : 1,
  });
  // A frame on the software renderer can take seconds, and a screenshot waits for one.
  page.setDefaultTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      '4wdsim.save.v2',
      JSON.stringify({
        version: 1,
        settings: { quality: 'low' },
        unlocked: ['perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79', 'sooty80'],
      }),
    );
  });
  const screens: Record<string, unknown> = {};
  const capture = async (name: string) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/${view}-${name}.png` });
    const m: Measured = await measure(page);
    const sizes = [...new Set(m.text.map((t) => t.px))].sort((a, b) => a - b);
    screens[name] = {
      textSizes: sizes,
      smallText: m.text.filter((t) => t.px < MIN_TEXT[view]).sort((a, b) => a.px - b.px),
      smallButtons: touch ? m.buttons.filter((b) => Math.min(b.w, b.h) < MIN_TOUCH) : [],
      buttons: m.buttons.length,
      cover: +m.cover.toFixed(3),
      coverMiddle: +m.coverMiddle.toFixed(3),
    };
    const small = m.text.filter((t) => t.px < MIN_TEXT[view]).length;
    console.log(
      `${view} ${name}: text ${sizes[0] ?? '-'}–${sizes[sizes.length - 1] ?? '-'} px, ${small} under ${MIN_TEXT[view]} px, ` +
        `covers ${(m.cover * 100).toFixed(1)}% (middle ${(m.coverMiddle * 100).toFixed(1)}%)`,
    );
  };
  const press = async (tap: string, key: string) => {
    if (touch) await page.locator(`[data-tap="${tap}"]`).first().tap();
    else await page.keyboard.press(key);
  };

  await page.goto(url);
  await page.locator('.welcome').waitFor({ state: 'visible' });
  await capture('1-title');
  const begin = page.locator('[data-title-begin]');
  if (await begin.isVisible()) await begin.click();
  const journey = page.locator('[data-title-journey]');
  if (await journey.isVisible()) await journey.click();
  await capture('2-setup');
  await page.locator('[data-welcome-drive]').click();
  const briefing = page.locator('[data-briefing-drive]:not(.hidden)');
  await briefing.waitFor({ timeout: 300_000 });
  await capture('3-briefing');
  await briefing.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 300_000 });
  await capture('4-arrived');
  await page.evaluate(() => {
    if (window.__game!.vehicle().engineOff) window.__game!.startEngine();
  });
  await page.waitForFunction(
    () => {
      document.querySelector<HTMLElement>('.history-card.reading')?.click();
      return window.__game!.vehicle().engineRunning;
    },
    null,
    { polling: 100 },
  );
  // On the steep pinch in low range, where the crawl gauges, lesson card and range badge all show.
  await page.evaluate(() => {
    const g = window.__game!;
    g.setStepsPerFrame(30);
    g.teleport(-33, 2428, 5);
    g.setInput({ throttle: 0.5 });
  });
  await page.waitForTimeout(4000);
  await capture('5-driving');
  await page.evaluate(() => window.__game!.setInput({ throttle: 0, brake: 1 }));
  // With a keyboard the wheel is open while Q is held: a press and release would close it
  // before it was measured, so hold Q down until after the capture.
  if (touch) await page.locator('[data-tap="toolMenu"]').first().tap();
  else await page.keyboard.down('KeyQ');
  await page.waitForFunction(() => window.__game!.ui().toolMenu);
  await capture('6-tools');
  // A touch menu closes with a tap outside the wheel (its top left corner); a keyboard's menu key
  // closes it. No key is pressed in a touch view: a key press makes the keyboard the device in
  // use, and the game then hides the touch buttons, so the map button could not be tapped
  // (why the touch views stopped here before v1.75).
  if (touch) await page.locator('.tool-menu').tap({ position: { x: 4, y: 4 } });
  else await page.keyboard.up('KeyQ');
  await page.waitForFunction(() => !window.__game!.ui().toolMenu);
  await press('map', 'KeyM');
  // The paper map unfolds over a second or so of slow frames.
  await page.waitForFunction(() => window.__game!.ui().map);
  await page.waitForTimeout(6000);
  await capture('7-map');
  if (touch) await page.locator('.paper-map-close').tap();
  else await page.keyboard.press('KeyM');
  await page.waitForFunction(() => !window.__game!.ui().map);
  await press('pause', 'Escape');
  await page.waitForFunction(() => window.__game!.ui().pause);
  await page.waitForTimeout(2000);
  await capture('8-pause');
  report[view] = { viewport: size, minText: MIN_TEXT[view], minTouch: touch ? MIN_TOUCH : null, screens };
  // Written after each view, so a later view failing keeps the earlier ones.
  writeFileSync(`${outDir}/ui-audit.json`, JSON.stringify(report, null, 2));
  await page.close();
}
await browser.close();
