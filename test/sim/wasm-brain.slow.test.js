// The full golden runs and the headless end-to-end run with the WASM brain kernel (docs/designs/wasm-kernels.md).
import { describe, expect, it } from 'vitest';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { golden } from './golden-run.js';
import { runCase, stepPair } from './helpers/wasm-run.js';

const TIMEOUT_MS = scaleTimeout(600_000);

describe('the WASM brain kernel over long runs', () => {
    for (const testCase of golden.cases) {
        it(
            `reaches the pinned golden hash with the switch on (${testCase.name}, ${testCase.ticks} ticks)`,
            () => {
                const { hash, attached } = runCase(testCase, { wasm: true });
                expect(attached).toBe(true);
                expect(hash).toBe(testCase.worldHash);
            },
            TIMEOUT_MS,
        );
    }

    it(
        'matches the JS kernel every tick for 2000 ticks of the default world, seed 1',
        () => {
            const { mismatches, jsHash, wasmHash } = stepPair({}, 2000);
            expect(mismatches).toEqual([]);
            expect(wasmHash).toBe(jsHash);
        },
        TIMEOUT_MS,
    );
});
