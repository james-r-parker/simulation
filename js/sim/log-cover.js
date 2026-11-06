// The log emitters of the cover events (docs/designs/realistic-keepers.md, T6): `CoverConfig` and `CoverTotals` records of the event
// ring become log events. Split from `log.js`, which holds the table that uses them.

/**
 * Emits one `CoverConfig` event: the cover switch and the ring geometry, once at tick 0.
 * @param {import('./log.js').SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
export function emitCoverConfig(log, d, o) {
    log.log('info', 'CoverConfig', {
        tick: d[o + 1],
        coverConceals: d[o + 2] === 1,
        refugeCount: d[o + 3],
        aperturePx: d[o + 4],
        interiorRadius: d[o + 5],
    });
}

/**
 * Emits one `CoverTotals` event: agents in rings now, and the running agent-ticks, concealed ray hits.
 * @param {import('./log.js').SimLog} log the log
 * @param {Float64Array} d ring data
 * @param {number} o record offset
 * @returns {void}
 */
export function emitCoverTotals(log, d, o) {
    log.log('debug', 'CoverTotals', {
        tick: d[o + 1],
        agentsInRings: d[o + 2],
        agentTicksInRings: d[o + 3],
        concealedHits: d[o + 4],
    });
}
