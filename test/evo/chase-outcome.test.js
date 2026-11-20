import { describe, expect, it } from 'vitest';
import {
    CHASE_FLAG,
    CHASE_OUTCOME,
    chasesEnded,
    chasesEvaded,
    chasesFlagged,
    createChaseTally,
    tallyChase,
} from '../../js/evo/chase-outcome.js';

const { CAUGHT, ESCAPED, GAVE_UP } = CHASE_OUTCOME;

describe('chase-outcome', () => {
    it('partitions the chases into the end classes', () => {
        const t = createChaseTally();
        for (const outcome of [CAUGHT, CAUGHT, ESCAPED, GAVE_UP, GAVE_UP, GAVE_UP]) {
            tallyChase(t, { outcome });
        }
        expect([CAUGHT, ESCAPED, GAVE_UP].map((c) => chasesEnded(t, c))).toEqual([2, 1, 3]);
        expect(chasesEnded(t, CAUGHT) + chasesEnded(t, ESCAPED) + chasesEnded(t, GAVE_UP)).toBe(t.total);
        expect(chasesEvaded(t)).toBe(4);
    });

    it('counts each flag on a hand-built chase without changing its end class', () => {
        const t = createChaseTally();
        tallyChase(t, {
            outcome: ESCAPED,
            flags: CHASE_FLAG.OVERSHOT | CHASE_FLAG.CROSSED_COVER | CHASE_FLAG.SPRINTED,
        });
        tallyChase(t, { outcome: CAUGHT, flags: CHASE_FLAG.OVERSHOT | CHASE_FLAG.REACQUIRED });
        tallyChase(t, { outcome: GAVE_UP, flags: CHASE_FLAG.PREY_AT_FIRST_SIGHT });
        expect(t.total).toBe(3);
        expect(chasesFlagged(t, CHASE_FLAG.OVERSHOT)).toBe(2);
        expect(chasesFlagged(t, CHASE_FLAG.OVERSHOT, [ESCAPED, GAVE_UP])).toBe(1);
        expect(chasesFlagged(t, CHASE_FLAG.CROSSED_COVER)).toBe(1);
        expect(chasesFlagged(t, CHASE_FLAG.SPRINTED)).toBe(1);
        expect(chasesFlagged(t, CHASE_FLAG.REACQUIRED, [CAUGHT])).toBe(1);
        expect(chasesFlagged(t, CHASE_FLAG.PREY_AT_FIRST_SIGHT, [GAVE_UP])).toBe(1);
    });

    it('counts a lost then re-acquired chase as one record', () => {
        const t = createChaseTally();
        tallyChase(t, { outcome: CAUGHT, flags: CHASE_FLAG.REACQUIRED });
        expect(t.total).toBe(1);
        expect(chasesEnded(t, GAVE_UP)).toBe(0);
        expect(chasesFlagged(t, CHASE_FLAG.REACQUIRED)).toBe(1);
    });

    it('throws on a chase that fits no end class or carries an unknown flag', () => {
        const t = createChaseTally();
        expect(() => tallyChase(t, { outcome: 3 })).toThrow(/end class 3/);
        expect(() => tallyChase(t, { outcome: CAUGHT, flags: 128 })).toThrow(/flags 128/);
        expect(() => chasesFlagged(t, 3)).toThrow(/not a CHASE_FLAG/);
        expect(t.total).toBe(0);
    });
});
