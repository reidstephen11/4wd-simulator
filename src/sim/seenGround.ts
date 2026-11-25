/** Grid cell (m) and how far round the car the ground counts as seen (m). */
export const seenTuning = { cell: 25, radius: 150 } as const;

/**
 * Ground the car has been near, on a coarse grid over the map: the paper map shows only
 * this, filling in as you drive. Plain bits, kept in the checkpoint as base64.
 */
export class SeenGround {
  private readonly cols: number;
  private readonly rows: number;
  private readonly bits: Uint8Array;
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(
    /** Half the map east–west and north–south (m). */
    readonly halfX: number,
    readonly halfZ: number,
    saved?: string,
  ) {
    this.cols = Math.ceil((2 * halfX) / seenTuning.cell);
    this.rows = Math.ceil((2 * halfZ) / seenTuning.cell);
    this.bits = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
    if (saved) {
      try {
        const raw = atob(saved);
        if (raw.length === this.bits.length)
          for (let i = 0; i < raw.length; i++) this.bits[i] = raw.charCodeAt(i);
      } catch {
        /* A damaged save starts with a blank map. */
      }
    }
  }

  private index(col: number, row: number): number {
    return row * this.cols + col;
  }

  private cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x + this.halfX) / seenTuning.cell), Math.floor((z + this.halfZ) / seenTuning.cell)];
  }

  /** Is this cell seen (false off the grid)? */
  seenCell(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    const i = this.index(col, row);
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  seenAt(x: number, z: number): boolean {
    return this.seenCell(...this.cellOf(x, z));
  }

  /** Is any seen ground within `r` metres of (x, z)? */
  near(x: number, z: number, r: number): boolean {
    const [c0, r0] = this.cellOf(x - r, z - r);
    const [c1, r1] = this.cellOf(x + r, z + r);
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        if (!this.seenCell(col, row)) continue;
        const [cx, cz] = this.centre(col, row);
        if (Math.hypot(cx - x, cz - z) <= r) return true;
      }
    return false;
  }

  /** A cell's centre (m). */
  centre(col: number, row: number): [number, number] {
    return [(col + 0.5) * seenTuning.cell - this.halfX, (row + 0.5) * seenTuning.cell - this.halfZ];
  }

  /** Mark the ground round (x, z) as seen (only after the car has moved a few metres). */
  mark(x: number, z: number, radius: number = seenTuning.radius): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 5) return;
    this.lastX = x;
    this.lastZ = z;
    const [c0, r0] = this.cellOf(x - radius, z - radius);
    const [c1, r1] = this.cellOf(x + radius, z + radius);
    for (let row = Math.max(0, r0); row <= Math.min(this.rows - 1, r1); row++)
      for (let col = Math.max(0, c0); col <= Math.min(this.cols - 1, c1); col++) {
        const [cx, cz] = this.centre(col, row);
        if (Math.hypot(cx - x, cz - z) > radius) continue;
        const i = this.index(col, row);
        this.bits[i >> 3] |= 1 << (i & 7);
      }
  }

  /** Every seen cell, for drawing. */
  *cells(): Generator<[number, number]> {
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.cols; col++) if (this.seenCell(col, row)) yield [col, row];
  }

  encode(): string {
    let s = '';
    for (const b of this.bits) s += String.fromCharCode(b);
    return btoa(s);
  }
}
