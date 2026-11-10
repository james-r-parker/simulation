// Generated liveness readings are exported for registry families to consume, and every reading that misses the
// liveness bar is triaged (docs/designs/metric-trust.md, T24).

import { describe, expect, it } from 'vitest';
import { LIVENESS } from '../../../js/evo/metric-registry/liveness.js';
import { METRICS } from '../../../js/evo/metric-registry/index.js';
import { meetsLivenessBar } from '../../../js/evo/metric-registry/status.js';

describe('generated metric liveness', () => {
    it('is frozen and holds readings only for registered metrics', () => {
        expect(Object.isFrozen(LIVENESS)).toBe(true);
        expect(Object.keys(LIVENESS).filter((name) => !Object.hasOwn(METRICS, name))).toEqual([]);
        for (const reading of Object.values(LIVENESS)) {
            expect(reading.nullShare).toBeGreaterThanOrEqual(0);
            expect(reading.nullShare).toBeLessThanOrEqual(1);
            expect(reading.distinct).toBeGreaterThanOrEqual(0);
            expect(reading.report).toMatch(/^evals\//);
        }
    });

    it('gives every metric that misses the liveness bar an expectedFlat reason unless it is deprecated', () => {
        const untriaged = Object.entries(METRICS)
            .filter(([, entry]) => entry.liveness !== null && !meetsLivenessBar(entry.liveness))
            .filter(([, entry]) => entry.expectedFlat === null && entry.deprecated === null)
            .map(([name]) => name);
        expect(untriaged).toEqual([]);
    });
});
