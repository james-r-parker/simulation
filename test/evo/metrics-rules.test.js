// The rule metrics as a set: names, directions, the three that wait for the proof rule, and their place in the
// selection metrics and the compare table. Each detector's value is tested beside its `scene-*.js` module.

import { describe, expect, it } from 'vitest';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { RULE_DIRECTIONS, ruleMetrics } from '../../js/evo/metrics-rules.js';
import { selectionMetrics } from '../../js/evo/metrics-selection.js';
import { observed } from './helpers/observer-world.js';
import { EMPTY_WORLD } from './helpers/metrics-observer.js';

describe('the rule metrics', () => {
    it('are the Detectors table names, all watch in the compare table', () => {
        const names = Object.keys(ruleMetrics(observed().observer)).sort();
        expect(names).toEqual(Object.keys(RULE_DIRECTIONS).sort());
        expect(names).toHaveLength(14);
        for (const name of names) {
            expect(metricDirection(name), name).toBe('watch');
        }
        expect(names).toContain('eval.birth_source_share.invasion');
    });

    it('read null with the T6 reason for the proof-rule metrics, and have a reason everywhere on a fresh observer', () => {
        const metrics = ruleMetrics(observed().observer);
        for (const name of ['lineage_persistence', 'proven_share', 'established_share']) {
            expect(metrics[`eval.${name}`].value, name).toBeNull();
            expect(metrics[`eval.${name}`].reason, name).toContain('T6');
        }
        for (const [name, result] of Object.entries(metrics)) {
            expect(result.value, name).toBeNull();
            expect(result.reason, name).toBeTypeOf('string');
        }
    });

    it('are merged into the selection metrics and computeMetrics', () => {
        const o = observed().observer;
        const selection = selectionMetrics(o);
        const all = computeMetrics(o, EMPTY_WORLD);
        for (const name of Object.keys(RULE_DIRECTIONS)) {
            expect(selection, name).toHaveProperty([name]);
            expect(all, name).toHaveProperty([name]);
        }
    });
});
