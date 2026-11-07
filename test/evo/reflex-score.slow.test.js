import { describe, expect, it } from 'vitest';
import { REFLEX_CASES } from '../../js/evo/reflex-cases.js';
import { MAX_BAR, REFERENCE_MIN, evalCase } from '../../js/evo/reflex-score.js';

describe('every case is valid', () => {
    for (const reflexCase of REFLEX_CASES) {
        it(`${reflexCase.name}: the reference passes, the random brains and constants do not (seeds 1, 2, 101, 116)`, () => {
            for (const seed of [1, 2, 101, 116]) {
                const { bars } = evalCase(reflexCase, [], { seed });
                expect(bars.reference, `reference, seed ${seed}`).toBeGreaterThanOrEqual(REFERENCE_MIN);
                expect(bars.random, `random mean, seed ${seed}`).toBeLessThanOrEqual(MAX_BAR);
                expect(bars.constant, `constant bar, seed ${seed}`).toBeLessThanOrEqual(MAX_BAR);
                expect(bars.valid).toBe(true);
            }
        });
    }
});
