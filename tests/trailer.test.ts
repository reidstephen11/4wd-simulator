import { describe, expect, it } from 'vitest';
import { lateAfternoon } from '../src/data/environment';
import { boxTrailer, canCouple, hitchPoint, no5Trailer, type TrailerTuning } from '../src/data/trailers';
import { Groups, groups, loadRapier } from '../src/sim/physics';
import { trailerHud } from '../src/core/hudState';
import { Simulation } from '../src/sim/sim';
import { emptyInput, type VehicleInput } from '../src/sim/input/vehicleInput';
import { poseBehind, Trailer, type TrailerEvent } from '../src/sim/trailer';
import type { Vehicle } from '../src/sim/vehicle/vehicle';
import { makeScene } from './helpers/scenes';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { testWorld } from './world';

/** Two 200 L drums of diesel standing in the box: a full load. */
const DRUMS = 2;

/** A scene on flat or tilted ground with a trailer (the box trailer unless named) hitched behind, loaded or empty. */
async function towScene(
  opts: Parameters<typeof makeScene>[0],
  drums = DRUMS,
  trailer: TrailerTuning = boxTrailer,
) {
  const s = await makeScene(opts);
  const v = s.vehicle;
  const pitch = Math.tan(((opts.pitchDeg ?? 0) * Math.PI) / 180);
  const roll = Math.tan(((opts.rollDeg ?? 0) * Math.PI) / 180);
  // The scene's ground: -z goes uphill, +x goes down.
  const t = new Trailer(
    't',
    s.physics,
    trailer,
    poseBehind(v, trailer, (x, z) => -pitch * z - roll * x),
  );
  if (drums > 0) t.loadDrums(drums);
  t.hitch(v);
  const events: TrailerEvent[] = [];
  s.beforeStep = (dt) => t.step(dt);
  s.afterStep = (dt) => events.push(...t.postStep(dt));
  s.run(1, {});
  return { s, v, t, events };
}

/** How far the coupling has come off the ball (m). */
function gap(v: Vehicle, t: Trailer): number {
  const h = hitchPoint(v.tuning);
  const b = v.localToWorld(h.x, h.y, h.z);
  const c = t.couplingWorld();
  return Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z);
}

describe('towing a trailer', () => {
  it('follows on the flat, on the ball, behind the car and upright', async () => {
    const { s, v, t } = await towScene({});
    s.run(6, { throttle: 1 });
    expect(-v.position.z).toBeGreaterThan(30);
    expect(gap(v, t)).toBeLessThan(0.02);
    // Still straight behind.
    expect(t.body.translation().z - v.position.z).toBeGreaterThan(3.5);
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(3);
    expect(t.tiltDeg()).toBeLessThan(8);
  });

  it.each(vehicleOrder)('follows behind the %s, forwards and in reverse', async (id) => {
    const { s, v, t, events } = await towScene({ tuning: vehicles[id].tuning });
    s.run(5, { throttle: 0.6 });
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(3);
    s.run(4, { throttle: 0.4, steer: 1 });
    s.run(3, { brake: 1 });
    s.run(3, { brake: 0.3 });
    expect(gap(v, t)).toBeLessThan(0.02);
    // However hard it's reversed into the fold, the drawbar stops against the towbar.
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(75);
    expect(events.map((e) => e.type)).not.toContain('tipped');
    expect(t.tiltDeg()).toBeLessThan(15);
  });

  it('the load slows the car down', async () => {
    const empty = await makeScene({});
    empty.run(6, { throttle: 1 });
    const { s, v } = await towScene({});
    s.run(6, { throttle: 1 });
    expect(-v.position.z).toBeLessThan(-empty.vehicle.position.z - 2);
  });

  it('follows round a corner without tipping', async () => {
    const { s, v, t, events } = await towScene({});
    s.run(4, { throttle: 0.6 });
    s.run(4, { throttle: 0.4, steer: 1 });
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(t.hitchAngleDeg()).toBeGreaterThan(5);
    expect(events.map((e) => e.type)).not.toContain('tipped');
  });

  it('climbs a 20° slope behind the car in low range, loaded', async () => {
    const { s, v, t } = await towScene({ pitchDeg: 20 });
    v.toggleRange();
    const y0 = v.position.y;
    s.run(10, { throttle: 1 });
    expect(v.position.y - y0).toBeGreaterThan(8);
    expect(gap(v, t)).toBeLessThan(0.02);
  });

  it('reverses straight back, then jackknifes reversing on full lock', async () => {
    const { s, v, t, events } = await towScene({});
    const z0 = t.body.translation().z;
    s.run(3, { brake: 0.5 });
    expect(t.body.translation().z - z0).toBeGreaterThan(1.5);
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(20);
    s.run(6, { brake: 0.7, steer: 1 });
    expect(events.map((e) => e.type)).toContain('jackknifed');
    // The drawbar has come up against the towbar: it folds no further, and the car only
    // creeps back, shoving the trailer sideways.
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(75);
    expect(Math.abs(v.speed)).toBeLessThan(1.5);
    expect(gap(v, t)).toBeLessThan(0.02);
  });

  it('stands hitched across a 30° side slope', async () => {
    const { s, t, events } = await towScene({ rollDeg: 30 });
    s.run(4, { handbrake: true });
    expect(t.tiltDeg()).toBeLessThan(40);
    expect(events.map((e) => e.type)).not.toContain('tipped');
  });

  it('the loaded trailer tips over in a hard turn across a slope', async () => {
    const { s, v, t, events } = await towScene({ rollDeg: 15 });
    const f = v.forward();
    const sp = 30 / 3.6;
    for (const b of [v.body, t.body]) b.setLinvel({ x: f.x * sp, y: f.y * sp, z: f.z * sp }, true);
    s.run(4, (time) => ({ throttle: 0.4, steer: time > 2.5 ? 1 : 0 }));
    expect(events.map((e) => e.type)).toContain('tipped');
    expect(t.tipped).toBe(true);
  });

  it('unhitched, stands chocked on an 8° slope while the car drives away', async () => {
    const { s, v, t } = await towScene({ pitchDeg: 8 });
    t.unhitch();
    s.run(1, {});
    const p0 = { ...t.body.translation() };
    s.run(6, { throttle: 0.5 });
    const p1 = t.body.translation();
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.1);
    expect(gap(v, t)).toBeGreaterThan(10);
    expect(t.tiltDeg()).toBeLessThan(15);
  });
});

describe('the Army No. 5 trailer', () => {
  const pintle = [vehicles.perentie.tuning, vehicles.unimog.tuning];

  it('its ring goes only on a pintle hook: the Land Rover and the Unimog', () => {
    for (const id of vehicleOrder)
      expect(canCouple(no5Trailer, vehicles[id].tuning)).toBe(id === 'perentie' || id === 'unimog');
    for (const id of vehicleOrder) expect(canCouple(boxTrailer, vehicles[id].tuning)).toBe(true);
  });

  it.each(pintle)('loaded, follows behind the $name and takes a corner at a walking pace', async (tuning) => {
    const { s, v, t, events } = await towScene({ tuning }, DRUMS, no5Trailer);
    s.run(4, { throttle: 0.5 });
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(3);
    expect(t.body.translation().z - v.position.z).toBeGreaterThan(3);
    s.run(2, {});
    s.run(4, { throttle: 0.25, steer: 1 });
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(Math.abs(t.hitchAngleDeg())).toBeGreaterThan(5);
    expect(events.map((e) => e.type)).not.toContain('tipped');
  });

  it('reversed on full lock behind the Land Rover, folds against the pintle without tipping', async () => {
    const { s, v, t, events } = await towScene({ tuning: vehicles.perentie.tuning }, DRUMS, no5Trailer);
    s.run(3, { brake: 0.5 });
    s.run(6, { brake: 0.7, steer: 1 });
    expect(events.map((e) => e.type)).toContain('jackknifed');
    expect(Math.abs(t.hitchAngleDeg())).toBeLessThan(75);
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(events.map((e) => e.type)).not.toContain('tipped');
  });

  it('climbs a 20° slope behind the Land Rover in low range, loaded', async () => {
    const { s, v, t } = await towScene({ pitchDeg: 20, tuning: vehicles.perentie.tuning }, DRUMS, no5Trailer);
    v.toggleRange();
    const y0 = v.position.y;
    s.run(10, { throttle: 1 });
    expect(v.position.y - y0).toBeGreaterThan(6);
    expect(gap(v, t)).toBeLessThan(0.02);
  });

  it('loaded, tips in a hard turn across a slope at a lower speed than the box trailer', async () => {
    // At 25 km/h across 15°, the No. 5 (narrow track, high floor) goes over.
    const { s, v, t } = await towScene({ rollDeg: 15, tuning: vehicles.perentie.tuning }, DRUMS, no5Trailer);
    const f = v.forward();
    const sp = 25 / 3.6;
    for (const b of [v.body, t.body]) b.setLinvel({ x: f.x * sp, y: f.y * sp, z: f.z * sp }, true);
    s.run(4, (time) => ({ throttle: 0.4, steer: time > 2.5 ? 1 : 0 }));
    expect(t.tipped).toBe(true);
  });

  it('unhitched, stands on its prop leg on an 8° slope while the Land Rover drives away', async () => {
    const { s, v, t } = await towScene({ pitchDeg: 8, tuning: vehicles.perentie.tuning }, DRUMS, no5Trailer);
    t.unhitch();
    s.run(1, {});
    const p0 = { ...t.body.translation() };
    s.run(6, { throttle: 0.5 });
    const p1 = t.body.translation();
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeLessThan(0.1);
    expect(gap(v, t)).toBeGreaterThan(10);
    expect(t.tiltDeg()).toBeLessThan(15);
  });
});

describe('what the player hears and sees of it', () => {
  it('bangs over a bump in the track, and runs quietly on the flat', async () => {
    const { s, t } = await towScene({}, 0);
    let flat = 0;
    s.afterStep = (dt) => {
      t.postStep(dt);
      flat = Math.max(flat, t.bump);
    };
    s.run(4, { throttle: 0.7 });
    expect(flat).toBe(0);
    // A 15 cm log across the track ahead.
    const R = s.physics.R;
    const z = s.vehicle.position.z - 12;
    s.physics.world.createCollider(
      R.ColliderDesc.cuboid(4, 0.075, 0.12)
        .setTranslation(0, 0.075, z)
        .setCollisionGroups(groups(Groups.STATIC, 0xffff)),
    );
    let bump = 0;
    let rough = 0;
    s.afterStep = (dt) => {
      t.postStep(dt);
      bump = Math.max(bump, t.bump);
      rough = Math.max(
        rough,
        t.wheels.reduce((a, w) => a + Math.abs(w.compression), 0),
      );
    };
    s.run(4, { throttle: 0.7 });
    expect(t.body.translation().z).toBeLessThan(z);
    expect(bump).toBeGreaterThan(1.2);
    expect(rough).toBeGreaterThan(1);
  });

  it('loads drums: their count, mass and where they sit', async () => {
    const { t } = await towScene({}, 0);
    expect(t.drums).toBe(0);
    expect(t.mass).toBe(boxTrailer.mass);
    t.loadDrums(2);
    expect(t.drums).toBe(2);
    expect(t.mass).toBeCloseTo(boxTrailer.mass + 2 * 186, 0);
    t.loadDrums(0);
    expect(t.mass).toBe(boxTrailer.mass);
  });

  it('the HUD line says what is on the back, or where it was left', async () => {
    const { t } = await towScene({});
    const line = trailerHud(t, null)!;
    expect(line).toMatchObject({ state: 'towing', drums: 2, overloaded: false, limit: 750 });
    expect(line.kg).toBe(Math.round(boxTrailer.mass + 2 * 186));
    t.loadDrums(3);
    expect(trailerHud(t, null)!.overloaded).toBe(true);
    t.jackknifed = true;
    expect(trailerHud(t, null)!.state).toBe('jackknifed');
    t.tipped = true;
    expect(trailerHud(t, null)!.state).toBe('tipped');
    expect(trailerHud(null, { distance: 42, tipped: false })).toMatchObject({ state: 'left', distance: 42 });
    expect(trailerHud(null, null)).toBeNull();
  });
});

describe('hitching in the game', () => {
  const DT = 1 / 60;
  function run(sim: Simulation, seconds: number, input: Partial<VehicleInput>): void {
    const inputs = new Map<string, VehicleInput>();
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      inputs.set('p', { ...emptyInput(), ...input });
      sim.step(inputs, DT);
      // An edge-triggered key is pressed for one step only.
      if (input.interact) input = { ...input, interact: false };
    }
  }

  async function campSim() {
    const R = await loadRapier();
    const sim = new Simulation(R, testWorld(), lateAfternoon);
    const v = sim.addVehicle('p', sim.campsitePose('river-flat-camp'));
    run(sim, 1, {});
    const t = sim.addTrailer('box', boxTrailer, 'p');
    run(sim, 1, {});
    return { sim, v, t };
  }

  it('unhitches when stopped, and the use key hitches it again once the ball is back under it', async () => {
    const { sim, v, t } = await campSim();
    const events: string[] = [];
    sim.events.on('trailer', (e) => events.push(e.event.type));
    expect(sim.trailerOf('p')).toBe(t);
    expect(sim.hitchOption('p')?.kind).toBe('unhitch');
    expect(sim.unhitchTrailer('p')).toBe(true);
    expect(sim.trailerOf('p')).toBeNull();
    // Creep forward a little: the coupling is still in reach of the ball.
    run(sim, 0.5, { throttle: 0.1 });
    run(sim, 2, {});
    const away = t.distanceToHitch(v);
    expect(away).toBeGreaterThan(0.1);
    const option = sim.hitchOption('p');
    expect(option?.kind).toBe('hitch');
    expect(option?.possible).toBe(true);
    run(sim, 0.5, { interact: true });
    expect(sim.trailerOf('p')).toBe(t);
    expect(events).toEqual(['unhitched', 'hitched']);
    // And it comes along.
    const p0 = { ...t.body.translation() };
    run(sim, 4, { throttle: 0.5 });
    const p1 = t.body.translation();
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(5);
    expect(gap(v, t)).toBeLessThan(0.02);
  });

  it('won’t hitch or unhitch on the move', async () => {
    const { sim } = await campSim();
    run(sim, 2, { throttle: 0.6 });
    expect(sim.hitchOption('p')).toMatchObject({ kind: 'unhitch', possible: false, reason: 'Stop first' });
    expect(sim.unhitchTrailer('p')).toBe(false);
    expect(sim.trailerOf('p')).not.toBeNull();
  });

  it('a No. 5 can’t go on a car with only a tow ball, and is left standing when the Land Rover is swapped for one', async () => {
    const R = await loadRapier();
    const sim = new Simulation(R, testWorld(), lateAfternoon);
    sim.addVehicle('p', sim.campsitePose('river-flat-camp'));
    run(sim, 1, {});
    expect(() => sim.addTrailer('no5', no5Trailer, 'p')).toThrow(/pintle/);
    sim.replaceVehicle('p', vehicles.perentie.tuning);
    run(sim, 1, {});
    const t = sim.addTrailer('no5', no5Trailer, 'p');
    run(sim, 1, {});
    expect(sim.trailerOf('p')).toBe(t);
    sim.unhitchTrailer('p');
    run(sim, 0.5, {});
    // Back on the short 4WD, it isn't offered the No. 5 even with the ball right there.
    sim.replaceVehicle('p', vehicles.shortie.tuning);
    run(sim, 1, {});
    expect(sim.trailerOf('p')).toBeNull();
    expect(sim.hitchOption('p')).toBeNull();
    // Swapping vehicles while towing it leaves it standing behind.
    sim.replaceVehicle('p', vehicles.perentie.tuning);
    run(sim, 1, {});
    expect(sim.hitchOption('p')).toMatchObject({ kind: 'hitch', possible: true });
    sim.hitchTrailer('p');
    sim.replaceVehicle('p', vehicles.lc79.tuning);
    run(sim, 1, {});
    expect(sim.trailerOf('p')).toBeNull();
    expect(t.hitchedTo).toBeNull();
  });

  it('comes back to camp hitched behind the car', async () => {
    const { sim, v, t } = await campSim();
    run(sim, 5, { throttle: 0.7 });
    sim.returnToCampsite('p', 'river-flat-camp');
    run(sim, 2, {});
    expect(sim.trailerOf('p')).toBe(t);
    expect(gap(v, t)).toBeLessThan(0.02);
    expect(t.tiltDeg()).toBeLessThan(15);
  });
});
