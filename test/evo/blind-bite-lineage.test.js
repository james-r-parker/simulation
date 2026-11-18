import { describe, expect, it } from 'vitest';
import {
    biasDrift,
    blindShare,
    byBiasSign,
    byDepth,
    bySource,
    countedLives,
    depths,
    outcomeByQuintile,
    parentChild,
    reproducers,
    unseenShare,
} from '../../js/evo/blind-bite-lineage.js';

/** @param {number} id @param {Record<string, any>} [over] @returns {Record<string, any>} a life */
const life = (id, over = {}) => ({
    id,
    parentA: 0,
    parentB: 0,
    source: 'floor',
    born: 20000,
    last: 21000,
    ticks: 1000,
    hold: 600,
    blind: 500,
    blindUnseen: 100,
    earlyTicks: 300,
    earlyBlind: 150,
    bias: 0.2,
    preyBite: 0.3,
    ...over,
});
const OPTIONS = { burnIn: 10000, endTick: 100000, juvenileTicks: 3000 };

describe('countedLives', () => {
    it('drops births in the burn-in and censors a life alive and young at the end', () => {
        const lives = [
            life(1, { born: 5000 }),
            life(2),
            life(3, { last: 100000, ticks: 500 }),
            life(4, { last: 100000, ticks: 3500 }),
        ];
        expect(countedLives(/** @type {any} */ (lives), OPTIONS).map((l) => l.id)).toEqual([2, 4]);
    });
});

describe('bySource', () => {
    it('splits birth share, blind share, blind mass and reach by source', () => {
        const lives = /** @type {any[]} */ ([
            life(1, { source: 'floor', blind: 800 }),
            life(2, { source: 'split-hunter-parent', blind: 200, ticks: 4000, preyBite: -0.1 }),
        ]);
        const rows = bySource(lives, 3000);
        expect(rows.floor).toMatchObject({
            meanBias: 0.2,
            zeroBias: 0,
            meanHold: 0.6,
            born: 1,
            birthShare: 0.5,
            meanBlind: 0.8,
            blindMass: 0.8,
            reach: 0,
        });
        expect(rows['split-hunter-parent']).toMatchObject({ pooledBlind: 0.05, reach: 1, positivePreyBite: 0 });
        expect(rows.floor.earlyBlind).toBe(0.5);
    });
});

describe('parentChild', () => {
    it('pairs a child with its tracked hunter parent and reads the change', () => {
        const parent = life(1, { blind: 600 });
        const kids = [
            life(2, { parentA: 1, blind: 300 }),
            life(3, { parentA: 1, blind: 100 }),
            life(4, { blind: 900 }),
        ];
        const all = /** @type {any[]} */ ([parent, ...kids]);
        const row = parentChild(all, all, 100);
        expect(row.pairs).toBe(2);
        expect(row.parentBlind).toBeCloseTo(0.6);
        expect(row.childBlind).toBeCloseTo(0.2);
        expect(row.change).toBeCloseTo(-0.4);
        expect(row.childLower).toBe(1);
    });

    it('averages two tracked parents and ignores one seen for too few ticks', () => {
        const a = life(1, { blind: 400 });
        const b = life(2, { blind: 800 });
        const short = life(3, { blind: 1, ticks: 10 });
        const all = /** @type {any[]} */ ([a, b, short, life(5, { parentA: 1, parentB: 2 }), life(6, { parentA: 3 })]);
        const row = parentChild(all, all, 100);
        expect(row.pairs).toBe(1);
        expect(row.parentBlind).toBeCloseTo(0.6);
        expect(Number.isNaN(row.correlation)).toBe(true);
    });

    it('reports a correlation and slope with enough pairs', () => {
        const all = /** @type {any[]} */ ([
            life(1, { blind: 200 }),
            life(2, { blind: 600 }),
            life(3, { parentA: 1, blind: 100 }),
            life(4, { parentA: 2, blind: 300 }),
        ]);
        const row = parentChild(all, all, 100);
        expect(row.correlation).toBeCloseTo(1);
        expect(row.slope).toBeCloseTo(0.5);
    });

    it('is empty with no tracked parent', () => {
        const all = /** @type {any[]} */ ([life(1)]);
        expect(parentChild(all, all, 100)).toMatchObject({ pairs: 0, parentBlind: 0, slope: NaN });
    });
});

describe('depths and byDepth', () => {
    const all = /** @type {any[]} */ ([
        life(1, { born: 1 }),
        life(2, { born: 2, parentA: 1 }),
        life(3, { born: 3, parentA: 2, parentB: 1 }),
        life(4, { born: 4, parentA: 99 }),
    ]);

    it('counts generations of tracked hunter parents', () => {
        const d = depths(all);
        expect([1, 2, 3, 4].map((id) => d.get(id))).toEqual([0, 1, 2, 0]);
    });

    it('reads a parent born later than its child as a root', () => {
        const odd = /** @type {any[]} */ ([life(5, { born: 0, parentA: 6 }), life(6, { born: 5 })]);
        expect(depths(odd).get(5)).toBe(1);
    });

    it('buckets the counted lives by depth', () => {
        const rows = byDepth(all, all);
        expect(rows['0'].n).toBe(2);
        expect(rows['1'].n).toBe(1);
        expect(rows['2'].blind).toBeCloseTo(0.5);
        expect(rows['2'].early).toBeCloseTo(0.5);
        expect(rows['2'].reach).toBe(1);
    });

    it('names the deeper buckets', () => {
        const chain = /** @type {any[]} */ (
            Array.from({ length: 7 }, (_, i) => life(i + 1, { born: i + 1, parentA: i }))
        );
        expect(Object.keys(byDepth(chain, chain)).sort()).toEqual(['0', '1', '2', '3-4', '5+']);
    });
});

describe('reproducers', () => {
    it('compares mature hunters that are named as a parent with those that are not', () => {
        const all = /** @type {any[]} */ ([
            life(1, { blind: 100 }),
            life(2, { blind: 700, ticks: 900 }),
            life(3, { parentA: 1, blind: 900 }),
            life(4, { ticks: 100 }),
        ]);
        const rows = reproducers(all, all, 600);
        expect(rows.parents).toMatchObject({ n: 1, meanBlind: 0.1 });
        expect(rows.childless.n).toBe(2);
        expect(rows.childless.medianAge).toBe(950);
    });
});

describe('biasDrift', () => {
    it('measures the step and shift of a birth weight from the hunter parent', () => {
        const all = /** @type {any[]} */ ([
            life(1, { bias: 0 }),
            life(2, { bias: 1 }),
            life(3, { parentA: 1, bias: 0.5 }),
            life(4, { parentA: 2, bias: 1.5 }),
        ]);
        const row = biasDrift(all, all, 'bias');
        expect(row.pairs).toBe(2);
        expect(row.shift).toBeCloseTo(0.5);
        expect(row.step).toBeCloseTo(0);
        expect(biasDrift(all.slice(0, 1), all.slice(0, 1), 'preyBite')).toMatchObject({ pairs: 0, step: 0, shift: 0 });
    });
});

describe('pick', () => {
    it('reads another share through the same functions', () => {
        const all = /** @type {any[]} */ ([
            life(1, { blindUnseen: 100 }),
            life(2, { parentA: 1, blindUnseen: 50 }),
            life(3, { ticks: 100, blindUnseen: 90 }),
        ]);
        expect(parentChild(all, all, 100, unseenShare).childBlind).toBeCloseTo(0.05);
        expect(byDepth(all, all, unseenShare)['0'].blind).toBeCloseTo((0.1 + 0.9) / 2);
        expect(reproducers(all, all, 100, unseenShare).parents.meanBlind).toBeCloseTo(0.1);
        expect(bySource(all, 3000).floor.pooledUnseen).toBeCloseTo(240 / 2100);
    });
});

describe('outcomeByQuintile', () => {
    it('cuts the lives of enough ticks into fifths by share and reads what became of each', () => {
        const all = /** @type {any[]} */ (
            Array.from({ length: 10 }, (_, i) =>
                life(i + 1, { blind: i * 100, ticks: i < 5 ? 5000 : 1000, parentA: i === 0 ? 0 : 1 }),
            ).concat([life(99, { ticks: 50 })])
        );
        const rows = outcomeByQuintile(all, all, { minTicks: 600, juvenileTicks: 3000 });
        expect(Object.keys(rows)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
        expect(rows.q1.n).toBe(2);
        expect(rows.q1.reach).toBe(1);
        expect(rows.q5.reach).toBe(0);
        expect(rows.q1.share).toBeLessThan(rows.q5.share);
        expect(rows.q1.parentShare).toBe(0.5);
        expect(outcomeByQuintile(all, all, { minTicks: 600, juvenileTicks: 3000, pick: unseenShare }).q3.n).toBe(2);
    });
});

describe('byBiasSign', () => {
    it('splits the lives by the sign of the birth bias and skips an empty sign', () => {
        const all = /** @type {any[]} */ ([
            life(1, { bias: -0.5, hold: 100, blindUnseen: 0 }),
            life(2, { bias: 0, ticks: 4000 }),
            life(3, { bias: 0 }),
        ]);
        const rows = byBiasSign(all, 3000);
        expect(Object.keys(rows)).toEqual(['negative', 'zero']);
        expect(rows.negative).toMatchObject({ n: 1, meanHold: 0.1, pooledUnseen: 0, reach: 0 });
        expect(rows.zero.share).toBeCloseTo(2 / 3);
        expect(rows.zero.reach).toBe(0.5);
        expect(byBiasSign([{ ...all[0], bias: 1 }], 3000).positive.n).toBe(1);
    });
});

describe('blindShare', () => {
    it('is 0 for a life with no ticks', () => {
        expect(blindShare(/** @type {any} */ (life(1, { ticks: 0, blind: 0 })))).toBe(0);
    });
});
