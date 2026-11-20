import { describe, expect, it } from 'vitest';
import {
    applyVariety,
    createShotHistory,
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
        expect(varietyFactor(createShotHistory(), { kind: 'chase', hunterId: 1 })).toBe(1);
    });

    it('scores a kind down by its share of the shots and a subject by a fixed factor', () => {
        const h = createShotHistory();
        noteShot(h, { kind: 'chase', subject: 1 });
        noteShot(h, { kind: 'kill', subject: 2 });
        expect(varietyFactor(h, { kind: 'chase' })).toBeCloseTo(1 - KIND_PENALTY * 0.5);
        expect(varietyFactor(h, { kind: 'escape' })).toBe(1);
        expect(varietyFactor(h, { kind: 'escape', victimId: 2 })).toBeCloseTo(SUBJECT_FACTOR);
        expect(varietyFactor(h, { kind: 'chase', hunterId: 1 })).toBeCloseTo((1 - KIND_PENALTY * 0.5) * SUBJECT_FACTOR);
    });

    it('remembers only the last 20 shots', () => {
        const h = createShotHistory();
        noteShot(h, { kind: 'old', subject: 99 });
        for (let i = 0; i < HISTORY_SHOTS; i++) {
            noteShot(h, { kind: 'chase', subject: i });
        }
        expect(h.kinds).toHaveLength(HISTORY_SHOTS);
        expect(varietyFactor(h, { kind: 'old', lineageId: 99 })).toBe(1);
    });

    it('never takes a one-kind world to zero', () => {
        const h = createShotHistory();
        for (let i = 0; i < HISTORY_SHOTS; i++) {
            noteShot(h, { kind: 'kill', subject: 5 });
        }
        expect(varietyFactor(h, { kind: 'kill', victimId: 5 })).toBeGreaterThan(0.3);
    });
});

describe('applyVariety', () => {
    it('rescores in place and sorts best first, so a repeat can lose to a fresh kind', () => {
        const h = createShotHistory();
        for (let i = 0; i < 10; i++) {
            noteShot(h, { kind: 'chase', subject: -1 });
        }
        const candidates = [
            { kind: 'chase', score: 70 },
            { kind: 'escape', score: 60 },
        ];
        applyVariety(h, candidates);
        expect(candidates.map((c) => c.kind)).toEqual(['escape', 'chase']);
        expect(candidates[1].score).toBeCloseTo(70 * (1 - KIND_PENALTY));
    });
});
