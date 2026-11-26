// The pooled hunter registry entries: complete fields, real module and source tests, and a pooled name beside its old one.

import { describe, expect, it } from 'vitest';
import { METRICS } from '../../../js/evo/metric-registry/index.js';
import { HUNTERS_POOLED } from '../../../js/evo/metric-registry/hunters-pooled.js';
import { describeFamily } from '../helpers/registry-family.js';

describeFamily('hunters', HUNTERS_POOLED);

describe('a pooled entry', () => {
    it.each(Object.keys(HUNTERS_POOLED))(
        '%s sits beside the old metric, which keeps its computation and name',
        (name) => {
            const old = name.replace(/_pooled$/, '');
            expect(Object.hasOwn(METRICS, old)).toBe(true);
            const [a, b] = [
                METRICS[/** @type {keyof typeof METRICS} */ (old)],
                METRICS[/** @type {keyof typeof METRICS} */ (name)],
            ];
            expect([b.unit, b.direction, b.module]).toEqual([a.unit, a.direction, a.module]);
            // Measured on its own report cells (E278), not inherited from the old metric.
            expect(b.liveness).not.toBeNull();
            expect(b.power).not.toBeNull();
            expect(b.power).not.toEqual(a.power);
        },
    );
});
