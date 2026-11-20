import { describe, expect, it } from 'vitest';
import {
    applyVariety,
    createShotHistory,
    HISTORY_MAX_AGE_S,
    HISTORY_SHOTS,
    KIND_PENALTY,
    noteShot,
    SUBJECT_FACTOR,
    subjectOf,
    varietyFactor,
} from '../../../js/app/director/variety.js';

describe('subjectOf', () => {
    it('names who a moment is about, or -1 for a place', () => {
        expect(subjectOf({ hunterId: 4 })).toBe(4);
        expect(subjectOf({ victimId: 6 })).toBe(6);
        expect(subjectOf({ biterId: 7 })).toBe(7);
        expect(subjectOf({ lineageId: 8 })).toBe(8);
        expect(subjectOf({})).toBe(-1);
    });
});

describe('noteShot and varietyFactor', () => {
    it('leaves a fresh history alone', () => {
        expect(varietyFactor(createShotHistory(), { kind: 'chase', hunterId: 1 }, 0)).toBe(1);
    });

    it('scores a kind down by its share of the shots and a subject by a fixed factor', () => {
        const h = createShotHistory();
        noteShot(h, { kind: 'chase', subject: 1, timeS: 0 });
        noteShot(h, { kind: 'kill', subject: 2, timeS: 10 });
        expect(varietyFactor(h, { kind: 'chase' }, 20)).toBeCloseTo(1 - KIND_PENALTY * 0.5);
        expect(varietyFactor(h, { kind: 'escape' }, 20)).toBe(1);
        expect(varietyFactor(h, { kind: 'escape', victimId: 2 }, 20)).toBeCloseTo(SUBJECT_FACTOR);
        expect(varietyFactor(h, { kind: 'chase', hunterId: 1 }, 20)).toBeCloseTo(
            (1 - KIND_PENALTY * 0.5) * SUBJECT_FACTOR,
        );
    });

    it('remembers only the last 20 shots', () => {
        const h = createShotHistory();
        noteShot(h, { kind: 'old', subject: 99, timeS: 0 });
        for (let i = 0; i < HISTORY_SHOTS; i++) {
            noteShot(h, { kind: 'chase', subject: i, timeS: i });
        }
        expect(h.kinds).toHaveLength(HISTORY_SHOTS);
        expect(varietyFactor(h, { kind: 'old', lineageId: 99 }, 30)).toBe(1);
    });

    it('forgets a shot after HISTORY_MAX_AGE_S, so a one-kind world is not shut out for good', () => {
        const h = createShotHistory();
        for (let i = 0; i < HISTORY_SHOTS; i++) {
            noteShot(h, { kind: 'kill', subject: 5, timeS: i });
        }
        expect(varietyFactor(h, { kind: 'kill', victimId: 5 }, 100)).toBe(0);
        expect(varietyFactor(h, { kind: 'kill', victimId: 5 }, HISTORY_MAX_AGE_S + 19)).toBeCloseTo(
            (1 - KIND_PENALTY) * SUBJECT_FACTOR,
        );
        expect(varietyFactor(h, { kind: 'kill', victimId: 5 }, HISTORY_MAX_AGE_S + 20)).toBe(1);
    });
});

describe('applyVariety', () => {
    it('rescores in place and sorts best first, so a repeat can lose to a fresh kind', () => {
        const h = createShotHistory();
        for (let i = 0; i < 10; i++) {
            noteShot(h, { kind: 'chase', subject: -1, timeS: i });
        }
        const candidates = [
            { kind: 'chase', score: 70 },
            { kind: 'escape', score: 60 },
        ];
        applyVariety(h, candidates, 20);
        expect(candidates.map((c) => c.kind)).toEqual(['escape', 'chase']);
        expect(candidates[1].score).toBeCloseTo(70 * (1 - KIND_PENALTY));
    });
});
