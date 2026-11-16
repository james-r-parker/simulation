import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillSubject } from '../../js/evo/drill.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 8;
/** What each oracle must reach on `TRIALS` trials, or 0 for a drill it is recorded as unable to win. */
const AT_LEAST = {
    'food-ahead': 0.9,
    'food-behind': 0.9,
    'two-foods': 0.9,
    'prey-too-big': 0.9,
    'hunter-closing': 0.4,
    'prey-crossing': 0.3,
    'hunter-flank': 0.5,
    'prey-ahead': 0.1,
    'rock-refuge': 0,
};

describe('each oracle against its drill', () => {
    for (const drill of DRILLS) {
        it(
            `${drill.name}: wins at least ${AT_LEAST[/** @type {keyof typeof AT_LEAST} */ (drill.name)]} of ${TRIALS} trials`,
            () => {
                const { winShare } = drillSubject(drill, oracleSubject(drill.name), { trials: TRIALS });
                expect(winShare).toBeGreaterThanOrEqual(AT_LEAST[/** @type {keyof typeof AT_LEAST} */ (drill.name)]);
            },
            scaleTimeout(60_000),
        );
    }

    it(
        'is unable to win rock-refuge: the scripted hunter reaches an agent inside the ring',
        () => {
            const drill = /** @type {any} */ (DRILLS.find((d) => d.name === 'rock-refuge'));
            expect(drillSubject(drill, oracleSubject('rock-refuge'), { trials: TRIALS }).winShare).toBe(0);
        },
        scaleTimeout(60_000),
    );

    it(
        'replays from its seed',
        () => {
            const drill = DRILLS[0];
            const a = drillSubject(drill, oracleSubject(drill.name), { trials: 4, seed: 3 });
            expect(drillSubject(drill, oracleSubject(drill.name), { trials: 4, seed: 3 })).toEqual(a);
        },
        scaleTimeout(60_000),
    );
});
