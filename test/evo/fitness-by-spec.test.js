import { describe, expect, it } from 'vitest';
import { TERM_NAMES, createTermTally, noteTerms, tallyingFitness, termTable } from '../../js/evo/fitness-by-spec.js';

/**
 * @param {Record<string, number>} over terms to set
 * @returns {Record<string, number>} a full `FitnessTerms` with the others 0 and `fitness` the paid sum less the waste
 */
function terms(over) {
    const t = { ...Object.fromEntries(TERM_NAMES.map((n) => [n, 0])), ...over };
    t.fitness = TERM_NAMES.filter((n) => n !== 'waste').reduce((a, n) => a + t[n], 0) - t.waste;
    return t;
}

describe('termTable', () => {
    it('gives each specialisation its mean fitness and term shares that, less the waste, sum to 1', () => {
        const tally = createTermTally();
        noteTerms(tally, 1, terms({ intake: 300, role: 100 }));
        noteTerms(tally, 1, terms({ intake: 100, kill: 50, waste: 50 }));
        noteTerms(tally, 0, terms({ intake: 200 }));
        const rows = termTable(tally, ['forager', 'predator']);
        expect(rows.map((r) => r.spec)).toEqual(['forager', 'predator']);
        const predator = rows[1];
        expect(predator.lives).toBe(2);
        expect(predator.mean).toBe(250);
        expect(predator.shares.intake).toBeCloseTo(0.8, 12);
        expect(predator.shares.role).toBeCloseTo(0.2, 12);
        expect(predator.shares.kill).toBeCloseTo(0.1, 12);
        expect(predator.shares.waste).toBeCloseTo(0.1, 12);
        const paid = TERM_NAMES.filter((n) => n !== 'waste').reduce((a, n) => a + (predator.shares[n] ?? 0), 0);
        expect(paid - (predator.shares.waste ?? 0)).toBeCloseTo(1, 12);
        expect(rows[0].shares.intake).toBe(1);
    });

    it('reports null shares for a specialisation whose fitness totals 0', () => {
        const tally = createTermTally();
        noteTerms(tally, 2, terms({}));
        expect(termTable(tally, [])[0]).toMatchObject({ spec: '2', lives: 1, mean: 0, shares: { intake: null } });
    });
});

describe('tallyingFitness', () => {
    it('returns the fitness unchanged and tallies the terms only while on', () => {
        let on = false;
        const base = Object.assign(() => 7, {
            weights: { BORN: 50 },
            terms: (/** @type {any} */ _o, /** @type {number} */ _s, /** @type {any} */ _c, /** @type {any} */ out) =>
                Object.assign(out, terms({ intake: 7 })),
        });
        const tally = createTermTally();
        const f = tallyingFitness(/** @type {any} */ (base), { tally, on: () => on });
        const observer = { spec: [3] };
        expect(f(observer, 0, {})).toBe(7);
        expect(tally.bySpec).toEqual([]);
        on = true;
        expect(f(observer, 0, {})).toBe(7);
        expect(tally.bySpec[3]).toMatchObject({ lives: 1, fitness: 7, intake: 7 });
        expect(/** @type {any} */ (f).weights).toEqual({ BORN: 50 });
    });
});
