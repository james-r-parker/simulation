// The log emitters of the hunter events (hunter-learning.md, realistic-keepers.md): a `HunterKill` and a `Provisioned`
// record of the event ring become debug log events. Split from `log.js`, which holds the table that uses them.

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
 * Emits one `Provisioned` event: a hunter handed part of a meal to its young.
 * @param {import('./log.js').SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
export function emitProvisioned(log, d, o) {
    log.log('debug', 'Provisioned', {
        tick: d[o + 1],
        genomeId: d[o + 2],
        energy: d[o + 3],
        young: d[o + 4],
    });
}
