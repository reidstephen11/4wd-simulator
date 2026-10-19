import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import {
  challengeAnchors,
  challengeEasyRoutes,
  challengeLoopRoute,
  challengeSigns,
  challengeTrails,
} from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import { flatDirt, loadRapier, Physics } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { convexHull } from '../src/sim/world/convexHull';
import { staticLogMesh, stonePoints, trailProgress } from '../src/sim/world/crawlTrail';
import { DETAIL_SUB, patchStride } from '../src/sim/world/detail';
import { driveLeg, driver } from './helpers/drive';
import { testWorld } from './world';

const world = testWorld();
const { trackOf, scene, drive } = driver(world);

const trail = (id: string) => challengeTrails.find((t) => t.id === id)!;
const crawlMax = vehicleTuning.crawling.forwardKmh / 3.6;
/** Most the car tilts (pitch and roll together) on each grade with both lockers. */
const maxTilt = { easy: 30, moderate: 40, hard: 43, extreme: 52 };

describe('Granite Spur', () => {
  it('grades eight obstacles from easy to extreme', () => {
    expect(Object.fromEntries(challengeTrails.map((t) => [t.id, t.difficulty]))).toEqual({
      'creek-bed': 'easy',
      'whoa-boys': 'moderate',
      'rock-steps': 'moderate',
      'log-step': 'moderate',
      sidling: 'hard',
      'boulder-gully': 'hard',
      'the-chute': 'extreme',
      'washout-ruts': 'hard',
    });
    const built = (t: (typeof challengeTrails)[number]) =>
      t.sections.flatMap((s) => [...(s.stones ?? []), ...(s.logs ?? [])]).length +
      (trackOf(t.trackId).def.humps?.length ?? 0) +
      (trackOf(t.trackId).def.erosion?.length ?? 0);
    for (const t of challengeTrails) expect(built(t), t.id).toBeGreaterThan(0);
  });

  for (const t of challengeTrails)
    for (const back of [false, true])
      it(`drives ${t.name} with both lockers ${back ? 'from its far end' : 'from its near end'}`, async () => {
        const s = await scene(t.trackId, back);
        try {
          const result = await driveLeg(s, s.track, back);
          expect(result.tilt).toBeLessThan(maxTilt[t.difficulty!]);
          expect(result.speed).toBeLessThan(crawlMax + (t.difficulty === 'extreme' ? 0.7 : 0.5));
          expect(result.deviation).toBeLessThan(s.track.def.width / 2 + 0.3);
        } finally {
          s.sim.physics.free();
        }
      });

  it('the Creek Bed rocks the car gently and needs no lockers', async () => {
    const r = await drive('creek-bed', 'open');
    expect(r.done).toBe(true);
    expect(r.roll).toBeLessThan(20);
  });

  it('the Whoa-boys pitch the car steeply over each hump but go with open diffs', async () => {
    const r = await drive('whoa-boys', 'open');
    expect(r.done).toBe(true);
    expect(r.pitch).toBeGreaterThan(28);
    expect(r.pitch).toBeLessThan(38);
  });

  it('the Rock Steps go in low range with open diffs but not in high range', async () => {
    expect((await drive('rock-steps', 'open')).done).toBe(true);
    const high = await drive('rock-steps', 'high', false, 45);
    expect(high.done).toBe(false);
    expect(high.remaining).toBeGreaterThan(5);
  });

  it('the Log Step lifts one side at a time', async () => {
    const r = await drive('log-step', 'open');
    expect(r.done).toBe(true);
    expect(r.roll).toBeGreaterThan(15);
  });

  it('The Sidling leans the car over 20° towards the drop in both directions, short of tipping', async () => {
    for (const back of [false, true]) {
      const r = await drive('sidling', 'both', back);
      expect(r.done).toBe(true);
      expect(r.roll).toBeGreaterThan(20);
      expect(r.roll).toBeLessThan(29);
    }
  });

  it('Boulder Gully needs both lockers and low range', async () => {
    const both = await drive('boulder-gully', 'both');
    expect(both.done).toBe(true);
    // A rear locker alone scrabbles through eventually, open diffs and high range stall.
    const rear = await drive('boulder-gully', 'rear', false, 3 * both.time);
    expect(rear.time).toBeGreaterThan(2 * both.time);
    for (const lockers of ['open', 'high'] as const) {
      const r = await drive('boulder-gully', lockers, false, 75);
      expect(r.done, lockers).toBe(false);
      expect(r.remaining, lockers).toBeGreaterThan(5);
    }
  });

  it('The Chute twists the car on a steep climb and needs both lockers', async () => {
    const both = await drive('the-chute', 'both');
    expect(both.done).toBe(true);
    expect(both.pitch).toBeGreaterThan(33);
    expect(both.roll).toBeGreaterThan(15);
    for (const lockers of ['rear', 'open', 'high'] as const) {
      const r = await drive('the-chute', lockers, false, 75);
      expect(r.done, lockers).toBe(false);
      expect(r.remaining, lockers).toBeGreaterThan(8);
    }
  });

  it('Washout Ruts roll the car where a tyre drops in, short of tipping', async () => {
    const r = await drive('washout-ruts', 'both');
    expect(r.done).toBe(true);
    expect(r.roll).toBeGreaterThan(15);
    expect(r.roll).toBeLessThan(30);
  });

  for (const id of world.features.tracks.map((t) => t.def.id).filter((id) => id.startsWith('ft-')))
    it(`drives the fire trail ${id} both ways with open diffs`, async () => {
      for (const back of [false, true]) {
        const r = await drive(id, 'open', back);
        expect(r.done, `${id}${back ? ' back' : ''} stopped ${r.remaining.toFixed(1)} m from the end`).toBe(
          true,
        );
        expect(r.tilt).toBeLessThan(25);
      }
    });

  it('joins every obstacle into a continuous loop without teleporting', async () => {
    const s = await scene(challengeLoopRoute[0]);
    try {
      const start = { ...s.v.position };
      for (const id of challengeLoopRoute) {
        const track = trackOf(id);
        const r = await driveLeg(s, track);
        expect(r.tilt, id).toBeLessThan(maxTilt[trail(id)?.difficulty ?? 'easy']);
        expect(r.deviation, id).toBeLessThan(track.def.width / 2 + 0.7);
      }
      expect(Math.hypot(s.v.position.x - start.x, s.v.position.z - start.z)).toBeLessThan(3);
    } finally {
      s.sim.physics.free();
    }
  }, 300_000);

  // The Chute's walls change height every 2.3 m, the short-wheelbase 4WD's wheelbase; the
  // 110 climbs it but grounds its chassis on a wall step coming down, so the loop is its test.
  it('the long-wheelbase Land Rover 110 drives the whole loop, up The Chute', async () => {
    const s = await scene(challengeLoopRoute[0], false, 'both', perentieTuning);
    try {
      for (const id of challengeLoopRoute) {
        const r = await driveLeg(s, trackOf(id));
        expect(r.tilt, id).toBeLessThan(maxTilt[trail(id)?.difficulty ?? 'easy']);
      }
    } finally {
      s.sim.physics.free();
    }
  }, 300_000);

  for (const route of challengeEasyRoutes)
    for (const tuning of [vehicleTuning, perentieTuning])
      it(`drives the fire trail from ${route[0][0]} to ${route[route.length - 1][0]} without lockers (${tuning.name})`, async () => {
        const [first, firstBack] = route[0];
        const s = await scene(first, firstBack, 'open', tuning);
        try {
          for (const [id, back] of route) {
            const r = await driveLeg(s, trackOf(id), back);
            expect(r.tilt, id).toBeLessThan(25);
          }
        } finally {
          s.sim.physics.free();
        }
      }, 300_000);

  it('every trail stone is a closed convex hull that rests on the ground', () => {
    expect(world.features.rocks.length).toBeGreaterThan(80);
    for (const rock of world.features.rocks) {
      const { vertices, indices } = rock;
      expect(indices.length % 3).toBe(0);
      const edges = new Map<string, number>();
      for (let i = 0; i < indices.length; i += 3)
        for (let k = 0; k < 3; k++) {
          const a = indices[i + k],
            b = indices[i + ((k + 1) % 3)];
          const key = `${a},${b}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      for (const [key, count] of edges) {
        const [a, b] = key.split(',');
        expect(count).toBe(1);
        expect(edges.get(`${b},${a}`)).toBe(1);
      }
      let minY = Infinity;
      for (let i = 1; i < vertices.length; i += 3) minY = Math.min(minY, vertices[i]);
      expect(minY).toBeLessThan(-0.05);
    }
  });

  it('the logs lie on the track rather than sinking into it', () => {
    const logs = trail('log-step').sections[0].logs!;
    expect(world.features.logs).toHaveLength(logs.length);
    const track = trackOf('log-step');
    for (const log of world.features.logs) {
      const mid = [(log.a[0] + log.b[0]) / 2, (log.a[1] + log.b[1]) / 2, (log.a[2] + log.b[2]) / 2];
      const along = trailProgress(track, mid[0], mid[2]);
      expect(along.distance).toBeLessThan(0.5);
      // Across the track the top stands at least 1.6 radii above the ground under it.
      for (const lateral of [-1.2, 0, 1.2]) {
        const t = 0.5 + lateral / Math.hypot(log.b[0] - log.a[0], log.b[2] - log.a[2]);
        const x = log.a[0] + (log.b[0] - log.a[0]) * t,
          y = log.a[1] + (log.b[1] - log.a[1]) * t,
          z = log.a[2] + (log.b[2] - log.a[2]) * t;
        expect(y + log.radius - world.terrain.heightAt(x, z)).toBeGreaterThan(log.radius * 1.6);
      }
    }
  });

  it('rocks, logs, signs and winch anchors stand clear of the fire trail', () => {
    const fireTrail = world.features.tracks.filter((t) => t.def.id.startsWith('ft-'));
    const clear = (x: number, z: number, margin: number) =>
      fireTrail.every((t) => trailProgress(t, x, z).distance > t.def.width / 2 + margin);
    for (const r of world.features.rocks)
      for (let i = 0; i < r.vertices.length; i += 3)
        if (r.vertices[i + 1] > 0.05)
          expect(clear(r.x + r.vertices[i], r.z + r.vertices[i + 2], 0), `rock at ${r.x}, ${r.z}`).toBe(true);
    for (const log of world.features.logs)
      for (let k = 0; k <= 10; k++)
        expect(
          clear(
            log.a[0] + ((log.b[0] - log.a[0]) * k) / 10,
            log.a[2] + ((log.b[2] - log.a[2]) * k) / 10,
            0.3,
          ),
        ).toBe(true);
    for (const sign of challengeSigns) expect(clear(sign.x, sign.z, 1), sign.text).toBe(true);
    for (const anchor of challengeAnchors)
      for (const t of world.features.tracks)
        expect(trailProgress(t, anchor.x, anchor.z).distance, t.def.id).toBeGreaterThan(
          t.def.width / 2 + anchor.radius,
        );
  });

  it('fine ruts and humps collide where they are drawn and meet the 1 m ground without a seam', async () => {
    const terrain = world.terrain;
    expect(terrain.detail.length).toBeGreaterThanOrEqual(3);
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    try {
      sim.physics.step();
      const R = sim.physics.R;
      // Only the ground: boulders and logs sit on top of some fine cells.
      const ground = sim.physics.terrainCollider!.collisionGroups();
      const onlyGround = (c: { collisionGroups(): number }) => c.collisionGroups() === ground;
      let deep = 0;
      for (const p of terrain.detail) {
        const w = patchStride(p);
        for (let cz = 0; cz < p.nz; cz++)
          for (let cx = 0; cx < p.nx; cx++) {
            if (!p.cells[cz * p.nx + cx]) continue;
            const x = p.ix0 - terrain.half + cx + 0.37,
              z = p.iz0 - terrain.half + cz + 0.61;
            const h = terrain.heightAt(x, z);
            const hit = sim.physics.world.castRay(
              new R.Ray({ x, y: h + 3, z }, { x: 0, y: -1, z: 0 }),
              10,
              true,
              undefined,
              undefined,
              undefined,
              undefined,
              onlyGround,
            );
            expect(hit).not.toBeNull();
            expect(h + 3 - hit!.timeOfImpact).toBeCloseTo(h, 3);
            deep = Math.min(deep, p.offset[(cz * DETAIL_SUB + 2) * w + cx * DETAIL_SUB + 2]);
            // The hidden 1 m surface stays under the fine ground at every 1 m corner.
            for (const [dx, dz] of [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ]) {
              const ix = p.ix0 + cx + dx,
                iz = p.iz0 + cz + dz;
              const fine = p.heights[(cz + dz) * DETAIL_SUB * w + (cx + dx) * DETAIL_SUB];
              expect(terrain.solidSample(ix, iz)).toBeLessThanOrEqual(fine + 1e-4);
            }
          }
        // Where a covered cell meets plain 1 m ground the fine edge carries no offset, so
        // it lies on the 1 m triangles.
        const covered = (cx: number, cz: number) =>
          cx >= 0 && cz >= 0 && cx < p.nx && cz < p.nz && p.cells[cz * p.nx + cx] === 1;
        for (let cz = 0; cz < p.nz; cz++)
          for (let cx = 0; cx < p.nx; cx++) {
            if (!covered(cx, cz)) continue;
            for (let k = 0; k <= DETAIL_SUB; k++) {
              if (!covered(cx - 1, cz))
                expect(Math.abs(p.offset[(cz * DETAIL_SUB + k) * w + cx * DETAIL_SUB])).toBeLessThan(1e-4);
              if (!covered(cx + 1, cz))
                expect(Math.abs(p.offset[(cz * DETAIL_SUB + k) * w + (cx + 1) * DETAIL_SUB])).toBeLessThan(
                  1e-4,
                );
              if (!covered(cx, cz - 1))
                expect(Math.abs(p.offset[cz * DETAIL_SUB * w + cx * DETAIL_SUB + k])).toBeLessThan(1e-4);
              if (!covered(cx, cz + 1))
                expect(Math.abs(p.offset[(cz + 1) * DETAIL_SUB * w + cx * DETAIL_SUB + k])).toBeLessThan(
                  1e-4,
                );
            }
          }
      }
      expect(deep).toBeLessThan(-0.3);
    } finally {
      sim.physics.free();
    }
  });

  it('a stone collider matches its visible faceted surface', async () => {
    const physics = new Physics(await loadRapier(), flatDirt);
    const stone = trail('the-chute').sections[0].stones![0];
    const shape = convexHull(stonePoints(stone, 30));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(shape.vertices, 3));
    geometry.setIndex(Array.from(shape.indices));
    const material = new MeshBasicMaterial(),
      mesh = new Mesh(geometry, material),
      cast = new Raycaster();
    try {
      physics.world.createCollider(physics.R.ColliderDesc.convexHull(new Float32Array(shape.vertices))!);
      physics.step();
      mesh.updateMatrixWorld();
      let hits = 0,
        grazing = 0;
      for (let ix = -12; ix <= 12; ix++)
        for (let iz = -12; iz <= 12; iz++) {
          const from = new Vector3(ix * 0.1 + 0.013, 6, iz * 0.12 + 0.007),
            down = new Vector3(0, -1, 0);
          cast.set(from, down);
          const visual = cast.intersectObject(mesh)[0];
          const physical = physics.world.castRay(new physics.R.Ray(from, down), 10, true);
          // Vertical rays running down a vertical side wall may touch one shape and not the other.
          if (!!physical !== !!visual) grazing++;
          if (visual && physical) {
            hits++;
            expect(physical.timeOfImpact).toBeCloseTo(visual.distance, 2);
          }
        }
      expect(hits).toBeGreaterThan(50);
      expect(grazing).toBeLessThan(4);
    } finally {
      physics.free();
      geometry.dispose();
      material.dispose();
    }
  });

  it('the angled log surface matches the visible sides and cut ends', async () => {
    const physics = new Physics(await loadRapier(), flatDirt);
    const shape = staticLogMesh({ a: [-1, 0.17, -0.25], b: [1, 0.3, 0.25], radius: 0.24 });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(shape.vertices, 3));
    geometry.setIndex(shape.indices);
    const material = new MeshBasicMaterial(),
      mesh = new Mesh(geometry, material),
      cast = new Raycaster();
    try {
      physics.world.createCollider(
        physics.R.ColliderDesc.trimesh(new Float32Array(shape.vertices), new Uint32Array(shape.indices)),
      );
      physics.step();
      mesh.updateMatrixWorld();
      let hits = 0;
      for (let ix = -11; ix <= 11; ix++)
        for (let iz = -5; iz <= 5; iz++) {
          const from = new Vector3(ix * 0.1, 2, iz * 0.1),
            down = new Vector3(0, -1, 0);
          cast.set(from, down);
          const visual = cast.intersectObject(mesh)[0];
          const physical = physics.world.castRay(new physics.R.Ray(from, down), 3, true);
          expect(!!physical).toBe(!!visual);
          if (visual && physical) {
            hits++;
            expect(physical.timeOfImpact).toBeCloseTo(visual.distance, 4);
          }
        }
      expect(hits).toBeGreaterThan(50);
    } finally {
      physics.free();
      geometry.dispose();
      material.dispose();
    }
  });
});
