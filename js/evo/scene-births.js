// Rule 1, the source of births (natural-selection.md, Detectors): `eval.birth_source_share.<split, mate, floor,
// immigrant, rescue, invasion>`, the share of the births after burn-in by `BORN_CAUSE`. A predator rescue and an
// invasion spawn their agents with `BORN_CAUSE.IMMIGRANT`, so they are counted from their own events
// (`PREDATOR_RESCUE`: one agent; `INVASION_ARRIVED`: `count` agents) and taken out of the immigrant share.

import { BORN_CAUSE, EVENT_TYPE } from '../sim/events.js';
import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';

/** The metric suffixes, in the order the doc names them. */
export const BIRTH_SOURCES = Object.freeze(['split', 'mate', 'floor', 'immigrant', 'rescue', 'invasion']);

/**
 * @returns {{rescue: number, invasion: number}} an empty scene
 */
export function createBirthScene() {
    return { rescue: 0, invasion: 0 };
}

/**
 * Counts a rescue or invasion event at or after burn-in; any other record is ignored.
 * @param {{rescue: number, invasion: number}} scene the birth scene
 * @param {Float64Array} d the event data
 * @param {number} o the record offset
 * @returns {void}
 */
export function noteBirthSource(scene, d, o) {
    if (d[o + 1] < BURN_IN_TICKS) {
        return;
    }
    if (d[o] === EVENT_TYPE.PREDATOR_RESCUE) {
        scene.rescue += 1;
    } else if (d[o] === EVENT_TYPE.INVASION_ARRIVED) {
        scene.invasion += d[o + 2];
    }
}

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} one share per source
 */
export function birthSourceMetrics(observer) {
    const after = observer.birthsAfterBurnIn;
    const { rescue, invasion } = observer.scenes.births;
    let total = 0;
    for (let cause = 0; cause < after.length; cause++) {
        total += after[cause];
    }
    const counts = [
        after[BORN_CAUSE.SPLIT],
        after[BORN_CAUSE.MATE],
        after[BORN_CAUSE.FLOOR],
        after[BORN_CAUSE.IMMIGRANT] - rescue - invasion,
        rescue,
        invasion,
    ];
    return Object.fromEntries(
        BIRTH_SOURCES.map((name, i) => [
            `eval.birth_source_share.${name}`,
            total > 0 ? ok(counts[i] / total) : none('no birth after burn-in'),
        ]),
    );
}
