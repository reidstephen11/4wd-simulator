/**
 * Dev helper: drive each Ironbark Creek line with the autopilot and print how it went
 * (finished or how far short, time, steepest pitch and roll, deepest water).
 * Usage: npx vite-node scripts/level-drive.ts [track id ...]   (default: every signed line)
 * Each line is tried crawling in low range with both lockers, then with open diffs; lines
 * marked `back` are driven from their far end.
 */
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { buildWorld } from '../src/sim/world/world';
import { driver, type Lockers } from '../tests/helpers/drive';

const world = buildWorld(ironbarkMap);
const { drive } = driver(world);
/** [track, driven from the far end]. */
const LINES: [string, boolean][] = [
  ['knoll-rock-climb', false],
  ['knoll-switchbacks', false],
  ['knoll-side-slope', false],
  ['knoll-drop', false],
  ['knoll-steep-descent', false],
  ['knoll-axle-twisters', false],
  ['knoll-bog-trench', false],
  ['creek-ford', false],
  ['creek-ford', true],
  ['creek-deep', false],
  ['creek-deep', true],
  ['creek-chute', false],
  ['creek-chute', true],
  ['bog-hole', false],
  ['rock-garden', false],
  ['rock-garden', true],
];
const want = process.argv.slice(2);
for (const [id, back] of LINES) {
  if (want.length && !want.includes(id)) continue;
  for (const lockers of ['both', 'open'] as Lockers[]) {
    const r = await drive(id, lockers, back, 240, undefined, 25);
    console.log(
      `${id.padEnd(20)} ${back ? 'back' : 'fwd '} ${lockers.padEnd(5)} ${r.done ? 'DONE ' : `short ${r.remaining.toFixed(1).padStart(5)} m`}  ${r.time.toFixed(0).padStart(3)} s  pitch ${r.pitch.toFixed(0)}°  roll ${r.roll.toFixed(0)}°  water ${r.water.toFixed(2)}  off-line ${r.deviation.toFixed(1)}`,
    );
  }
}
