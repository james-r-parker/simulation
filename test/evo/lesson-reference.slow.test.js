import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillSubject } from '../../js/evo/drill.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 8;
/** Drills that need more trials: `prey-ahead` stages the prey at a share of the predator's view, so since the forward
 * 400 eye (senses-and-motor E186) the reader wins about 0.69 of 32 trials and 8 trials sit at the floor by chance. */
const TRIALS_OF = { 'prey-ahead': 32 };
/** What the input reader must reach on `TRIALS` trials; 0 for a drill it is recorded as unable to win. */
const AT_LEAST = {
    'food-ahead': 0.9,
    'food-behind': 0.9,
    'two-foods': 0.6,
    'prey-ahead': 0.4,
    'prey-too-big': 0.9,
    'hunter-closing': 0,
    'prey-crossing': 0.6,
    'hunter-flank': 0,
    'rock-refuge': 0,
};

describe('the input reader against each drill', () => {
    for (const drill of DRILLS) {
        const floor = AT_LEAST[/** @type {keyof typeof AT_LEAST} */ (drill.name)];
        it(
            `${drill.name}: wins at least ${floor} of ${TRIALS_OF[/** @type {keyof typeof TRIALS_OF} */ (drill.name)] ?? TRIALS} trials`,
            () => {
                const { winShare } = drillSubject(drill, referenceSubject('input-reader'), {
                    trials: TRIALS_OF[/** @type {keyof typeof TRIALS_OF} */ (drill.name)] ?? TRIALS,
                });
                expect(winShare).toBeGreaterThanOrEqual(floor);
            },
            scaleTimeout(60_000),
        );
    }
});
