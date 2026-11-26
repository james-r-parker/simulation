// The pooled hunter metrics (metric-noise.md Phase 2): a rate or share carried as per-seed numerator and denominator in
// the report (`report-pooled.js`), read as the ratio of sums with whole seeds resampled, beside the old metric it replaces.

import { entry } from './entry.js';

export const HUNTERS_POOLED = {
    'eval.bite_idle_pooled': entry('hunters', {
        module: 'js/evo/scene-bite.js',
        meaning:
            'Lower means hunters ask to bite with nothing in their jaws less often, across all the seeds of a run.',
        counts: "Pooled eval.bite_idle: the sum over seeds of hunter-ticks with no body in the jaws on which BITE is above 0, over the sum of hunter-ticks with no body in the jaws; the report keeps each seed's two sums, and a seed with none adds no exposure.",
        unit: 'share',
        direction: 'lower',
        nullWhen: ['<n> hunter-ticks with that body in the jaws (a share needs 1)'],
        arithmetic: 'test/evo/scene-bite.test.js',
        source: 'test/evo/metric-source-hunter-bites-pooled.test.js',
    }),
};
