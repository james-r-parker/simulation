// The patch-visit sample behind `eval.migration_index`: a bitset of `ceil(floraPatchMax / 32)` words per slot (at most
// 8, as `floraPatchMax` is at most 256) plus a distinct-patch counter, both allocated once. `sampleVisits` runs every
// `MOTION_SAMPLE_TICKS` and costs alive agents x patches distance checks; it allocates nothing. A patch is visited
// when the agent is strictly inside its disc (as `depletePatchAt` decides); overlapping discs mark every patch that
// contains the agent. Kept apart from `metrics-watch.js` because the event handling imports it.

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty visit pools: the bitsets and counters per slot, and the mature deaths after
 *   burn-in with their summed visits
 */
export function createVisitPools(config) {
    const words = Math.ceil(config.floraPatchMax / 32);
    return {
        patchCount: config.floraPatchMax,
        hadPatches: config.foodPatchCount > 0,
        words,
        maturityTicks: config.maturityTicks,
        bits: new Uint32Array(config.maxAgents * words),
        visited: new Uint16Array(config.maxAgents),
        deaths: 0,
        visitSum: 0,
    };
}

/**
 * Forgets a slot's visits (called on birth and slot reuse).
 * @param {Record<string, any>} pools the watch pools
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetVisits(pools, slot) {
    pools.visited[slot] = 0;
    pools.bits.fill(0, slot * pools.words, (slot + 1) * pools.words);
}

/**
 * Marks, for every alive agent, the patches whose disc contains it.
 * @param {Record<string, any>} pools the watch pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleVisits(pools, world) {
    const { patchCount, words, bits, visited } = pools;
    for (let p = 0; p < patchCount; p++) {
        if (world.patchAlive[p] === 1) {
            pools.hadPatches = true;
            break;
        }
    }
    if (!pools.hadPatches) {
        return;
    }
    const { patchX, patchY, alive, x, y } = world;
    const radius = world.config.foodPatchRadius;
    const limit = radius * radius;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        for (let p = 0; p < patchCount; p++) {
            if (world.patchAlive[p] !== 1) {
                continue;
            }
            const dx = x[slot] - patchX[p];
            const dy = y[slot] - patchY[p];
            const word = slot * words + (p >> 5);
            const bit = 1 << (p & 31);
            if (dx * dx + dy * dy < limit && (bits[word] & bit) === 0) {
                bits[word] |= bit;
                visited[slot] += 1;
            }
        }
    }
}

/**
 * Counts a death at or after burn-in when the agent was mature, with its distinct patches visited.
 * @param {Record<string, any>} pools the watch pools
 * @param {number} slot the dead agent's slot
 * @param {number} ageTicks its age at death
 * @returns {void}
 */
export function noteVisitDeath(pools, slot, ageTicks) {
    if (ageTicks >= pools.maturityTicks) {
        pools.deaths += 1;
        pools.visitSum += pools.visited[slot];
    }
}
