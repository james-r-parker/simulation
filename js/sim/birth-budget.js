// The birth budget: a mother who has given birth `maxBirthsPerWindow` times in the last `birthWindowTicks` ticks (by
// mating or splitting) waits until the oldest of those births leaves the window. `maxBirthsPerWindow` 0 is off.
// `world.birthRing` holds, per slot, the last `maxBirthsPerWindow` birth ticks plus one (0 is an empty entry).

/** @typedef {import('./world.js').World} World */

/**
 * @param {number} maxBirthsPerWindow the config value
 * @returns {[Uint32ArrayConstructor, string, number]} the `agentSpecs` row for the ring: stride 0 when the budget is off
 */
export function birthRingSpec(maxBirthsPerWindow) {
    return [Uint32Array, 'birthRing', maxBirthsPerWindow];
}

/**
 * @param {World} world the world
 * @param {number} slot a mother
 * @returns {number} the index of the oldest entry in her ring (an empty one first)
 */
function oldestIndex(world, slot) {
    const stride = world.config.maxBirthsPerWindow;
    const ring = world.birthRing;
    const base = slot * stride;
    let at = base;
    for (let i = base + 1; i < base + stride; i++) {
        if (ring[i] < ring[at]) {
            at = i;
        }
    }
    return at;
}

/**
 * @param {World} world the world
 * @param {number} slot a mother
 * @returns {boolean} true when her last `maxBirthsPerWindow` births are all within `birthWindowTicks` of this tick;
 *   always false when the budget is off
 */
export function birthBudgetSpent(world, slot) {
    const { maxBirthsPerWindow, birthWindowTicks } = world.config;
    if (maxBirthsPerWindow === 0) {
        return false;
    }
    const oldest = world.birthRing[oldestIndex(world, slot)];
    return oldest !== 0 && world.tick - (oldest - 1) < birthWindowTicks;
}

/**
 * Notes a birth this tick in the mother's ring, over her oldest entry. Does nothing when the budget is off.
 * @param {World} world the world
 * @param {number} slot the mother
 * @returns {void}
 */
export function recordBirth(world, slot) {
    if (world.config.maxBirthsPerWindow !== 0) {
        world.birthRing[oldestIndex(world, slot)] = world.tick + 1;
    }
}
