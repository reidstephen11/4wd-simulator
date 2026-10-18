import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { coursePoint } from '../src/sim/world/crawlCourse';
import { trailProgress } from '../src/sim/world/crawlTrail';
import { segmentDistance } from '../src/sim/world/polyline';
import { rockShape } from '../src/sim/world/rockShape';
import { testWorld } from './world';

/** Distance from (x, z) to the edge of the nearest track's driving surface (negative = on it). */
function trackClearance(x: number, z: number): { id: string; edge: number } {
  let best = { id: '', edge: Infinity };
  for (const t of testWorld().features.tracks) {
    const p = t.poly;
    for (let i = 0; i < p.count - 1; i++) {
      const edge = segmentDistance(x, z, p.xs[i], p.zs[i], p.xs[i + 1], p.zs[i + 1]).d - t.def.width / 2;
      if (edge < best.edge) best = { id: t.def.id, edge };
    }
  }
  return best;
}

describe('world placement', () => {
  it('stands every signpost beside the road, not on it or on a steep bank', () => {
    const { map, terrain } = testWorld();
    for (const sign of map.props.filter((p) => p.kind === 'signpost')) {
      const near = trackClearance(sign.x, sign.z);
      expect(near.edge, `${sign.text} is ${near.edge.toFixed(1)} m from ${near.id}`).toBeGreaterThan(1.2);
      expect(terrain.slopeDegAt(sign.x, sign.z), `${sign.text} slope`).toBeLessThan(12);
    }
  });

  it('starts and ends every practice line off the roads', () => {
    for (const course of testWorld().map.crawlCourses ?? [])
      for (const line of course.lines)
        for (const along of [0, 1, course.length])
          for (const side of [-1.8, 1.8]) {
            const p = coursePoint(course, line.offset + side, along);
            const near = trackClearance(p.x, p.z);
            expect(near.edge, `${line.name} at ${along} m is on ${near.id}`).toBeGreaterThan(1);
          }
  });

  it('keeps boulders and trail stones off the roads they do not belong to', () => {
    const { map, features, scatter, terrain } = testWorld();
    // Hand-placed and scattered boulders stay off every driving surface (scattered ones may
    // brush an edge).
    for (const [i, rock] of scatter.rocks.entries()) {
      const near = trackClearance(rock.x, rock.z);
      const allowed = i < map.boulders.length ? 0 : -0.25;
      expect(near.edge - rock.radius, `boulder at ${rock.x}, ${rock.z} is on ${near.id}`).toBeGreaterThan(
        allowed,
      );
    }
    // Trail stones may share the junction where their track meets its link or bypass.
    let first = 0;
    for (const trail of map.crawlTrails ?? []) {
      const own = features.tracks.find((t) => t.def.id === trail.trackId)!;
      const ends = [0, own.poly.count - 1].map((i) => [own.poly.xs[i], own.poly.zs[i]]);
      const others = features.tracks.filter((t) => t !== own);
      const count = trail.sections.reduce((n, s) => n + (s.stones?.length ?? 0), 0);
      for (const rock of features.rocks.slice(first, (first += count))) {
        for (let i = 0; i < rock.vertices.length; i += 3) {
          const x = rock.x + rock.vertices[i],
            z = rock.z + rock.vertices[i + 2];
          if (rock.y + rock.vertices[i + 1] < terrain.heightAt(x, z) + 0.05) continue;
          if (ends.some(([ex, ez]) => Math.hypot(x - ex, z - ez) < 3)) continue;
          for (const t of others) {
            const on = trailProgress(t, x, z).distance < t.def.width / 2;
            expect(
              on,
              `${trail.id} stone at ${rock.x.toFixed(0)}, ${rock.z.toFixed(0)} is on ${t.def.id}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('seats every ledge and trail stone in the ground with no gap underneath', () => {
    const { map, features, terrain } = testWorld();
    // A rounded boulder may show a sliver where the ground dips; flat undersides sit flush.
    const shapes = (map.crawlTrails ?? []).flatMap((t) => t.sections.flatMap((s) => s.stones ?? []));
    const hulls = [
      ...features.boxes
        .filter((b) => b.kind === 'ledge')
        .map((b) => {
          const shape = rockShape(b.hx, b.hy, b.hz, b.bevel ?? 0.001);
          const m = new Matrix4()
            .makeTranslation(b.x, b.y, b.z)
            .multiply(new Matrix4().makeRotationY(b.yaw))
            .multiply(new Matrix4().makeRotationZ(b.roll ?? 0));
          const v = new Vector3();
          const vertices = new Float32Array(shape.vertices.length);
          for (let i = 0; i < shape.vertices.length; i += 3)
            v.fromArray(shape.vertices, i).applyMatrix4(m).toArray(vertices, i);
          const at = `ledge at ${b.x.toFixed(0)}, ${b.z.toFixed(0)}`;
          return { at, vertices, indices: shape.indices, allowed: 0.03 };
        }),
      ...features.rocks.map((r, i) => ({
        at: `${shapes[i].shape} at ${r.x.toFixed(0)}, ${r.z.toFixed(0)}`,
        vertices: r.vertices.map((c, i) => c + [r.x, r.y, r.z][i % 3]),
        indices: r.indices,
        allowed: shapes[i].shape === 'boulder' ? 0.2 : 0.03,
      })),
    ];
    expect(shapes.length).toBe(features.rocks.length);
    expect(hulls.length).toBeGreaterThan(100);
    const [a, b, c, ab, ac] = [0, 1, 2, 3, 4].map(() => new Vector3());
    for (const hull of hulls) {
      let gap = -Infinity;
      for (let i = 0; i < hull.indices.length; i += 3) {
        a.fromArray(hull.vertices, hull.indices[i] * 3);
        b.fromArray(hull.vertices, hull.indices[i + 1] * 3);
        c.fromArray(hull.vertices, hull.indices[i + 2] * 3);
        // Only faces turned towards the ground; a boulder's bulge may overhang its base.
        if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().y > -0.5) continue;
        for (const p of [a, b, c]) gap = Math.max(gap, p.y - terrain.heightAt(p.x, p.z));
      }
      expect(gap, `${hull.at} lifts off the ground`).toBeLessThan(hull.allowed);
    }
  });
});
