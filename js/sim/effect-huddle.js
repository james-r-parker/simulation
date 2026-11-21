// The `huddled` effect's pass (docs/designs/status-effects.md, "The social effects"): every `HUDDLE_EVERY` ticks, in the
// signal phase, each alive body counts the fed kin that stand within `huddleRange` of its own size and holds that many
// stacks (up to the cap). A kin is fed when its energy is above half its store, so a starving body gives no warmth and a
// huddle of sitters cools as it starves. Bodies are visited in slot order and the hash is read in cell order: no RNG, no
// allocation, a replay is bit for bit.

import { cellOf, cellRange } from './spatial-hash.js';
import { EFFECT, SYSTEM } from './effects.js';
import { setStacks } from './effect-raise.js';
import { isKin } from './kin.js';

/** The ticks between two counts. */
export const HUDDLE_EVERY = 8;

/** The record `setStacks` takes, reused for every body so the pass allocates nothing. */
const TO = { effect: EFFECT.HUDDLED, count: 0, source: 0 };

/** The most stacks a body can hold. */
const CAP = SYSTEM.list[EFFECT.HUDDLED].maxStacks;

/**
 * @param {any} world the world
 * @param {number} slot the counting body
 * @param {number} other a body in one of its cells
 * @returns {boolean} whether `other` is a fed kin inside the range of `slot`
 */
function givesWarmth(world, slot, other) {
    if (other === slot || world.alive[other] !== 1 || world.energy[other] * 2 <= world.lanes.maxEnergy[other]) {
        return false;
    }
    const dx = world.x[other] - world.x[slot];
    const dy = world.y[other] - world.y[slot];
    const reach = world.config.huddleRange * world.size[slot];
    return dx * dx + dy * dy < reach * reach && isKin(world, slot, other);
}

/**
 * @param {any} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} slot the counting body
 * @param {number} cell a cell index
 * @returns {number} the fed kin of the body that have their box's start in the cell
 */
function warmthInCell(world, hash, slot, cell) {
    const { cellStart, entries, boxX, boxY, cols, rows, cellSize } = hash;
    let count = 0;
    for (let e = cellStart[cell]; e < cellStart[cell + 1]; e++) {
        // A body sits in every cell its box covers: count it in the cell its box starts in.
        const home = cellOf(boxY[e], cellSize, rows - 1) * cols + cellOf(boxX[e], cellSize, cols - 1);
        if (entries[e] < hash.maxAgents && home === cell && givesWarmth(world, slot, entries[e])) {
            count += 1;
        }
    }
    return count;
}

/**
 * @param {any} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} slot an alive slot
 * @returns {number} the fed kin near the slot, counted up to the cap
 */
function countWarmth(world, hash, slot) {
    const range = cellRange(hash, world.x[slot], world.y[slot], world.config.huddleRange * world.size[slot]);
    let count = 0;
    for (let row = range[1]; row <= range[3] && count < CAP; row++) {
        for (let cell = row * hash.cols + range[0]; cell <= row * hash.cols + range[2]; cell++) {
            count += warmthInCell(world, hash, slot, cell);
        }
    }
    return Math.min(count, CAP);
}

/**
 * Recounts the `huddled` stacks of every alive body, on the ticks that are a multiple of `HUDDLE_EVERY`, and not at all while `huddleWarmth` is 0: the stack warms nothing then, so a neutral world pays no search.
 * @param {any} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function huddlePass(world, hash) {
    if (world.tick % HUDDLE_EVERY !== 0 || !(world.config.huddleWarmth > 0)) {
        return;
    }
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            TO.count = countWarmth(world, hash, slot);
            setStacks(SYSTEM, world, slot, TO);
        }
    }
}
