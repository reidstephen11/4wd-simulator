import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, type MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { efiFourSynthTuning, engineSynthTunings } from '../src/data/audio';
import { hiluxTuning } from '../src/data/hilux';
import { SurfaceId } from '../src/data/surfaces';
import { vehicleOrder, vehicles } from '../src/data/vehicles';
import { xtracabTuning as t } from '../src/data/xtracab';
import { spareSidewall } from '../src/render/spares';
import { vehicleLooks } from '../src/render/vehicleLooks';
import { VehicleModel } from '../src/render/vehicleModel';
import { XTRACAB_DRIVING_LAMPS } from '../src/render/xtracabLayout';
import { loadSave, writeSave } from '../src/sim/save/save';
import { coupledRpm } from '../src/sim/vehicle/drivetrain';
import { MemoryStore, saveData } from './helpers/saves';
import { makeScene } from './helpers/scenes';

describe('Hilux SR5 Xtra Cab', () => {
  it('is the 1985 4x4 SR5 Xtracab of the brochure: 2.85 m wheelbase, 56.3 and 55.5 in tread, the W56, 4.10 axles, a 2.276 low range and 73 L', () => {
    expect(vehicleOrder).toContain('xtracab');
    expect(Math.abs(t.wheels[0].z - t.wheels[2].z)).toBeCloseTo(2.85, 3);
    expect(t.wheels[1].x - t.wheels[0].x).toBeCloseTo(1.43, 3);
    expect(t.wheels[3].x - t.wheels[2].x).toBeCloseTo(1.41, 3);
    // 31×10.50R15 tyres, at stock height.
    expect(t.wheelRadius * 2).toBeCloseTo(0.787, 2);
    expect(t.wheelWidth).toBeCloseTo(0.267, 2);
    expect(t.gearbox.ratios).toEqual([3.954, 2.141, 1.384, 1.0, 0.85]);
    expect([t.gearbox.finalDrive, t.ranges.low.ratio]).toEqual([4.1, 2.276]);
    expect(t.engine.fuel.tankLitres).toBe(73);
    expect(t.transfer).toBe('partTime');
    // 190 Nm at 2,800 rpm, as the brochure. Its 86.5 kW (116 hp) at 4,800 became 94.6 kW at
    // 5,250 on the curve when v2.29 let every engine rev a tenth further (the airflow limit
    // holds what is delivered to about 86 kW).
    const at = (rpm: number) => t.engine.torqueCurve.find(([r]) => r === rpm)![1];
    expect(at(2800)).toBe(190);
    expect((at(5250) * 5250 * 2 * Math.PI) / 60 / 1000).toBeCloseTo(94.6, 0);
    // Its own engine sound: the injected four, four firings, a starter as long as the crank time.
    expect(engineSynthTunings.xtracab).toBe(efiFourSynthTuning);
    expect(efiFourSynthTuning).not.toBe(engineSynthTunings.hilux);
    expect(efiFourSynthTuning.firingOrder).toHaveLength(4);
    expect(efiFourSynthTuning.knock).toBeUndefined();
    expect(efiFourSynthTuning.starter.seconds).toBe(t.engine.crankSeconds);
    // 100 km/h in fifth is about 2,350 rpm on the 31s; first low creeps at a walk at idle.
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeGreaterThan(2250);
    expect(coupledRpm(t, 100 / 3.6, 4, 'high')).toBeLessThan(2450);
    expect((t.engine.idleRpm / coupledRpm(t, 1, 0, 'low')) * 3.6).toBeLessThan(3.2);
    // Heavier and more powerful than the earlier Hilux.
    expect(t.mass).toBeGreaterThan(hiluxTuning.mass);
  });

  it('is open from the start and is remembered in the save', () => {
    expect(vehicles.xtracab.tuning.name).not.toMatch(/future|mcfly/i);
    expect(vehicles.xtracab.blurb).not.toMatch(/future|mcfly/i);
    const store = new MemoryStore();
    writeSave(saveData({ vehicle: 'xtracab' }), store);
    expect(loadSave(store)!.vehicle).toBe('xtracab');
  });

  it('draws open wheel wells, leaf springs, a left-hand-drive cab, dials the driver can see and six driving lamps', () => {
    const model = new VehicleModel(t, true);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      expect(model.root.name).toBe('hilux-sr5-xtra-cab');
      expect(model.suspension.group.children.filter((c) => c.name.startsWith('coil-'))).toHaveLength(0);
      // Left-hand drive: the wheel and the driver's eye are on the left.
      expect(model.instruments.wheel.parent!.position.x).toBeLessThan(0);
      expect(vehicles.xtracab.cabin.eye.x).toBeLessThan(0);
      expect(model.beams).not.toBeNull();
      expect(model.rackPlanks.children).toHaveLength(2);
      const shell = new Mesh(model.body.geometry, material);
      shell.updateMatrixWorld();
      for (const wheel of t.wheels) {
        const side = Math.sign(wheel.x);
        const ray = new Raycaster(new Vector3(side * 0.6, -0.12, wheel.z), new Vector3(side, 0, 0), 0, 0.4);
        expect(ray.intersectObject(shell)).toHaveLength(0);
      }
      const cabin = vehicles.xtracab.cabin;
      for (const dial of Object.values(cabin.dials)) {
        const ray = new Raycaster(
          new Vector3(dial.x, cabin.dialY, cabin.dialZ + 0.25),
          new Vector3(0, 0, -1),
          0,
          0.3,
        );
        const hit = ray.intersectObject(shell)[0];
        expect(hit).toBeDefined();
        expect(hit.point.z).toBeLessThan(cabin.dialZ + 0.015);
        expect(hit.point.z).toBeGreaterThan(cabin.dialZ - 0.01);
      }
      // Four round lamps on the roll bar and two on the front hoop, each drawn where the glow is.
      expect(XTRACAB_DRIVING_LAMPS).toHaveLength(6);
      expect(vehicleLooks.xtracab.lamps.roof).toBe(XTRACAB_DRIVING_LAMPS);
      const pos = model.body.geometry.getAttribute('position');
      const slots = model.body.geometry.getAttribute('materialSlot');
      for (const lamp of XTRACAB_DRIVING_LAMPS) {
        let n = 0;
        for (let i = 0; i < pos.count; i++)
          if (
            slots.getX(i) === 9 &&
            Math.hypot(pos.getX(i) - lamp.x, pos.getY(i) - lamp.y, pos.getZ(i) - lamp.z) < 0.12
          )
            n++;
        expect(n, `lamp at ${lamp.x}, ${lamp.y}`).toBeGreaterThan(20);
      }
      for (const attribute of Object.values(model.body.geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    } finally {
      material.dispose();
      model.dispose();
    }
  });

  it('matches the published size: 1.69 m over the flares, about 1.74 m to the roof on the 31s, the bed 1.9 m inside', () => {
    const wheel = vehicleLooks.xtracab.wheel(t);
    const body = vehicleLooks.xtracab.body(t, wheel);
    const p = body.getAttribute('position');
    const ground = -(0.12 + t.wheelRadius);
    let roof = -Infinity,
      wide = 0,
      nose = Infinity,
      tail = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const x = Math.abs(p.getX(i)),
        y = p.getY(i),
        z = p.getZ(i);
      // The cab's roof (not the lamps behind it), the flares (not the mirrors or tyres), and
      // the sheet metal between the nose and the tailgate at the crease's height.
      if (z > -0.4 && z < 0.5 && x < 0.5) roof = Math.max(roof, y);
      if (y < 0.5 && y > 0.1 && Math.abs(Math.abs(z) - 1.425) < 0.3) wide = Math.max(wide, x);
      if (x < 0.2 && y > 0.47 && y < 0.54) {
        nose = Math.min(nose, z);
        tail = Math.max(tail, z);
      }
    }
    // Published: 66.5 in wide, 67.1–67.3 in high on P225/75R15s (34 mm lower than the 31s).
    expect(wide * 2).toBeCloseTo(1.69, 2);
    expect(roof - ground).toBeGreaterThan(1.72);
    expect(roof - ground).toBeLessThan(1.76);
    // Nose skin to tailgate skin: the 184.1 in overall length less the two stock bumpers.
    expect(tail - nose).toBeGreaterThan(4.5);
    expect(tail - nose).toBeLessThan(4.62);
    body.dispose();
    wheel.dispose();
  });

  it('keeps every tyre clear of the body at full bump, on its own and across an axle, at full lock both ways', () => {
    const model = new VehicleModel(t);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const shell = new Mesh(model.body.geometry, material);
      shell.updateMatrixWorld();
      const parked = -0.12,
        bump = t.suspensionTravel - 0.12,
        droop = -0.12;
      const lock = (t.steering.maxAngleDeg * Math.PI) / 180;
      const heights = [
        [parked + bump, parked + bump, parked + bump, parked + bump],
        [parked + bump, parked + droop, parked + droop, parked + bump],
        [parked + droop, parked + bump, parked + bump, parked + droop],
        [parked, parked, parked, parked],
      ];
      const halfWidth = spareSidewall(model.wheels[0].mesh.geometry);
      const fouls: string[] = [];
      for (const h of heights)
        for (const steer of [-lock, 0, lock]) {
          model.poseWheels(h, [steer, steer, 0, 0]);
          model.root.updateMatrixWorld(true);
          for (let i = 0; i < 4; i++) {
            const wheel = model.wheels[i].pivot;
            const axle = new Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
            // Lines through the tyre from sidewall to sidewall, out to the tread.
            for (const radius of [0.24, 0.3, 0.35, t.wheelRadius - 0.012])
              for (let n = 0; n < 24; n++) {
                const angle = (n * Math.PI) / 12;
                const point = new Vector3(0, Math.sin(angle) * radius, Math.cos(angle) * radius)
                  .applyQuaternion(wheel.quaternion)
                  .add(wheel.position)
                  .addScaledVector(axle, -halfWidth);
                const hits = new Raycaster(point, axle, 0.002, 2 * halfWidth - 0.002).intersectObject(shell);
                if (hits.length)
                  fouls.push(
                    `wheel ${i} r ${radius.toFixed(2)} a ${n} h ${h.map((x) => x.toFixed(2))} s ${steer.toFixed(2)} at ${hits[0].point.toArray().map((x) => x.toFixed(2))}`,
                  );
              }
          }
        }
      expect(fouls.slice(0, 12), 'body inside a tyre').toEqual([]);
    } finally {
      material.dispose();
      model.dispose();
    }
  });

  it('idles near 750 rpm, reaches 60 km/h in 6 to 11 s, quicker than the earlier Hilux', async () => {
    const s = await makeScene({ tuning: t });
    s.run(3, {});
    expect(s.vehicle.drivetrain.rpm).toBeGreaterThan(690);
    expect(s.vehicle.drivetrain.rpm).toBeLessThan(790);
    expect(Math.abs(s.vehicle.speed)).toBeLessThan(0.05);
    const sprint = async (tuning: typeof t) => {
      const scene = await makeScene({ tuning });
      scene.run(1, {});
      let time = 0;
      while (scene.vehicle.speed * 3.6 < 60 && time < 20) {
        scene.run(0.1, { throttle: 1 });
        time += 0.1;
      }
      scene.physics.world.free();
      return time;
    };
    s.physics.world.free();
    const time = await sprint(t);
    expect(time).toBeGreaterThan(6);
    expect(time).toBeLessThan(11);
    expect(time).toBeLessThan(await sprint(hiluxTuning));
  });

  it('stays upright through a full-lock turn at 50 km/h and climbs 30° in low range', async () => {
    const s = await makeScene({ speed: 50 / 3.6, tuning: t });
    let tilt = 0;
    s.run(3, (time) => {
      tilt = Math.max(tilt, s.vehicle.tiltDeg());
      return { throttle: 0.6, steer: time > 0.3 ? 1 : 0 };
    });
    expect(tilt).toBeLessThan(20);
    s.physics.world.free();
    const hill = await makeScene({ pitchDeg: 30, tuning: t });
    hill.vehicle.toggleRange();
    const z0 = hill.vehicle.position.z;
    hill.run(12, { throttle: 1 });
    expect(z0 - hill.vehicle.position.z).toBeGreaterThan(15);
    hill.physics.world.free();
  });

  it('lights its headlamps on low beam and all six driving lamps with high beam', async () => {
    const s = await makeScene({ tuning: t });
    const model = new VehicleModel(t, true);
    try {
      const materials = model.body.material as MeshStandardMaterial[];
      const at = (mode: 'off' | 'low' | 'high') => {
        s.vehicle.lights = mode;
        model.update(s.vehicle, 1, 1 / 60);
        return {
          ...model.beams!.strengths,
          head: materials[8].emissiveIntensity,
          lamps: materials[9].emissiveIntensity,
        };
      };
      const off = at('off'),
        low = at('low'),
        high = at('high');
      expect(low.head).toBeGreaterThan(off.head);
      expect(low.roof).toBe(0);
      expect(low.lamps).toBe(off.lamps);
      expect(high.roof).toBeGreaterThan(0);
      expect(high.lamps).toBeGreaterThan(off.lamps);
      // The yellow covers are in the driving-lamp material: they are what glows.
      expect(model.body.geometry.groups.find((g) => g.materialIndex === 9)?.count ?? 0).toBeGreaterThan(300);
    } finally {
      model.dispose();
      s.physics.world.free();
    }
  });

  it('drowns in water over its headlamps: no snorkel', async () => {
    const ground = { surfaceAt: () => SurfaceId.Water, waterSurfaceAt: () => 1.2 };
    expect(t.intake.y + t.wheelRadius + 0.12).toBeCloseTo(t.intakeHeight, 2);
    const s = await makeScene({ tuning: t, ground });
    s.run(12, {});
    expect(s.vehicle.condition.flood.stalled).toBe(true);
    s.physics.world.free();
  });
});
