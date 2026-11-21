import { describe, expect, it } from 'vitest';
import {
    createLifeLine,
    lastEvents,
    LIFE,
    LIFE_CAPACITY,
    LIFE_EVENTS,
    LIFE_LABELS,
    noteLife,
} from '../../js/app/life-line.js';
import { CLIENT_KIND } from '../../js/app/renderer/client-kinds.js';

const KINDS = { BORN: 1, DIED: 2, BITE: 3, MATED: 8 };
const CTX = { kinds: KINDS, eatenCause: 1 };

/** @param {Record<string, number>} e @returns {any} an effect with the unset words 0 */
const effect = (e) => ({ kind: 0, a: 0, b: 0, c: 0, ...e });

/** @param {any} life @param {number} genome @returns {number[]} the codes the strip would show */
function strip(life, genome) {
    const out = new Uint8Array(LIFE_EVENTS);
    return Array.from(out.subarray(0, lastEvents(life, genome, out)));
}

describe('noteLife', () => {
    it('writes a row for each agent an effect involves', () => {
        const life = createLifeLine();
        noteLife(life, effect({ kind: KINDS.BORN, a: 5, c: 3 }), CTX);
        noteLife(life, effect({ kind: KINDS.BITE, a: 5, b: 6 }), CTX);
        noteLife(life, effect({ kind: KINDS.MATED, a: 5, b: 6 }), CTX);
        noteLife(life, effect({ kind: CLIENT_KIND.MEAL, a: 5 }), CTX);
        noteLife(life, effect({ kind: KINDS.DIED, a: 6, b: 5, c: 1 << 8 }), CTX);
        expect(strip(life, 5)).toEqual([LIFE.BORN, LIFE.BITE_GIVEN, LIFE.MATE, LIFE.MEAL, LIFE.KILL]);
        expect(strip(life, 6)).toEqual([LIFE.BITE_TAKEN, LIFE.MATE]);
        expect(strip(life, 3)).toEqual([LIFE.BIRTH]);
    });

    it('counts only an eaten death as a kill, and skips an absent killer, mother or unknown effect', () => {
        const life = createLifeLine();
        noteLife(life, effect({ kind: KINDS.DIED, a: 6, b: 5, c: 0 }), CTX);
        noteLife(life, effect({ kind: KINDS.DIED, a: 6, b: 0, c: 1 << 8 }), CTX);
        noteLife(life, effect({ kind: KINDS.BORN, a: 7, c: 0 }), CTX);
        noteLife(life, effect({ kind: 99, a: 7, b: 5 }), CTX);
        expect(life.count).toBe(1);
        expect(strip(life, 7)).toEqual([LIFE.BORN]);
    });
});

describe('lastEvents', () => {
    it('returns the newest 12 of an agent, oldest first, and nothing for a stranger', () => {
        const life = createLifeLine();
        for (let k = 0; k < 20; k++) {
            noteLife(life, effect({ kind: KINDS.BITE, a: 5, b: 100 + k }), CTX);
            noteLife(life, effect({ kind: CLIENT_KIND.MEAL, a: 9 }), CTX);
        }
        noteLife(life, effect({ kind: KINDS.MATED, a: 5, b: 9 }), CTX);
        const mine = strip(life, 5);
        expect(mine).toHaveLength(LIFE_EVENTS);
        expect(mine.at(-1)).toBe(LIFE.MATE);
        expect(mine.slice(0, -1).every((code) => code === LIFE.BITE_GIVEN)).toBe(true);
        expect(strip(life, 12345)).toEqual([]);
    });

    it('forgets the oldest rows once the ring is full', () => {
        const life = createLifeLine();
        noteLife(life, effect({ kind: KINDS.MATED, a: 5, b: 6 }), CTX);
        for (let k = 0; k < LIFE_CAPACITY; k++) {
            noteLife(life, effect({ kind: CLIENT_KIND.MEAL, a: 9 }), CTX);
        }
        expect(life.count).toBe(LIFE_CAPACITY);
        expect(strip(life, 5)).toEqual([]);
        expect(strip(life, 9)).toHaveLength(LIFE_EVENTS);
    });

    it('labels every code', () => {
        expect(Object.values(LIFE).map((code) => LIFE_LABELS[code])).toEqual(LIFE_LABELS);
    });
});
