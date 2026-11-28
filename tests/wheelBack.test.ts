import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VehicleId } from '../src/data/vehicle';
import { vehicles } from '../src/data/vehicles';
import { trailers } from '../src/data/trailers';
import { vehicleLooks } from '../src/render/vehicleLooks';
import { VehicleBuilder, VehicleMaterial as M } from '../src/render/vehicleGeometry';
import { buildVehicleWheel } from '../src/render/vehicleWheel';
import { mountSpare, takeMountedSpares, type SpareFacing } from '../src/render/spares';
import { measureWheel, wheelBack, withBrake } from '../src/render/wheelBack';

/**
 * The owner saw that every wheel looked the same inside as outside: a second set of nuts and a
 * second hub cap facing the axle. `wheelBack` gives each wheel a real inner side and `withBrake`
 * puts the brake behind a road wheel's disc. These check every vehicle's wheel and the trailer's.
 */

const wheels: [string, THREE.BufferGeometry][] = [
  ...(Object.keys(vehicleLooks) as VehicleId[]).map(
    (id) => [id, vehicleLooks[id].wheel(vehicles[id].tuning)] as [string, THREE.BufferGeometry],
  ),
  ...Object.values(trailers).map(
    (t) =>
      [
        `trailer ${t.id}`,
        buildVehicleWheel({ wheelRadius: t.wheelRadius, wheelWidth: t.wheelWidth } as never),
      ] as [string, THREE.BufferGeometry],
  ),
];

/** A ray along the axle from outside the wheel: the first thing it meets, as (x, slot). */
function firstAlongAxle(g: THREE.BufferGeometry, y: number, z: number, from: 1 | -1) {
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hit = new THREE.Raycaster(
    new THREE.Vector3(from, y, z),
    new THREE.Vector3(-from, 0, 0),
  ).intersectObject(mesh)[0];
  if (!hit) return null;
  const slot = g.getAttribute('materialSlot').getX(hit.face!.a);
  const c = g.getAttribute('color');
  return {
    x: hit.point.x,
    slot,
    grey: (c.getX(hit.face!.a) + c.getY(hit.face!.a) + c.getZ(hit.face!.a)) / 3,
  };
}

describe('wheel inner side', () => {
  for (const [name, raw] of wheels) {
    const before = measureWheel(raw);
    const spare = wheelBack(raw.clone());
    const road = withBrake(spare);
    describe(name, () => {
      it('has no nuts or hub cap on its inner half', () => {
        // Nothing reaches in from the rim on the inner side but the barrel's well (at 90% of the
        // bead): no metal (nuts, hub caps) inside 85% of the bead on the inner half.
        const p = spare.getAttribute('position');
        const slot = spare.getAttribute('materialSlot');
        let metal = 0;
        for (let i = 0; i < p.count; i++)
          if (
            p.getX(i) < -0.02 &&
            slot.getX(i) === M.Metal &&
            Math.hypot(p.getY(i), p.getZ(i)) < before.bead * 0.85
          )
            metal++;
        expect(metal).toBe(0);
        // The outer face keeps everything it had.
        const outer = (g: THREE.BufferGeometry) => {
          const q = g.getAttribute('position');
          let n = 0;
          for (let i = 0; i < q.count; i++) if (q.getX(i) > 0.01) n++;
          return n;
        };
        expect(outer(spare)).toBeGreaterThanOrEqual(outer(raw));
      });

      it('is closed from inside: looking along the axle, the barrel or the disc stops the eye', () => {
        // From inside, rays through the bead's ring meet the rim (not the outside world) before
        // the wheel's outer face, at every angle round.
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + 0.1;
          for (const f of [0.3, 0.6, 0.85]) {
            const hit = firstAlongAxle(
              spare,
              Math.cos(a) * before.bead * f,
              Math.sin(a) * before.bead * f,
              -1,
            );
            expect(hit, `${name} at ${f} of the bead`).not.toBeNull();
          }
        }
        // Rays just inside the bead, slanting outwards, meet the barrel.
        const mesh = new THREE.Mesh(spare, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.1;
          const dir = new THREE.Vector3(0.6, Math.cos(a), Math.sin(a)).normalize();
          const hit = new THREE.Raycaster(new THREE.Vector3(before.beadIn, 0, 0), dir, 0, 1).intersectObject(
            mesh,
          )[0];
          expect(hit, `${name} slanting ray ${k}`).toBeDefined();
          expect(Math.hypot(hit.point.y, hit.point.z)).toBeLessThan(before.bead + 0.01);
        }
      });

      it('a road wheel has a dark brake behind its disc; a spare has none', () => {
        const spareHit = firstAlongAxle(spare, 0.0, before.bead * 0.6, -1)!;
        const roadHit = firstAlongAxle(road, 0.0, before.bead * 0.6, -1)!;
        // From inside, the road wheel's first surface is well in from the disc's back.
        expect(roadHit.x).toBeLessThan(spareHit.x - 0.02);
        expect(roadHit.grey).toBeLessThan(0.15);
      });
    });
  }
});

describe('mountSpare', () => {
  const raw = vehicleLooks.troopy.wheel(vehicles.troopy.tuning);
  const wheel = wheelBack(raw);
  const facings: [SpareFacing, THREE.Vector3][] = [
    ['back', new THREE.Vector3(0, 0, 1)],
    ['front', new THREE.Vector3(0, 0, -1)],
    ['up', new THREE.Vector3(0, 1, 0)],
    ['down', new THREE.Vector3(0, -1, 0)],
    ['left', new THREE.Vector3(-1, 0, 0)],
    ['right', new THREE.Vector3(1, 0, 0)],
  ];
  for (const [facing, axle] of facings)
    it(`turns the wheel's outer face (its hub cap) ${facing}`, () => {
      const b = new VehicleBuilder();
      mountSpare(b, wheel, { x: 1, y: 2, z: 3 }, facing, new THREE.Color('#222'));
      takeMountedSpares();
      const g = b.build();
      const p = g.getAttribute('position');
      const slot = g.getAttribute('materialSlot');
      // The metal parts near the axle (nuts and hub cap) are all on the outer face.
      const hub = new THREE.Vector3(1, 2, 3);
      const v = new THREE.Vector3();
      let n = 0,
        along = 0;
      for (let i = 0; i < p.count; i++) {
        if (slot.getX(i) !== M.Metal) continue;
        v.fromBufferAttribute(p, i).sub(hub);
        const d = v.dot(axle);
        if (v.clone().addScaledVector(axle, -d).length() > 0.09) continue;
        n++;
        along += d;
      }
      expect(n).toBeGreaterThan(0);
      expect(along / n).toBeGreaterThan(0.03);
    });
});
