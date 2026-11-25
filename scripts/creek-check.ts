/**
 * Dev helper: list the places where a creek's water stands above the ground a little way
 * out from its banks (it would run perched, as in an aqueduct). Usage: npx vite-node scripts/creek-check.ts [map id]
 */
import { isMapId, maps } from '../src/data/maps';
import { buildWorld } from '../src/sim/world/world';
import { NO_WATER } from '../src/sim/world/terrain';

const mapId = process.argv[2] ?? 'ironbark';
if (!isMapId(mapId)) throw new Error(`Unknown map ${mapId}`);
const world = buildWorld(maps[mapId].def);
const t = world.terrain;
for (const c of world.features.creeks) {
  let bad = 0;
  for (let k = 0; k < c.poly.count; k += 4) {
    const x = c.poly.xs[k];
    const z = c.poly.zs[k];
    const dx = c.poly.zs[Math.min(c.poly.count - 1, k + 1)] - z;
    const dz = x - c.poly.xs[Math.min(c.poly.count - 1, k + 1)];
    const len = Math.hypot(dx, dz) || 1;
    const out = c.halfWidth[k] + 3;
    for (const side of [-1, 1]) {
      const bx = x + (dx / len) * out * side;
      const bz = z + (dz / len) * out * side;
      const wi = t.index(bx, bz);
      if (!t.inBounds(bx, bz) || t.water[wi] > NO_WATER || world.features.trackDistance[wi] <= 2) continue;
      const h = t.heightAt(bx, bz);
      if (h < c.water[k] - 0.05) {
        bad++;
        if (bad < 12)
          console.log(
            `${c.def.id} at ${k} (${bx.toFixed(0)}, ${bz.toFixed(0)}): ground ${h.toFixed(2)} < water ${c.water[k].toFixed(2)}`,
          );
      }
    }
  }
  console.log(`${c.def.id}: ${bad} low bank points`);
}
