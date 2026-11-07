// Female choice: finds the male a ready female mates with among the agents within `mateRange`, using the tick's spatial hash.

import { canMatePair } from './mate-eligibility.js';
import { nextFloat } from './rng.js';
import { SEX } from './sex.js';
import { cellOf, cellRange } from './spatial-hash.js';

/** @typedef {import('./world.js').World} World */

/**
 * The edge-to-edge range within which agent `a` looks for a mate: `mateRange`, plus a roaming extension that starts only
 * after `mateRoamTicks` ticks without a possible mate in view (`mateSeenAt`) and grows linearly to `mateRoamMax` over the
 * next `mateRoamTicks` ticks. A mate in view resets it. A `mateRoamTicks` of 0 is off. Draws nothing, allocates nothing.
 * @param {World} world the world
 * @param {number} a the searching agent
 * @returns {number} the range, at least `mateRange`
 */
export function mateReach(world, a) {
    const { mateRange, mateRoamTicks, mateRoamMax } = world.config;
    if (mateRoamTicks === 0) {
        return mateRange;
    }
    const grown = (world.tick - world.mateSeenAt[a] - mateRoamTicks) / mateRoamTicks;
    return grown > 0 ? mateRange + mateRoamMax * Math.min(1, grown) : mateRange;
}

/**
 * Whether the cell `col`, `row` is the first cell of the scan that holds entry `e`: the cell of the corner of its box
 * clamped into the scanned range.
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash, with `range` set to the scan
 * @param {number} e the entry index
 * @param {number} col the cell column being scanned
 * @param {number} row the cell row being scanned
 * @returns {boolean}
 */
export function firstScannedCell(hash, e, col, row) {
    const { range, cellSize } = hash;
    return (
        col === Math.max(cellOf(hash.boxX[e], cellSize, hash.cols - 1), range[0]) &&
        row === Math.max(cellOf(hash.boxY[e], cellSize, hash.rows - 1), range[1])
    );
}

/**
 * Whether agent `b` is within `reach` of `a` edge to edge and may mate with it. A `mateRange` of 0 is the
 * contact test of `resolvePair`.
 * @param {World} world the world
 * @param {number} a the searching agent
 * @param {number} b a candidate slot
 * @param {number} reach the searcher's `mateReach`
 * @returns {boolean}
 */
function isPartner(world, a, b, reach) {
    const { x, y, size } = world;
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    return Math.sqrt(dx * dx + dy * dy) < size[a] + size[b] + reach && canMatePair(world, a, b);
}

/**
 * Whether entry `e` is a male the female `a` may mate with that the scan owns, and so is a choice.
 * @param {World} world the world
 * @param {number} a the searching female
 * @param {number} e the entry index
 * @param {number} reach the searcher's `mateReach`
 * @returns {boolean}
 */
function isChoice(world, a, e, reach) {
    const b = world.hash.entries[e];
    return (
        b < world.hash.maxAgents && world.alive[b] === 1 && world.sex[b] === SEX.MALE && isPartner(world, a, b, reach)
    );
}

/**
 * Whether male `b` beats `pick` (a slot, or -1): a higher mate rank, ties to the lower slot.
 * @param {World} world the world
 * @param {number} b the candidate
 * @param {number} pick the best so far, or -1
 * @returns {boolean}
 */
function beats(world, b, pick) {
    if (pick < 0) {
        return true;
    }
    const rb = world.mateRank[b];
    const rp = world.mateRank[pick];
    return rb > rp || (rb === rp && b < pick);
}

/**
 * Finds the best candidate of one cell: the male with the highest mate rank, ties to the lower slot.
 * @param {World} world the world
 * @param {number} a the searching female
 * @param {number} cell the cell index
 * @param {number} reach the searcher's `mateReach`
 * @returns {number} the cell's best candidate, or -1
 */
function bestInCell(world, a, cell, reach) {
    const hash = world.hash;
    const col = cell % hash.cols;
    const row = (cell - col) / hash.cols;
    let pick = -1;
    for (let e = hash.cellStart[cell]; e < hash.cellStart[cell + 1]; e++) {
        const b = hash.entries[e];
        if (firstScannedCell(hash, e, col, row) && isChoice(world, a, e, reach)) {
            pick = beats(world, b, pick) ? b : pick;
        }
    }
    return pick;
}

/**
 * Female choice: the male with the highest mate rank (`mate-rank.js`; ties to the lower slot) among those of her specialisation
 * within `mateReach` that pass `canMatePair`, then one `lifecycle` draw against `chance`. Allocates nothing.
 * @param {World} world the world, with the hash built this tick
 * @param {number} a the searching female, alive
 * @param {number} chance the probability that the chosen pair mates
 * @returns {number} the male's slot, or -1 when there is none or the draw fails (no draw is made without a male)
 */
export function findMale(world, a, chance) {
    const hash = world.hash;
    const reach = mateReach(world, a);
    const range = cellRange(hash, world.x[a], world.y[a], world.size[a] + reach);
    let best = -1;
    for (let row = range[1]; row <= range[3]; row++) {
        for (let col = range[0]; col <= range[2]; col++) {
            const pick = bestInCell(world, a, row * hash.cols + col, reach);
            best = pick >= 0 && beats(world, pick, best) ? pick : best;
        }
    }
    return best >= 0 && nextFloat(world.rng.lifecycle) < chance ? best : -1;
}
