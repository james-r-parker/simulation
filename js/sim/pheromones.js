// Danger and attack pheromone grids: deposit, decay, diffusion and sampling.

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @returns {{cols: number, rows: number}} the grid size, built once by `allocateWorld`
 */
function gridSize(world) {
    return world.pheromoneGrid;
}

/**
 * @param {World} world the world
 * @param {number} x world x
 * @param {number} y world y
 * @returns {number} the index of the clamped cell holding the point
 */
function cellIndex(world, x, y) {
    const { cols, rows } = gridSize(world);
    const size = world.config.pheromoneCellSize;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x / size)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / size)));
    return row * cols + col;
}

/**
 * Adds a deposit to the cell under a point, capped at `pheromoneMax`.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger` or `world.attack`
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
 * @param {Float32Array} grid `world.danger` or `world.attack`
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
 * @param {World} world the world
 * @param {Float32Array} grid the grid to decay and diffuse
 * @returns {void}
 */
function updateGrid(world, grid) {
    const { pheromoneDecay, pheromoneDiffusion } = world.config;
    const s = world.pheromoneScratch;
    const size = gridSize(world);
    const k = pheromoneDiffusion / 4;
    for (let c = 0; c < grid.length; c++) {
        grid[c] = grid[c] * (1 - pheromoneDecay);
        s[c] = grid[c];
    }
    for (let c = 0; c < grid.length; c++) {
        grid[c] = s[c] - k * neighbourCount(c, size) * s[c] + k * neighbourSum(s, c, size);
    }
}

/**
 * Decays then diffuses both pheromone grids.
 * @param {World} world the world
 * @returns {void}
 */
export function updatePheromones(world) {
    updateGrid(world, world.danger);
    updateGrid(world, world.attack);
}
