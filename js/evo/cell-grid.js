// Per-slot bitsets of visited square cells, shared by the observer's 200 px cells and the life counters' 300 px cells.

/**
 * @typedef {object} CellGrid
 * @property {number} cellSize cell edge in world px
 * @property {number} cellCols cells across the world
 * @property {number} cellRows cells down the world
 * @property {number} cellBytes bytes per slot's bitset
 * @property {Uint8Array} cellBits every slot's bitset, `cellBytes` each
 */

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`worldWidth`, `worldHeight`)
 * @param {number} cellSize cell edge in world px
 * @param {number} slots the number of slots
 * @returns {CellGrid} an empty grid
 */
export function createCellGrid(config, cellSize, slots) {
    const cellCols = Math.ceil(config.worldWidth / cellSize);
    const cellRows = Math.ceil(config.worldHeight / cellSize);
    const cellBytes = Math.ceil((cellCols * cellRows) / 8);
    return { cellSize, cellCols, cellRows, cellBytes, cellBits: new Uint8Array(slots * cellBytes) };
}

/**
 * Marks the cell holding a point in a slot's bitset; points outside the world count in the nearest edge cell.
 * @param {CellGrid | Record<string, any>} grid the grid, or an object that spreads one (the observer, the life counters)
 * @param {number} slot the slot
 * @param {number} x world x
 * @param {number} y world y
 * @returns {boolean} whether the cell was new for this slot
 */
export function markCell(grid, slot, x, y) {
    const { cellSize, cellCols, cellRows, cellBytes, cellBits } = grid;
    const cx = Math.min(cellCols - 1, Math.max(0, Math.floor(x / cellSize)));
    const cy = Math.min(cellRows - 1, Math.max(0, Math.floor(y / cellSize)));
    const bit = cy * cellCols + cx;
    const at = slot * cellBytes + (bit >> 3);
    const mask = 1 << (bit & 7);
    if ((cellBits[at] & mask) !== 0) {
        return false;
    }
    cellBits[at] |= mask;
    return true;
}

/**
 * Empties a slot's bitset.
 * @param {CellGrid | Record<string, any>} grid the grid, or an object that spreads one (the observer, the life counters)
 * @param {number} slot the slot
 * @returns {void}
 */
export function clearCells(grid, slot) {
    grid.cellBits.fill(0, slot * grid.cellBytes, (slot + 1) * grid.cellBytes);
}
