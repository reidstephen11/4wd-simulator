import * as THREE from 'three';

/** An open tube of `sides` smooth-shaded quads per step along `samples`, framed by parallel transport. */
export function sweptTube(samples: THREE.Vector3[], radius: number, sides: number): THREE.BufferGeometry {
  const n = samples.length;
  const tangents = samples.map((_, i) => {
    const a = samples[Math.max(0, i - 1)],
      c = samples[Math.min(n - 1, i + 1)];
    return c.clone().sub(a).normalize();
  });
  // Parallel-transport one normal along the tube so the quads never twist at a bend.
  const normals: THREE.Vector3[] = [];
  const t0 = tangents[0];
  const pick = Math.abs(t0.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  normals.push(pick.cross(t0).normalize());
  for (let i = 1; i < n; i++) {
    const axis = tangents[i - 1].clone().cross(tangents[i]);
    const next = normals[i - 1].clone();
    if (axis.lengthSq() > 1e-12) {
      const angle = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
      next.applyAxisAngle(axis.normalize(), angle);
    }
    normals.push(next);
  }
  const rings = samples.map((p, i) => {
    const bin = tangents[i].clone().cross(normals[i]);
    return Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      const dir = normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      return { p: p.clone().addScaledVector(dir, radius), n: dir };
    });
  });
  const positions: number[] = [],
    norms: number[] = [];
  const put = (...vs: { p: THREE.Vector3; n: THREE.Vector3 }[]) => {
    for (const v of vs) {
      positions.push(v.p.x, v.p.y, v.p.z);
      norms.push(v.n.x, v.n.y, v.n.z);
    }
  };
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < sides; k++) {
      const a = rings[i][k],
        bb = rings[i][(k + 1) % sides],
        c = rings[i + 1][(k + 1) % sides],
        d = rings[i + 1][k];
      // Wound so each quad faces out of the tube (it faced in until v1.78, which drew every
      // tube as its far inner wall).
      put(a, bb, c, a, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  return g;
}
