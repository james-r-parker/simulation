// A uniform grid over a set of points, rebuilt each frame by a stable counting sort, so a search within one cell size
// of a point scans the 3 x 3 cells around it instead of every point. Pure; it grows its arrays when a frame holds more
// points or cells than any before, and allocates nothing otherwise.

/** The most cells a grid holds; a wider spread of points doubles the cell size until it fits. */
export const MAX_CELLS = 4096;

/**
 * @typedef {object} PointGrid
 * @property {number} cols columns
 * @property {number} rows rows
 * @property {number} minX the left edge, world units
 * @property {number} minY the top edge, world units
 * @property {number} cell the cell size actually used, at least the one asked for
 * @property {Int32Array} start each cell's first slot in `items`; `start[cells]` is the point count
 * @property {Int32Array} items the point ids sorted by cell, in their given order within a cell
 * @property {Int32Array} cellOf scratch: each point's cell, in input order
 */

/** @returns {PointGrid} an empty grid */
export function createPointGrid() {
    return {
        cols: 0,
        rows: 0,
        minX: 0,
        minY: 0,
        cell: 1,
        start: new Int32Array(1),
        items: new Int32Array(0),
        cellOf: new Int32Array(0),
    };
}

/**
 * Sets the grid's bounds and cell size to cover the points.
 * @param {PointGrid} grid the grid
 * @param {{x: ArrayLike<number>, y: ArrayLike<number>}} at the coordinates, by id
 * @param {{ids: Int32Array, n: number}} points the ids to place
 * @param {number} cell the smallest cell size
 * @returns {void}
 */
function frame(grid, at, { ids, n }, cell) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < n; k++) {
        const x = at.x[ids[k]];
        const y = at.y[ids[k]];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    let size = cell;
    while ((Math.floor((maxX - minX) / size) + 1) * (Math.floor((maxY - minY) / size) + 1) > MAX_CELLS) {
        size *= 2;
    }
    grid.minX = minX;
    grid.minY = minY;
    grid.cell = size;
    grid.cols = Math.floor((maxX - minX) / size) + 1;
    grid.rows = Math.floor((maxY - minY) / size) + 1;
}

/**
 * Places the points into the grid.
 * @param {PointGrid} grid the grid
 * @param {{x: ArrayLike<number>, y: ArrayLike<number>}} at the coordinates, by id
 * @param {{ids: Int32Array, n: number}} points the ids to place, `n` of them
 * @param {number} cell the smallest cell size: a search radius up to it needs only the 3 x 3 cells around a point
 * @returns {PointGrid} grid
 */
export function fillPointGrid(grid, at, points, cell) {
    const { ids, n } = points;
    if (n === 0) {
        grid.cols = 0;
        grid.rows = 0;
        return grid;
    }
    frame(grid, at, points, cell);
    const cells = grid.cols * grid.rows;
    if (grid.start.length < cells + 1) {
        grid.start = new Int32Array(cells + 1);
    }
    if (grid.items.length < n) {
        grid.items = new Int32Array(n);
        grid.cellOf = new Int32Array(n);
    }
    grid.start.fill(0, 0, cells + 1);
    for (let k = 0; k < n; k++) {
        const cx = Math.floor((at.x[ids[k]] - grid.minX) / grid.cell);
        const cy = Math.floor((at.y[ids[k]] - grid.minY) / grid.cell);
        grid.cellOf[k] = cy * grid.cols + cx;
        grid.start[grid.cellOf[k] + 1] += 1;
    }
    for (let c = 0; c < cells; c++) {
        grid.start[c + 1] += grid.start[c];
    }
    for (let k = 0; k < n; k++) {
        const c = grid.cellOf[k];
        // start[c] is advanced as the cell fills, then shifted back below, so each cell keeps the input order
        grid.items[grid.start[c]++] = ids[k];
    }
    for (let c = cells; c > 0; c--) {
        grid.start[c] = grid.start[c - 1];
    }
    grid.start[0] = 0;
    return grid;
}

/**
 * The cells to scan for points within one cell size of a position: its own cell and the ring around it, clipped to
 * the grid. An empty range (`x0 > x1`) when the position is more than a cell outside the grid.
 * @param {PointGrid} grid the grid
 * @param {number} x a position
 * @param {number} y a position
 * @param {{x0: number, x1: number, y0: number, y1: number}} out receives the column and row range, inclusive
 * @returns {{x0: number, x1: number, y0: number, y1: number}} out
 */
export function nearCells(grid, x, y, out) {
    const cx = Math.floor((x - grid.minX) / grid.cell);
    const cy = Math.floor((y - grid.minY) / grid.cell);
    out.x0 = Math.max(cx - 1, 0);
    out.x1 = Math.min(cx + 1, grid.cols - 1);
    out.y0 = Math.max(cy - 1, 0);
    out.y1 = Math.min(cy + 1, grid.rows - 1);
    return out;
}
