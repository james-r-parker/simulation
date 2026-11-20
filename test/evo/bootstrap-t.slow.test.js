// Seeded null calibration of the verdict interval (metric-noise.md D4): on pure-noise differences the share of 95%
// intervals that exclude 0 must stay near 5% at 16, 32 and 64 seeds. The BCa interval alone read 9.3% at 16 seeds.

import { describe, expect, it } from 'vitest';
import { bootstrapInterval } from '../../js/evo/compare.js';
import { createRng, fork, nextInt } from '../../js/sim/rng.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 600;
/** The null false-positive rate the plan holds the 16-seed verdict interval under. */
const BAR = 0.065;

/**
 * @param {number} size seeds per sample
 * @returns {number} the share of `TRIALS` normal null samples whose interval excludes 0
 */
function nullRate(size) {
    const rng = fork(createRng(11), `cal-${size}`);
    const u = () => (nextInt(rng, 1 << 30) + 0.5) / (1 << 30);
    const normal = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    let excluded = 0;
    for (let t = 0; t < TRIALS; t++) {
        const { low, high } = bootstrapInterval(Array.from({ length: size }, normal));
        excluded += low > 0 || high < 0 ? 1 : 0;
    }
    return excluded / TRIALS;
}

describe('the verdict interval on null data', () => {
    it.each([16, 32, 64])('excludes 0 in under 6.5% of %i-seed samples', { timeout: scaleTimeout(60_000) }, (size) => {
        expect(nullRate(size)).toBeLessThan(BAR);
    });
});
