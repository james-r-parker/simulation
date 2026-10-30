// Rule 1, the source of births (natural-selection.md, Detectors): `eval.birth_source_share.<split, mate, floor,
// immigrant>`, the share of the births after burn-in by `BORN_CAUSE`. The floor guard is the only source of `floor`
// births, and no code spawns `immigrant` births any more, so that share reads 0.

import { BORN_CAUSE } from '../sim/events.js';
import { none, ok } from './metrics-stats.js';

/** The metric suffixes, in the order the doc names them. */
export const BIRTH_SOURCES = Object.freeze(['split', 'mate', 'floor', 'immigrant']);

/**
 * @param {Record<string, any>} observer the observer
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} one share per source
 */
export function birthSourceMetrics(observer) {
    const after = observer.birthsAfterBurnIn;
    let total = 0;
    for (let cause = 0; cause < after.length; cause++) {
        total += after[cause];
    }
    const counts = [
        after[BORN_CAUSE.SPLIT],
        after[BORN_CAUSE.MATE],
        after[BORN_CAUSE.FLOOR],
        after[BORN_CAUSE.IMMIGRANT],
    ];
    return Object.fromEntries(
        BIRTH_SOURCES.map((name, i) => [
            `eval.birth_source_share.${name}`,
            total > 0 ? ok(counts[i] / total) : none('no birth after burn-in'),
        ]),
    );
}
