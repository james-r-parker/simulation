import { describe, expect, it } from 'vitest';
import * as s from '../../js/evo/metrics-series.js';
import { addCheckpoint, bareObserver } from './helpers/metrics-observer.js';

describe('series metrics', () => {
    it('are null with a reason when there is no checkpoint', () => {
        const o = bareObserver();
        for (const fn of [s.populationMean, s.diversity, s.lineagesAlive, s.predatorShareCv, s.lineageTurnover]) {
            const r = fn(o);
            expect(r.value).toBeNull();
            expect(r.reason).toBeTypeOf('string');
        }
    });

    it('averages population and non-NaN diversity over checkpoints', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 1000, population: 10, diversity: 2 });
        addCheckpoint(o, { tick: 2000, population: 20 });
        addCheckpoint(o, { tick: 3000, population: 30, diversity: 4 });
        expect(s.populationMean(o).value).toBe(20);
        expect(s.diversity(o).value).toBe(3);
    });

    it('has null diversity when every checkpoint had fewer than 2 agents', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 1000 });
        expect(s.diversity(o).value).toBeNull();
    });

    it('averages lineages alive only at checkpoints from tick 10000', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 9000, lineagesAlive: 100 });
        expect(s.lineagesAlive(o).value).toBeNull();
        addCheckpoint(o, { tick: 10000, lineagesAlive: 4 });
        addCheckpoint(o, { tick: 11000, lineagesAlive: 6 });
        expect(s.lineagesAlive(o).value).toBe(5);
    });

    it('computes the coefficient of variation of the predator share, null when the mean is 0', () => {
        const o = bareObserver();
        addCheckpoint(o, { tick: 1000, predatorShare: 0 });
        addCheckpoint(o, { tick: 2000, predatorShare: 0 });
        expect(s.predatorShareCv(o)).toEqual({ value: null, reason: 'mean predator share is 0' });
        const p = bareObserver();
        addCheckpoint(p, { tick: 1000, predatorShare: 0.1 });
        addCheckpoint(p, { tick: 2000, predatorShare: 0.3 });
        expect(s.predatorShareCv(p).value).toBeCloseTo(0.5, 12);
    });
});

/**
 * @param {number[]} dominants dominantLineage per checkpoint, from tick 8000 in steps of 1000
 * @param {number} ticks the run length
 * @returns {any} an observer
 */
function withDominants(dominants, ticks) {
    const o = bareObserver();
    dominants.forEach((d, i) => addCheckpoint(o, { tick: 8000 + i * 1000, dominantLineage: d }));
    o.ticks = ticks;
    return o;
}

describe('lineageTurnover', () => {
    it('counts new dominants after burn-in per 100000 ticks after burn-in', () => {
        // ticks 8000, 9000 | 10000 .. 14000: 7 (new), 7, 8 (new), 7 (seen in the window), 9 (new)
        const o = withDominants([7, 7, 7, 7, 8, 7, 9], 20000);
        expect(s.lineageTurnover(o).value).toBe((2 * 100000) / 10000);
    });

    it('counts a lineage again only after 10 checkpoints without it as dominant', () => {
        const pad = (/** @type {number[]} */ at) => Array.from({ length: 15 }, (_, i) => (at.includes(i) ? 5 : 0));
        // index 2 is tick 10000, the first after burn-in; the window of index 12 reaches back to index 2
        expect(s.lineageTurnover(withDominants(pad([2, 12]), 30000)).value).toBe((1 * 100000) / 20000);
        expect(s.lineageTurnover(withDominants(pad([2, 13]), 30000)).value).toBe((2 * 100000) / 20000);
    });

    it('never counts dominant 0 (none yet)', () => {
        expect(s.lineageTurnover(withDominants([0, 0, 0, 0], 12000)).value).toBe(0);
    });

    it('is null before the first checkpoint after burn-in', () => {
        expect(s.lineageTurnover(withDominants([1, 1], 9000))).toEqual({
            value: null,
            reason: 'no checkpoint after burn-in',
        });
    });

    it('is null when the run has no ticks after burn-in', () => {
        const r = s.lineageTurnover(withDominants([1, 1, 1], 10000));
        expect(r.value).toBeNull();
        expect(r.reason).toBe('no ticks after burn-in');
    });
});
