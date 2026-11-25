import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { HORIZON_RINGS, Horizon } from '../src/render/horizon';
import { lateAfternoon } from '../src/data/environment';
import { testWorld } from './world';

describe('the horizon mesh', () => {
  const world = testWorld();
  const horizon = new Horizon(world.map, world.terrain, lateAfternoon);
  const pos = horizon.mesh.geometry.getAttribute('position');
  const index = horizon.mesh.geometry.getIndex()!;
  const ringSize = pos.count / HORIZON_RINGS.length;
  const hx = world.map.width / 2;
  const hz = world.map.length / 2;
  /** Distance outside the map, seen from above. */
  const outside = (x: number, z: number) =>
    Math.hypot(Math.max(0, Math.abs(x) - hx), Math.max(0, Math.abs(z) - hz));

  it('lies outside the map', () => {
    for (let i = 0; i < pos.count; i++) {
      const out = outside(pos.getX(i), pos.getZ(i));
      const inside = Math.min(hx - Math.abs(pos.getX(i)), hz - Math.abs(pos.getZ(i)));
      expect(out > 0 || inside < 1e-6, `vertex ${i}`).toBe(true);
    }
  });

  it('starts just under the map’s edge, so no gap shows between them', () => {
    for (let i = 0; i < ringSize; i++) {
      const j = (i + 1) % ringSize;
      const [x0, z0, x1, z1] = [pos.getX(i), pos.getZ(i), pos.getX(j), pos.getZ(j)];
      const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
      for (let k = 0; k <= steps; k++) {
        const t = steps ? k / steps : 0;
        const ground = world.terrain.heightAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
        const y = pos.getY(i) + (pos.getY(j) - pos.getY(i)) * t;
        expect(y, `edge at ${x0}, ${z0}`).toBeLessThan(ground);
      }
    }
  });

  it('draws the farthest land first, so nearer land covers it', () => {
    let last = Infinity;
    for (let t = 0; t < index.count; t += 3) {
      const ring = Math.min(...[0, 1, 2].map((k) => Math.floor(index.getX(t + k) / ringSize)));
      expect(ring).toBeLessThanOrEqual(last);
      last = ring;
    }
  });

  it('faces up', () => {
    const n = horizon.mesh.geometry.getAttribute('normal');
    const v = new Vector3();
    let up = 0;
    for (let i = ringSize; i < n.count; i++) if (v.fromBufferAttribute(n, i).y > 0) up++;
    expect(up).toBe(n.count - ringSize);
  });

  it('is drawn behind the world without depth', () => {
    expect(horizon.mesh.renderOrder).toBeLessThan(0);
    expect(horizon.mesh.frustumCulled).toBe(false);
    expect((horizon.mesh.material as { depthWrite: boolean }).depthWrite).toBe(false);
  });
});
