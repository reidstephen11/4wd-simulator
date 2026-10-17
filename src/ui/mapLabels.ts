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

/** Keep discovered names clear of one another and of the map's POI icons. */
export function placeMapLabels(points: readonly MapLabelPoint[], size: number, margin: number): MapLabel[] {
  const occupied = points.map((p) => ({ left: p.x - 18, right: p.x + 18, top: p.y - 18, bottom: p.y + 18 }));
  return points.map((p) => {
    let labelX = p.x + 22,
      labelY = p.y;
    placement: for (let row = 0; row < 16; row++) {
      const dy = Math.ceil(row / 2) * 36 * (row % 2 ? -1 : 1);
      for (const side of [1, -1]) {
        const x = side > 0 ? p.x + 22 : p.x - 22 - p.width,
          y = p.y + dy;
        const box = { left: x - 4, right: x + p.width + 4, top: y - 17, bottom: y + 17 };
        if (box.left < margin || box.right > size - margin || box.top < margin || box.bottom > size - margin)
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
    occupied.push({ left: labelX - 4, right: labelX + p.width + 4, top: labelY - 17, bottom: labelY + 17 });
    return { ...p, labelX, labelY };
  });
}
