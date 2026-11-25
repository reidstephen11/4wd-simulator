/**
 * Menu walk: every menu of the real game at the television's size (1920×1080, no touch, no
 * keyboard), worked with a simulated PS4 controller only. After every press it saves a
 * picture and records what is highlighted, so a reviewer can follow the highlight through
 * each page, and the numbers flag what a still picture cannot show: items the D-pad never
 * reaches, a press that moves the highlight the wrong way, a highlight off the screen, a
 * page that takes too many presses to cross, and Back losing its place.
 *
 * Usage (against `npm run dev`, or `npx vite build && npx vite preview --port 4173`):
 *   npx vite-node scripts/menu-walk.ts <outDir> [url=http://localhost:5173/] [quality=low] [only=title|pause]
 * PW_CHROMIUM names another Chromium than the pinned Playwright's own.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pad } from '../src/data/controls';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) throw new Error('Usage: menu-walk.ts <outDir> [key=value...]');
const arg = (key: string, fallback: string) =>
  rest.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const url = arg('url', 'http://localhost:5173/');
const quality = arg('quality', 'low');
/** `title`: the title screens only, which take a minute. `pause`: straight into the game, for its pages. */
const only = arg('only', '');
/** Most presses spent crossing one page before the walk gives up on it. */
const MAX_PRESSES = 90;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(300_000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`[error] ${m.text()}`));
await page.addInitScript((quality) => {
  localStorage.setItem(
    '4wdsim.save.v2',
    JSON.stringify({
      version: 1,
      settings: { quality },
      unlocked: ['perentie', 'hilux', 'unimog', 'troopy', 'patrol', 'lc79', 'sooty80'],
    }),
  );
  // The 3D picture at a third of its size: the menus are what is being walked, and the software
  // renderer takes seconds over a full 1080p frame. The page and its menus stay 1920×1080.
  Object.defineProperty(window, 'devicePixelRatio', { get: () => 0.34 });
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, value: 0, touched: false }));
  const pad = {
    connected: true,
    mapping: 'standard',
    id: 'Wireless Controller',
    index: 0,
    axes: [0, 0, 0, 0],
    buttons,
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  (window as unknown as { walkPad: typeof pad }).walkPad = pad;
}, quality);

interface Item {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Wholly on the screen and inside every scrolling box that holds it. */
  shown: boolean;
}
interface Snap {
  heading: string;
  /** The highlighted item, and which of `items` it is. */
  focus: (Item & { style: string; plain: string; index: number }) | null;
  focused: number;
  items: Item[];
}

/** What is on the screen now: the page's heading, the highlighted item and every item a pad can reach. */
const snap = (): Promise<Snap> =>
  page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
      }
      return true;
    };
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return false;
      for (let e = el.parentElement; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (!/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) continue;
        const p = e.getBoundingClientRect();
        if (r.top < p.top - 1 || r.bottom > p.bottom + 1 || r.left < p.left - 1 || r.right > p.right + 1)
          return false;
      }
      return true;
    };
    const label = (el: Element) => {
      const own = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const row = el.closest('.setting-row, .welcome-row, label, fieldset');
      const rowName =
        row && row !== el ? (row.firstChild?.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
      const name = own || el.getAttribute('aria-label') || (el as HTMLInputElement).type || el.tagName;
      return (rowName && rowName !== name ? `${rowName}: ${name}` : name).slice(0, 70);
    };
    const item = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        label: label(el),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        shown: shown(el),
      };
    };
    const look = (el: Element) => {
      const s = getComputedStyle(el);
      return [
        s.backgroundColor,
        s.color,
        s.borderColor,
        s.outlineStyle === 'none' ? '' : `${s.outlineWidth} ${s.outlineColor}`,
        s.boxShadow === 'none' ? '' : 'shadow',
      ]
        .filter(Boolean)
        .join(' | ');
    };
    // The top open layer: the pause card over the game, else the title screens.
    const layer =
      [...document.querySelectorAll('.pause-card, .pause, .paper-map, .briefing, .welcome')].find(visible) ??
      document.body;
    const items = [...layer.querySelectorAll('[data-focus], [data-group], button, input')].filter(
      (el, i, all) => visible(el) && all.indexOf(el) === i && !(el as HTMLButtonElement).disabled,
    );
    const focusedAll = [...document.querySelectorAll('.focused')].filter(visible);
    const f = focusedAll[0];
    // The same kind of item without the highlight, to compare its look with.
    const plain =
      f && items.find((el) => el !== f && el.tagName === f.tagName && !el.classList.contains('on'));
    const heading = [...layer.querySelectorAll('h1, h2')].find(visible)?.textContent ?? '';
    return {
      heading: heading.replace(/\s+/g, ' ').trim(),
      focus: f
        ? { ...item(f), style: look(f), plain: plain ? look(plain) : '', index: items.indexOf(f) }
        : null,
      focused: focusedAll.length,
      items: items.map(item),
    };
  });

/** Wait for drawn frames, so the game's own polling sees a button go down and come up. */
const frames = (n: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
const hold = (index: number, down: boolean) =>
  page.evaluate(
    ({ index, down }) => {
      const b = (window as unknown as { walkPad: { buttons: { pressed: boolean; value: number }[] } }).walkPad
        .buttons[index];
      b.pressed = down;
      b.value = down ? 1 : 0;
    },
    { index, down },
  );
const press = async (index: number) => {
  await hold(index, true);
  await frames(2);
  await hold(index, false);
  await frames(2);
};
const stick = (axes: number[]) =>
  page.evaluate((axes) => {
    (window as unknown as { walkPad: { axes: number[] } }).walkPad.axes = axes;
  }, axes);

let shots = 0;
const shot = async (name: string) => {
  const file = `${String(++shots).padStart(3, '0')}-${name}.jpg`;
  await page.screenshot({ path: `${outDir}/${file}`, type: 'jpeg', quality: 78 });
  return file;
};

interface Step {
  press: string;
  file: string;
  focus: string | null;
  at: [number, number] | null;
  shown: boolean;
}
interface Walk {
  heading: string;
  items: string[];
  start: string | null;
  steps: Step[];
  /** Presses of Down before the highlight was back where it began (null: never, in MAX_PRESSES). */
  round: number | null;
  /** False when Down stops at the last item. */
  wraps: boolean;
  findings: string[];
  highlight: { focused: string; plain: string } | null;
}
const report: Record<string, Walk | Record<string, unknown>> = {};
// The same item: by its name and its place in the list, since a page scrolls under the highlight.
const same = (a: Snap['focus'], b: Snap['focus']) => !!a && !!b && a.label === b.label && a.index === b.index;
const save = () => writeFileSync(`${outDir}/menu-walk.json`, JSON.stringify({ report, errors }, null, 2));

/**
 * Press Down until the highlight is back where it began, with a picture after every press,
 * then check what the walk found. Leaves the highlight where it started.
 */
async function walk(name: string): Promise<Walk> {
  const first = await snap();
  const steps: Step[] = [
    {
      press: 'start',
      file: await shot(`${name}-start`),
      focus: first.focus?.label ?? null,
      at: first.focus ? [first.focus.x, first.focus.y] : null,
      shown: first.focus?.shown ?? false,
    },
  ];
  const findings: string[] = [];
  if (!first.focus) findings.push('nothing is highlighted when the page opens');
  if (first.focused > 1) findings.push(`${first.focused} items are highlighted at once`);
  const reached = new Map<string, Snap['focus']>();
  if (first.focus) reached.set(`${first.focus.label}@${first.focus.x},${first.focus.y}`, first.focus);
  let round: number | null = null;
  /** Presses of Down that reached the bottom of a list that stops there. */
  let ended: number | null = null;
  let prev = first.focus;
  let scrolled = first.items;
  for (let i = 1; i <= MAX_PRESSES; i++) {
    await press(Pad.Down);
    const s = await snap();
    scrolled = s.items.length >= scrolled.length ? s.items : scrolled;
    const f = s.focus;
    steps.push({
      press: 'down',
      file: await shot(`${name}-down${String(i).padStart(2, '0')}`),
      focus: f?.label ?? null,
      at: f ? [f.x, f.y] : null,
      shown: f?.shown ?? false,
    });
    if (!f) {
      findings.push(`press ${i} of Down: nothing is highlighted`);
      break;
    }
    if (!f.shown)
      findings.push(
        `press ${i} of Down: the highlight ("${f.label}") is off the screen or cut off by its box`,
      );
    if (prev && same(prev, f)) {
      // The bottom of a list that does not wrap round: go back up to where the walk began.
      ended = i - 1;
      break;
    } else if (prev && Math.abs(f.y - prev.y) < 4 && f.x !== prev.x && s.heading === first.heading)
      findings.push(
        `press ${i} of Down: the highlight moved sideways, "${prev.label}" → "${f.label}", not down a row`,
      );
    if (same(first.focus, f)) {
      round = i;
      if (first.focus && Math.abs(f.y - first.focus.y) > 8)
        findings.push(
          `after going round, the page is not back at its top: "${f.label}" sits ${first.focus.y - f.y} px higher and what is above it stays scrolled off`,
        );
      break;
    }
    reached.set(`${f.label}@${f.x},${f.y}`, f);
    prev = f;
  }
  if (ended !== null) {
    for (let i = 1; i <= ended + 3; i++) {
      await press(Pad.Up);
      const f = (await snap()).focus;
      if (f) reached.set(`${f.label}@${f.x},${f.y}`, f);
      if (same(first.focus, f)) break;
      if (i === ended + 3)
        findings.push(`Up from the bottom did not return to "${first.focus?.label}" in ${i} presses`);
    }
    await shot(`${name}-back-at-top`);
  } else if (round === null) findings.push(`Down did not come back to the start in ${MAX_PRESSES} presses`);
  const rows = new Set(first.items.map((it) => it.label.split(':')[0])).size;
  const presses = round ?? ended;
  if (presses !== null && presses > rows + 2)
    findings.push(`${presses} presses of Down to cross a page of about ${rows} rows`);
  const labels = new Set([...reached.values()].map((r) => r!.label));
  // Options in a row are reached with Left and Right; an item no Down press lands on, in a row
  // where none was reached, cannot be reached by going down the page.
  const rowsReached = new Set([...labels].map((l) => l.split(':')[0]));
  for (const it of first.items)
    if (!labels.has(it.label) && !rowsReached.has(it.label.split(':')[0]))
      findings.push(`"${it.label}" is never highlighted going down the page`);
  const w: Walk = {
    heading: first.heading,
    items: first.items.map((it) => it.label),
    start: first.focus?.label ?? null,
    steps,
    round,
    wraps: ended === null,
    findings,
    highlight: first.focus ? { focused: first.focus.style, plain: first.focus.plain } : null,
  };
  report[name] = w;
  save();
  console.log(
    `${name} [${w.heading}]: ${first.items.length} items, ${ended === null ? `round in ${round ?? '—'}` : `bottom in ${ended}`} presses, ${findings.length} findings`,
  );
  for (const f of findings) console.log(`   · ${f}`);
  return w;
}

/** Press Left and Right on the highlighted row and record where the highlight goes. */
async function sideways(name: string): Promise<void> {
  const before = await snap();
  const moves: string[] = [];
  for (const [dir, index] of [
    ['right', Pad.Right],
    ['left', Pad.Left],
    ['left', Pad.Left],
  ] as const) {
    await press(index);
    const s = await snap();
    await shot(`${name}-${dir}`);
    moves.push(`${dir}: "${s.focus?.label ?? 'nothing'}" at ${s.focus?.x},${s.focus?.y}`);
  }
  report[`${name}-sideways`] = { from: before.focus?.label, moves };
  console.log(`${name} sideways from "${before.focus?.label}": ${moves.join('; ')}`);
  save();
}

/**
 * Move the highlight to the item whose label matches: down the page row by row, looking
 * along each row of buttons that stand side by side, then back up it.
 */
async function focusOn(label: RegExp): Promise<boolean> {
  const at = async () => (await snap()).focus;
  for (const dir of [Pad.Down, Pad.Up]) {
    let stuck = 0;
    let prev: Snap['focus'] = null;
    const seen = new Set<string>();
    for (let i = 0; i <= MAX_PRESSES && stuck < 2; i++) {
      let f = await at();
      if (f && label.test(f.label)) return true;
      // Round a list that wraps: every row has been looked at.
      const key = `${f?.label}#${f?.index}`;
      if (seen.has(key) && !same(prev, f)) break;
      seen.add(key);
      // Along a row of plain buttons (a setting's options are not looked through: Right changes them).
      const plain = await page.evaluate(
        () => !document.querySelector('.focused')?.closest('.seg, .welcome-options'),
      );
      if (plain)
        for (const [out, home] of [
          [Pad.Right, Pad.Left],
          [Pad.Left, Pad.Right],
        ]) {
          await press(out);
          const beside = await at();
          if (beside && label.test(beside.label)) return true;
          if (!same(f, beside)) await press(home);
        }
      stuck = same(prev, f) ? stuck + 1 : 0;
      prev = f;
      f = null;
      await press(dir);
    }
  }
  console.log(`   ! could not reach ${label} with the D-pad`);
  return false;
}

/** Open a page from the highlighted item, walk it, go Back and record where the highlight lands. */
async function visit(name: string, label: RegExp, extra?: () => Promise<void>): Promise<void> {
  if (!(await focusOn(label))) {
    report[name] = { findings: [`${label} could not be reached with the D-pad`] };
    return save();
  }
  const from = (await snap()).focus?.label;
  await press(Pad.A);
  await page.waitForTimeout(700);
  const w = await walk(name);
  await extra?.();
  await press(Pad.B);
  await page.waitForTimeout(700);
  const back = await snap();
  await shot(`${name}-after-back`);
  if (back.focus?.label !== from)
    w.findings.push(
      `Back (○) returns to "${back.focus?.label ?? 'nothing'}", not "${from}" where the page was opened`,
    );
  console.log(`   back lands on "${back.focus?.label}" (opened from "${from}")`);
  save();
}

// ---- Title screens ----
await page.goto(url);
await page.locator('.welcome').waitFor({ state: 'visible' });
await page.waitForTimeout(1500);
await shot('title');
await press(Pad.A);
await page.waitForTimeout(700);
if (only !== 'pause') {
  await walk('title-menu');
  await visit('title-settings', /^Settings/, async () => {
    await sideways('title-settings');
  });
  await visit('title-journey', /New journey|Journey|Start/i, async () => {
    await sideways('title-journey');
  });
}
if (only === 'title') {
  save();
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
  await browser.close();
  process.exit(0);
}
// Into the game: New journey, then Options starts the drive.
if (await focusOn(/New journey|Journey|Start/i)) await press(Pad.A);
await page.waitForTimeout(700);
// The two folded sections of the journey page: the vehicle list and the packing.
if (only !== 'pause')
  for (const [name, label] of [
    ['title-journey-vehicle', /^Vehicle/],
    ['title-journey-packing', /^Packing/],
  ] as const) {
    if (!(await focusOn(label))) continue;
    await press(Pad.A);
    await page.waitForTimeout(700);
    await walk(name);
    await sideways(name);
  }
await shot('journey-before-drive');
await press(Pad.Start);
const briefing = page.locator('[data-briefing-drive]:not(.hidden)');
await briefing.waitFor({ timeout: 600_000 });
await page.waitForTimeout(1000);
const briefed = await snap();
await press(Pad.Down);
const briefedDown = await snap();
report.briefing = {
  heading: briefed.heading,
  items: briefed.items.map((it) => it.label),
  focus: briefed.focus?.label ?? null,
  afterDown: briefedDown.focus?.label ?? null,
  file: await shot('briefing'),
  findings: briefed.focus ? [] : ['nothing on the briefing is highlighted for a controller'],
};
await press(Pad.A);
const started = await page
  .waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 })
  .then(
    () => true,
    () => false,
  );
if (!started) {
  report.briefing = {
    ...(report.briefing as object),
    findings: ['✕ on the briefing did not start the drive; the button was clicked instead'],
  };
  await briefing.click();
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 600_000 });
}
await page.waitForTimeout(3000);
await shot('arrived');

// ---- Pause pages ----
await press(Pad.Start);
await page.waitForFunction(() => window.__game!.ui().pause, null, { timeout: 60_000 });
await page.waitForTimeout(1500);
await walk('pause-main');
await visit('pause-journal', /^Trip journal/);
await visit('pause-vehicle', /^Vehicle/);
await visit('pause-settings', /^Settings/, async () => {
  await sideways('pause-settings');
});
await visit('pause-controls', /^Controls/);
// The map from the pause menu.
if (await focusOn(/^Map/)) {
  await press(Pad.A);
  await page.waitForTimeout(6000);
  const ui = await page.evaluate(() => window.__game!.ui());
  report['pause-map'] = { ui, file: await shot('pause-map') };
  await press(Pad.B);
  await page.waitForTimeout(3000);
  report['pause-map-after-back'] = {
    ui: await page.evaluate(() => window.__game!.ui()),
    file: await shot('pause-map-after-back'),
  };
  save();
}
// Out of every menu, back to driving.
for (
  let i = 0;
  i < 3 && (await page.evaluate(() => window.__game!.ui().pause || window.__game!.ui().map));
  i++
) {
  await press(Pad.B);
  await page.waitForTimeout(1500);
}
await shot('driving');

// ---- Tool wheel: hold L1, point the right stick eight ways ----
await page.evaluate(() => {
  if (window.__game!.vehicle().engineOff) window.__game!.startEngine();
});
await hold(Pad.LB, true);
await page
  .waitForFunction(() => window.__game!.ui().toolMenu, null, { timeout: 60_000 })
  .catch(() => undefined);
await page.waitForTimeout(1500);
const wheel: Record<string, unknown> = {
  open: await page.evaluate(() => window.__game!.ui().toolMenu),
  file: await shot('tools-open'),
};
const picked = () =>
  page.evaluate(() => {
    const on = document.querySelector('.tool-menu .tool-option.selected');
    const centre = document.querySelector('.tool-menu .tool-centre');
    return {
      item: on?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      centre: centre?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    };
  });
for (let k = 0; k < 8; k++) {
  const a = (k * Math.PI) / 4;
  await stick([0, 0, Math.sin(a), -Math.cos(a)]);
  await frames(4);
  await page.waitForTimeout(400);
  wheel[`stick-${k * 45}`] = {
    ...(await picked()),
    file: await shot(`tools-stick-${String(k * 45).padStart(3, '0')}`),
  };
}
await stick([0, 0, 0, 0]);
await frames(4);
await hold(Pad.LB, false);
// Frames, not a fixed wait: on the software renderer one frame can outlast it.
await frames(6);
wheel.closed = await page
  .waitForFunction(() => !window.__game!.ui().toolMenu, null, { timeout: 30_000 })
  .then(
    () => true,
    () => false,
  );
report['tool-wheel'] = wheel;

// ---- The map on its own button ----
await press(Pad.View);
await page.waitForTimeout(6000);
report.map = { ui: await page.evaluate(() => window.__game!.ui()), file: await shot('map') };
await press(Pad.View);
await page.waitForTimeout(3000);
report['map-closed'] = { ui: await page.evaluate(() => window.__game!.ui()), file: await shot('map-closed') };
save();
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
