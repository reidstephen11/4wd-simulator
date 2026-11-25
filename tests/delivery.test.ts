import { describe, expect, it } from 'vitest';
import { environmentAt } from '../src/data/environment';
import { ironbarkLevel as E } from '../src/data/levels/ironbark';
import { ironbarkMap } from '../src/data/levels/ironbarkMap';
import { supplyRun } from '../src/sim/supplyRun';
import { unimogTuning } from '../src/data/unimog';
import { SAVE_KEY } from '../src/core/config';
import { boxTrailer } from '../src/data/trailers';
import { SurfaceId } from '../src/data/surfaces';
import { Trailer, poseBehind } from '../src/sim/trailer';
import { makeScene } from './helpers/scenes';
import { CargoDrum } from '../src/sim/cargoDrum';
import { checkpointAt, EpisodeRun, startCheckpoint } from '../src/sim/episode';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier, Physics } from '../src/sim/physics';
import { loadSave, writeSave } from '../src/sim/save/save';
import { Simulation } from '../src/sim/sim';
import { hitchSupplyTrailer, supplyDelivered } from '../src/sim/supplyRun';
import { readDeliveryState } from '../src/sim/trailerState';
import { buildWorld } from '../src/sim/world/world';
import { MemoryStore, saveData } from './helpers/saves';

// A flat stand-in for a map with the supply run's camp where the run starts.
const CAMP = supplyRun.goal;
const world = buildWorld({
  ...ironbarkMap,
  width: 256,
  length: 256,
  wall: [120, 120],
  floor: [
    [-128, 0],
    [128, 0],
  ],
  noise: { ...ironbarkMap.noise, macroAmplitude: 0, midAmplitude: 0, detailAmplitude: 0 },
  tracks: [],
  gates: [],
  gateCourse: undefined,
  creeks: [],
  bogs: [],
  props: [],
  hills: [],
  flats: [],
  boulders: [],
  border: { width: 0, height: 0, gaps: [] },
  blackSoil: undefined,
  horizon: undefined,
  vegetation: { ...ironbarkMap.vegetation, maxTreeDensity: 0, boulderDensity: 0, termiteMounds: 0 },
  pois: [{ id: CAMP, name: 'Supply camp', kind: 'campsite', x: 0, z: 0, radius: 20 }],
  spawnCampsite: CAMP,
});
const DT = 1 / 60;
async function scene() {
  const sim = new Simulation(await loadRapier(), world, environmentAt(10, 'clear'));
  const v = sim.addVehicle('p', sim.poseAt(0, 0, 0));
  const t = hitchSupplyTrailer(sim, v.tuning, 'p');
  const inputs = new Map([['p', { ...emptyInput(), brake: 1, handbrake: true }]]);
  const step = (n = 120) => {
    for (let i = 0; i < n; i++) sim.step(inputs, DT);
  };
  step();
  return { sim, v, t, step };
}

describe('the Army supply run and trailer persistence', () => {
  it('hitches the box trailer behind a ball hitch and the No. 5 behind a pintle, each with the drums', async () => {
    const { sim, v, t } = await scene();
    expect(t.tuning.id).toBe('box6x4');
    expect(t.drums).toBe(supplyRun.drums);
    expect(t.hitchedTo).toBe(v);
    sim.physics.free();
    const sim2 = new Simulation(await loadRapier(), world, environmentAt(10, 'clear'));
    const mog = sim2.addVehicle('m', sim2.poseAt(0, 0, 0), unimogTuning);
    const no5 = hitchSupplyTrailer(sim2, unimogTuning, 'm');
    expect(no5.tuning.id).toBe('no5');
    expect(no5.drums).toBe(supplyRun.drums);
    expect(no5.hitchedTo).toBe(mog);
    sim2.physics.free();
  });

  it('is delivered (the Perentie unlock) only by both drums on a parked upright trailer at the camp', async () => {
    const { sim, t } = await scene();
    const pois = world.pois;
    expect(supplyDelivered([t], pois)).toBe(true);
    expect(supplyDelivered([], pois)).toBe(false);
    expect(supplyDelivered([t], [{ ...pois[0], id: 'elsewhere' }])).toBe(false);
    expect(supplyDelivered([t], [{ ...pois[0], x: 100 }])).toBe(false);
    t.loadDrums(1);
    expect(supplyDelivered([t], pois)).toBe(false);
    t.loadDrums(2);
    t.body.setLinvel({ x: 2, y: 0, z: 0 }, true);
    expect(supplyDelivered([t], pois)).toBe(false);
    t.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    t.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    expect(supplyDelivered([t], pois)).toBe(false);
    t.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    expect(supplyDelivered([t], pois)).toBe(true);
    sim.physics.free();
  });

  it('keeps the supply run in the save, and loads old checkpoints with a rescue flag', () => {
    const checkpoint = { ...startCheckpoint(E, CAMP, 'shortie'), supply: true };
    const store = new MemoryStore();
    writeSave(
      saveData({ episode: 'ironbark', episodes: { ironbark: { completed: false, checkpoint } } }),
      store,
    );
    expect(loadSave(store)!.episodes.ironbark!.checkpoint!.supply).toBe(true);
    // Before v1.51 a checkpoint carried `rescued` for the removed Episode 3's stockman.
    const old = JSON.parse(store.getItem(SAVE_KEY)!);
    old.episodes.ironbark.checkpoint.rescued = true;
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const loaded = loadSave(store)!.episodes.ironbark!.checkpoint!;
    expect(loaded.camp).toBe(CAMP);
    expect(loaded.supply).toBe(true);
    expect('rescued' in loaded).toBe(false);
  });

  it('round-trips unhitched trailers, punctures and spilled drums without moving or duplicating cargo', async () => {
    const { sim, v, t, step } = await scene();
    sim.spillDrum(t);
    step();
    t.unhitch();
    t.tyres[0] = 0;
    t.strain = 0.7;
    const state = sim.deliveryState();
    const run = new EpisodeRun(E, startCheckpoint(E, CAMP, 'shortie'), true);
    const checkpoint = checkpointAt(CAMP, run, v, [CAMP], [], [], state);
    const store = new MemoryStore();
    writeSave(
      saveData({ episode: 'ironbark', episodes: { ironbark: { completed: false, checkpoint } } }),
      store,
    );
    const loaded = loadSave(store)!.episodes.ironbark!.checkpoint!.delivery!;
    expect(loaded).toEqual(state);
    sim.removeTrailer(t.id);
    sim.restoreDelivery(loaded, 'p');
    const restored = sim.trailers.get(t.id)!;
    expect(restored.hitchedTo).toBeNull();
    expect(restored.drums).toBe(1);
    expect(restored.tyres).toEqual([0, 1]);
    expect(restored.strain).toBe(0.7);
    expect(restored.body.translation().z).toBeCloseTo(state.trailers[0].position.z, 1);
    expect(sim.looseDrums.size).toBe(1);
    sim.restoreDelivery(loaded, 'p');
    expect(sim.looseDrums.size).toBe(1);
    expect(sim.trailers.size).toBe(1);
    sim.physics.free();
  });

  it('reloads a nearby drum once, and repairs a trailer puncture using the car’s supplies', async () => {
    const { sim, v, t, step } = await scene();
    sim.spillDrum(t);
    step(180);
    expect(sim.recoverDrum('p')).toBe(true);
    expect(t.drums).toBe(2);
    expect(sim.looseDrums.size).toBe(0);
    expect(sim.recoverDrum('p')).toBe(false);
    t.tyres[1] = 0;
    v.condition.plugs = 1;
    expect(sim.repairTrailerTyre('p')).toBe(true);
    expect(v.condition.plugs).toBe(0);
    expect(t.tyres).toEqual([1, 1]);
    t.tyres[0] = 0;
    v.condition.spares = 0;
    expect(sim.repairTrailerTyre('p')).toBe(false);
    sim.repairAtCamp('p');
    expect(t.tyres).toEqual([1, 1]);
    v.body.setLinvel({ x: 4, y: 0, z: 0 }, true);
    v.speed = 4;
    expect(sim.secureTrailerLoad('p')).toBe(false);
    sim.physics.free();
  });

  it('spills a tipped load into physical drums, while a careful loaded drive keeps its cargo', async () => {
    const { sim, t, step } = await scene();
    step(240);
    expect(t.drums).toBe(2);
    expect(sim.looseDrums.size).toBe(0);
    t.unhitch();
    const p = t.body.translation();
    t.teleport(p.x, p.y + 1, p.z, { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
    step(120);
    expect(t.drums).toBeLessThan(2);
    expect(t.drums + sim.looseDrums.size).toBe(2);
    sim.physics.free();
  });

  it('floats a sealed full drum and carries it with the river current', async () => {
    const physics = new Physics(await loadRapier(), {
      surfaceAt: () => 0,
      waterSurfaceAt: () => 0,
      waterFlowAt: (_x, _z, out) => Object.assign(out, { x: 0, z: 1 }),
    });
    const d = new CargoDrum('d', physics, { x: 0, y: -0.5, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    for (let i = 0; i < 600; i++) {
      d.step(DT, 0);
      physics.step();
    }
    expect(d.body.translation().y).toBeGreaterThan(-0.6);
    expect(d.body.translation().y).toBeLessThan(0.2);
    expect(d.body.translation().z).toBeGreaterThan(4);
    physics.free();
  });

  it('a hard rock impact punctures trailer tyres only on Realistic', async () => {
    for (const mode of ['mild', 'realistic'] as const) {
      const s = await makeScene({
        speed: 12,
        ground: { surfaceAt: () => SurfaceId.Rock, waterSurfaceAt: () => null },
      });
      const t = new Trailer(
        't',
        s.physics,
        boxTrailer,
        poseBehind(s.vehicle, boxTrailer, () => 0),
      );
      t.loadDrums(2);
      t.hitch(s.vehicle);
      s.physics.world.createCollider(
        s.physics.R.ColliderDesc.cuboid(2, 0.12, 0.2).setTranslation(0, 0.12, -16),
      );
      s.beforeStep = (dt) => t.step(dt);
      s.afterStep = (dt) => t.postStep(dt, mode);
      s.run(4, { throttle: 1 });
      expect(t.tyres.some((h) => h === 0)).toBe(mode === 'realistic');
      s.physics.free();
    }
  });

  it('a submerged loaded trailer is lifted and pushed downstream by running water', async () => {
    const physics = new Physics(await loadRapier(), {
      surfaceAt: () => SurfaceId.Water,
      waterSurfaceAt: () => 0,
      waterFlowAt: (_x, _z, out) => Object.assign(out, { x: 0, z: 1 }),
    });
    const t = new Trailer('t', physics, boxTrailer, {
      x: 0,
      y: -1,
      z: 0,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    t.loadDrums(2);
    physics.step();
    const initialDown = t.body.linvel().y;
    t.step(DT);
    expect(t.body.linvel().y).toBeGreaterThan(initialDown);
    expect(t.body.linvel().z).toBeGreaterThan(0);
    physics.free();
  });

  it('rejects broken cargo saves and retains compatibility with older saves', () => {
    expect(readDeliveryState(undefined)).toBeUndefined();
    expect(readDeliveryState({ trailers: [null, { id: 'bad', position: {} }], looseDrums: [] })).toEqual({
      trailers: [],
      looseDrums: [],
    });
    const store = new MemoryStore();
    writeSave(saveData(), store);
    expect(loadSave(store)!.episode).toBe('ironbark');
  });
});
