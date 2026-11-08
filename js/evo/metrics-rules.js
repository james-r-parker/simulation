// The selection-rule metrics (natural-selection.md, Detectors): instruments for the rules of
// [principles.md](../../docs/principles.md) - where births come from, whether a skill is inherited, whether rare niches
// replace themselves, whether the social credit pays, and who is chosen to mate. All are `watch`. Three of them
// (`eval.proven_share`, `eval.established_share`, `eval.lineage_persistence`) read the proof rule (`scene-proof.js`).
// `metrics-selection.js` merges these into the selection metrics.

import { mateMetrics } from './scene-mate.js';
import { birthSourceMetrics } from './scene-births.js';
import { heritageMetrics } from './scene-heritage.js';
import { nicheMetrics } from './scene-niche.js';
import { proofMetrics } from './scene-proof.js';

/**
 * @param {Record<string, any>} observer the observer, fed every tick
 * @returns {import('./metrics-stats.js').MetricRecord} the rule metrics
 */
export function ruleMetrics(observer) {
    const s = observer.scenes;
    return {
        ...birthSourceMetrics(observer),
        ...heritageMetrics(s.heritage),
        ...nicheMetrics(s.niche),
        ...mateMetrics(s.mate),
        ...proofMetrics(s.proof),
    };
}
