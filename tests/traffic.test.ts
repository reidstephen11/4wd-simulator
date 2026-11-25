import { describe, expect, it } from 'vitest';
import { Groups, Physics, groups, loadRapier } from '../src/sim/physics';
import { Traffic, createTrafficBody, trafficPlans } from '../src/sim/traffic';
import { densify } from '../src/sim/world/polyline';

const track = {
  name: 'A Troopy',
  points: [
    [0, 0],
    [0, -100],
    [0, -200],
  ] as const,
};

describe('Traffic', () => {
  it('sends a car from the far end when you reach a track end, once', () => {
    const t = new Traffic([track]);
    const [e] = t.update(0.1, { x: 0, z: 5 });
    expect(e.type).toBe('spawned');
    expect(t.cars[0].at(0)).toMatchObject({ x: 0, z: -200 });
    expect(t.cars[0].at().headingDeg).toBeCloseTo(180);
    t.cars.length = 0;
    expect(t.update(0.1, { x: 0, z: -195 })).toEqual([]);
  });

  it('stops for you on the line, and squeezes past once you pull over', () => {
    const t = new Traffic([track]);
    t.update(0.1, { x: 0, z: 0 });
    const car = t.cars[0];
    // Sit on the track 100 m up: it drives towards you and stops short.
    for (let i = 0; i < 400; i++) t.update(0.1, { x: 0, z: -100 });
    expect(car.waiting).toBe(true);
    const z = car.at().z;
    expect(z).toBeLessThan(-100 - 2);
    expect(z).toBeGreaterThan(-100 - 20);
    // Pulled off 3 m to the side, it goes by and reaches the end.
    const events = [];
    for (let i = 0; i < 400; i++) events.push(...t.update(0.1, { x: 3, z: -100 }));
    expect(events.map((e) => e.type)).toEqual(['moving', 'gone']);
    expect(t.cars).toEqual([]);
  });

  it('plans the car along the generated track, not the chords between its control points', () => {
    // A bend: the spline through these swings well off the straight lines between them.
    const poly = densify(
      [
        [0, 0],
        [0, -60],
        [40, -100],
        [40, -160],
      ],
      1,
    );
    const [plan] = trafficPlans([{ track: 'bend', name: 'A Troopy' }], [{ def: { id: 'bend' }, poly }]);
    expect(plan.points.length).toBe(poly.count);
    expect(plan.points[0]).toEqual([0, 0]);
    expect(plan.points[poly.count - 1]).toEqual([40, -160]);
    const mid = plan.points[Math.round(poly.count / 2)];
    const mid2 = [poly.xs[Math.round(poly.count / 2)], poly.zs[Math.round(poly.count / 2)]];
    expect(mid).toEqual(mid2);
    // Between the control points the plan leaves their chord by metres.
    const chord = (x: number, z: number) =>
      Math.abs((x - 0) * (-100 - -60) - (z - -60) * (40 - 0)) / Math.hypot(40, 40);
    let max = 0;
    for (const [x, z] of plan.points) if (z < -60 && z > -100) max = Math.max(max, chord(x, z));
    expect(max).toBeGreaterThan(1.5);
    expect(trafficPlans([{ track: 'missing', name: 'A HiLux' }], [{ def: { id: 'bend' }, poly }])).toEqual(
      [],
    );
  });

  it('resets: the cars go and the track sends one again', () => {
    const t = new Traffic([track]);
    t.update(0.1, { x: 0, z: 0 });
    expect(t.cars).toHaveLength(1);
    t.reset();
    expect(t.cars).toEqual([]);
    expect(t.update(0.1, { x: 0, z: 0 }).map((e) => e.type)).toEqual(['spawned']);
  });

  it('is solid to the player and passes through movable things on the track', async () => {
    const R = await loadRapier();
    const physics = new Physics(R);
    physics.world.gravity = { x: 0, y: 0, z: 0 };
    const traffic = createTrafficBody(R, physics);
    const loose = (member: number, x: number) => {
      const body = physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, 0.5, 0));
      physics.world.createCollider(
        R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setCollisionGroups(groups(member, 0xffff)),
        body,
      );
      return body;
    };
    // A fallen rock on its line, and the player's car on it a little further on.
    const rock = loose(Groups.DYNAMIC, 0);
    const car = loose(Groups.VEHICLE, 6);
    traffic.setTranslation({ x: -4, y: 0, z: 0 }, true);
    for (let i = 0; i < 130; i++) {
      traffic.setNextKinematicTranslation({ x: -4 + i * 0.1, y: 0, z: 0 });
      physics.world.step();
    }
    expect(Math.abs(rock.translation().x)).toBeLessThan(0.01);
    expect(car.translation().x).toBeGreaterThan(6.5);
  });
});
