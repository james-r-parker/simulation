// The dominance metrics (fitness-and-selection.md, New metrics): how concentrated the population is in one
// specialisation or lineage. Each reads the pools `checkpoint` fills from the alive agents at every checkpoint at or
// after burn-in, so a share is a share of sampled agent-ticks, the same pooling `eval.lineages_alive` and
// `eval.diversity` use. Report-time only: nothing here runs per tick.

import { detExp, detLog } from '../sim/det-math.js';
import { none, ok } from './metrics-stats.js';

const NO_SAMPLE = 'no checkpoint after burn-in with an alive agent';

/**
 * @param {Iterable<number>} counts pooled counts per group
 * @returns {{dominance: number, effective: number} | null} the largest share and `exp` of the Shannon entropy of the
 *   shares; `null` when nothing was pooled
 */
function summarise(counts) {
    let total = 0;
    let top = 0;
    let nLogN = 0;
    for (const n of counts) {
        total += n;
        top = Math.max(top, n);
        nLogN += n > 0 ? n * detLog(n) : 0;
    }
    if (total === 0) {
        return null;
    }
    if (top === total) {
        return { dominance: 1, effective: 1 }; // a monoculture, exactly (the log form can round to 1 - 1e-16)
    }
    // One pass (the counts may be an iterator): H = ln(total) - sum(n ln n) / total
    const entropy = detLog(total) - nLogN / total;
    return { dominance: top / total, effective: detExp(entropy) };
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed during the run
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the four dominance metrics, keyed by name; all
 *   `null` when no checkpoint at or after burn-in had an alive agent
 */
export function dominanceMetrics(observer) {
    const { specSamples, lineageSamples } = observer.dominance;
    const spec = summarise(specSamples);
    const lineage = summarise(lineageSamples.values());
    return {
        'eval.spec_dominance': spec === null ? none(NO_SAMPLE) : ok(spec.dominance),
        'eval.spec_effective': spec === null ? none(NO_SAMPLE) : ok(spec.effective),
        'eval.lineage_dominance': lineage === null ? none(NO_SAMPLE) : ok(lineage.dominance),
        'eval.lineage_effective': lineage === null ? none(NO_SAMPLE) : ok(lineage.effective),
    };
}
