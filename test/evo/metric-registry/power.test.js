import { describe, expect, it } from 'vitest';
import { POWER } from '../../../js/evo/metric-registry/power.js';
import { minSeedsFromPower } from '../../../js/evo/metric-registry/status.js';

describe('generated metric power readings', () => {
    it('uses the registry power shape and delegates the seed minimum to the shared bar', () => {
        for (const [name, power] of Object.entries(POWER)) {
            expect(name.startsWith('eval.')).toBe(true);
            expect(Object.keys(power)).toEqual([
                'fpr16',
                'fpr32',
                'fpr64',
                'mde16',
                'mde32',
                'mde64',
                'referenceMean',
                'report',
            ]);
            expect(
                [power.fpr16, power.fpr32, power.fpr64, power.mde16, power.mde32, power.mde64].every(
                    (value) => value === null || typeof value === 'number',
                ),
            ).toBe(true);
            expect(power.referenceMean).toEqual(expect.any(Number));
            expect(power.report).toEqual(expect.any(String));
        }
        expect(POWER['eval.hunter_catches_per_1k'].mde64).not.toBeNull();
        expect(
            minSeedsFromPower({
                unit: 'count',
                power: { fpr16: 0.05, fpr32: 0.05, mde16: 0.1, mde32: 0.2, referenceMean: 10, report: 'r' },
            }),
        ).toBe(16);
    });
});
