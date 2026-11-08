// Generated liveness readings are exported for registry families to consume.

import { describe, expect, it } from 'vitest';
import { LIVENESS } from '../../../js/evo/metric-registry/liveness.js';

describe('generated metric liveness', () => {
    it('is frozen and holds either no baseline or a complete set of readings', () => {
        expect(Object.isFrozen(LIVENESS)).toBe(true);
        expect([0, 268]).toContain(Object.keys(LIVENESS).length);
        for (const reading of Object.values(LIVENESS)) {
            expect(reading.nullShare).toBeGreaterThanOrEqual(0);
            expect(reading.nullShare).toBeLessThanOrEqual(1);
            expect(reading.distinct).toBeGreaterThanOrEqual(0);
            expect(reading.report).toMatch(/^evals\//);
        }
    });
});
