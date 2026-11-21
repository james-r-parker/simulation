import { describe, expect, it } from 'vitest';
import { HAND_SET, NO_ROW, TODO_ROWS } from '../../js/evo/reflex-bars-hand.js';

describe('the hand-set bars', () => {
    it('are frozen shares of the output range, with the sprint bars rising as the prey nears', () => {
        for (const group of [HAND_SET, HAND_SET.forager, HAND_SET.predator, HAND_SET.role, HAND_SET.role.sprint]) {
            expect(Object.isFrozen(group)).toBe(true);
        }
        const { far, mid, near } = HAND_SET.role.sprint;
        expect(far).toBeLessThan(mid);
        expect(mid).toBeLessThan(near);
        expect(HAND_SET.forager.fleeBehindThrust).toBeGreaterThan(HAND_SET.forager.fleeThrust);
    });

    it('list each TODO bar once, with the row and the pull request that will give it', () => {
        const names = TODO_ROWS.map((t) => t.bar);
        expect(new Set(names).size).toBe(names.length);
        expect(TODO_ROWS.every((t) => /^PR \d+$/.test(t.pr) && t.row.includes(':'))).toBe(true);
    });

    it('keep the no-row bars apart from the TODO ones', () => {
        const todo = new Set(TODO_ROWS.map((t) => t.bar));
        expect(NO_ROW.every((n) => !todo.has(n.bar) && n.why.length > 0)).toBe(true);
    });
});
