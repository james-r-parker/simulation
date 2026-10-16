// A column log of Float64Arrays that doubles when full; the observer's death log and checkpoint series use it.

/** @typedef {{capacity: number} & Record<string, any>} Log columns by name (Float64Array) plus `capacity` */

/**
 * @param {string[]} names the column names
 * @param {number} [capacity] the initial row capacity; a positive integer
 * @returns {Log} a log whose columns are zeroed `Float64Array`s of length `capacity`
 */
export function createLog(names, capacity = 64) {
    /** @type {Log} */
    const log = { capacity };
    for (const name of names) {
        log[name] = new Float64Array(capacity);
    }
    return log;
}

/**
 * Makes row `index` writable, doubling every column when `index` is at the capacity.
 * @param {Log} log the log
 * @param {number} index the row about to be written; at most `log.capacity`
 * @returns {void}
 */
export function ensureRoom(log, index) {
    if (index < log.capacity) {
        return;
    }
    const capacity = log.capacity * 2;
    for (const name of Object.keys(log)) {
        if (name !== 'capacity') {
            const grown = new Float64Array(capacity);
            grown.set(log[name]);
            log[name] = grown;
        }
    }
    log.capacity = capacity;
}
