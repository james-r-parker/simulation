import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { referenceSubject } from '../../js/evo/memory-probe-references.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { evalReflex } from '../../js/evo/reflex-eval.js';
import { createKindTally, kindScores, noteBite, notePass } from '../../js/evo/reflex-kind-tally.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';

const TRIALS = 4;
const table = buildCaseTable(caseNamed('bite-discrimination'), { trials: TRIALS });

/**
 * @param {string} name a label
 * @param {number} bite the BITE output every slot holds
 * @returns {import('../../js/evo/reflex-eval.js').ReflexSubject} a scripted subject
 */
function constantBite(name, bite) {
    return {
        name,
        id: 1,
        weights: null,
        act(world) {
            for (let slot = 0; slot < world.alive.length; slot++) {
                world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bite;
            }
        },
    };
}

/**
 * @param {import('../../js/evo/reflex-eval.js').ReflexSubject} subject a subject
 * @returns {Record<string, import('../../js/evo/reflex-kind-tally.js').KindScore>} its kinds on bite-discrimination
 */
function kindsOf(subject) {
    return evalReflex([subject], [table])[0]['bite-discrimination'].kinds;
}

describe('per-kind scores of bite-discrimination', () => {
    it('lists the prey, too-big and kin stagings, each played twice a trial (drawn and mirrored)', () => {
        const kinds = kindsOf(constantBite('never', 0));
        expect(Object.keys(kinds)).toEqual(['prey', 'too-big', 'kin']);
        for (const kind of Object.values(kinds)) {
            expect(kind.stagings).toBe(2 * TRIALS);
        }
    });

    it('a brain that never bites passes the too-big and kin stagings and fails every prey one', () => {
        const kinds = kindsOf(constantBite('never', 0));
        expect(kinds.prey).toMatchObject({ passShare: 0, biteShare: 0 });
        expect(kinds['too-big']).toMatchObject({ passShare: 1, biteShare: 0 });
        expect(kinds.kin).toMatchObject({ passShare: 1, biteShare: 0 });
    });

    it('a brain that always bites passes the prey stagings and fails the others, with a bite share of 1 everywhere', () => {
        const kinds = kindsOf(constantBite('always', 1));
        expect(kinds.prey).toMatchObject({ passShare: 1, biteShare: 1 });
        expect(kinds['too-big']).toMatchObject({ passShare: 0, biteShare: 1 });
        expect(kinds.kin).toMatchObject({ passShare: 0, biteShare: 1 });
    });

    it('the memoryless reference bites on sight of prey, so its prey bite share is above the never-bite brain', () => {
        const kinds = kindsOf(referenceSubject('memoryless'));
        expect(kinds.prey.biteShare).toBeGreaterThan(0);
    });
});

describe('the kind tally', () => {
    const sequences = [{ staging: { kind: 'a' } }, { staging: { kind: 'b' } }, { staging: { kind: 'a' } }];

    it('counts passes and bite ticks per slot and kind, and reports shares of stagings and scored ticks', () => {
        const tally = createKindTally(sequences, 2);
        expect(tally.kinds).toEqual(['a', 'b']);
        expect(tally.stagings).toEqual([2, 1]);
        notePass(tally, { slot: 1, sequence: 0, ok: 1 });
        notePass(tally, { slot: 1, sequence: 2, ok: 0 });
        noteBite(tally, { slot: 1, sequence: 1, bite: 0.5 });
        noteBite(tally, { slot: 1, sequence: 1, bite: 0 });
        expect(kindScores(tally, 1).a).toEqual({ stagings: 2, passShare: 0.5, biteShare: 0 });
        expect(kindScores(tally, 1).b.biteShare).toBe(1 / 4);
        expect(kindScores(tally, 0).a.passShare).toBe(0);
    });
});
