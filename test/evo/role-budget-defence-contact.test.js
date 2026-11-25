import { describe, expect, it } from 'vitest';
import { fadeStagger, lying } from '../../js/evo/role-budget-defence-contact.js';

/**
 * @param {{rest?: number, stacks?: number, ticks?: number, stagger?: number}} [at] the rest, the stacks and timer, and the
 *   thrust a stack takes off
 * @returns {any} a run with just what the contact functions read
 */
const run = ({ rest = 0, stacks = 0, ticks = 0, stagger = 0.5 } = {}) => ({
    rest,
    stagger: { stacks, ticks },
    p: { defender: { repel: { stagger, staggerTicks: 30 } } },
});

describe('lying', () => {
    it('leaves a free hunter its outputs', () => {
        const ho = { turn: 0.3, sprint: 1 };
        expect(lying(run(), ho)).toBe(ho);
    });

    it('takes all thrust for each tick of rest and counts the rest down, keeping the steering and the sprint', () => {
        const s = run({ rest: 2 });
        expect(lying(s, { turn: 0.3, sprint: 1 })).toEqual({ turn: 0.3, sprint: 1, thrust: 0 });
        expect(s.rest).toBe(1);
        expect(lying(s, { turn: 0, sprint: 0 })).toEqual({ turn: 0, sprint: 0, thrust: 0 });
        expect(s.rest).toBe(0);
        expect(lying(s, { turn: 0, sprint: 0 })).toEqual({ turn: 0, sprint: 0 });
    });

    it('takes staggerThrust off for each stack, never below 0', () => {
        expect(lying(run({ stacks: 1 }), { turn: 0, sprint: 0 }).thrust).toBe(0.5);
        expect(lying(run({ stacks: 3 }), { turn: 0, sprint: 0 }).thrust).toBe(0);
    });

    it('does not slow a hunter when the stagger is off', () => {
        const ho = { turn: 0, sprint: 0 };
        expect(lying(run({ stacks: 2, stagger: 0 }), ho)).toBe(ho);
    });
});

describe('fadeStagger', () => {
    it('ends every stack when the timer runs out, and does nothing with none', () => {
        const s = run({ stacks: 2, ticks: 2 });
        fadeStagger(s);
        expect(s.stagger).toEqual({ stacks: 2, ticks: 1 });
        fadeStagger(s);
        expect(s.stagger).toEqual({ stacks: 0, ticks: 0 });
        fadeStagger(s);
        expect(s.stagger).toEqual({ stacks: 0, ticks: 0 });
    });
});
