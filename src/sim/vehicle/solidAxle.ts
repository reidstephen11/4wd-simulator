/** A massless rigid axle: hub separation stays fixed as it rolls across the chassis. */
export function solidAxlePose(span: number, leftY: number, rightY: number) {
  const sin = Math.max(-1, Math.min(1, (rightY - leftY) / span));
  return { y: (leftY + rightY) / 2, sin, cos: Math.sqrt(1 - sin * sin), roll: Math.asin(sin) };
}
