import { describe, expect, it } from 'vitest';
import { ARMS, founderMixture } from '../../js/evo/founder-mixture.js';

const champion = (/** @type {string} */ name, /** @type {number} */ genomeId) => ({ name, genomeId });
const spec = (/** @type {Record<string, any>} */ over = {}) => ({
    champions: { low: champion('low-1', 11), high: champion('high-1', 22) },
    mixture: { low: 4, high: 8 },
    kinGroupSize: 4,
    ages: [
        { ticks: 0, share: 0.25 },
        { ticks: 600, share: 0.5 },
        { ticks: 1800, share: 0.25 },
    ],
    arena: { columns: 6, rows: 4 },
    energyEach: 900,
    seed: 5,
    ...over,
});

describe('founderMixture', () => {
    it('builds the three arms with the same population, energy, ages, places and families', () => {
        const manifest = founderMixture(spec());
        expect(manifest.total).toBe(12);
        expect(manifest.totalEnergy).toBe(12 * 900);
        expect(Object.keys(manifest.arms)).toEqual([...ARMS]);
        const key = (/** @type {any} */ f) => [f.slot, f.family, f.ageTicks, f.column, f.row, f.energy];
        for (const arm of ARMS) {
            expect(manifest.arms[arm]).toHaveLength(12);
            expect(manifest.arms[arm].map(key)).toEqual(manifest.arms.low.map(key));
        }
    });

    it('apportions the age distribution exactly and puts each founder on its own cell', () => {
        const founders = founderMixture(spec()).arms.mixed;
        const count = (/** @type {number} */ ticks) =>
            founders.filter((/** @type {any} */ f) => f.ageTicks === ticks).length;
        expect([count(0), count(600), count(1800)]).toEqual([3, 6, 3]);
        expect(new Set(founders.map((/** @type {any} */ f) => `${f.column},${f.row}`)).size).toBe(12);
    });

    it('fills the mixed arm with exactly the mixture counts, a whole family at a time, from the right champion', () => {
        const mixed = founderMixture(spec()).arms.mixed;
        expect(mixed.filter((/** @type {any} */ f) => f.style === 'low')).toHaveLength(4);
        expect(mixed.filter((/** @type {any} */ f) => f.style === 'high')).toHaveLength(8);
        for (const family of [0, 1, 2]) {
            const styles = new Set(
                mixed.filter((/** @type {any} */ f) => f.family === family).map((/** @type {any} */ f) => f.style),
            );
            expect(styles.size).toBe(1);
        }
        expect(mixed.find((/** @type {any} */ f) => f.style === 'low')).toMatchObject({
            champion: 'low-1',
            genomeId: 11,
        });
        expect(mixed.find((/** @type {any} */ f) => f.style === 'high')).toMatchObject({
            champion: 'high-1',
            genomeId: 22,
        });
    });

    it('fills each single-style arm with that style only', () => {
        const manifest = founderMixture(spec());
        expect(new Set(manifest.arms.low.map((/** @type {any} */ f) => f.style))).toEqual(new Set(['low']));
        expect(new Set(manifest.arms.high.map((/** @type {any} */ f) => f.genomeId))).toEqual(new Set([22]));
    });

    it('is the same from the same seed and another from another, and the hash follows', () => {
        const a = founderMixture(spec());
        expect(founderMixture(spec())).toEqual(a);
        const b = founderMixture(spec({ seed: 6 }));
        expect(b.arms).not.toEqual(a.arms);
        expect(b.hash).not.toBe(a.hash);
        expect(founderMixture(spec({ energyEach: 901 })).hash).not.toBe(a.hash);
    });

    it('refuses an empty band: a band with no champion cannot found a world', () => {
        expect(() => founderMixture(spec({ champions: { low: champion('l', 1), high: null } }))).toThrow(
            /high band has no champion/,
        );
        expect(() => founderMixture(spec({ champions: { low: null, high: champion('h', 1) } }))).toThrow(
            /low band has no champion/,
        );
    });

    it('refuses a count that is not a whole number of families, a zero count and a bad kin size', () => {
        expect(() => founderMixture(spec({ mixture: { low: 3, high: 8 } }))).toThrow(/whole number of families/);
        expect(() => founderMixture(spec({ mixture: { low: 0, high: 8 } }))).toThrow(/whole number of families/);
        expect(() => founderMixture(spec({ kinGroupSize: 0 }))).toThrow(/kinGroupSize/);
    });

    it('refuses age shares that do not sum to 1, a non-positive energy and an arena that is too small', () => {
        expect(() => founderMixture(spec({ ages: [{ ticks: 0, share: 0.5 }] }))).toThrow(/age shares/);
        const negative = [
            { ticks: 0, share: -0.5 },
            { ticks: 9, share: 1.5 },
        ];
        expect(() => founderMixture(spec({ ages: negative }))).toThrow(/age shares/);
        expect(() => founderMixture(spec({ energyEach: 0 }))).toThrow(/energyEach/);
        expect(() => founderMixture(spec({ arena: { columns: 2, rows: 2 } }))).toThrow(/fewer cells/);
    });
});
