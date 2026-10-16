import { describe, expect, it } from 'vitest';
import {
    CELLS,
    CHALLENGER,
    CV_DEFAULT,
    ELITE,
    archiveCv,
    cellOf,
    coverage,
    createArchive,
    lowerBound,
    nextClone,
    occupiedCount,
    offer,
    placeOf,
    qdScore,
    seedArchive,
    selectParent,
} from '../../js/evo/archive.js';
import { welfordAdd } from '../../js/evo/welford.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createSimLog } from '../../js/sim/log.js';
import { createRng } from '../../js/sim/rng.js';

const layout = brainLayout({ rayCount: 2, brainHidden: 4 });

/**
 * @param {number} id genome id
 * @param {number} fitness its fitness
 * @param {Record<string, any>} [extra] offer fields
 * @returns {import('../../js/evo/archive.js').Offer} an offer to spec 0
 */
function mk(id, fitness, extra = {}) {
    return {
        spec: 0,
        cell: 5,
        row: new Float32Array(layout.weightCount).fill(id),
        sigma: id / 100,
        id,
        fitness,
        ...extra,
    };
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @param {number} cell cell of spec 0
 * @param {number} which place
 * @returns {number[]} the place's [n, mean]
 */
function statsOf(archive, cell, which) {
    const o = placeOf(0, cell, which) * 3;
    return [archive.stats[o], archive.stats[o + 1]];
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @param {number} id genome id
 * @param {number} fitness fitness
 * @returns {void}
 */
function cloneOf(archive, id, fitness) {
    offer(archive, mk(99, fitness, { isClone: true, archiveRef: 5, refId: id }));
}

describe('cellOf', () => {
    it('bins each axis over 0..1 into 10 bins, y rows of x', () => {
        expect(cellOf(0, 0)).toBe(0);
        expect(cellOf(0.35, 0.72)).toBe(73);
        expect(cellOf(1, 1)).toBe(99);
    });
});

describe('offer', () => {
    it('lets an empty cell take the first offer as the elite with n = 1', () => {
        const archive = createArchive(layout);
        expect(offer(archive, mk(1, 50))).toBe('elite');
        expect(statsOf(archive, 5, ELITE)).toEqual([1, 50]);
        expect(archive.ids[placeOf(0, 5, ELITE)]).toBe(1);
        expect(archive.rows[placeOf(0, 5, ELITE) * layout.weightCount]).toBe(1);
        expect(archive.sigmas[placeOf(0, 5, ELITE)]).toBeCloseTo(0.01);
    });

    it('derives the cell from the descriptors', () => {
        const archive = createArchive(layout);
        offer(archive, { ...mk(1, 5), cell: undefined, speed: 0.35, crowding: 0.72 });
        expect(occupiedCount(archive, 0)).toBe(1);
        expect(archive.occupied[placeOf(0, 73, ELITE)]).toBe(1);
    });

    it('drops a fitness below the elite mean and never replaces on one lucky evaluation', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 50));
        expect(offer(archive, mk(2, 49))).toBe('dropped');
        expect(offer(archive, mk(3, 5000))).toBe('challenger');
        expect(archive.ids[placeOf(0, 5, ELITE)]).toBe(1);
        expect(statsOf(archive, 5, CHALLENGER)).toEqual([1, 5000]);
    });

    it('replaces a challenger with n = 1 only by a higher fitness', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 50));
        offer(archive, mk(2, 80));
        expect(offer(archive, mk(3, 60))).toBe('dropped');
        expect(offer(archive, mk(4, 90))).toBe('challenger');
        expect(archive.ids[placeOf(0, 5, CHALLENGER)]).toBe(4);
    });

    it('lets a challenger with two good evaluations replace the elite, keeping its statistics', () => {
        const archive = createArchive(layout);
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        offer(archive, mk(1, 50), log);
        offer(archive, mk(2, 100), log);
        expect(offer(archive, mk(99, 110, { isClone: true, archiveRef: 5, refId: 2 }), log)).toBe('replaced');
        expect(archive.ids[placeOf(0, 5, ELITE)]).toBe(2);
        expect(archive.rows[placeOf(0, 5, ELITE) * layout.weightCount]).toBe(2);
        expect(statsOf(archive, 5, ELITE)).toEqual([2, 105]);
        expect(archive.occupied[placeOf(0, 5, CHALLENGER)]).toBe(0);
        expect(records.map((r) => r.event)).toEqual(['ChallengerSet', 'ArchiveReplaced']);
        expect(records[1]).toMatchObject({ level: 'info', spec: 0, cell: 5, oldId: 1, newId: 2, n: 2 });
        expect(records[1].newLower).toBeGreaterThan(records[1].oldLower);
        expect(records[0]).toMatchObject({ level: 'debug', id: 2, fitness: 100 });
    });

    it('adds clone fitness by genome id, so a reused slot cannot misdirect it', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 50));
        cloneOf(archive, 1, 70);
        expect(statsOf(archive, 5, ELITE)).toEqual([2, 60]);
        expect(offer(archive, mk(99, 10, { isClone: true, archiveRef: 5, refId: 777 }))).toBe('lost');
        expect(statsOf(archive, 5, ELITE)).toEqual([2, 60]);
    });

    it('does not replace when the challenger only matches the elite', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 100));
        cloneOf(archive, 1, 100);
        offer(archive, mk(2, 100));
        cloneOf(archive, 2, 100);
        expect(archive.ids[placeOf(0, 5, ELITE)]).toBe(1);
    });
});

describe('lower bound and cv', () => {
    it('uses mean x cv for n = 1 and the own sd from n = 2', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 100));
        const p = placeOf(0, 5, ELITE);
        expect(archiveCv(archive)).toBe(CV_DEFAULT);
        expect(lowerBound(archive, p)).toBeCloseTo(100 - 1.96 * 30);
        cloneOf(archive, 1, 120);
        expect(lowerBound(archive, p)).toBeCloseTo(110 - (1.96 * Math.sqrt(200)) / Math.sqrt(2));
    });

    it('measures cv as the median of sd / mean once five genomes have n >= 2', () => {
        const archive = createArchive(layout);
        for (let c = 0; c < 5; c++) {
            const o = placeOf(0, c, ELITE);
            archive.occupied[o] = 1;
            welfordAdd(archive.stats, o * 3, 10);
            welfordAdd(archive.stats, o * 3, 10 + 2 * (c + 1));
        }
        const ratios = [0, 1, 2, 3, 4].map((c) => (Math.SQRT2 * (c + 1)) / (10 + c + 1));
        expect(archiveCv(archive)).toBeCloseTo(ratios[2], 12);
    });
});

describe('nextClone', () => {
    it('returns the first challenger with n < 3 in cell order, cycling', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 10, { cell: 7 }));
        offer(archive, mk(2, 20, { cell: 7 }));
        offer(archive, mk(3, 10, { cell: 3 }));
        offer(archive, mk(4, 20, { cell: 3 }));
        const a = nextClone(archive, 0);
        expect([a?.cell, a?.which, a?.id, a?.archiveRef]).toEqual([3, CHALLENGER, 4, 3]);
        const b = nextClone(archive, 0);
        expect([b?.cell, b?.id]).toEqual([7, 2]);
        expect(nextClone(archive, 0)?.cell).toBe(3);
    });

    it('falls back to the elite with the smallest n when no challenger needs tests', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 10, { cell: 2 }));
        offer(archive, mk(2, 10, { cell: 4 }));
        offer(archive, mk(99, 10, { isClone: true, archiveRef: 2, refId: 1 }));
        const ref = nextClone(archive, 0);
        expect([ref?.cell, ref?.which, ref?.id]).toEqual([4, ELITE, 2]);
        expect(ref?.row[0]).toBe(2);
    });

    it('is null for an empty specialisation and scoped to its specialisation', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 10));
        expect(nextClone(archive, 1)).toBeNull();
        expect(nextClone(archive, 0)?.spec).toBe(0);
    });
});

describe('selectParent', () => {
    it('is null when empty and picks only occupied cells of the spec', () => {
        const archive = createArchive(layout);
        const rng = createRng(3);
        expect(selectParent(archive, 0, rng)).toBeNull();
        offer(archive, mk(1, 10, { cell: 11 }));
        offer(archive, mk(2, 10, { cell: 55 }));
        offer(archive, { ...mk(3, 10, { cell: 70 }), spec: 1 });
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            const ref = selectParent(archive, 0, rng);
            seen.add(ref?.cell);
            expect(ref?.spec).toBe(0);
        }
        expect([...seen].sort()).toEqual([11, 55]);
    });

    it('prefers the best mean among a cell and its neighbours, never a far cell', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 10, { cell: 0 }));
        offer(archive, mk(2, 100, { cell: 1 }));
        offer(archive, mk(3, 1000, { cell: 99 }));
        const rng = createRng(9);
        const wins = { 1: 0, 2: 0, 3: 0 };
        for (let i = 0; i < 600; i++) {
            wins[/** @type {1 | 2 | 3} */ (selectParent(archive, 0, rng)?.id ?? 1)]++;
        }
        expect(wins[3]).toBeGreaterThan(150);
        expect(wins[2]).toBeGreaterThan(wins[1]);
        expect(wins[1]).toBeGreaterThan(0);
    });
});

describe('seedArchive and metrics', () => {
    it('seeds the elite with n = 1 and mean 0, so a tested challenger can replace it', () => {
        const archive = createArchive(layout);
        seedArchive(archive, {
            specialisation: 'predator',
            cell: 5,
            id: 40,
            sigma: 0.1,
            weights: new Float32Array(layout.weightCount).fill(4),
        });
        const o = placeOf(1, 5, ELITE);
        expect([archive.occupied[o], archive.stats[o * 3], archive.stats[o * 3 + 1], archive.ids[o]]).toEqual([
            1, 1, 0, 40,
        ]);
        offer(archive, { ...mk(7, 30), spec: 1 });
        cloneOf1(archive);
        expect(archive.ids[o]).toBe(7);
    });

    it('counts occupied cells, coverage and the qd score over all 500 cells', () => {
        const archive = createArchive(layout);
        offer(archive, mk(1, 50, { cell: 1 }));
        offer(archive, { ...mk(2, 150, { cell: 2 }), spec: 3 });
        expect(occupiedCount(archive)).toBe(2);
        expect(occupiedCount(archive, 3)).toBe(1);
        expect(coverage(archive)).toBe(2 / (5 * CELLS));
        expect(qdScore(archive)).toBe(200 / (5 * CELLS));
    });
});

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {void}
 */
function cloneOf1(archive) {
    offer(archive, { ...mk(99, 35, { isClone: true, archiveRef: 105, refId: 7 }), spec: 1 });
}
