import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { placedSignFaces, signFaces } from '../src/render/worldProps';
import { propYaw } from '../src/sim/world/props';
import { gateTrailSigns } from '../src/data/gateTrail';

describe('signposts', () => {
  it('letter both sides of the board, lying flat on it, at every heading', () => {
    const material = new THREE.MeshBasicMaterial();
    const headings = [0, 30, 54.5, 90, 135, 180, 241.6, 287, 330, ...gateTrailSigns.map((s) => s.headingDeg)];
    for (const headingDeg of headings) {
      const faces = signFaces(
        { kind: 'signpost', x: 10, z: -4, headingDeg, text: 'Rock Garden' },
        2,
        material,
      );
      expect(faces.length).toBe(2);
      const yaw = propYaw(headingDeg);
      // The board's long side and the way its front faces (local x and -z).
      const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const front = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      faces.forEach((face, k) => {
        face.updateMatrixWorld();
        const q = face.getWorldQuaternion(new THREE.Quaternion());
        const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        // Each face lies along the board and looks out of its own side, upright.
        expect(Math.abs(x.dot(along)), `${headingDeg}° face ${k}`).toBeCloseTo(1, 5);
        expect(normal.dot(front), `${headingDeg}° face ${k}`).toBeCloseTo(k === 0 ? 1 : -1, 5);
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).y).toBeCloseTo(1, 5);
      });
    }
  });

  it('letter only the front when an arrow points one way', () => {
    const faces = signFaces(
      { kind: 'signpost', x: 0, z: 0, headingDeg: 287, text: '← Granite Link' },
      0,
      new THREE.MeshBasicMaterial(),
    );
    expect(faces.length).toBe(1);
  });

  it('share one texture: each sign maps to its own cell, its faces where they stand', () => {
    const material = new THREE.MeshBasicMaterial();
    const sign = { kind: 'signpost' as const, x: 10, z: -4, headingDeg: 54.5, text: 'Rock Garden' };
    const faces = signFaces(sign, 2, material);
    const range = (g: THREE.BufferGeometry, attr: string, axis: 0 | 1) => {
      const a = g.getAttribute(attr);
      const v = Array.from({ length: a.count }, (_, i) => (axis ? a.getY(i) : a.getX(i)));
      return [Math.min(...v), Math.max(...v)];
    };
    // Six signs, four to a row: the first is top left, the fifth starts the second row.
    for (const [index, u, v] of [
      [0, [0, 0.25], [0.5, 1]],
      [3, [0.75, 1], [0.5, 1]],
      [4, [0, 0.25], [0, 0.5]],
    ] as const) {
      const placed = placedSignFaces(faces, index, 6);
      expect(placed.length).toBe(2);
      for (const [k, g] of placed.entries()) {
        expect(range(g, 'uv', 0)).toEqual(u);
        expect(range(g, 'uv', 1)).toEqual(v);
        const box = new THREE.Box3().setFromBufferAttribute(
          g.getAttribute('position') as THREE.BufferAttribute,
        );
        expect(box.getCenter(new THREE.Vector3()).distanceTo(faces[k].position)).toBeLessThan(1e-6);
      }
    }
  });
});
