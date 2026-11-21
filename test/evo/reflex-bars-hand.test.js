import { describe, expect, it } from 'vitest';
import { HAND_SET, NO_ROW } from '../../js/evo/reflex-bars-hand.js';

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

    it('list each no-row bar once, with the reason no row gives it, and keep no TODO list', async () => {
        const names = NO_ROW.map((n) => n.bar);
        expect(new Set(names).size).toBe(names.length);
        expect(NO_ROW.every((n) => n.why.length > 0)).toBe(true);
        expect(names).toContain('forager.fleeThrust');
        expect(await import('../../js/evo/reflex-bars-hand.js')).not.toHaveProperty('TODO_ROWS');
    });
});
