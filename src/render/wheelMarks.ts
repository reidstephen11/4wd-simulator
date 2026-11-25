import * as THREE from 'three';
import type { WheelMark } from '../sim/world/wheelMarks';
import { patchFog } from './fog';

/** A soft-edged blob, so one mark runs into the next along a wheel line. */
function blob(): THREE.Texture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, Math.min(1, (1 - d) * 2));
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

/**
 * Worn wheel lines (src/sim/world/wheelMarks.ts, v2.25): dark, damp tyre lines lying on the
 * ground where others have driven, built once. They tell which way in and which way out is
 * used; the ground under them is the same as beside them.
 */
export class WheelMarksView {
  readonly mesh: THREE.InstancedMesh;

  constructor(marks: readonly WheelMark[], heightAt: (x: number, z: number) => number) {
    const g = new THREE.PlaneGeometry(0.62, 0.62);
    g.rotateX(-Math.PI / 2);
    const mat = patchFog(
      new THREE.MeshLambertMaterial({
        map: blob(),
        color: '#3d2f22',
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      'wheel-marks',
    );
    this.mesh = new THREE.InstancedMesh(g, mat, Math.max(1, marks.length));
    this.mesh.name = 'wheel-marks';
    this.mesh.count = marks.length;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    marks.forEach((mark, i) => {
      const { x, z } = mark;
      // Lie along the slope.
      n.set(heightAt(x - 1, z) - heightAt(x + 1, z), 2, heightAt(x, z - 1) - heightAt(x, z + 1)).normalize();
      q.setFromUnitVectors(up, n);
      // A fainter mark is a smaller one: the line thins out towards the ends of a stretch.
      const s = 0.45 + 0.55 * mark.strength;
      m.compose(at.set(x, heightAt(x, z) + 0.03, z), q, size.set(s, 1, s));
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
