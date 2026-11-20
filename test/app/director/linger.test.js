import { describe, expect, it } from 'vitest';
import { lingerOver, refreshLingerMoment } from '../../../js/app/director/linger.js';

const AGENTS = [
    { genomeId: 1, lineageId: 1, spec: 1, x: 100, y: 100, angle: 0, size: 18, speed: 5, flags: 0 },
    { genomeId: 2, lineageId: 2, spec: 0, x: 300, y: 100, angle: 0, size: 12, speed: 5, flags: 0 },
];

describe('refreshLingerMoment', () => {
    it('takes the score and focus of the matching fresh candidate', () => {
        const moment = { kind: 'chase', score: 70, x: 0, y: 0 };
        const raw = [{ kind: 'chase', score: 55, x: 9, y: 8 }];
        expect(refreshLingerMoment(moment, raw, AGENTS)).toEqual({ score: 55, x: 9, y: 8 });
    });

    it('follows a chase pair that is still alive at score 0, between the two', () => {
        const moment = { kind: 'chase', score: 70, x: 0, y: 0, hunterId: 1, preyId: 2 };
        expect(refreshLingerMoment(moment, [], AGENTS)).toEqual({ score: 0, x: 200, y: 100 });
    });

    it('follows an escape victim, and otherwise stays where the moment was', () => {
        const escape = { kind: 'escape', score: 65, x: 0, y: 0, victimId: 2 };
        expect(refreshLingerMoment(escape, [], AGENTS)).toEqual({ score: 0, x: 300, y: 100 });
        const kill = { kind: 'kill', score: 80, x: 7, y: 6 };
        expect(refreshLingerMoment(kill, [], AGENTS)).toEqual({ score: 0, x: 7, y: 6 });
    });
});

describe('lingerOver', () => {
    it('ends a quiet moment only after the floor, and a strong one at its extended end', () => {
        const state = {
            shot: { startTimeS: 3, durationS: 8 },
            shotStartS: 0,
            lastWideS: 0,
            lowScoreSinceS: /** @type {number | null} */ (null),
        };
        expect(lingerOver(state, { timeS: 4, score: 10 })).toBe(false);
        expect(lingerOver(state, { timeS: 6.5, score: 10 })).toBe(true);
        expect(lingerOver({ ...state, lowScoreSinceS: null }, { timeS: 11, score: 90 })).toBe(false);
    });
});
