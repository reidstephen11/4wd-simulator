import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { environmentFor, lateAfternoon, timesOfDay } from '../src/data/environment';
import { headlightTuning, nextHeadlightMode, type HeadlightMode } from '../src/data/headlights';
import { camelTuning } from '../src/data/camel';
import { perentieTuning } from '../src/data/perentie';
import { vehicleTuning } from '../src/data/vehicle';
import { keyBindings } from '../src/data/controls';
import { VehicleModel } from '../src/render/vehicleModel';
import { emptyInput } from '../src/sim/input/vehicleInput';
import { loadRapier } from '../src/sim/physics';
import { Simulation } from '../src/sim/sim';
import { makeScene } from './helpers/scenes';
import { testWorld } from './world';

const brightness = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  return ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
};

describe('night', () => {
  it('is a fifth time of day: moonlight much fainter than dusk, a dark sky with stars', () => {
    expect(timesOfDay).toEqual(['morning', 'midday', 'afternoon', 'dusk', 'night']);
    const night = environmentFor({ time: 'night', weather: 'clear' });
    const dusk = environmentFor({ time: 'dusk', weather: 'clear' });
    expect(night.sun.intensity).toBeLessThan(dusk.sun.intensity * 0.25);
    expect(night.hemisphere.intensity).toBeLessThan(dusk.hemisphere.intensity * 0.4);
    expect(brightness(night.sky.zenith)).toBeLessThan(brightness(dusk.sky.zenith) * 0.25);
    expect(brightness(night.fog.nearColor)).toBeLessThan(brightness(dusk.fog.nearColor) * 0.25);
    expect(night.stars).toBe(1);
    expect(night.cloudLight).toBeLessThan(0.3);
  });

  it('stays dark under cloud, with no stars, and only dusk and night light the ground with the lamps', () => {
    for (const weather of ['wet', 'rain'] as const) {
      const e = environmentFor({ time: 'night', weather });
      expect(brightness(e.sky.zenith)).toBeLessThan(90);
      expect(brightness(e.sky.horizon)).toBeLessThan(150);
      expect(brightness(e.hemisphere.sky)).toBeLessThan(260);
      expect(e.stars).toBe(0);
    }
    for (const time of timesOfDay)
      for (const weather of ['clear', 'wet', 'rain'] as const)
        expect(environmentFor({ time, weather }).lampBeams, `${time} ${weather}`).toBe(
          time === 'dusk' || time === 'night',
        );
    expect(lateAfternoon.stars).toBe(0);
  });
});

describe('headlights', () => {
  it('N cycles off, low beam, high beam and off again, and the state is part of the simulation', async () => {
    expect(keyBindings.lights).toEqual(['KeyN']);
    expect(['off', 'low', 'high'].map((m) => nextHeadlightMode(m as HeadlightMode))).toEqual([
      'low',
      'high',
      'off',
    ]);
    const world = testWorld();
    const sim = new Simulation(await loadRapier(), world, lateAfternoon);
    sim.addVehicle('p', sim.campsitePose(world.map.spawnCampsite));
    const changes: HeadlightMode[] = [];
    sim.events.on('lightsChanged', ({ mode }) => changes.push(mode));
    const inputs = new Map([['p', emptyInput()]]);
    const press = () => {
      inputs.set('p', { ...emptyInput(), cycleLights: true });
      sim.step(inputs, 1 / 60);
      inputs.set('p', emptyInput());
      sim.step(inputs, 1 / 60);
    };
    press();
    press();
    expect(sim.serialize().vehicles[0].lights).toBe('high');
    // Swapping vehicles keeps the lights as the driver had them.
    expect(sim.replaceVehicle('p', perentieTuning).lights).toBe('high');
    press();
    expect(changes).toEqual(['low', 'high', 'off']);
    expect(sim.vehicles.get('p')!.lights).toBe('off');
    sim.physics.free();
  });

  it('throws its beams ahead of the car, forward and a little down, high beam further than low', async () => {
    for (const tuning of [vehicleTuning, camelTuning, perentieTuning]) {
      const s = await makeScene({ tuning });
      const model = new VehicleModel(tuning, true);
      const beams = model.beams!;
      const spots = beams.group.children.filter((c): c is THREE.SpotLight => c instanceof THREE.SpotLight);
      // The same two lights for every vehicle, so swapping never changes the scene's lights.
      expect(spots.length, tuning.name).toBe(2);
      model.body.geometry.computeBoundingBox();
      const front = model.body.geometry.boundingBox!.min.z;
      expect(spots[0].position.z, tuning.name).toBeLessThan(front);

      const at = (mode: HeadlightMode) => {
        s.vehicle.lights = mode;
        model.update(s.vehicle, 1, 1 / 60);
        return {
          ...beams.strengths,
          distance: spots[0].distance,
          dir: spots[0].target.position.clone().sub(spots[0].position).normalize(),
        };
      };
      expect(at('off').head).toBe(0);
      const low = at('low');
      expect(low.head).toBeGreaterThan(0);
      expect(low.dir.z).toBeLessThan(-0.98);
      expect(low.dir.y).toBeLessThan(-0.05);
      const high = at('high');
      expect(high.head).toBeGreaterThan(low.head);
      expect(high.distance).toBeGreaterThan(low.distance);
      expect(high.dir.y).toBeGreaterThan(low.dir.y);
      // Only the Camel Trophy car has roof lamps, and they come on with high beam.
      expect(high.roof > 0, tuning.name).toBe(tuning === camelTuning);
      expect(low.roof).toBe(0);
      model.dispose();
      s.physics.world.free();
    }
  });

  it('lights the lenses and tail lamps, and in daylight adds no lights to the scene', async () => {
    const s = await makeScene({ tuning: camelTuning });
    const model = new VehicleModel(camelTuning);
    expect(model.beams).toBeNull();
    const materials = model.body.material as THREE.MeshStandardMaterial[];
    // Material slots: 4 needles and small lenses, 5 tail lamps, 8 headlamps, 9 roof lamps.
    const glow = () => [5, 8, 9].map((i) => materials[i].emissiveIntensity);
    model.update(s.vehicle, 1, 1 / 60);
    const off = glow();
    s.vehicle.lights = 'low';
    model.update(s.vehicle, 1, 1 / 60);
    const low = glow();
    s.vehicle.lights = 'high';
    model.update(s.vehicle, 1, 1 / 60);
    const high = glow();
    expect(low[0]).toBeGreaterThan(off[0]);
    expect(low[1]).toBe(headlightTuning.lensGlow.low);
    expect(high[1]).toBe(headlightTuning.lensGlow.high);
    expect(low[2]).toBe(off[2]);
    expect(high[2]).toBeGreaterThan(off[2]);
    // The dash lights up with the headlights: the needles, and every dial's markings.
    expect(materials[4].emissiveIntensity).toBe(headlightTuning.panelGlow.on);
    expect(materials[10].emissiveIntensity).toBe(headlightTuning.dialGlow.on);
    const marks = model.body.geometry.groups.find((g) => g.materialIndex === 10);
    expect(marks?.count ?? 0).toBeGreaterThan(1000);
    s.vehicle.lights = 'off';
    model.update(s.vehicle, 1, 1 / 60);
    expect(materials[10].emissiveIntensity).toBe(0);
    let lights = 0;
    model.root.traverse((o) => (lights += o instanceof THREE.Light ? 1 : 0));
    expect(lights).toBe(0);
    model.dispose();
    s.physics.world.free();
  });
});
