// Finds a mating partner for one agent among the agents within `mateRange` of it, using the tick's spatial hash.

import { canMatePair } from './mate-eligibility.js';
import { nextFloat } from './rng.js';
import { cellOf, cellRange } from './spatial-hash.js';

/** @typedef {import('./world.js').World} World */

/**
 * Whether the cell `col`, `row` is the first cell of the scan that holds entry `e`: the cell of the corner of its box
 * clamped into the scanned range.
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash, with `range` set to the scan
 * @param {number} e the entry index
 * @param {number} col the cell column being scanned
 * @param {number} row the cell row being scanned
 * @returns {boolean}
 */
function firstScannedCell(hash, e, col, row) {
    const { range, cellSize } = hash;
    return (
        col === Math.max(cellOf(hash.boxX[e], cellSize, hash.cols - 1), range[0]) &&
        row === Math.max(cellOf(hash.boxY[e], cellSize, hash.rows - 1), range[1])
    );
}

/**
 * Whether agent `b` is within `mateRange` of `a` edge to edge and may mate with it. A `mateRange` of 0 is the
 * contact test of `resolvePair`.
 * @param {World} world the world
 * @param {number} a the searching agent
 * @param {number} b a candidate slot
 * @returns {boolean}
 */
function isPartner(world, a, b) {
    const { x, y, size } = world;
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    return Math.sqrt(dx * dx + dy * dy) < size[a] + size[b] + world.config.mateRange && canMatePair(world, a, b);
}

/**
 * Scans one cell's entries in order for a partner of `a` that is owned by the cell and wins the draw.
 * @param {World} world the world
 * @param {number} a the searching agent
 * @param {number} cell the cell index
 * @param {number} chance the probability that an eligible pair mates
 * @returns {number} the partner slot, or -1
 */
function scanCell(world, a, cell, chance) {
    const hash = world.hash;
    const col = cell % hash.cols;
    const row = (cell - col) / hash.cols;
    for (let e = hash.cellStart[cell]; e < hash.cellStart[cell + 1]; e++) {
        const b = hash.entries[e];
        if (
            b > a &&
            b < hash.maxAgents &&
            world.alive[b] === 1 &&
            firstScannedCell(hash, e, col, row) &&
            isPartner(world, a, b) &&
            nextFloat(world.rng.lifecycle) < chance
        ) {
            return b;
        }
    }
    return -1;
}

/**
 * Finds the first partner for `a` with a higher slot: scanning the cells that cover `a`'s body plus `mateRange` in
 * row-major order and each cell's entries in entry order, the first that passes `canMatePair` and the `chance` draw.
 * One `lifecycle` draw is made for each pair that passes everything but the draw. Allocates nothing.
 * @param {World} world the world, with the hash built this tick
 * @param {number} a the searching agent, alive
 * @param {number} chance the probability that an eligible pair mates
 * @returns {number} the partner slot, or -1
 */
export function findMate(world, a, chance) {
    const hash = world.hash;
    const range = cellRange(hash, world.x[a], world.y[a], world.size[a] + world.config.mateRange);
    const col0 = range[0];
    const col1 = range[2];
    for (let row = range[1]; row <= range[3]; row++) {
        for (let col = col0; col <= col1; col++) {
            const b = scanCell(world, a, row * hash.cols + col, chance);
            if (b >= 0) {
                return b;
            }
        }
    }
    return -1;
}
