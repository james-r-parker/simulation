import { describe, expect, it } from 'vitest';
import { createSampler, riverSeries, stackLayers } from '../../../js/app/ui/chart-data.js';

const WORLD = {
    specs: [
        { index: 0, name: 'predator' },
        { index: 1, name: 'forager' },
    ],
    bornCauses: { INITIAL: 0, MATE: 1, SPLIT: 2 },
    deathCauses: { STARVED: 0, OLD_AGE: 1 },
};

describe('createSampler', () => {
    it('names a series for each chart quantity, leaving out the initial births', () => {
        const { names, kinds, groups } = createSampler(WORLD);
        expect(groups.births).toEqual(['born.mate', 'born.split']);
        expect(groups.deaths).toEqual(['died.starved', 'died.old age']);
        expect(names).toContain('pop.predator');
        expect(names).toContain('occupied.forager');
        expect(names.at(-1)).toBe('caughtShare');
        expect(kinds).toHaveLength(names.length);
        expect(kinds[names.indexOf('born.mate')]).toBe('flow');
        expect(kinds[names.indexOf('pop.predator')]).toBe('level');
    });

    it('turns a stats message into a row, reading what each series names', () => {
        const sampler = createSampler(WORLD);
        const out = new Float64Array(sampler.names.length);
        sampler.fill(
            {
                bySpec: [4, 9],
                lineages: { top: [{ id: 17, share: 0.6 }] },
                birthsByCause: [0, 3, 1],
                deathsByCause: [2, 5],
                combat: { caught: 3, escaped: 1 },
                archive: { coverage: 0.25, occupiedCount: [7, 8] },
            },
            out,
        );
        const at = (/** @type {string} */ name) => out[sampler.names.indexOf(name)];
        expect(at('pop.forager')).toBe(9);
        expect(at('river.id0')).toBe(17);
        expect(at('river.id1')).toBe(-1);
        expect(at('river.share0')).toBe(0.6);
        expect(at('born.mate')).toBe(3);
        expect(at('died.old age')).toBe(5);
        expect(at('caught')).toBe(3);
        expect(at('coverage')).toBe(0.25);
        expect(at('occupied.predator')).toBe(7);
        expect(at('caughtShare')).toBe(0.75);
    });

    it('keeps a running caught share across messages and forgets it on reset', () => {
        const sampler = createSampler(WORLD);
        const out = new Float64Array(sampler.names.length);
        const share = () => out[sampler.names.length - 1];
        sampler.fill({ combat: { caught: 1, escaped: 1 } }, out);
        sampler.fill({ combat: { caught: 2, escaped: 0 } }, out);
        expect(share()).toBe(0.75);
        sampler.reset();
        sampler.fill({}, out);
        expect(share()).toBe(0);
    });
});

describe('stackLayers', () => {
    it('gives cumulative tops, highest first', () => {
        const tops = stackLayers([Float64Array.of(1, 2), Float64Array.of(3, 1)]);
        expect(tops.map((t) => Array.from(t))).toEqual([
            [4, 3],
            [1, 2],
        ]);
    });

    it('stacks downward with a negative sign', () => {
        expect(Array.from(stackLayers([Float64Array.of(2), Float64Array.of(1)], -1)[0])).toEqual([-3]);
    });
});

describe('riverSeries', () => {
    /** @param {number[][]} ids rank slots by sample @param {number[][]} shares @returns {Record<string, Float64Array>} */
    function cols(ids, shares) {
        /** @type {Record<string, Float64Array>} */
        const out = { t: new Float64Array(ids.length) };
        for (let slot = 0; slot < 8; slot++) {
            out[`river.id${slot}`] = Float64Array.from(ids, (row) => row[slot] ?? -1);
            out[`river.share${slot}`] = Float64Array.from(shares, (row) => row[slot] ?? 0);
        }
        return out;
    }

    it('follows a lineage across the rank slots it moves through', () => {
        const river = riverSeries(cols([[5, 9], [9, 5], [9]], [[0.5, 0.3], [0.6, 0.2], [0.7]]), 8);
        const byId = new Map(river.layers.map((l) => [l.id, l]));
        const five = /** @type {any} */ (byId.get(5));
        const nine = /** @type {any} */ (byId.get(9));
        expect(Array.from(five.top)).toEqual([0.5, 0.2, 0]);
        expect(Array.from(nine.top)).toEqual([0.8, 0.8, 0.7]);
    });

    it('draws the others band first and makes the stack reach 1', () => {
        const river = riverSeries(cols([[5], [5]], [[0.25], [0.5]]), 8);
        expect(river.layers[0].id).toBeNull();
        expect(Array.from(river.layers[0].top)).toEqual([1, 1]);
        expect(river.layers).toHaveLength(2);
    });

    it('keeps only the largest lineages by peak share, the rest joining others', () => {
        const river = riverSeries(cols([[1, 2, 3]], [[0.5, 0.3, 0.1]]), 2);
        expect(river.layers.map((l) => l.id)).toEqual([null, 2, 1]);
        expect(Array.from(river.layers[1].top)).toEqual([0.8]);
        expect(river.layers[0].top[0]).toBeCloseTo(1);
    });

    it('handles no samples', () => {
        const river = riverSeries(cols([], []));
        expect(river.layers).toHaveLength(1);
        expect(river.layers[0].top).toHaveLength(0);
    });
});
