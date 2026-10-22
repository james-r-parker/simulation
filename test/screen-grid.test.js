import { describe, expect, it } from 'vitest';
import { eachArms, expandGrid } from '../scripts/lib/screen-grid.mjs';

describe('eachArms', () => {
    it('makes one arm per list value, one per scalar, and keeps an object as one arm', () => {
        expect(
            eachArms({ minAgents: [40, 60], sexesEnabled: true, hebb: { hebbianRate: 0.1, leakEnabled: true } }),
        ).toEqual({
            'minAgents-40': { minAgents: 40 },
            'minAgents-60': { minAgents: 60 },
            sexesEnabled: { sexesEnabled: true },
            hebb: { hebbianRate: 0.1, leakEnabled: true },
        });
    });
});

describe('expandGrid', () => {
    it('adds a base reference arm and lays each arm over the base', () => {
        const plan = expandGrid({
            base: { maxAgents: 300 },
            ticks: 1000,
            each: { minAgents: [40, 80] },
            arms: { custom: { maxAgents: 200, leakEnabled: true } },
        });
        expect(plan).toMatchObject({ seeds: 4, seedOffset: 0, ticks: 1000, policy: 'live', reference: 'base' });
        expect(plan.arms.map((a) => a.name)).toEqual(['base', 'minAgents-40', 'minAgents-80', 'custom']);
        expect(plan.arms[0].overrides).toEqual({ maxAgents: 300 });
        expect(plan.arms[1].overrides).toEqual({ maxAgents: 300, minAgents: 40 });
        expect(plan.arms[3].overrides).toEqual({ maxAgents: 200, leakEnabled: true });
    });

    it('uses a named reference and does not add base', () => {
        const plan = expandGrid({
            ticks: 10,
            reference: 'defaults',
            arms: { defaults: {}, a: { x: 1 } },
            seeds: 2,
            seedOffset: 28,
        });
        expect(plan.arms.map((a) => a.name)).toEqual(['defaults', 'a']);
        expect(plan).toMatchObject({ reference: 'defaults', seeds: 2, seedOffset: 28 });
    });

    it.each([
        [{ arms: { a: {} } }, /ticks must be an integer/],
        [{ ticks: 10 }, /at least one arm/],
        [{ ticks: 10, reference: 'nope', arms: { a: {} } }, /reference "nope" is not an arm/],
        [{ ticks: 10, arms: { 'a b': {} } }, /arm name "a b"/],
        [{ ticks: 10, arms: { a: { seed: 1 } } }, /sets "seed"/],
        [{ ticks: 10, each: { a: 1 }, arms: { a: {} } }, /both "each" and "arms"/],
        [{ ticks: 10, seeds: 0, arms: { a: {} } }, /seeds must be an integer >= 1/],
        [{ ticks: 10, arms: { a: 5 } }, /arms.a must be an object/],
    ])('rejects %j', (grid, message) => {
        expect(() => expandGrid(/** @type {any} */ (grid))).toThrow(message);
    });

    it('expands the T59 worked example', async () => {
        const { default: grid } = await import('../evals/screens/t59.grid.json', { with: { type: 'json' } });
        const plan = expandGrid(/** @type {any} */ (grid));
        expect(plan).toMatchObject({ seeds: 4, seedOffset: 28, ticks: 200000, reference: 'defaults' });
        expect(plan.arms).toHaveLength(29);
    });
});
