// Danger, attack, hunt and mate pheromone grids: deposit, decay, diffusion and sampling. The decay and diffusion run in the WASM
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
 * Adds `amount` to the cell under a point, capped at `pheromoneMax`.
 * @param {World} world the world
 * @param {Float32Array} grid the grid
 * @param {number} c the cell
 * @param {number} amount the deposit
 * @returns {void}
 */
function addCapped(world, grid, c, amount) {
    grid[c] = Math.min(world.config.pheromoneMax, grid[c] + amount);
}

/**
 * Adds `pheromoneDeposit` to the cell under a point, capped at `pheromoneMax`.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger`, `world.attack` or `world.hunt`
 * @param {number} x world x
 * @param {number} y world y
 * @returns {void}
 */
export function depositPheromone(world, grid, x, y) {
    addCapped(world, grid, cellIndex(world, x, y), world.config.pheromoneDeposit);
}

/**
 * A ready female's receptive-mate scent: `mateScentDeposit` on `world.mate` at her cell, capped at `pheromoneMax` as
 * `depositPheromone` caps; nothing when it is 0.
 * @param {World} world the world
 * @param {number} slot a female ready to mate this tick
 * @returns {void}
 */
export function depositMateScent(world, slot) {
    const amount = world.config.mateScentDeposit;
    if (amount > 0) {
        addCapped(world, world.mate, cellIndex(world, world.x[slot], world.y[slot]), amount);
    }
}

/**
 * Reads the cell under a point, clamped to 0..1.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger`, `world.attack`, `world.hunt` or `world.mate`
 * @param {number} x world x
 * @param {number} y world y
 * @returns {number}
 */
export function samplePheromone(world, grid, x, y) {
    return Math.min(1, Math.max(0, grid[cellIndex(world, x, y)]));
}

/**
 * Decays then diffuses the danger, attack, hunt and mate grids, in the WASM kernel (`update_pheromones`, wasm/src/field.rs):
 * each cell decays by `pheromoneDecay`, then gives a quarter of `pheromoneDiffusion` of itself to each in-grid
 * four-neighbour and takes the same share of theirs.
 * @param {World} world the world
 * @returns {void}
 */
export function updatePheromones(world) {
    updatePheromonesKernel(world);
}
