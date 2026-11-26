// Seeded null calibration of the verdict interval (metric-noise.md D4 and D8): on pure-noise differences the share of
// 95% intervals that exclude 0 must stay near 5% at 16, 32 and 64 seeds on a normal shape (under 6.5%), and under a per-size ceiling on the
// skewed and zero-heavy shapes real metrics have. The BCa interval alone read 9.3% at 16 seeds on normal data.

import { describe, expect, it } from 'vitest';
import { bootstrapInterval } from '../../js/evo/compare.js';
import { createRng, fork, nextInt } from '../../js/sim/rng.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 600;
/** The null false-positive rate the plan holds the verdict interval under on normal data. */
const BAR = 0.065;
/**
 * The ceilings on the skewed shapes, per size. A mean-based interval cannot reach 5% on a heavy right skew at 16 to 64
 * seeds (D8 records the residual); each ceiling sits between the studentised rate and the BCa rate it replaced
 * (lognormal 10.3% at 32, 8.0% at 64; zero-inflated 13.5% at 32, 10.3% at 64).
 * @type {Record<string, Record<number, number>>}
 */
const CEILING = {
    normal: { 16: BAR, 32: BAR, 64: BAR },
    lognormal: { 16: 0.075, 32: 0.09, 64: 0.075 },
    zeroInflated: { 16: 0.08, 32: 0.095, 64: 0.085 },
};

/** @type {Record<string, (normal: () => number, u: () => number) => number>} one draw of each shape */
const SHAPES = {
    normal: (normal) => normal(),
    lognormal: (normal) => Math.exp(normal()),
    // About 45% zeros, the rest a skewed count around 3 with occasional values near 8x that, like eval.predators_at_end.
    zeroInflated: (normal, u) => (u() < 0.45 ? 0 : Math.round(3 * Math.exp(1.1 * normal()))),
};

/**
 * @param {string} shape a key of `SHAPES`
 * @param {number} size seeds per sample
 * @returns {number} the share of `TRIALS` mean-zero samples of that shape whose interval excludes 0
 */
function nullRate(shape, size) {
    const rng = fork(createRng(11), `cal-${shape}-${size}`);
    const u = () => (nextInt(rng, 1 << 30) + 0.5) / (1 << 30);
    const normal = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const draw = () => SHAPES[shape](normal, u);
    let centre = 0;
    for (let i = 0; i < 200_000; i++) {
        centre += draw() / 200_000;
    }
    let excluded = 0;
    for (let t = 0; t < TRIALS; t++) {
        const { low, high } = bootstrapInterval(Array.from({ length: size }, () => draw() - centre));
        excluded += low > 0 || high < 0 ? 1 : 0;
    }
    return excluded / TRIALS;
}

describe('the verdict interval on null data', () => {
    for (const shape of Object.keys(SHAPES)) {
        it.each([16, 32, 64])(
            `holds the ${shape} null rate under its ceiling at %i seeds`,
            { timeout: scaleTimeout(120_000) },
            (size) => {
                const rate = nullRate(shape, size);
                expect(rate, `${shape} at ${size}: ${rate}`).toBeLessThan(CEILING[shape][size]);
            },
        );
    }
});
