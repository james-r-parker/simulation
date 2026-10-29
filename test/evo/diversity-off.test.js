// The diversity factor is off at `fitnessOverrides.DIVERSITY` 0 (natural-selection.md T10a). `fitnessOverrides` is how
// screens vary the `fitnessV6` weights (`pick(FITNESS_V6_DIVERSITY, overrides)` in `fitness-v6.js`); at 0 the factor is
// exactly 1 whatever the niche's share, so a death in a rare niche is paid as a death in a common one.

import { describe, expect, it } from 'vitest';
import { createFitnessV6 } from '../../js/evo/fitness-v6.js';
import { createDiversityGroup, createNicheTally } from '../../js/evo/fitness-v6-diversity.js';
import { validatePolicyOptions } from '../../js/evo/policy-options.js';

const INTENT = [
    'deliberateFood',
    'deliberateBite',
    'chanceFood',
    'chanceBite',
    'respondedEscape',
    'idleSignal',
    'undefendedBite',
    'deliberateKills',
    'convergedKills',
    'alarmCredits',
    'huntCredits',
];

const config = {
    specialisations: Object.fromEntries(
        ['forager', 'predator', 'reproducer', 'scout', 'defender'].map((name, index) => [name, { index }]),
    ),
};

/**
 * A hand-built death in niche 1 (a rare niche: one agent in twenty) with a known fitness before the factor, and a tally
 * in which niche 0 holds the other nineteen.
 * @param {boolean} withTally whether the observer carries the checkpoint's niche tally
 * @returns {any} the observer
 */
function rareDeath(withTally) {
    const tally = createNicheTally(false);
    tally.shares[0] = 0.95;
    tally.shares[1] = 0.05;
    return {
        intent: Object.fromEntries(INTENT.map((k) => [k, Float64Array.of(k === 'deliberateFood' ? 1000 : 0)])),
        spec: Uint8Array.of(99),
        ageTicks: Float64Array.of(100),
        children: Uint32Array.of(0),
        matings: Uint32Array.of(0),
        maturedChildren: Uint32Array.of(0),
        descendantsAlive: Uint32Array.of(0),
        chaseTicks: Uint32Array.of(0),
        packKills: Uint32Array.of(0),
        niche: Uint8Array.of(1),
        watch: { visited: Uint32Array.of(0) },
        nicheTally: withTally ? tally : undefined,
    };
}

describe('the diversity factor at DIVERSITY 0', () => {
    it('is how a screen varies the weight: the policy option is accepted and names a fitnessV6 weight', () => {
        expect(validatePolicyOptions('map-elites-v6', { fitnessOverrides: { DIVERSITY: 0 } })).toEqual({
            fitnessOverrides: { DIVERSITY: 0 },
        });
        expect(() => validatePolicyOptions('map-elites-v6', { fitnessOverrides: { DIVERSITYY: 0 } })).toThrow(
            /not a fitnessV6 weight/,
        );
        expect(createFitnessV6({}, { DIVERSITY: 0 }).weights.DIVERSITY).toBe(0);
        expect(createFitnessV6({}).weights.DIVERSITY).toBe(0.5);
    });

    it('is exactly 1 in every niche, rare or common', () => {
        const tally = createNicheTally(false);
        tally.shares[0] = 0.95;
        tally.shares[1] = 0.05;
        const off = createDiversityGroup({ DIVERSITY: 0 });
        expect(off.factor(tally, 0)).toBe(1);
        expect(off.factor(tally, 1)).toBe(1);
        expect(off.factor(tally, 4)).toBe(1);
        const on = createDiversityGroup({ DIVERSITY: 0.5 });
        expect(on.factor(tally, 1)).toBeGreaterThan(1);
        expect(on.factor(tally, 0)).toBeLessThan(1);
    });

    it('pays a death in a rare niche what it would be paid with no tally at all', () => {
        const bare = createFitnessV6({}, { DIVERSITY: 0 })(rareDeath(false), 0, config);
        const off = createFitnessV6({}, { DIVERSITY: 0 })(rareDeath(true), 0, config);
        const on = createFitnessV6({}, {})(rareDeath(true), 0, config);
        expect(bare).toBe(1050);
        expect(off).toBe(bare);
        expect(on).toBeGreaterThan(bare);
        expect(
            createFitnessV6({}, { DIVERSITY: 0 }).parts(rareDeath(true), 0, config, /** @type {any} */ ({}))
                .diversityFactor,
        ).toBe(1);
    });
});
