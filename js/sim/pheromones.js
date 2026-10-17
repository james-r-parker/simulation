// Danger, attack and hunt pheromone grids: deposit, decay, diffusion and sampling.

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} x world x
 * @param {number} y world y
 * @returns {number} the index of the clamped cell holding the point
 */
function cellIndex(world, x, y) {
    const { cols, rows } = world.pheromoneGrid;
    const size = world.config.pheromoneCellSize;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / size)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / size)));
    return row * cols + col;
}

/**
 * Adds a deposit to the cell under a point, capped at `pheromoneMax`.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger`, `world.attack` or `world.hunt`
 * @param {number} x world x
 * @param {number} y world y
 * @returns {void}
 */
export function depositPheromone(world, grid, x, y) {
    const { pheromoneMax, pheromoneDeposit } = world.config;
    const c = cellIndex(world, x, y);
    grid[c] = Math.min(pheromoneMax, grid[c] + pheromoneDeposit);
}

/**
 * Reads the cell under a point, clamped to 0..1.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger`, `world.attack` or `world.hunt`
 * @param {number} x world x
 * @param {number} y world y
 * @returns {number}
 */
export function samplePheromone(world, grid, x, y) {
    return Math.min(1, Math.max(0, grid[cellIndex(world, x, y)]));
}

/**
 * @param {Float32Array} s the decayed copy
 * @param {number} c a cell index
 * @param {{cols: number, rows: number}} size the grid size
 * @returns {number} the sum of the in-grid four-neighbours of the cell
 */
function neighbourSum(s, c, { cols, rows }) {
    const col = c % cols;
    const row = (c - col) / cols;
    let sum = 0;
    sum += col > 0 ? s[c - 1] : 0;
    sum += col < cols - 1 ? s[c + 1] : 0;
    sum += row > 0 ? s[c - cols] : 0;
    sum += row < rows - 1 ? s[c + cols] : 0;
    return sum;
}

/**
 * @param {number} c a cell index
 * @param {{cols: number, rows: number}} size the grid size
 * @returns {number} how many four-neighbours the cell has inside the grid
 */
function neighbourCount(c, { cols, rows }) {
    const col = c % cols;
    const row = (c - col) / cols;
    return (col > 0 ? 1 : 0) + (col < cols - 1 ? 1 : 0) + (row > 0 ? 1 : 0) + (row < rows - 1 ? 1 : 0);
}

/**
 * @param {Float32Array} s the decayed copy
 * @param {number} c a cell index
 * @param {{cols: number, rows: number}} size the grid size
 * @param {number} k a quarter of the diffusion rate
 * @returns {number} the cell's value after diffusion, for a cell with any number of in-grid neighbours
 */
function diffuseCell(s, c, size, k) {
    return s[c] - k * neighbourCount(c, size) * s[c] + k * neighbourSum(s, c, size);
}

/**
 * @param {World} world the world
 * @param {Float32Array} grid the grid to decay and diffuse
 * @returns {void}
 */
function updateGrid(world, grid) {
    const { pheromoneDecay, pheromoneDiffusion } = world.config;
    const s = world.pheromoneScratch;
    const size = world.pheromoneGrid;
    const k = pheromoneDiffusion / 4;
    for (let c = 0; c < grid.length; c++) {
        grid[c] = grid[c] * (1 - pheromoneDecay);
        s[c] = grid[c];
    }
    const { cols, rows } = size;
    const k4 = k * 4;
    for (let row = 0; row < rows; row++) {
        const start = row * cols;
        const end = start + cols;
        if (row === 0 || row === rows - 1 || cols < 3) {
            for (let c = start; c < end; c++) {
                grid[c] = diffuseCell(s, c, size, k);
            }
            continue;
        }
        grid[start] = diffuseCell(s, start, size, k);
        // Four in-grid neighbours: the same terms, in the same order, as `diffuseCell`.
        for (let c = start + 1; c < end - 1; c++) {
            grid[c] = s[c] - k4 * s[c] + k * (s[c - 1] + s[c + 1] + s[c - cols] + s[c + cols]);
        }
        grid[end - 1] = diffuseCell(s, end - 1, size, k);
    }
}

/**
 * Decays then diffuses the danger, attack and hunt grids.
 * @param {World} world the world
 * @returns {void}
 */
export function updatePheromones(world) {
    updateGrid(world, world.danger);
    updateGrid(world, world.attack);
    updateGrid(world, world.hunt);
}
