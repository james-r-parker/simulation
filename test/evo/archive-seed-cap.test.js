import { describe, expect, it } from 'vitest';
import {
    ELITE,
    CHALLENGER,
    createArchive,
    lowerBound,
    offer,
    placeCount,
    placeOf,
    seedArchive,
} from '../../js/evo/archive.js';
import { welfordMean } from '../../js/evo/welford.js';
import { brainLayout } from '../../js/sim/brain-layout.js';

const layout = brainLayout({ rayCount: 2, brainHidden: 4 });

/**
 * @param {number} id genome id
 * @param {number} fitness its fitness
 * @param {Record<string, any>} [extra] offer fields
 * @returns {import('../../js/evo/archive.js').Offer} an offer to spec 0, cell 5
 */
function mk(id, fitness, extra = {}) {
    return { spec: 0, cell: 5, row: new Float32Array(layout.weightCount), sigma: 0.1, id, fitness, ...extra };
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {void}
 */
function seed(archive) {
    seedArchive(archive, { spec: 0, cell: 5, id: 40, sigma: 0.1, weights: new Float32Array(layout.weightCount) });
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @param {number} refId the genome cloned (in spec 0, cell 5)
 * @param {number} fitness the clone's fitness
 * @returns {string} the outcome
 */
function clone(archive, refId, fitness) {
    return offer(archive, mk(99, fitness, { isClone: true, archiveRef: 5, refId }));
}

describe('a seeded elite', () => {
    it('gets one clone offer of 100 as n 1 and mean 100, not a mean dragged to 50 by a false 0', () => {
        const archive = createArchive(layout);
        seed(archive);
        clone(archive, 40, 100);
        const o = placeOf(0, 5, ELITE);
        expect([placeCount(archive, o), welfordMean(archive.stats, o * 3)]).toEqual([1, 100]);
    });

    it('takes a negative offer as its challenger, which an untested elite does not block', () => {
        const archive = createArchive(layout);
        seed(archive);
        expect(offer(archive, mk(7, -3))).toBe('challenger');
        expect(archive.ids[placeOf(0, 5, CHALLENGER)]).toBe(7);
    });

    it('has a lower bound of -Infinity until tested, and loses to a challenger tested twice', () => {
        const archive = createArchive(layout);
        seed(archive);
        expect(lowerBound(archive, placeOf(0, 5, ELITE))).toBe(-Infinity);
        offer(archive, mk(7, -3));
        expect(clone(archive, 7, -2)).toBe('replaced');
        expect(archive.ids[placeOf(0, 5, ELITE)]).toBe(7);
    });
});

describe('nCap', () => {
    it('is off by default and rejects 1 and a fraction', () => {
        expect(createArchive(layout).nCap).toBe(0);
        expect(() => createArchive(layout, { nCap: 1 })).toThrow(/nCap/);
        expect(() => createArchive(layout, { nCap: 2.5 })).toThrow(/nCap/);
    });

    it('holds n at the cap and lets the mean follow recent samples', () => {
        const archive = createArchive(layout, { nCap: 4 });
        offer(archive, mk(1, 10));
        const o = placeOf(0, 5, ELITE);
        for (let i = 0; i < 20; i++) {
            clone(archive, 1, 10);
        }
        expect(placeCount(archive, o)).toBe(4);
        for (let i = 0; i < 12; i++) {
            clone(archive, 1, 50);
        }
        expect(placeCount(archive, o)).toBe(4);
        expect(welfordMean(archive.stats, o * 3)).toBeGreaterThan(40);
    });

    it('without a cap n keeps counting', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 10));
        for (let i = 0; i < 9; i++) {
            clone(archive, 1, 10);
        }
        expect(placeCount(archive, placeOf(0, 5, ELITE))).toBe(10);
    });
});
