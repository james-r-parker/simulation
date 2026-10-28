// The diversity group of `fitnessV6` (fitness-and-selection.md "Fitness v6"): a frequency-dependent factor on the
// fitness at death. A niche is the specialisation and the tercile of the size trait (15 niches; 5 with `traitsEnabled`
// off). The factor reads the niche's share of the alive agents at the latest checkpoint, so a death reads one number:
// `tallyNiches` rebuilds the shares once per checkpoint (one pass over the slots the checkpoint already walks) and
// nothing allocates after `createNicheTally`. Pure: no clock, no randomness.

import { SPEC_COUNT } from '../sim/spec-rescue.js';

/** The diversity constants of the doc's constants table, named so a change is one visible edit. */
export const FITNESS_V6_DIVERSITY = Object.freeze({
    DIVERSITY: 0.5,
    /** The size multiplier below which an agent is in the small tercile. */
    SIZE_LOW: 0.9,
    /** The size multiplier above which an agent is in the large tercile. */
    SIZE_HIGH: 1.1,
});

/** Size terciles per specialisation. */
const TERCILES = 3;

/**
 * @param {number} spec the specialisation index
 * @param {number} sizeMultiplier the size trait as a multiple of the default `baseSize` (ignored when traits are off)
 * @param {boolean} traitsEnabled whether the config has traits on
 * @param {Record<string, number>} [weights] `FITNESS_V6_DIVERSITY` entries (the size cut points)
 * @returns {number} the niche index: `spec` with traits off, else `spec * 3` plus the size tercile (0 small, 1 mid, 2 large)
 */
export function nicheOf(spec, sizeMultiplier, traitsEnabled, weights = FITNESS_V6_DIVERSITY) {
    if (!traitsEnabled) {
        return spec;
    }
    let tercile = 1;
    if (sizeMultiplier < weights.SIZE_LOW) {
        tercile = 0;
    } else if (sizeMultiplier > weights.SIZE_HIGH) {
        tercile = 2;
    }
    return spec * TERCILES + tercile;
}

/**
 * @param {boolean} traitsEnabled whether the config has traits on
 * @returns {{count: number, shares: Float64Array}} a tally with the niche count and a zero share per niche
 */
export function createNicheTally(traitsEnabled) {
    const count = traitsEnabled ? SPEC_COUNT * TERCILES : SPEC_COUNT;
    return { count, shares: new Float64Array(count) };
}

/**
 * Sets each niche's share of the alive agents; all shares are 0 when none is alive. Run at a checkpoint.
 * @param {{count: number, shares: Float64Array}} tally the tally from `createNicheTally`
 * @param {Record<string, any>} world the world (`alive`, `spec`, `baseSize`, `config`)
 * @param {Record<string, number>} [weights] `FITNESS_V6_DIVERSITY` entries
 * @returns {void}
 */
export function tallyNiches(tally, world, weights = FITNESS_V6_DIVERSITY) {
    const { shares } = tally;
    const { traitsEnabled, baseSize } = world.config;
    shares.fill(0);
    let alive = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            shares[nicheOf(world.spec[slot], world.baseSize[slot] / baseSize, traitsEnabled, weights)]++;
            alive++;
        }
    }
    if (alive > 0) {
        for (let i = 0; i < shares.length; i++) {
            shares[i] /= alive;
        }
    }
}

/**
 * Binds the weight to the factor.
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6_DIVERSITY` entries
 * @returns {{
 *   weights: Record<string, number>,
 *   factor: (tally: {count: number, shares: Float64Array}, niche: number) => number,
 * }}
 */
export function createDiversityGroup(overrides) {
    const w = { ...FITNESS_V6_DIVERSITY, ...overrides };
    const lo = 1 - w.DIVERSITY / 2;
    const hi = 1 + w.DIVERSITY;
    return {
        weights: w,
        // 1 + DIVERSITY x (1 - share x count), clamped to [1 - DIVERSITY / 2, 1 + DIVERSITY]
        factor: (tally, niche) => Math.min(hi, Math.max(lo, 1 + w.DIVERSITY * (1 - tally.shares[niche] * tally.count))),
    };
}
