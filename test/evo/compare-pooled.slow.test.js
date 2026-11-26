// Seeded null calibration of the pooled interval (metric-noise.md D4 and D7): two independent arms with the same
// skewed denominators and a per-seed rate near 0.63, so the share of 95% intervals that exclude 0 must stay near 5%.
// The BCa interval alone read 12.7% at 16 seeds on a real pooled report.

import { describe, expect, it } from 'vitest';
import { pooledInterval } from '../../js/evo/compare-pooled.js';
import { createRng, fork, nextInt } from '../../js/sim/rng.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 600;
const BAR = 0.065;

/**
 * @param {number} size seeds per arm
 * @returns {number} the share of `TRIALS` null pooled samples whose interval excludes 0
 */
function nullRate(size) {
    const rng = fork(createRng(13), `pooled-cal-${size}`);
    const u = () => (nextInt(rng, 1 << 30) + 0.5) / (1 << 30);
    const normal = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const cell = () => {
        const den = 900_000 * Math.exp(0.7 * normal());
        const rate = Math.min(0.98, Math.max(0.05, 0.63 + 0.15 * normal()));
        return { num: rate * den, den };
    };
    let excluded = 0;
    for (let t = 0; t < TRIALS; t++) {
        const before = Array.from({ length: size }, cell);
        const after = Array.from({ length: size }, cell);
        const { low, high } = pooledInterval(before, after, { level: 0.95, resamples: 1000 });
        excluded += low > 0 || high < 0 ? 1 : 0;
    }
    return excluded / TRIALS;
}

describe('the pooled interval on null data', () => {
    it.each([16, 32, 64])('excludes 0 in under 6.5% of %i-seed samples', { timeout: scaleTimeout(120_000) }, (size) => {
        const rate = nullRate(size);
        console.log(`pooled null rate ${size}: ${rate}`);
        expect(rate).toBeLessThan(BAR);
    });
});
