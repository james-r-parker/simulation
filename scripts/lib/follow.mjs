// Follows one genome through a replay: logs `FollowSample` every FOLLOW_INTERVAL ticks until the agent dies.

/** Ticks between samples. */
export const FOLLOW_INTERVAL = 10;

/**
 * @typedef {object} Follower
 * @property {(world: Record<string, any>) => void} update call once per tick, after the step
 * @property {(world: Record<string, any>) => void} finish call when the run ends
 */

/**
 * @param {Record<string, any>} world the world
 * @param {number} genomeId the genome to find
 * @returns {number} the alive slot holding it, or -1
 */
function findSlot(world, genomeId) {
    const { alive, genomeId: ids } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && ids[slot] === genomeId) {
            return slot;
        }
    }
    return -1;
}

/**
 * @param {import('../../js/sim/log.js').SimLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} genomeId the followed genome
 * @param {number} slot the genome's slot
 * @returns {void}
 */
function logSample(log, world, genomeId, slot) {
    const count = world.layout.outputCount;
    log.log('info', 'FollowSample', {
        tick: world.tick,
        genomeId,
        x: world.x[slot],
        y: world.y[slot],
        energy: world.energy[slot],
        outputs: Array.from(world.outputs.subarray(slot * count, (slot + 1) * count)),
    });
}

/**
 * Creates a follower for one genome. The slot is cached once found and checked each tick, so a death is seen on the
 * tick it happens; samples are taken when the tick is a multiple of FOLLOW_INTERVAL.
 * @param {import('../../js/sim/log.js').SimLog} log the log
 * @param {number} genomeId the genome to follow
 * @returns {Follower} the follower
 */
export function createFollower(log, genomeId) {
    let slot = -1;
    let seen = false;
    let ended = false;
    /** @param {number} tick @param {string} reason */
    const end = (tick, reason) => {
        ended = true;
        log.log('info', 'FollowEnded', { tick, genomeId, reason });
    };
    return {
        update(world) {
            if (ended) {
                return;
            }
            if (slot >= 0 && !(world.alive[slot] === 1 && world.genomeId[slot] === genomeId)) {
                end(world.tick, 'died');
                return;
            }
            if (world.tick % FOLLOW_INTERVAL !== 0) {
                return;
            }
            slot = slot >= 0 ? slot : findSlot(world, genomeId);
            if (slot >= 0) {
                seen = true;
                logSample(log, world, genomeId, slot);
            }
        },
        finish(world) {
            if (ended) {
                return;
            }
            if (seen) {
                end(world.tick, 'run ended');
            } else {
                log.log('warn', 'FollowNeverSeen', { tick: world.tick, genomeId });
            }
        },
    };
}
