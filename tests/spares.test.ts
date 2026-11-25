import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { VehicleId } from '../src/data/vehicle';
import { vehicleLooks } from '../src/render/vehicleLooks';
import { across, buildSpares, spareLine, wheelHits } from './helpers/spares';

/**
 * Every spare wheel in the game is placed by `mountSpare()` (src/render/spares.ts), which
 * records where it put it. Two builds in a row shipped a spare wrong: one hung almost on the
 * ground, one stood edge-on with its tread through the rear door. This builds every vehicle
 * and checks each spare's axle, its clearance from the body behind it and from the ground.
 */

const ids = Object.keys(vehicleLooks) as VehicleId[];
const all = ids.map(buildSpares);

describe('spare wheels', () => {
  it('are all mounted with mountSpare: every vehicle has at least one', () => {
    for (const b of all) expect(b.spares.length, b.id).toBeGreaterThan(0);
  });

  for (const b of all)
    describe(b.id, () => {
      b.spares.forEach((s, n) => {
        const { position: hub, axle, halfWidth: hw, radius: r, facing } = s.spare;
        const name = `spare ${n + 1} (${facing} at ${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}, ${hub.z.toFixed(2)})`;

        it(`${name}: its axle points ${facing}`, () => {
          // Straight out from the hub across the face, the tread is about one radius away.
          // (Turned 0.05 rad off the axes, so no ray runs along a seam of the tyre's mesh.)
          const [u0, w0] = across(axle);
          for (const k of [0, 1, 2, 3]) {
            const a = (k * Math.PI) / 2 + 0.05;
            const dir = u0.clone().multiplyScalar(Math.cos(a)).addScaledVector(w0, Math.sin(a));
            const hits = wheelHits(s, hub, dir, r * 1.5);
            expect(hits.length, `${b.id} ${name} across`).toBeGreaterThan(0);
            expect(Math.max(...hits), `${b.id} ${name} across`).toBeGreaterThan(r * 0.9);
            expect(Math.max(...hits), `${b.id} ${name} across`).toBeLessThan(r * 1.06);
          }
          // Along the axle, part way out on the sidewall, the wheel ends within its half-width
          // (looking no further, as another spare may lie in line with this one).
          const [u] = across(axle);
          for (const dir of [axle, axle.clone().negate()]) {
            const hits = wheelHits(s, hub.clone().addScaledVector(u, r * 0.6), dir, hw * 1.5);
            expect(hits.length, `${b.id} ${name} along`).toBeGreaterThan(0);
            expect(Math.max(...hits), `${b.id} ${name} along`).toBeLessThan(hw * 1.06);
          }
        });

        it(`${name}: no part of the body is inside it or within 3 mm of its inner face`, () => {
          // Lines through the wheel parallel to its axle, over the tyre and the rim's outer half.
          // Inside half the radius is the rim's centre, which bears on the carrier's plate,
          // stud or clamp, so that is left out.
          const bad: string[] = [];
          for (let du = -r; du <= r + 1e-9; du += 0.04)
            for (let dw = -r; dw <= r + 1e-9; dw += 0.04) {
              const rr = Math.hypot(du, dw);
              if (rr < r * 0.5 || rr > r * 0.97) continue;
              const line = spareLine(s, du, dw);
              if (line?.fouled) bad.push(`(${du.toFixed(2)}, ${dw.toFixed(2)})`);
            }
          expect(bad, `${b.id} ${name}: fouled at these points across its face`).toEqual([]);
        });

        it(`${name}: stays well off the ground`, () => {
          const flat = Math.abs(axle.y) > 0.5;
          const lowest = hub.y - (flat ? hw : r);
          // And measured on the drawn wheel: straight down from the hub, or from the sidewall.
          const from = flat ? hub.clone().addScaledVector(across(axle)[0], r * 0.6) : hub.clone();
          const down = wheelHits(s, from, new Vector3(0, -1, 0), 2);
          expect(down.length).toBeGreaterThan(0);
          const measured = from.y - Math.max(...down);
          expect(Math.min(lowest, measured) - b.ground, `${b.id} ${name}`).toBeGreaterThan(0.15);
        });
      });
    });
});
