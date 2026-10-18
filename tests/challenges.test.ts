import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { challengeTrails, challengeLoopRoute, challengeEasyRoute } from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { vehicleTuning } from '../src/data/vehicle';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { flatDirt, loadRapier, Physics } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import type { Vehicle } from '../src/sim/vehicle/vehicle';
import { convexHull } from '../src/sim/world/convexHull';
import { staticLogMesh, stonePoints, trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
import type { TrackInfo } from '../src/sim/world/features';
import { testWorld } from './world';

const DT = 1 / 60;
function pathFor(track: TrackInfo, back = false) {
  const path = Array.from({ length: Math.ceil(track.poly.length / 0.5) + 1 }, (_, i) => {
    const p = trailPoint(track, Math.min(track.poly.length, i * 0.5));
    return [p.x, p.z] as [number, number];
  });
  return back ? path.reverse() : path;
}

function runLeg(
  sim: Simulation,
  v: Vehicle,
  track: TrackInfo,
  inputs: Map<string, VehicleInput>,
  back = false,
  limit = 110,
) {
  const high = v.drivetrain.range === 'high';
  const pilot = new Autopilot(pathFor(track, back), high ? 1.5 : 0.7);
  pilot.lowRange = !high;
  let tilt = 0,
    speed = 0,
    sustained = 0,
    deviation = 0,
    lift = 0,
    time = 0;
  for (; time < limit; time += DT) {
    const command = pilot.input(v, DT);
    if (pilot.done) break;
    if (!high) {
      command.throttle = 1;
      command.brake = 0;
    }
    inputs.set('p', command);
    sim.step(inputs, DT);
    tilt = Math.max(tilt, v.tiltDeg());
    // Dropping off a ledge spikes the speed for a moment; crawl control holds the average.
    sustained += (Math.abs(v.speed) - sustained) * (DT / 0.5);
    speed = Math.max(speed, sustained);
    const near = trailProgress(track, v.position.x, v.position.z);
    // At a junction the vehicle begins behind this leg's finite centreline.
    if (near.along > 1 && near.along < track.poly.length - 1) deviation = Math.max(deviation, near.distance);
    lift = Math.max(lift, v.position.y - sim.world.terrain.heightAt(v.position.x, v.position.z));
  }
  return { done: pilot.done, remaining: pilot.remaining(v), time, tilt, speed, deviation, lift };
}

function driveLeg(...args: Parameters<typeof runLeg>) {
  const result = runLeg(...args);
  expect(result.done, `${args[2].def.id} stopped ${result.remaining.toFixed(1)} m from the end`).toBe(true);
  return result;
}

type Lockers = 'open' | 'rear' | 'both' | 'high';
async function scene(trackId: string, back = false, lockers: Lockers = 'open') {
  const world = testWorld(),
    sim = new Simulation(await loadRapier(), world, lateAfternoon);
  const track = world.features.tracks.find((t) => t.def.id === trackId)!;
  const p = trailPoint(track, back ? track.poly.length : 0);
  const v = sim.addVehicle('p', sim.poseAt(p.x, p.z, p.headingDeg + (back ? 180 : 0)));
  const inputs = new Map([['p', emptyInput()]]);
  for (let i = 0; i < 60; i++) sim.step(inputs, DT);
  if (lockers !== 'high') {
    v.toggleRange();
    v.precisionCrawl = true;
  }
  if (lockers === 'both') v.toggleDiff('front');
  if (lockers === 'both' || lockers === 'rear') v.toggleDiff('rear');
  return { sim, v, track, inputs };
}

const trail = (id: string) => challengeTrails.find((t) => t.id === id)!;

describe('Granite Crawl', () => {
  it('grades six rock obstacles from easy to extreme', () => {
    expect(challengeTrails.map((t) => t.difficulty)).toEqual([
      'easy',
      'moderate',
      'moderate',
      'hard',
      'hard',
      'extreme',
    ]);
    for (const t of challengeTrails) {
      const stones = t.sections.flatMap((s) => s.stones ?? []);
      expect(stones.length, t.id).toBeGreaterThan(3);
      expect(t.sections.flatMap((s) => s.logs ?? [])).toEqual([]);
    }
  });

  for (const t of challengeTrails)
    for (const bypass of [false, true])
      for (const back of [false, true])
        it(`drives ${t.name} ${bypass ? 'on its open-diff bypass' : 'through the rocks'} ${back ? 'towards its entrance' : 'towards its exit'}`, async () => {
          const s = await scene(bypass ? t.bypassTrackId : t.trackId, back, bypass ? 'open' : 'both');
          try {
            const result = driveLeg(s.sim, s.v, s.track, s.inputs, back);
            expect(result.tilt).toBeLessThan(bypass ? 15 : t.difficulty === 'extreme' ? 46 : 35);
            // Proportional crawl braking lets the Rock Face's steep back run a little fast at full throttle.
            const margin = t.difficulty === 'extreme' ? 0.7 : 0.4;
            expect(result.speed).toBeLessThan(vehicleTuning.crawling.forwardKmh / 3.6 + margin);
            expect(result.deviation).toBeLessThan(s.track.def.width / 2);
            if (!bypass && t.id === 'crevice-run') expect(result.lift).toBeGreaterThan(0.5);
            if (!bypass && t.id === 'off-camber-slab') expect(result.tilt).toBeGreaterThan(20);
            if (!bypass && t.id === 'rock-face') expect(result.tilt).toBeGreaterThan(35);
          } finally {
            s.sim.physics.free();
          }
        });

  it('the Rock Garden is easy enough for open differentials', async () => {
    const s = await scene('rock-garden');
    try {
      expect(driveLeg(s.sim, s.v, s.track, s.inputs).tilt).toBeLessThan(15);
    } finally {
      s.sim.physics.free();
    }
  });

  it('the Boulder Field stalls open differentials and slows a rear-only locker', async () => {
    const times: Record<string, number> = {};
    for (const lockers of ['both', 'rear'] as const) {
      const s = await scene('boulder-field', false, lockers);
      try {
        times[lockers] = driveLeg(s.sim, s.v, s.track, s.inputs).time;
      } finally {
        s.sim.physics.free();
      }
    }
    expect(times.rear).toBeGreaterThan(times.both * 1.3);
    const s = await scene('boulder-field');
    try {
      const result = runLeg(s.sim, s.v, s.track, s.inputs, false, 60);
      expect(result.done).toBe(false);
      expect(s.v.tiltDeg()).toBeLessThan(45);
    } finally {
      s.sim.physics.free();
    }
  });

  for (const id of ['boulder-field', 'rock-face'])
    it(`${trail(id).name} cannot be climbed in high range`, async () => {
      const s = await scene(id, false, 'high');
      try {
        const result = runLeg(s.sim, s.v, s.track, s.inputs, false, 45);
        expect(result.done).toBe(false);
        expect(result.remaining).toBeGreaterThan(10);
      } finally {
        s.sim.physics.free();
      }
    });

  for (const easy of [false, true])
    it(`joins every section into a continuous ${easy ? 'open-diff easy' : 'technical'} loop without teleporting`, async () => {
      const ids = easy ? challengeEasyRoute : challengeLoopRoute;
      const s = await scene(ids[0]);
      try {
        const start = { ...s.v.position };
        if (!easy) s.v.toggleDiff('rear');
        for (const id of ids) {
          const front = !easy && (id === 'boulder-field' || id === 'rock-face');
          if (s.v.differentials.front !== front) s.v.toggleDiff('front');
          const track = s.sim.world.features.tracks.find((t) => t.def.id === id)!;
          const result = driveLeg(s.sim, s.v, track, s.inputs);
          expect(result.tilt).toBeLessThan(easy ? 20 : 46);
          expect(result.deviation, id).toBeLessThan(track.def.width / 2 + 0.7);
        }
        expect(Math.hypot(s.v.position.x - start.x, s.v.position.z - start.z)).toBeLessThan(3);
      } finally {
        s.sim.physics.free();
      }
    });

  it('every trail stone is a closed convex hull that rests on the ground', () => {
    const world = testWorld();
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

  it('a stone collider matches its visible faceted surface', async () => {
    const physics = new Physics(await loadRapier(), flatDirt);
    const stone = trail('rock-face').sections[0].stones![0];
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
          const from = new Vector3(ix * 0.3 + 0.013, 6, iz * 0.6 + 0.007),
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
