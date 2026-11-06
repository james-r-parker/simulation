// The log emitter of the hunter-learning events (hunter-learning.md): a `HunterKill` record of the event ring becomes a
// debug log event. Split from `log.js`, which holds the table that uses it.

/**
 * Emits one `HunterKill` event: a hunter's deliberate kill, with its age, its kills so far and whether it was still dependent.
 * @param {import('./log.js').SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
export function emitHunterKill(log, d, o) {
    log.log('debug', 'HunterKill', {
        tick: d[o + 1],
        genomeId: d[o + 2],
        ageTicks: d[o + 3],
        kills: d[o + 4],
        dependent: d[o + 5] === 1,
    });
}

/**
 * Emits one `RewardShuffleDropped` event: a shuffled reward that was never delivered, because the queue was full or its owner died.
 * @param {import('./log.js').SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
export function emitRewardShuffleDropped(log, d, o) {
    log.log('debug', 'RewardShuffleDropped', {
        tick: d[o + 1],
        genomeId: d[o + 2],
        magnitude: d[o + 3],
        cause: d[o + 4] === 1 ? 'death' : 'queue-full',
    });
}
