// A uniform grid over the alive `canHunt` slots, rebuilt each tick by a counting sort, so the nearest hunter of another
// lineage within an agent's vision range is found from the 3 x 3 cells around it instead of by a scan of every hunter.
// The cell edge is the longest vision range, so a hunter within any agent's range lies in a neighbouring cell.

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty grid sized for `config.maxAgents` hunters
 */
export function createHunterGrid(config) {
    const ranges = Object.values(config.specialisations).map((spec) => /** @type {any} */ (spec).visionRange);
    const cellSize = Math.max(1, ...ranges);
    const cols = Math.max(1, Math.ceil(config.worldWidth / cellSize));
    const rows = Math.max(1, Math.ceil(config.worldHeight / cellSize));
    return {
        cellSize,
        cols,
        rows,
        start: new Int32Array(cols * rows + 1),
        next: new Int32Array(cols * rows),
        cellOf: new Int32Array(config.maxAgents),
        items: new Int32Array(config.maxAgents),
    };
}

/**
 * @param {number} v a coordinate
 * @param {number} cellSize the cell edge
 * @param {number} last the last valid cell index
 * @returns {number} the clamped cell index of `v`
 */
function cellAt(v, cellSize, last) {
    const c = Math.floor(v / cellSize);
    return c < 0 ? 0 : c > last ? last : c;
}

/**
 * Sorts the listed hunters into cells, keeping slot order inside a cell.
 * @param {Record<string, any>} grid the grid
 * @param {Record<string, any>} world the world
 * @param {Int32Array} hunters the alive `canHunt` slots in ascending order
 * @param {number} count how many of `hunters` are listed
 * @returns {void}
 */
export function buildHunterGrid(grid, world, hunters, count) {
    const { start, next, cellOf, items, cellSize, cols, rows } = grid;
    const { x, y } = world;
    start.fill(0);
    for (let i = 0; i < count; i++) {
        const h = hunters[i];
        const cell = cellAt(y[h], cellSize, rows - 1) * cols + cellAt(x[h], cellSize, cols - 1);
        cellOf[i] = cell;
        start[cell + 1] += 1;
    }
    for (let c = 0; c < cols * rows; c++) {
        start[c + 1] += start[c];
        next[c] = start[c];
    }
    for (let i = 0; i < count; i++) {
        items[next[cellOf[i]]++] = hunters[i];
    }
}

/**
 * @param {Record<string, any>} grid the grid, built this tick
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} vision the agent's vision range, at most the grid's cell edge
 * @returns {number} the hunter of another lineage nearest to the agent within `vision` (the highest slot on a tie),
 *   or -1
 */
export function nearestHunterIn(grid, world, slot, vision) {
    const { start, items, cellSize, cols, rows } = grid;
    const { x, y, lineageId } = world;
    const c0 = cellAt(x[slot], cellSize, cols - 1);
    const r0 = cellAt(y[slot], cellSize, rows - 1);
    let best = -1;
    let bestDistance = vision * vision;
    for (let r = Math.max(r0 - 1, 0); r <= Math.min(r0 + 1, rows - 1); r++) {
        const from = start[r * cols + Math.max(c0 - 1, 0)];
        const to = start[r * cols + Math.min(c0 + 1, cols - 1) + 1];
        for (let i = from; i < to; i++) {
            const h = items[i];
            const dx = x[h] - x[slot];
            const dy = y[h] - y[slot];
            const d2 = dx * dx + dy * dy;
            if (
                h !== slot &&
                lineageId[h] !== lineageId[slot] &&
                (d2 < bestDistance || (d2 === bestDistance && h > best))
            ) {
                best = h;
                bestDistance = d2;
            }
        }
    }
    return best;
}
