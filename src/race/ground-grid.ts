/**
 * Points on the ground in a grid of square cells, so as to look only at
 * those near a spot rather than at every one: the track's generator keeps its
 * stretches of road apart with one, its placements keep the scenery off the
 * road, and the renderer finds the stretch of road nearest a point of the
 * land.
 */
export interface GroundGrid<T> {
  /** Adds `item`, which stands at (`x`, `z`) on the ground (metres east and south). */
  add(x: number, z: number, item: T): void;
  /**
   * Calls `visit` with every item in the cells up to `span` cells either way
   * of the one holding (`x`, `z`) on both axes: column by column from west to
   * east, north to south within each column, and in the order they were added
   * within each cell. Cells fewer than `from` cells away on both axes are left
   * out, so that a search can widen ring by ring.
   */
  forEachNear(x: number, z: number, span: number, visit: (item: T) => void, from?: number): void;
}

/** An empty grid of cells `cell` metres wide. */
export function createGroundGrid<T>(cell: number): GroundGrid<T> {
  const cells = new Map<string, T[]>();
  const keyOf = (column: number, row: number) => `${column},${row}`;
  return {
    add(x, z, item) {
      const key = keyOf(Math.floor(x / cell), Math.floor(z / cell));
      const items = cells.get(key);
      if (items) items.push(item);
      else cells.set(key, [item]);
    },
    forEachNear(x, z, span, visit, from = 0) {
      const column = Math.floor(x / cell);
      const row = Math.floor(z / cell);
      for (let east = -span; east <= span; east++) {
        for (let south = -span; south <= span; south++) {
          if (Math.max(Math.abs(east), Math.abs(south)) < from) continue;
          for (const item of cells.get(keyOf(column + east, row + south)) ?? []) visit(item);
        }
      }
    },
  };
}
