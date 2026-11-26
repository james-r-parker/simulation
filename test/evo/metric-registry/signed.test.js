// The `signed` flag of the registry against the shared baseline (docs/designs/metric-noise.md, T30).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { METRICS as REGISTRY } from '../../../js/evo/metric-registry/index.js';
import { withCurrentNames } from '../../../js/evo/metric-registry/renames.js';

/** @type {Readonly<Record<string, import('../../../js/evo/metric-registry/entry.js').MetricEntry>>} */
const METRICS = REGISTRY;
const BASELINE = 'evals/power/defaults-floor-on-E276.json';
const report = withCurrentNames(
    JSON.parse(readFileSync(new URL(`../../../${BASELINE}`, import.meta.url), 'utf8')),
    METRICS,
);

/** Units that are a difference, a change, a slope, a balance or a correlation by definition: signed even if no seed of the baseline went below 0. */
const SIGNED_BY_DEFINITION = new Set([
    'share difference',
    'share change',
    'slope',
    'speed change over max speed',
    'balance',
    'catch per prior chase',
    'correlation',
    'trend',
]);

/** @param {string} name a metric @returns {number} the lowest non-null seed value, `Infinity` when none */
const lowest = (name) =>
    Math.min(...report.metrics[name].values.filter((/** @type {number | null} */ v) => v !== null));

describe('the signed flag', () => {
    it('is set on every metric with a seed below 0 in the E276 baseline', () => {
        const missing = Object.keys(report.metrics).filter((name) => lowest(name) < 0 && METRICS[name].signed !== true);
        expect(missing).toEqual([]);
    });

    it('is set on a metric that never goes below 0 only when its unit is a difference, change, slope, balance or correlation', () => {
        const odd = Object.entries(METRICS)
            .filter(([name, e]) => e.signed === true && !(lowest(name) < 0) && !SIGNED_BY_DEFINITION.has(e.unit))
            .map(([name]) => name);
        expect(odd).toEqual([]);
    });

    it('is set on every metric of a difference, change, slope, balance or correlation unit', () => {
        const unset = Object.entries(METRICS)
            .filter(([, e]) => SIGNED_BY_DEFINITION.has(e.unit) && e.signed !== true)
            .map(([name]) => name);
        expect(unset).toEqual([]);
    });

    it('names the ten metrics the T19 review found in a shared unit', () => {
        for (const name of [
            'eval.mother_wait_by_condition',
            'eval.hunter_size_choice',
            'eval.chase_net_energy',
            'eval.chase_failed_energy',
            'eval.kin_nearby_threat_gain',
            'eval.social_return',
            'eval.mate_rank_gap',
            'eval.rare_input_saturation_jump',
            'eval.winter_shelter_distance',
            'eval.hunter_slow_choice',
        ]) {
            expect(METRICS[name].signed, name).toBe(true);
        }
    });
});
