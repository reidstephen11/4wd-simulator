import * as THREE from 'three';
import { VehicleBuilder, VehicleMaterial as M, BodyZone as Z } from './vehicleGeometry';

/**
 * The Hilux bull bar: a swept steel beam across the front, a centre hoop over the grille and
 * a branch out to each end of the beam, each hoop one continuous bent tube with shared joints.
 */
export function hiluxBullBar(b: VehicleBuilder, color: THREE.Color): void {
  b.slot = M.Metal;
  b.tag = Z.Front;
  const outline = new THREE.Shape();
  const points = [
    [-0.9, -2.2],
    [-0.78, -2.32],
    [0.78, -2.32],
    [0.9, -2.2],
    [0.845, -2.1],
    [0.72, -2.18],
    [-0.72, -2.18],
    [-0.845, -2.1],
  ];
  points.forEach(([x, z], i) => (i ? outline.lineTo(x, z) : outline.moveTo(x, z)));
  outline.closePath();
  const beam = new THREE.ExtrudeGeometry(outline, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    steps: 1,
  });
  beam.rotateX(Math.PI / 2);
  beam.translate(0, 0.18, 0);
  b.geometry(beam, color);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const tube = (pts: THREE.Vector3[], radius = 0.026) => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    let last = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const c = pts[i],
        next = pts[i + 1];
      const r = Math.min(0.085, c.distanceTo(last) * 0.4, c.distanceTo(next) * 0.4);
      const a = c.clone().add(last.clone().sub(c).normalize().multiplyScalar(r));
      const d = c.clone().add(next.clone().sub(c).normalize().multiplyScalar(r));
      path.add(new THREE.LineCurve3(last, a));
      path.add(new THREE.QuadraticBezierCurve3(a, c, d));
      last = d;
    }
    path.add(new THREE.LineCurve3(last, pts.at(-1)!));
    b.slot = M.Metal;
    b.tag = Z.Front;
    b.geometry(new THREE.TubeGeometry(path, 96, radius, 12, false), color);
  };
  const z = (y: number) => -2.27 + (y - 0.17) * 0.12;
  // The hoop stands 0.1 m over the bonnet's front edge, the branches level with it.
  // Its legs stand between the grille and the headlamps, clear of the maker's name.
  const HOOP = 0.66,
    BRANCH = 0.56,
    LEG = 0.475,
    END = 0.81;
  tube([V(-LEG, 0.14, z(0.14)), V(-LEG, HOOP, z(HOOP)), V(LEG, HOOP, z(HOOP)), V(LEG, 0.14, z(0.14))]);
  for (const s of [-1, 1]) {
    // The branch penetrates the centre post; the lower leg enters the swept beam.
    tube([
      V(s * (LEG - 0.01), BRANCH, z(BRANCH)),
      V(s * (END - 0.01), BRANCH, -2.18),
      V(s * END, 0.14, -2.18),
    ]);
    b.block(s * LEG, 0.19, z(0.19), 0.082, 0.025, 0.075, color, M.Metal, Z.Front, 0.008);
    b.block(s * END, 0.19, -2.18, 0.075, 0.025, 0.075, color, M.Metal, Z.Front, 0.008);
    b.rod(V(s * 0.42, 0.08, -2.21), V(s * 0.35, 0.04, -1.91), 0.026, color, M.Metal, Z.Trim);
    for (const y of [0.2, 0.23])
      b.block(
        s * LEG,
        y,
        z(0.2) - 0.028,
        0.011,
        0.011,
        0.006,
        new THREE.Color('#858887'),
        M.Metal,
        Z.Front,
        0.003,
      );
  }
}
