import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { SOCIAL_DRILLS } from '../../js/evo/drill-scenarios-social.js';
import { drillSubject, randomBrains } from '../../js/evo/drill.js';
import { oracleSubject } from '../../js/evo/lesson-oracles.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TRIALS = 8;
const byName = (/** @type {string} */ name) => /** @type {any} */ (SOCIAL_DRILLS.find((d) => d.name === name));
const zeroBrain = () => ({
    name: 'zero',
    id: 7,
    spec: null,
    weights: new Float32Array(brainLayout(createConfig({})).weightCount),
    act: null,
});

describe('the social drills are valid: the scripted subject wins, random and still brains do not', () => {
    for (const [name, subject, floor] of /** @type {[string, () => any, number][]} */ ([
        ['prey-crossing', () => referenceSubject('input-reader'), 0.6],
        ['prey-crossing', () => oracleSubject('prey-crossing'), 0.3],
        ['hunter-flank', () => oracleSubject('hunter-flank'), 0.5],
    ])) {
        it(
            `${name}: ${subject().name} wins at least ${floor} of ${TRIALS} trials`,
            () => {
                expect(drillSubject(byName(name), subject(), { trials: TRIALS }).winShare).toBeGreaterThanOrEqual(
                    floor,
                );
            },
            scaleTimeout(60_000),
        );
    }

    for (const name of ['prey-crossing', 'hunter-flank']) {
        it(
            `${name}: no random brain and no still brain wins a trial`,
            () => {
                const drill = byName(name);
                for (const brain of [...randomBrains(drill), zeroBrain()]) {
                    const subject = { ...brain, spec: drill.spec };
                    expect(drillSubject(drill, subject, { trials: TRIALS }).wins).toBe(0);
                }
            },
            scaleTimeout(60_000),
        );
    }

    it(
        'replays from its seed',
        () => {
            const drill = byName('prey-crossing');
            const subject = referenceSubject('input-reader');
            const a = drillSubject(drill, subject, { trials: 4, seed: 3 });
            expect(drillSubject(drill, subject, { trials: 4, seed: 3 })).toEqual(a);
        },
        scaleTimeout(60_000),
    );
});
