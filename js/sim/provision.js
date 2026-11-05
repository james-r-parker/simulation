// Parental provisioning (hunter-learning.md T4): a hunter that stores energy from a kill, a bite or a carcass hands
// `provisionShare` of it to its young in range, paid from its own meal, so a juvenile eats at its parent's kill while it
// learns (wolf pups, lion cubs). Off at `provisionEnabled` false. The young are the giver's offspring: `parentA` or `parentB`
// equals the giver's `genomeId`, an id that is a per-birth serial, so a match is one life with no slot check; a split child
// that names its mother twice is one agent and is fed once. They must `canHunt`, be below `juvenileTicks` and lie within
// `provisionRange`. The scan walks the spatial hash cells and counts an agent in the first cell of its box inside the query
// range, so none is met twice. Nothing is created: the giver loses what the young store (`transferEnergy`), counted on both
// sides in `provisionTotals`. `provisionedTick` (tick + 1 of the last transfer, 0 for never) is derived state outside
// `worldHash`, zeroed by `freeAgent`. No RNG, no clock, no allocation per call.

import { EVENT_TYPE, pushEvent } from './events.js';
import { transferEnergy } from './energy.js';
import { cellOf, cellRange } from './spatial-hash.js';

/**
 * @returns {[any, string, number][]} the allocation specs for `allocateWorld`, one element per slot: `provisionedTick`
 */
export function provisionSpecs() {
    return [[Uint32Array, 'provisionedTick', 1]];
}

/**
 * Allocates the world-level provisioning state: the scan's young list (with the last gift's totals) and the two-slot totals (energy handed away, energy
 * received).
 * @param {Record<string, any>} world the world being built
 * @returns {void}
 */
export function allocProvision(world) {
    world.provisionTotals = new Float64Array(2);
    world.provisionYoung = { slots: new Int32Array(world.config.maxAgents), count: 0, moved: 0, fed: 0 };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a candidate slot
 * @param {number} giver the giving slot
 * @returns {boolean} whether the candidate is the giver's living, hunting, juvenile offspring within `provisionRange`
 */
function isYoungOf(world, slot, giver) {
    const { config, parentA, parentB, genomeId } = world;
    const id = genomeId[giver];
    if (world.alive[slot] !== 1 || (parentA[slot] !== id && parentB[slot] !== id)) {
        return false;
    }
    if (world.huntBySpec[world.spec[slot]] !== 1 || world.ageTicks[slot] >= config.juvenileTicks) {
        return false;
    }
    const dx = world.x[slot] - world.x[giver];
    const dy = world.y[slot] - world.y[giver];
    return dx * dx + dy * dy <= config.provisionRange * config.provisionRange;
}

/**
 * Adds the young of `giver` found in one hash cell to the world's list. An entry counts only in the first cell of its box that
 * lies inside the query range (`hash.range`, set by the caller), so an agent in several cells is met once.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick, whose `range` is the query box
 * @param {number} giver the giving slot
 * @param {number} cell the cell index
 * @returns {void}
 */
function gatherCell(world, hash, giver, cell) {
    const { cellStart, entries, boxX, boxY, maxAgents, cols, rows, cellSize, range } = hash;
    const list = world.provisionYoung;
    for (let e = cellStart[cell]; e < cellStart[cell + 1]; e++) {
        const col = Math.max(range[0], cellOf(boxX[e], cellSize, cols - 1));
        const row = Math.max(range[1], cellOf(boxY[e], cellSize, rows - 1));
        if (entries[e] < maxAgents && row * cols + col === cell && isYoungOf(world, entries[e], giver)) {
            list.slots[list.count++] = entries[e];
        }
    }
}

/**
 * Lists the young of `giver` in range into `world.provisionYoung`, in hash cell order.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} giver the giving slot
 * @returns {number} the number of young listed
 */
function gatherYoung(world, hash, giver) {
    const list = world.provisionYoung;
    list.count = 0;
    const box = cellRange(hash, world.x[giver], world.y[giver], world.config.provisionRange);
    const row1 = box[3];
    const col1 = box[2];
    for (let row = box[1]; row <= row1; row++) {
        for (let col = box[0]; col <= col1; col++) {
            gatherCell(world, hash, giver, row * hash.cols + col);
        }
    }
    return list.count;
}

/**
 * Pushes a `Provisioned` event: fields 2 to 4 are the giver's genome id, the energy handed away and the young fed.
 * @param {Record<string, any>} world the world
 * @param {{giver: number, moved: number, fed: number}} gift the giving slot, the energy it lost and the young that stored some
 * @returns {void}
 */
function pushProvisioned(world, { giver, moved, fed }) {
    const o = pushEvent(world.events, EVENT_TYPE.PROVISIONED, world.tick);
    const d = world.events.data;
    d[o + 2] = world.genomeId[giver];
    d[o + 3] = moved;
    d[o + 4] = fed;
}

/**
 * Gives each listed young `part` of energy, capped by its headroom, and counts the transfers on both sides of `provisionTotals`.
 * Leaves the energy the giver lost in `list.moved` and the young that stored some in `list.fed`.
 * @param {Record<string, any>} world the world
 * @param {number} giver the giving slot
 * @param {number} part the energy offered to each young
 * @returns {void}
 */
function giveToYoung(world, giver, part) {
    const list = world.provisionYoung;
    list.moved = 0;
    list.fed = 0;
    for (let i = 0; i < list.count; i++) {
        const young = list.slots[i];
        const headroom = world.maxEnergyBySpec[world.spec[young]] - world.energy[young];
        const lost = headroom > 0 ? transferEnergy(world, giver, young, Math.min(part, headroom)) : 0;
        if (lost > 0) {
            world.provisionTotals[0] += lost;
            world.provisionTotals[1] += world.transferGained;
            world.provisionedTick[young] = world.tick + 1;
            list.moved += lost;
            list.fed += 1;
        }
    }
}

/**
 * Hands `provisionShare` of the energy a hunter just stored to its young in range, split equally and capped by each young's
 * headroom; the giver pays only what the young store. Does nothing when `provisionEnabled` is off, the giver cannot hunt or
 * has no young in range.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} giver the hunter that stored the energy
 * @param {number} stored the energy it stored
 * @returns {void}
 */
export function provisionYoung(world, hash, giver, stored) {
    const { config } = world;
    if (!config.provisionEnabled || !(stored > 0) || world.huntBySpec[world.spec[giver]] !== 1) {
        return;
    }
    const count = gatherYoung(world, hash, giver);
    if (count === 0) {
        return;
    }
    giveToYoung(world, giver, (stored * config.provisionShare) / count);
    const list = world.provisionYoung;
    if (list.moved > 0) {
        pushProvisioned(world, { giver, moved: list.moved, fed: list.fed });
    }
}

/**
 * Throws unless the two sides of `provisionTotals` agree and no stamp is from the future.
 * @param {Record<string, any>} world the world
 * @param {(slot: number, value: number, detail: string) => Error} fail builds the invariant error
 * @returns {void}
 */
export function assertProvision(world, fail) {
    const totals = world.provisionTotals;
    if (Math.abs(totals[0] - totals[1]) > 1e-6 * Math.max(1, totals[0])) {
        throw fail(-1, totals[0] - totals[1], 'energy handed away and energy received by provisioning differ');
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.provisionedTick[slot] > world.tick + 1) {
            throw fail(slot, world.provisionedTick[slot], 'a provisioning stamp is from the future');
        }
    }
}
