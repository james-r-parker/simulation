// Uniform-grid spatial hash over agent and food circles, rebuilt each tick by a counting sort.

/**
 * @typedef {object} SpatialHash
 * @property {number} cellSize cell edge length in world units
 * @property {number} cols columns
 * @property {number} rows rows
 * @property {number} maxAgents agent slot count; food ids start here
 * @property {Int32Array} cellStart `cols * rows + 1` offsets into `entries`
 * @property {Int32Array} cellCount per-cell scratch for the count and insert passes
 * @property {Int32Array} entries circle ids, grouped by cell
 * @property {Float64Array} boxX per entry, the circle's `minX` at build time
 * @property {Float64Array} boxY per entry, the circle's `minY` at build time
 * @property {Int32Array} range `[col0, row0, col1, row1]` written by `cellRange`
 * @property {number} entryCount entries used by the last build
 */

/**
 * Allocates the hash once, sized for the worst case of nine cells per circle.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {SpatialHash}
 */
export function createSpatialHash(config) {
    const cellSize = config.hashCellSize;
    const cols = Math.ceil(config.worldWidth / cellSize);
    const rows = Math.ceil(config.worldHeight / cellSize);
    const capacity = 9 * (config.maxAgents + config.maxFood);
    return {
        cellSize,
        cols,
        rows,
        maxAgents: config.maxAgents,
        cellStart: new Int32Array(cols * rows + 1),
        cellCount: new Int32Array(cols * rows),
        entries: new Int32Array(capacity),
        boxX: new Float64Array(capacity),
        boxY: new Float64Array(capacity),
        range: new Int32Array(4),
        entryCount: 0,
    };
}

/**
 * Clamped cell coordinate of a world coordinate.
 * @param {number} v the coordinate
 * @param {number} cellSize cell edge length
 * @param {number} last the last valid cell index
 * @returns {number}
 */
export function cellOf(v, cellSize, last) {
    const c = Math.floor(v / cellSize);
    return c < 0 ? 0 : c > last ? last : c;
}

/**
 * Writes the cell box `[col0, row0, col1, row1]` that a circle's bounding box covers into `hash.range`.
 * The result is shared: finish with it before calling again.
 * @param {SpatialHash} hash the hash
 * @param {number} x circle centre x
 * @param {number} y circle centre y
 * @param {number} r circle radius
 * @returns {Int32Array} `hash.range`
 */
export function cellRange(hash, x, y, r) {
    const range = hash.range;
    range[0] = cellOf(x - r, hash.cellSize, hash.cols - 1);
    range[1] = cellOf(y - r, hash.cellSize, hash.rows - 1);
    range[2] = cellOf(x + r, hash.cellSize, hash.cols - 1);
    range[3] = cellOf(y + r, hash.cellSize, hash.rows - 1);
    return range;
}

/**
 * Counts one circle into every cell of `hash.range`.
 * @param {SpatialHash} hash the hash
 */
function countRange(hash) {
    const { range, cols, cellCount } = hash;
    for (let row = range[1]; row <= range[3]; row++) {
        for (let col = range[0]; col <= range[2]; col++) {
            cellCount[row * cols + col]++;
        }
    }
}

/**
 * Inserts one circle into every cell of `hash.range`.
 * @param {SpatialHash} hash the hash
 * @param {number} id circle id
 * @param {number} minX the box's minimum x
 * @param {number} minY the box's minimum y
 */
function insertRange(hash, id, minX, minY) {
    const { range, cols, cellStart, cellCount, entries, boxX, boxY } = hash;
    for (let row = range[1]; row <= range[3]; row++) {
        for (let col = range[0]; col <= range[2]; col++) {
            const cell = row * cols + col;
            const at = cellStart[cell] + cellCount[cell]++;
            entries[at] = id;
            boxX[at] = minX;
            boxY[at] = minY;
        }
    }
}

/**
 * Visits every live circle: agents by ascending slot (id `slot`), then food (id `maxAgents + slot`).
 * @param {SpatialHash} hash the hash
 * @param {Record<string, any>} world the world
 * @param {boolean} insert false to count, true to insert
 */
function visitAll(hash, world, insert) {
    const { alive, x, y, size, foodAlive, foodX, foodY, foodRadius } = world;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] === 1) {
            cellRange(hash, x[i], y[i], size[i]);
            if (insert) {
                insertRange(hash, i, x[i] - size[i], y[i] - size[i]);
            } else {
                countRange(hash);
            }
        }
    }
    for (let i = 0; i < foodAlive.length; i++) {
        if (foodAlive[i] === 1) {
            cellRange(hash, foodX[i], foodY[i], foodRadius[i]);
            if (insert) {
                insertRange(hash, hash.maxAgents + i, foodX[i] - foodRadius[i], foodY[i] - foodRadius[i]);
            } else {
                countRange(hash);
            }
        }
    }
}

/**
 * Rebuilds the hash from the world's live agents and food. Allocates nothing.
 * @param {SpatialHash} hash the hash
 * @param {Record<string, any>} world the world
 */
export function buildHash(hash, world) {
    const { cellStart, cellCount } = hash;
    cellCount.fill(0);
    visitAll(hash, world, false);
    cellStart[0] = 0;
    for (let c = 0; c < cellCount.length; c++) {
        cellStart[c + 1] = cellStart[c] + cellCount[c];
    }
    const total = cellStart[cellCount.length];
    if (total > hash.entries.length) {
        throw new Error(`spatial hash needs ${total} entries but holds ${hash.entries.length}`);
    }
    cellCount.fill(0);
    visitAll(hash, world, true);
    hash.entryCount = total;
}
