import * as THREE from 'three';
import type { World } from '../sim/world/world';
import type { PropDef } from '../sim/world/mapTypes';
import { propBase, propDims, propYaw } from '../sim/world/props';
import { FALLEN_TREE_STUBS, type DynamicObject } from '../sim/sim';
import { mulberry32 } from '../sim/world/rng';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';
import { coursePoint } from '../sim/world/crawlCourse';
import { trailPoint, staticLogMesh } from '../sim/world/crawlTrail';
import { rockShape } from '../sim/world/rockShape';

const timber = () => pal('barkPale').clone().lerp(pal('barkOchre'), 0.35).multiplyScalar(0.82);
const rust = () => pal('dirtDark').clone().lerp(pal('mud'), 0.3);
const iron = () => pal('rockDark').clone().lerp(pal('dirtDark'), 0.35);

function hut(b: MeshBuilder): void {
  const d = propDims.hut;
  const rand = mulberry32(11);
  // Stone footing.
  b.push().translate(0, 0.12, 0);
  b.box(d.w + 0.2, 0.3, d.d + 0.2, pal('rockDark'));
  b.pop();
  // Slab walls: vertical boards with weathered colour variation.
  const boards = (len: number, along: 'x' | 'z', offset: number, skip?: (u: number) => boolean) => {
    const n = Math.round(len / 0.38);
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * (len / n);
      if (skip?.(u)) continue;
      const c = timber()
        .lerp(pal('barkOchre'), rand() * 0.3)
        .multiplyScalar(0.9 + rand() * 0.15);
      b.push().translate(along === 'x' ? u : offset, d.wall / 2 + 0.25, along === 'x' ? offset : u);
      b.box(along === 'x' ? len / n - 0.02 : 0.1, d.wall, along === 'x' ? 0.1 : len / n - 0.02, c);
      b.pop();
    }
  };
  boards(d.w, 'x', -d.d / 2, (u) => Math.abs(u - 0.6) < 0.5);
  boards(d.w, 'x', d.d / 2);
  boards(d.d, 'z', -d.w / 2);
  boards(d.d, 'z', d.w / 2, (u) => Math.abs(u) < 0.45);
  // Door and windows (dark openings).
  const dark = pal('vehicleTrim').clone().multiplyScalar(0.6);
  b.push().translate(0.6, 1.2, -d.d / 2 + 0.02);
  b.box(0.95, 1.9, 0.08, dark);
  b.pop();
  b.push().translate(d.w / 2 - 0.02, 1.55, 0);
  b.box(0.08, 0.7, 0.9, dark);
  b.pop();
  // Gable ends.
  const gable = timber();
  for (const z of [-d.d / 2, d.d / 2]) {
    b.tri(
      { x: -d.w / 2, y: d.wall + 0.25, z },
      { x: 0, y: d.ridge + 0.25, z },
      { x: d.w / 2, y: d.wall + 0.25, z },
      gable,
    );
    b.tri(
      { x: d.w / 2, y: d.wall + 0.25, z },
      { x: 0, y: d.ridge + 0.25, z },
      { x: -d.w / 2, y: d.wall + 0.25, z },
      gable,
    );
  }
  // Corrugated iron roof in rusty sheets.
  const o = 0.35;
  const y0 = d.wall + 0.25 - 0.12;
  const y1 = d.ridge + 0.25 + 0.05;
  const sheets = 6;
  for (let i = 0; i < sheets; i++) {
    const z0 = -d.d / 2 - o + ((d.d + 2 * o) * i) / sheets;
    const z1 = -d.d / 2 - o + ((d.d + 2 * o) * (i + 1)) / sheets;
    const c = (i % 2 ? rust() : iron()).multiplyScalar(0.9 + rand() * 0.2);
    for (const side of [-1, 1]) {
      const xe = side * (d.w / 2 + o);
      const a = { x: xe, y: y0, z: z0 };
      const bb = { x: 0, y: y1, z: z0 };
      const cc = { x: 0, y: y1, z: z1 };
      const dd = { x: xe, y: y0, z: z1 };
      if (side < 0) {
        b.quad(a, bb, cc, dd, c);
        b.quad(dd, cc, bb, a, c);
      } else {
        b.quad(dd, cc, bb, a, c);
        b.quad(a, bb, cc, dd, c);
      }
    }
  }
  // Stone chimney.
  b.push().translate(-d.w / 2 - 0.35, 2.2, 0.8);
  b.box(0.9, 4.4, 1.0, pal('rock'), [1, 3, 1]);
  b.pop();
}

function waterTank(b: MeshBuilder): void {
  const d = propDims.waterTank;
  const c = pal('rock').clone().lerp(pal('dirtTrack'), 0.2);
  for (let i = 0; i < 5; i++) {
    b.push().translate(0, (d.h / 5) * (i + 0.5), 0);
    b.cylinder(d.r, d.r, d.h / 5, 14, i % 2 ? c : c.clone().multiplyScalar(0.92), i === 4, iron());
    b.pop();
  }
}

function fireRing(b: MeshBuilder): void {
  b.push().translate(0, 0.02, 0);
  b.cylinder(0.7, 0.75, 0.04, 10, pal('vehicleTrim').clone().lerp(pal('rockDark'), 0.5));
  b.pop();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.push().translate(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8);
    b.blob(0.18, pal('rock'), 0.25, 0, 0.7);
    b.pop();
  }
  for (let i = 0; i < 3; i++) {
    b.push()
      .translate(0, 0.1, 0)
      .rotate(0.3, (i * Math.PI * 2) / 3, Math.PI / 2);
    b.cylinder(0.06, 0.06, 0.8, 5, pal('vehicleTrim'));
    b.pop();
  }
}

function logSeat(b: MeshBuilder): void {
  const d = propDims.logSeat;
  b.push()
    .translate(0, d.y, 0)
    .rotate(0, 0, Math.PI / 2);
  b.cylinder(d.r, d.r, d.l, d.sides, pal('barkOchre'), true, pal('barkPale'));
  b.pop();
}

function signpost(b: MeshBuilder): void {
  b.push().translate(0, propDims.signpost.h / 2, 0);
  b.box(0.12, propDims.signpost.h, 0.12, timber());
  b.pop();
  b.push().translate(0, propDims.signpost.h - 0.25, -0.08);
  b.box(1.5, 0.4, 0.05, pal('barkPale'));
  b.pop();
}

function fireTower(b: MeshBuilder): void {
  const d = propDims.fireTower;
  const legC = timber();
  const top = d.height;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const base = new THREE.Vector3(sx * d.spread, 0, sz * d.spread);
    const tip = new THREE.Vector3(sx * d.spread * 0.75, top, sz * d.spread * 0.75);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tip.clone().sub(base).normalize(),
    );
    b.push(
      new THREE.Matrix4().compose(base.clone().add(tip).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)),
    );
    b.box(0.22, base.distanceTo(tip), 0.22, legC);
    b.pop();
  }
  // Cross bracing.
  for (let level = 0; level < 3; level++) {
    const y = 1.2 + level * 2.8;
    const s = d.spread * (1 - (0.25 * y) / top);
    for (const [ax, az] of [
      [1, 0],
      [0, 1],
    ]) {
      for (const side of [-1, 1]) {
        b.push().translate(az * side * s, y, ax * side * s);
        b.box(ax ? s * 2 : 0.1, 0.1, az ? s * 2 : 0.1, legC);
        b.pop();
      }
    }
  }
  // Cabin with a band of windows and a pyramid roof.
  const cab = d.cabin;
  b.push().translate(0, top + 0.6, 0);
  b.box(cab, 1.2, cab, timber());
  b.pop();
  b.push().translate(0, top + 1.55, 0);
  b.box(cab - 0.1, 0.7, cab - 0.1, pal('vehicleTrim').clone().lerp(pal('waterDeep'), 0.3));
  b.pop();
  b.push().translate(0, top + 1.98, 0);
  b.box(cab + 0.1, 0.16, cab + 0.1, timber());
  b.pop();
  const r = cab / 2 + 0.35;
  const ry = top + 2.06;
  const apex = { x: 0, y: ry + 1.1, z: 0 };
  const corners = [
    { x: -r, y: ry, z: -r },
    { x: r, y: ry, z: -r },
    { x: r, y: ry, z: r },
    { x: -r, y: ry, z: r },
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const c = corners[(i + 1) % 4];
    b.tri(a, apex, c, rust());
    b.tri(c, apex, a, rust());
  }
  // Ladder up one side.
  for (let i = 0; i < 14; i++) {
    b.push().translate(0, 0.6 + i * 0.65, d.spread * 0.92 - (i * 0.65 * 0.25 * d.spread) / top);
    b.box(0.6, 0.06, 0.06, legC);
    b.pop();
  }
}

function oldUte(b: MeshBuilder): void {
  const rand = mulberry32(5);
  const paint = pal('vehicleBody').clone().lerp(pal('barkOchre'), 0.4);
  const rusty = () =>
    pal('dirtTrack')
      .clone()
      .lerp(pal('barkOchre'), 0.3 + rand() * 0.4);
  // Sunk on one corner, sitting on its axles.
  b.push().rotate(0.05, 0, -0.06);
  b.push().translate(0, 0.62, -1.3);
  b.box(1.7, 0.55, 1.4, paint, [3, 1, 3]);
  b.pop();
  b.push().translate(0, 1.15, -0.25);
  b.box(1.6, 0.9, 1.1, rusty());
  b.pop();
  b.push().translate(0, 1.15, -0.82);
  b.box(1.4, 0.55, 0.04, pal('vehicleTrim'));
  b.pop();
  b.push().translate(0, 0.72, 1.25);
  b.box(1.75, 0.5, 2.0, rusty(), [3, 1, 3]);
  b.pop();
  b.push().translate(0, 0.22, 0);
  b.box(1.2, 0.2, 4.2, pal('vehicleTrim'));
  b.pop();
  for (const z of [-1.4, 1.4]) {
    b.push()
      .translate(0, 0.25, z)
      .rotate(0, 0, Math.PI / 2);
    b.cylinder(0.08, 0.08, 1.6, 6, pal('vehicleTrim'));
    b.pop();
  }
  b.pop();
  // A wheel lying in the grass.
  b.push().translate(1.6, 0.1, 1.2).rotate(0, 0.4, 0);
  b.cylinder(0.36, 0.36, 0.22, 10, pal('vehicleTrim'), true, rust());
  b.pop();
}

function mineEntrance(b: MeshBuilder): void {
  const post = timber().multiplyScalar(0.85);
  for (const x of [-1.4, 1.4]) {
    b.push().translate(x, 1.35, 0);
    b.box(0.26, 2.7, 0.26, post);
    b.pop();
  }
  b.push().translate(0, 2.75, 0);
  b.box(3.4, 0.3, 0.32, post);
  b.pop();
  // Dark adit going into the hill, with timber lining.
  b.push().translate(0, 1.3, 2.4);
  b.box(2.6, 2.6, 4.6, pal('vehicleTrim').clone().multiplyScalar(0.35));
  b.pop();
  for (const x of [-1.32, 1.32]) {
    b.push().translate(x, 1.3, 1.2);
    b.box(0.12, 2.6, 2.2, post.clone().multiplyScalar(0.7));
    b.pop();
  }
  // Rails and an ore cart.
  for (const x of [-0.45, 0.45]) {
    b.push().translate(x, 0.05, -2.5);
    b.box(0.06, 0.06, 5.5, iron());
    b.pop();
  }
  b.push().translate(0, 0.55, -3.8);
  b.box(1.1, 0.8, 1.4, rust());
  b.pop();
}

function cattleGrid(b: MeshBuilder): void {
  const d = propDims.cattleGrid;
  b.push().translate(0, -0.05, 0);
  b.box(d.w, 0.12, d.d, pal('vehicleTrim').clone().multiplyScalar(0.5));
  b.pop();
  for (let i = 0; i < 9; i++) {
    b.push().translate(0, 0.04, -d.d / 2 + 0.15 + (i * (d.d - 0.3)) / 8);
    b.box(d.w, 0.08, 0.08, iron());
    b.pop();
  }
  for (const x of [-2.9, 2.9]) {
    b.push().translate(x, 0.6, 0);
    b.box(0.24, 1.2, 2.6, timber());
    b.pop();
    // Wing fences.
    b.push().translate(x + Math.sign(x) * 4, 0.9, 0);
    b.box(8, 0.06, 0.06, iron());
    b.pop();
    for (const k of [3, 6]) {
      b.push().translate(x + Math.sign(x) * k, 0.55, 0);
      b.box(0.12, 1.1, 0.12, timber());
      b.pop();
    }
  }
}

const builders: Record<PropDef['kind'], (b: MeshBuilder) => void> = {
  hut,
  waterTank,
  fireRing,
  logSeat,
  signpost,
  fireTower,
  oldUte,
  mineEntrance,
  cattleGrid,
};

/** Canvas texture with hand-lettered sign text. */
function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#D8D0C0';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#8E4B2B';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = '#3B2A1E';
  let size = 30;
  ctx.font = `${size}px "Patrick Hand", "Nunito", sans-serif`;
  while (ctx.measureText(text).width > 230 && size > 12)
    ctx.font = `${--size}px "Patrick Hand", "Nunito", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Static man-made props, Staircase ledges and washout walls merged into one mesh, plus
 * sign faces and the Fallen Tree (which follows its physics body).
 */
export class WorldProps {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private readonly dynamicMeshes: { obj: DynamicObject; mesh: THREE.Mesh }[] = [];

  constructor(world: World, dynamics: Iterable<DynamicObject>) {
    this.material = patchFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.name = 'props';
    const b = new MeshBuilder(2024);
    for (const p of world.map.props) {
      const base = propBase(p, world.terrain);
      b.push().translate(p.x, base, p.z).rotate(0, propYaw(p.headingDeg), 0);
      builders[p.kind](b);
      b.pop();
      if (p.kind === 'signpost' && p.text) this.addSignFace(p, base);
    }
    // Coloured timber markers bracket the entrance and exit of each practice line.
    for (const course of world.map.crawlCourses ?? [])
      for (const line of course.lines) {
        const colour = new THREE.Color(
          { easy: '#72975A', moderate: '#CEA348', hard: '#B45D49' }[line.difficulty],
        );
        for (const along of [1, course.length])
          for (const side of [-1, 1]) {
            const p = coursePoint(course, line.offset + side * 1.8, along);
            const y = world.terrain.heightAt(p.x, p.z);
            b.push().translate(p.x, y + 0.3, p.z);
            b.cylinder(0.035, 0.045, 0.6, 6, timber());
            b.pop();
            b.push().translate(p.x, y + 0.55, p.z);
            b.box(0.18, 0.15, 0.1, colour);
            b.pop();
          }
      }
    const markedTracks = new Map<string, string>();
    for (const trail of world.map.crawlTrails ?? []) {
      markedTracks.set(
        trail.trackId,
        { easy: '#4F7FA6', moderate: '#CEA348', hard: '#B45D49', extreme: '#2B2724' }[
          trail.difficulty ?? 'moderate'
        ],
      );
      markedTracks.set(trail.bypassTrackId, '#72975A');
    }
    for (const track of world.features.tracks)
      if (track.def.markerColor)
        markedTracks.set(
          track.def.id,
          { green: '#72975A', amber: '#CEA348', red: '#B45D49' }[track.def.markerColor],
        );
    for (const [id, hex] of markedTracks) {
      const track = world.features.tracks.find((t) => t.def.id === id)!;
      const colour = new THREE.Color(hex);
      for (let at = 2; at < track.poly.length; at += 10) {
        const p = trailPoint(track, at, -(track.def.width / 2 + 0.7));
        const y = world.terrain.heightAt(p.x, p.z);
        b.push().translate(p.x, y + 0.25, p.z);
        b.cylinder(0.035, 0.045, 0.5, 6, timber());
        b.pop();
        b.push().translate(p.x, y + 0.46, p.z);
        b.box(0.15, 0.13, 0.1, colour);
        b.pop();
      }
    }
    for (const log of world.features.logs) {
      const shape = staticLogMesh(log);
      const vertex = (i: number) => new THREE.Vector3().fromArray(shape.vertices, i * 3);
      for (let i = 0; i < shape.indices.length; i += 3)
        b.tri(
          vertex(shape.indices[i]),
          vertex(shape.indices[i + 1]),
          vertex(shape.indices[i + 2]),
          i % 12 >= 6 ? pal('barkPale') : pal('dirtDark'),
        );
    }
    // Staircase ledges and chamfered trail rocks share their collision dimensions.
    const rand = mulberry32(99);
    for (const box of world.features.boxes) {
      b.push()
        .translate(box.x, box.y, box.z)
        .rotate(0, box.yaw, 0)
        .rotate(0, 0, box.roll ?? 0);
      if (box.kind === 'ledge') {
        const c = pal('rock')
          .clone()
          .lerp(pal('rockDark'), rand() * 0.5);
        if (box.bevel) {
          const shape = rockShape(box.hx, box.hy, box.hz, box.bevel);
          const v = (i: number) => new THREE.Vector3().fromArray(shape.vertices, i * 3);
          for (let i = 0; i < shape.indices.length; i += 3)
            b.tri(v(shape.indices[i]), v(shape.indices[i + 1]), v(shape.indices[i + 2]), c);
        } else b.box(box.hx * 2, box.hy * 2, box.hz * 2, c, [3, 1, 1]);
      } else {
        b.box(
          box.hx * 2,
          box.hy * 2,
          box.hz * 2,
          pal('dirtDark')
            .clone()
            .lerp(pal('mud'), rand() * 0.4),
        );
      }
      b.pop();
    }
    // Trail granite: the collider is the convex hull of exactly these vertices.
    const lichen = new THREE.Color('#9A9A74');
    for (const rock of world.features.rocks) {
      const c = pal('rock')
        .clone()
        .lerp(pal('rockDark'), 0.15 + rand() * 0.45);
      const v = (i: number) => new THREE.Vector3().fromArray(rock.vertices, i * 3);
      b.push().translate(rock.x, rock.y, rock.z);
      for (let i = 0; i < rock.indices.length; i += 3) {
        const a = v(rock.indices[i]),
          bb = v(rock.indices[i + 1]),
          cc = v(rock.indices[i + 2]);
        const up = new THREE.Vector3()
          .subVectors(bb, a)
          .cross(new THREE.Vector3().subVectors(cc, a))
          .normalize().y;
        // Weathered, lichen-flecked tops; darker undersides and faces.
        const face = c
          .clone()
          .lerp(up > 0.75 && rand() < 0.3 ? lichen : pal('rockDark'), up > 0.75 ? rand() * 0.25 : 0.2);
        b.tri(a, bb, cc, face);
      }
      b.pop();
    }
    const mesh = new THREE.Mesh(b.build(), this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);

    for (const obj of dynamics) {
      if (obj.kind !== 'fallenTree' || !obj.def) continue;
      const m = new THREE.Mesh(this.buildFallenTree(obj.def.length, obj.def.radius), this.material);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.dynamicMeshes.push({ obj, mesh: m });
    }
  }

  private addSignFace(p: PropDef, base: number): void {
    const tex = signTexture(p.text ?? '');
    const mat = patchFog(new THREE.MeshLambertMaterial({ map: tex }), 'sign');
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.36), mat);
    const yaw = propYaw(p.headingDeg);
    // Face out of the board's front (-z local).
    const off = new THREE.Vector3(0, 0, -0.11).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    plane.position.set(p.x + off.x, base + propDims.signpost.h - 0.25, p.z + off.z);
    plane.rotation.y = yaw + Math.PI;
    this.group.add(plane);
    // An arrow at either end points one way, so only the front is lettered; from behind
    // it would point the wrong way.
    if (/^←|→$/.test(p.text ?? '')) return;
    const back = plane.clone();
    const off2 = new THREE.Vector3(0, 0, -0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    back.position.set(p.x + off2.x, base + propDims.signpost.h - 0.25, p.z + off2.z);
    back.rotation.y = yaw;
    this.group.add(back);
  }

  private buildFallenTree(length: number, radius: number): THREE.BufferGeometry {
    const b = new MeshBuilder(404);
    const bark = pal('barkPale').clone().lerp(pal('barkOchre'), 0.3);
    // Capsule axis is local +y.
    b.cylinder(radius * 0.8, radius, length - radius, 8, bark, true, pal('barkOchre'));
    const half = length / 2 - radius;
    for (const [ay, ox, oz] of FALLEN_TREE_STUBS) {
      b.push()
        .translate(ox, ay * half, oz)
        .rotate(0, 0, Math.PI / 2);
      b.cylinder(0.06, 0.1, 0.8, 5, bark);
      b.pop();
    }
    // Root plate at one end.
    b.push().translate(0, -half - 0.2, 0);
    b.blob(radius * 2.2, pal('mud'), 0.35, 0, 0.5);
    b.pop();
    // Dead leaves at the crown end.
    b.push().translate(0.2, half + 0.6, 0);
    b.blob(1.3, pal('foliageDark').clone().lerp(pal('barkOchre'), 0.5), 0.35, 0, 0.6);
    b.pop();
    return b.build();
  }

  update(): void {
    for (const { obj, mesh } of this.dynamicMeshes) {
      const p = obj.body.translation();
      const q = obj.body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
}
