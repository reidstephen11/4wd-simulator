import * as THREE from 'three';
import { VehicleBuilder } from './vehicleGeometry';
/** Indexed grid with smooth normals; optionally add an inward-facing inner skin. */
export function surface(
  b: VehicleBuilder,
  nu: number,
  nv: number,
  point: (u: number, v: number) => THREE.Vector3,
  outward: THREE.Vector3,
  color: THREE.Color,
  slot: typeof b.slot,
  zone: number,
  thickness = 0,
): void {
  for (const layer of thickness ? [0, 1] : [0]) {
    const p: number[] = [],
      idx: number[] = [];
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const q = point(i / nu, j / nv).addScaledVector(outward, layer ? -thickness : 0);
        p.push(q.x, q.y, q.z);
      }
    const a = new THREE.Vector3().fromArray(p),
      c = new THREE.Vector3().fromArray(p, 3),
      d = new THREE.Vector3().fromArray(p, (nu + 1) * 3);
    const reverse = c.sub(a).cross(d.sub(a)).dot(outward) * (layer ? -1 : 1) < 0;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i,
          c = a + nu + 1;
        idx.push(...(reverse ? [a, c, a + 1, a + 1, c, c + 1] : [a, a + 1, c, a + 1, c + 1, c]));
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.slot = slot;
    b.tag = zone;
    b.geometry(g, layer ? color.clone().multiplyScalar(0.82) : color);
  }
}
