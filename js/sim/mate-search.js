// Female choice: finds the male a ready female mates with among the agents within `mateRange`, using the tick's spatial hash.

import { meritPeek } from './merit.js';
import { canMatePair } from './mate-eligibility.js';
import { nextFloat } from './rng.js';
import { SEX } from './sex.js';
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
 * Whether entry `e` of `cell` is a male the female `a` may mate with that the scan owns, and so is a choice.
 * @param {World} world the world
 * @param {number} a the searching female
 * @param {number} e the entry index
 * @param {number} cell the cell being scanned
 * @returns {boolean}
 */
function isChoice(world, a, e, cell) {
    const hash = world.hash;
    const b = hash.entries[e];
    const col = cell % hash.cols;
    const row = (cell - col) / hash.cols;
    return (
        b < hash.maxAgents &&
        world.alive[b] === 1 &&
        world.sex[b] === SEX.MALE &&
        firstScannedCell(hash, e, col, row) &&
        isPartner(world, a, b)
    );
}

/**
 * Whether the mate score blends merit in (a non-zero `meritMateWeight`).
 * @param {World} world the world
 * @returns {boolean}
 */
function meritRanks(world) {
    return world.config.meritMateWeight > 0;
}

/**
 * The mate score of male `b`: `(1 - w) x energy / maxEnergy + w x m`, `m = merit / (merit + meritHalf)` of his merit
 * decayed to now. Reads merit without restamping it, so the order of the scan changes nothing in the world.
 * @param {World} world the world
 * @param {number} b the male
 * @returns {number}
 */
function mateScore(world, b) {
    const { meritMateWeight, maxEnergy, meritHalf } = world.config;
    const merit = meritPeek(world, b);
    return ((1 - meritMateWeight) * world.energy[b]) / maxEnergy + (meritMateWeight * merit) / (merit + meritHalf);
}

/**
 * Whether male `b` beats `pick` (a slot, or -1): more score, ties to the lower slot.
 * @param {World} world the world
 * @param {number} b the candidate
 * @param {number} pick the best so far, or -1
 * @returns {boolean}
 */
function beats(world, b, pick) {
    if (pick < 0) {
        return true;
    }
    if (meritRanks(world)) {
        const sb = mateScore(world, b);
        const sp = mateScore(world, pick);
        return sb > sp || (sb === sp && b < pick);
    }
    return world.energy[b] > world.energy[pick] || (world.energy[b] === world.energy[pick] && b < pick);
}

/**
 * Finds the candidate of one cell that beats `best`: the male with the best mate score (energy alone unless merit
 * ranks), ties to the lower slot.
 * @param {World} world the world
 * @param {number} a the searching female
 * @param {number} cell the cell index
 * @param {number} best the best male so far, or -1
 * @returns {number} the better of `best` and the cell's candidates
 */
function bestInCell(world, a, cell, best) {
    const hash = world.hash;
    let pick = best;
    for (let e = hash.cellStart[cell]; e < hash.cellStart[cell + 1]; e++) {
        const b = hash.entries[e];
        if (isChoice(world, a, e, cell)) {
            pick = beats(world, b, pick) ? b : pick;
        }
    }
    return pick;
}

/**
 * Female choice: the male with the best mate score (most energy unless merit ranks; ties to the lower slot) among those of her specialisation within
 * `mateRange` that pass `canMatePair`, then one `lifecycle` draw against `chance`. Allocates nothing.
 * @param {World} world the world, with the hash built this tick
 * @param {number} a the searching female, alive
 * @param {number} chance the probability that the chosen pair mates
 * @returns {number} the male's slot, or -1 when there is none or the draw fails (no draw is made without a male)
 */
export function findMale(world, a, chance) {
    const hash = world.hash;
    const range = cellRange(hash, world.x[a], world.y[a], world.size[a] + world.config.mateRange);
    let best = -1;
    for (let row = range[1]; row <= range[3]; row++) {
        for (let col = range[0]; col <= range[2]; col++) {
            best = bestInCell(world, a, row * hash.cols + col, best);
        }
    }
    return best >= 0 && nextFloat(world.rng.lifecycle) < chance ? best : -1;
}
