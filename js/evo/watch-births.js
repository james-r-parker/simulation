// The count behind `eval.predator_births`: children (cause `mate` or `split`) of a `canHunt` specialisation born at or
// after burn-in. Kept apart from `metrics-watch.js` because the event handling imports it.

import { BORN_CAUSE } from '../sim/events.js';

/**
 * Counts one `AgentBorn` record in `observer.watch.hunterBirths` when it is a mate or split birth at or after burn-in
 * whose specialisation has `canHunt`.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of the `AgentBorn`
 * @returns {void}
 */
export function noteHunterBirth(observer, d, o) {
    const cause = d[o + 8];
    if (d[o + 1] >= observer.lineage.burnIn && (cause === BORN_CAUSE.MATE || cause === BORN_CAUSE.SPLIT)) {
        observer.watch.hunterBirths += observer.combat.hunterSpec[d[o + 5]];
    }
}
