// The evidence behind the gate conditions the ladder leaves out (training-stages.md, Gates, Validity). The ladder's own
// conditions are read in gate-validity-a, -b and -c.slow.test.js, one drill group each (helpers/gate-validity-ladder.js).

import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../js/evo/drill-scenarios.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { gateValidity } from '../../js/evo/gate-validity.js';
import { kinSparingSubject } from '../../js/evo/lesson-reference.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const drillOf = (/** @type {string} */ name) => /** @type {any} */ (DRILLS.find((d) => d.name === name));

describe('the pack gate that the ladder leaves out', () => {
    it(
        'has no reference that passes gainLow or blindGapLow: a lone scripted hunter wins as often as the trio',
        () => {
            const pack = [
                {
                    name: 'pack',
                    config: null,
                    minGenerations: 1,
                    maxGenerations: 2,
                    gate: [
                        { read: 'drill.pack-converge.gainLow', min: 0.001 },
                        { read: 'drill.pack-converge.blindGapLow', min: 0.001 },
                    ],
                },
            ];
            const rows = gateValidity(/** @type {any} */ (pack), { trials: 32 });
            expect(rows.map((r) => r.level)).toEqual(['none', 'none']);
        },
        scaleTimeout(60000),
    );
});

describe('the kin-sparing reference', () => {
    it(
        'wins `kin-spared` without wishing a bite on its sibling, where random brains win none',
        () => {
            const drill = drillOf('kin-spared');
            const reasons = /** @type {Record<string, number>} */ ({});
            const log = /** @type {any} */ ({
                log: (/** @type {string} */ _l, /** @type {string} */ _e, /** @type {any} */ f) => {
                    if (!f.won) {
                        reasons[f.reason] = (reasons[f.reason] ?? 0) + 1;
                    }
                },
            });
            const score = drillSubject(drill, kinSparingSubject(), { seed: 1, trials: 32, log });
            expect(score.winShare).toBeGreaterThan(0.4);
            expect(reasons['bit-kin'] ?? 0).toBe(0);
            const random = randomBrains(drill, { seed: 1 }).map((b) => drillSubject(drill, b, { seed: 1, trials: 32 }));
            expect(random.reduce((sum, s) => sum + s.wins, 0)).toBe(0);
        },
        scaleTimeout(60000),
    );
});
