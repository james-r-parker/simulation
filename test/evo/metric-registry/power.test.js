import { describe, expect, it } from 'vitest';
import { POWER } from '../../../js/evo/metric-registry/power.js';
import { minSeedsFromPower } from '../../../js/evo/metric-registry/status.js';

describe('generated metric power readings', () => {
    it('uses the registry power shape and delegates the seed minimum to the shared bar', () => {
        for (const [name, power] of Object.entries(POWER)) {
            expect(name.startsWith('eval.')).toBe(true);
            expect(power).toMatchObject({
                fpr16: expect.anything(),
                fpr32: expect.anything(),
                mde16: expect.anything(),
                mde32: expect.anything(),
                referenceMean: expect.any(Number),
                report: expect.any(String),
            });
        }
        expect(
            minSeedsFromPower({
                unit: 'count',
                power: { fpr16: 0.05, fpr32: 0.05, mde16: 0.1, mde32: 0.2, referenceMean: 10, report: 'r' },
            }),
        ).toBe(16);
    });
});
