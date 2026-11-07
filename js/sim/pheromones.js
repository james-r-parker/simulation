// Danger, attack and hunt pheromone grids: deposit, decay, diffusion and sampling. The decay and diffusion run in the WASM
// kernels (wasm/src/field.rs); the grids live in the world's arena.

import { updatePheromonesKernel } from './wasm-field.js';

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
 * Decays then diffuses the danger, attack and hunt grids, in the WASM kernel (`update_pheromones`, wasm/src/field.rs):
 * each cell decays by `pheromoneDecay`, then gives a quarter of `pheromoneDiffusion` of itself to each in-grid
 * four-neighbour and takes the same share of theirs.
 * @param {World} world the world
 * @returns {void}
 */
export function updatePheromones(world) {
    updatePheromonesKernel(world);
}
