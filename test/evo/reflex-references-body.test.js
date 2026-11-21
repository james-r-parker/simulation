import { describe, expect, it } from 'vitest';
import { BODY_INPUT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createReflexWorld } from '../../js/evo/reflex-eval.js';
import { BODY_BEHAVIOURS } from '../../js/evo/reflex-references-body.js';
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
