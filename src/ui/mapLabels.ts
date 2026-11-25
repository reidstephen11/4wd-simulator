interface MapLabelPoint {
  id: string;
  x: number;
  y: number;
  width: number;
}
export interface MapLabel extends MapLabelPoint {
  labelX: number;
  labelY: number;
}

/** Something else drawn on the sheet that a name must not cover (canvas px). */
export interface MapBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Keep discovered names clear of one another, of the map's POI icons and of `obstacles`
 * (question marks, the car's arrow), inside a `width` × `height` sheet. `k` is how large the
 * marks and names are drawn (1 = 26 px names round 36 px icons, in canvas px).
 */
export function placeMapLabels(
  points: readonly MapLabelPoint[],
  width: number,
  margin: number,
  height = width,
  k = 1,
  obstacles: readonly MapBox[] = [],
): MapLabel[] {
  const icon = 18 * k;
  const gap = 22 * k;
  const half = 17 * k;
  const pad = 4 * k;
  const occupied: MapBox[] = [
    ...points.map((p) => ({ left: p.x - icon, right: p.x + icon, top: p.y - icon, bottom: p.y + icon })),
    ...obstacles,
  ];
  return points.map((p) => {
    let labelX = p.x + gap,
      labelY = p.y;
    placement: for (let row = 0; row < 16; row++) {
      const dy = Math.ceil(row / 2) * 36 * k * (row % 2 ? -1 : 1);
      for (const side of [1, -1]) {
        const x = side > 0 ? p.x + gap : p.x - gap - p.width,
          y = p.y + dy;
        const box = { left: x - pad, right: x + p.width + pad, top: y - half, bottom: y + half };
        if (
          box.left < margin ||
          box.right > width - margin ||
          box.top < margin ||
          box.bottom > height - margin
        )
          continue;
        if (
          occupied.some(
            (r) => box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top,
          )
        )
          continue;
        labelX = x;
        labelY = y;
        break placement;
      }
    }
    occupied.push({
      left: labelX - pad,
      right: labelX + p.width + pad,
      top: labelY - half,
      bottom: labelY + half,
    });
    return { ...p, labelX, labelY };
  });
}

/** Question marks closer together than `spacing` are drawn as one (the first). */
export function mergeHints<T extends { x: number; y: number }>(hints: readonly T[], spacing: number): T[] {
  const out: T[] = [];
  for (const h of hints) if (!out.some((o) => Math.hypot(o.x - h.x, o.y - h.y) < spacing)) out.push(h);
  return out;
}
