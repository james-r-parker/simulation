import { describe, expect, it } from 'vitest';
import { BODY_INPUT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { BODY_BEHAVIOURS } from '../../js/evo/reflex-references-body.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { createReflexWorld, evalReflex } from '../../js/evo/reflex-eval.js';
import { lone, preyAt } from '../../js/evo/reflex-roles-stage.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';
import { hasRoleReference, roleReference } from '../../js/evo/reflex-references-roles.js';

describe('BODY_BEHAVIOURS', () => {
    it('names the four body cases, each a role reference', () => {
        expect(Object.keys(BODY_BEHAVIOURS)).toEqual([
            'pick-the-weak',
            'flee-what-closes',
            'mind-the-numbers',
            'answer-the-call',
        ]);
        for (const name of Object.keys(BODY_BEHAVIOURS)) {
            expect(hasRoleReference(name)).toBe(true);
        }
        expect(hasRoleReference('flee-what-closes:scout')).toBe(true);
    });

    it('answer-the-call goes towards the side of a heard hunt call and stands without one', () => {
        const world = createReflexWorld({}, 1, 1);
        world.inputs.fill(0);
        const act = (/** @type {number} */ side) => {
            const at = world.config.rayCount * RAY_CHANNELS + BODY_INPUT.HEARD_HUNT;
            world.inputs[at] = side === 0 ? 0 : 1;
            world.inputs[at + 2] = side;
            roleReference('answer-the-call').act?.(world);
            return [world.outputs[OUTPUT_INDEX.THRUST], world.outputs[OUTPUT_INDEX.TURN]];
        };
        expect(act(0.5)[1]).toBe(1);
        expect(act(-0.5)[1]).toBe(-1);
        expect(act(0)).toEqual([0, 0]);
        expect(act(0.5)[0]).toBeGreaterThan(0.3);
    });
});

describe('pick-the-weak on hand-staged views', () => {
    /**
     * @param {import('../../js/evo/pool-discrimination-stage.js').StagedAgent[]} others the prey
     * @returns {number} the turn the reference writes
     */
    function turnWith(others) {
        const c = caseNamed('pick-the-weak');
        const stage = { ...c, plan: () => [{ kind: 'pair', bearing: 0, mirror: 1, ticks: [lone(0, 1, others)] }] };
        const table = buildCaseTable(/** @type {any} */ (stage), { trials: 1 });
        let turn = NaN;
        evalReflex([roleReference('pick-the-weak')], [table], {
            observe: ({ world }) => {
                turn = world.outputs[OUTPUT_INDEX.TURN];
            },
        });
        return turn;
    }

    it('stands still on nothing, and turns to a lone prey or the smaller, slower of two', () => {
        const prey = (/** @type {number} */ bearing, /** @type {Record<string, number>} */ extra = {}) => ({
            ...preyAt(0, bearing, 150),
            ...extra,
        });
        expect(turnWith([])).toBe(0);
        expect(turnWith([prey(0.4)])).toBe(1);
        expect(turnWith([prey(-0.4)])).toBe(-1);
        const weak = { baseSize: 12 };
        const fast = { vx: 4 };
        expect(turnWith([prey(0.4, weak), prey(-0.4, fast)])).toBe(1);
        expect(turnWith([prey(0.4, fast), prey(-0.4, weak)])).toBe(-1);
    });
});
