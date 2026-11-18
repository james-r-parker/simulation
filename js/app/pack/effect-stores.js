// The effect stores the main thread writes and the pack worker reads (docs/designs/pack-worker.md, "State"): the
// membrane dents, the body tweens and the dying bodies, all lanes of one SharedArrayBuffer per world. Pure.

import { createLanes } from '../lanes.js';
import { createBodyTweens } from '../renderer/body-tweens.js';
import { createDents } from '../renderer/dents.js';
import { createDying } from '../renderer/dying.js';

/**
 * @param {import('../lanes.js').LaneAllocator} alloc the lane allocator
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {{dents: import('../renderer/dents.js').Dents, tweens: import('../renderer/body-tweens.js').BodyTweens,
 *   dying: import('../renderer/dying.js').Dying}} the stores
 */
function build(alloc, capacity) {
    return {
        dents: createDents(capacity, alloc),
        tweens: createBodyTweens(capacity, alloc),
        dying: createDying(capacity, alloc),
    };
}

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {number} the buffer size for the three stores
 */
export function effectStoreBytes(capacity) {
    const lanes = createLanes(null);
    build(lanes.alloc, capacity);
    return lanes.end();
}

/**
 * @param {SharedArrayBuffer | ArrayBuffer} memory a buffer of `effectStoreBytes(capacity)` bytes
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {ReturnType<typeof build>} the stores over the buffer, so every thread given it sees one set of lanes
 * @throws {Error} when the buffer is not `effectStoreBytes(capacity)` bytes
 */
export function createEffectStores(memory, capacity) {
    if (memory.byteLength !== effectStoreBytes(capacity)) {
        throw new Error(`createEffectStores: ${memory.byteLength} bytes, expected ${effectStoreBytes(capacity)}`);
    }
    return build(createLanes(memory).alloc, capacity);
}
