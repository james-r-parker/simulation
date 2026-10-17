import { describe, expect, it } from 'vitest';
import { golden, runGolden } from './golden-run.js';

const TIMEOUT_MS = 120_000;

// "default" is the shipped config; "busy" is a crowded world where random brains meet, so mating, splits, bites, the
// floor and immigrants all happen within the run and the hash guards them too.
for (const testCase of golden.cases) {
    describe(`golden run: ${testCase.name}`, () => {
        it(
            'reaches the pinned world hash with invariants holding',
            () => {
                expect(runGolden(testCase)).toBe(testCase.worldHash);
            },
            TIMEOUT_MS,
        );
    });
}
