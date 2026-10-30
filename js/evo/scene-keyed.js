// Rows of running sums keyed by a number (a lineage id, a lineage and specialisation): a Map from key to row and a
// growable column log. A row is added the first time its key is seen, so the cost is one Map entry per new key and
// nothing per later visit. The scene detectors keep their per-lineage tallies here.

import { createLog, ensureRoom } from './growable-log.js';

/** @typedef {{index: Map<number, number>, rows: number, log: import('./growable-log.js').Log}} Keyed */

/**
 * @param {string[]} columns the column names, each a `Float64Array` that starts at 0
 * @returns {Keyed} an empty table
 */
export function createKeyed(columns) {
    return { index: new Map(), rows: 0, log: createLog(columns, 16) };
}

/**
 * @param {Keyed} table the table
 * @param {number} key the key
 * @returns {number} the key's row; read the columns from `table.log` after the call (it may have grown them)
 */
export function rowOf(table, key) {
    const found = table.index.get(key);
    if (found !== undefined) {
        return found;
    }
    const row = table.rows++;
    ensureRoom(table.log, row);
    table.index.set(key, row);
    return row;
}
