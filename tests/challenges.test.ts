import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { challengeTrails, challengeLoopRoute, challengeEasyRoute } from '../src/data/challenges';
import { lateAfternoon } from '../src/data/environment';
import { SurfaceId } from '../src/data/surfaces';
import { Autopilot } from '../src/sim/input/autopilot';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { flatDirt, loadRapier, Physics } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import type { Vehicle } from '../src/sim/vehicle/vehicle';
import { staticLogMesh, trailPoint, trailProgress } from '../src/sim/world/crawlTrail';
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

function driveLeg(
  sim: Simulation,
  v: Vehicle,
  track: TrackInfo,
  inputs: Map<string, VehicleInput>,
  back = false,
) {
  const pilot = new Autopilot(pathFor(track, back), 0.7);
  pilot.lowRange = true;
  let tilt = 0,
    speed = 0,
    deviation = 0,
    lift = 0,
    woodContacts = 0;
  for (let time = 0; time < 110; time += DT) {
    const command = pilot.input(v, DT);
    if (pilot.done) break;
    command.throttle = 1;
    command.brake = 0;
    inputs.set('p', command);
    sim.step(inputs, DT);
    tilt = Math.max(tilt, v.tiltDeg());
    speed = Math.max(speed, Math.abs(v.speed));
    const near = trailProgress(track, v.position.x, v.position.z);
    // At a junction the vehicle begins behind this leg's finite centreline.
    if (near.along > 1 && near.along < track.poly.length - 1) deviation = Math.max(deviation, near.distance);
    lift = Math.max(lift, v.position.y - sim.world.terrain.heightAt(v.position.x, v.position.z));
    woodContacts += v.wheels.filter((w) => w.contact && w.surface === SurfaceId.Wood && w.load > 100).length;
  }
  expect(pilot.done, `${track.def.id} stopped ${pilot.remaining(v).toFixed(1)} m from the end`).toBe(true);
  return { tilt, speed, deviation, lift, woodContacts };
}

async function scene(trackId: string, back = false) {
  const world = testWorld(),
    sim = new Simulation(await loadRapier(), world, lateAfternoon);
  const track = world.features.tracks.find((t) => t.def.id === trackId)!;
  const p = trailPoint(track, back ? track.poly.length : 0);
  const v = sim.addVehicle('p', sim.poseAt(p.x, p.z, p.headingDeg + (back ? 180 : 0)));
  const inputs = new Map([['p', emptyInput()]]);
  for (let i = 0; i < 60; i++) sim.step(inputs, DT);
  v.toggleRange();
  v.precisionCrawl = true;
  return { sim, v, track, inputs };
}

describe('4WD Challenge Loop', () => {
  for (const trail of challengeTrails)
    for (const bypass of [false, true])
      for (const back of [false, true])
        it(`drives ${trail.name} ${bypass ? 'on its open-diff bypass' : 'through the obstacle'} ${back ? 'towards its entrance' : 'towards its exit'}`, async () => {
          const s = await scene(bypass ? trail.bypassTrackId : trail.trackId, back);
          try {
            if (!bypass) {
              s.v.toggleDiff('front');
              s.v.toggleDiff('rear');
            }
            const result = driveLeg(s.sim, s.v, s.track, s.inputs, back);
            expect(result.tilt).toBeLessThan(bypass ? 15 : 35);
            expect(result.speed).toBeLessThan(1.5);
            expect(result.deviation).toBeLessThan(s.track.def.width / 2);
            if (!bypass && trail.id === 'log-steps') expect(result.woodContacts).toBeGreaterThan(100);
            if (!bypass && trail.id === 'v-notch') expect(result.lift).toBeGreaterThan(0.7);
            if (!bypass && trail.id === 'sidewinder-shelf') expect(result.tilt).toBeGreaterThan(20);
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
          const front = !easy && (id === 'v-notch' || id === 'log-steps');
          if (s.v.differentials.front !== front) s.v.toggleDiff('front');
          const track = s.sim.world.features.tracks.find((t) => t.def.id === id)!;
          const result = driveLeg(s.sim, s.v, track, s.inputs);
          expect(result.tilt).toBeLessThan(easy ? 20 : 35);
          expect(result.deviation, id).toBeLessThan(track.def.width / 2 + 0.7);
        }
        expect(Math.hypot(s.v.position.x - start.x, s.v.position.z - start.z)).toBeLessThan(3);
      } finally {
        s.sim.physics.free();
      }
    });

  it('the rock gate stops a misaligned vehicle instead of letting it clip through', async () => {
    const s = await scene('boulder-gates');
    try {
      const p = trailPoint(s.track, 3, 0.6);
      s.v.teleport(s.sim.poseAt(p.x, p.z, p.headingDeg));
      s.inputs.set('p', { ...emptyInput(), throttle: 1 });
      for (let i = 0; i < 14 / DT; i++) s.sim.step(s.inputs, DT);
      expect(trailProgress(s.track, s.v.position.x, s.v.position.z).along).toBeLessThan(9);
      expect(s.v.tiltDeg()).toBeLessThan(45);
    } finally {
      s.sim.physics.free();
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
