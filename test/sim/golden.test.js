import { describe, expect, it } from 'vitest';
import { golden, runGolden } from './golden-run.js';

const TIMEOUT_MS = 30_000;

// The short golden runs: the same cases as golden.slow.test.js cut to a few hundred ticks, so every PR's fast tests
// check bit-exact determinism. The full 5000-tick runs stay in the slow tier.
for (const testCase of golden.shortCases) {
    describe(`short golden run: ${testCase.name}`, () => {
        it(
            'reaches the pinned world hash with invariants holding',
            () => {
                expect(runGolden(testCase)).toBe(testCase.worldHash);
            },
            TIMEOUT_MS,
        );
    });
}
