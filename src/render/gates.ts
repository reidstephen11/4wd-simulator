import * as THREE from 'three';
import type { World } from '../sim/world/world';
import { gateColours } from '../data/palette';
import { pal } from './colors';
import { patchFog } from './fog';
import { MeshBuilder } from './lowpoly';

const POLE = 1.35;
const PLATE = 0.34;
/** Numbers per row in the plate texture. */
const ATLAS_COLUMNS = 8;

/** One canvas with every gate number on a white plate, for the number boards. */
function numberAtlas(count: number): { texture: THREE.CanvasTexture; rows: number } {
  const rows = Math.max(1, Math.ceil(count / ATLAS_COLUMNS));
  const cell = 64;
  const c = document.createElement('canvas');
  c.width = ATLAS_COLUMNS * cell;
  c.height = rows * cell;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  for (let n = 1; n <= count; n++) {
    const x = ((n - 1) % ATLAS_COLUMNS) * cell,
      y = Math.floor((n - 1) / ATLAS_COLUMNS) * cell;
    ctx.fillStyle = '#EFEBDD';
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = '#2A2A26';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
    ctx.fillStyle = '#1F1F1C';
    ctx.font = `bold ${n > 9 ? 34 : 40}px "Nunito", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x + cell / 2, y + cell / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, rows };
}

/**
 * The numbered gates of a gate trail: a timber stake with a pennant either side of the
 * way through, and the gate's number on a board on the left stake facing the approach.
 * Two meshes for every gate on the map.
 */
export class GateMarkers {
  readonly group = new THREE.Group();

  constructor(world: World) {
    this.group.name = 'gates';
    const gates = world.features.gates;
    if (!gates.length) return;
    const b = new MeshBuilder(77);
    const stake = pal('barkPale').clone().lerp(pal('barkOchre'), 0.3);
    const flags = { left: new THREE.Color(gateColours.left), right: new THREE.Color(gateColours.right) };
    const positions: number[] = [],
      uvs: number[] = [];
    const { texture, rows } = numberAtlas(Math.max(...gates.map((g) => g.n)));
    for (const g of gates) {
      const yaw = (-g.headingDeg * Math.PI) / 180;
      for (const side of ['left', 'right'] as const) {
        const p = g[side];
        b.push().translate(p.x, p.y, p.z).rotate(0, yaw, 0);
        b.push().translate(0, POLE / 2 - 0.15, 0);
        b.cylinder(0.025, 0.035, POLE + 0.3, 6, stake);
        b.pop();
        // A pennant flying outwards from the way through, seen from both sides.
        const out = side === 'left' ? -1 : 1;
        const tip = { x: out * 0.55, y: POLE - 0.17, z: 0 },
          top = { x: 0, y: POLE, z: 0 },
          low = { x: 0, y: POLE - 0.34, z: 0 };
        b.tri(top, low, tip, flags[side]);
        b.tri(top, tip, low, flags[side]);
        b.pop();
      }
      // Number board just under the left pennant, facing the traffic coming through.
      const p = g.left;
      const k = g.n - 1;
      const u0 = (k % ATLAS_COLUMNS) / ATLAS_COLUMNS,
        u1 = u0 + 1 / ATLAS_COLUMNS;
      const v1 = 1 - Math.floor(k / ATLAS_COLUMNS) / rows,
        v0 = v1 - 1 / rows;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y + POLE - 0.6, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        new THREE.Vector3(1, 1, 1),
      );
      // The board's face looks back along the track (+z in the gate's frame) and sits
      // just in front of the stake.
      const corner = (x: number, y: number) =>
        new THREE.Vector3(x, y, 0.045).applyMatrix4(m).toArray(positions, positions.length);
      const h = PLATE / 2;
      corner(-h, -h);
      corner(h, -h);
      corner(h, h);
      corner(-h, -h);
      corner(h, h);
      corner(-h, h);
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
    const poles = new THREE.Mesh(b.build(), patchFog(new THREE.MeshLambertMaterial({ vertexColors: true })));
    poles.castShadow = true;
    poles.matrixAutoUpdate = false;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const plates = new THREE.Mesh(
      geometry,
      patchFog(new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }), 'gate-numbers'),
    );
    plates.matrixAutoUpdate = false;
    this.group.add(poles, plates);
  }
}
