/** A low-poly granite slab with clipped corners and a rounded approach to its top. */
export function rockShape(hx: number, hy: number, hz: number, bevel: number) {
  const cut = Math.min(hx, hz) * 0.3;
  const inset = Math.min(bevel, hx * 0.3, hz * 0.3, hy * 0.8);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [x, y, z] of [
    [hx, -hy, hz],
    [hx, hy - inset, hz],
    [hx - inset, hy, hz - inset],
  ]) {
    const c = Math.min(cut, x * 0.5, z * 0.5);
    for (const [px, pz] of [
      [-x + c, -z],
      [x - c, -z],
      [x, -z + c],
      [x, z - c],
      [x - c, z],
      [-x + c, z],
      [-x, z - c],
      [-x, -z + c],
    ])
      vertices.push(px, y, pz);
  }
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const a = ring * 8,
        b = a + 8;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  for (let i = 1; i < 7; i++) indices.push(0, i, i + 1, 16, 16 + i + 1, 16 + i);
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
