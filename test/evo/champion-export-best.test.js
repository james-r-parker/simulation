import { describe, expect, it } from 'vitest';
import { ELITE, createArchive, placeOf, seedArchive } from '../../js/evo/archive.js';
import { bestElites } from '../../js/evo/champion-export.js';
import { WELFORD_STRIDE, welfordAdd } from '../../js/evo/welford.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const layout = brainLayout(createConfig({}));

describe('bestElites', () => {
    const archive = createArchive(layout);
    /** @type {[number, number, number, number][]} spec, cell, id, fitness */
    const elites = [
        [1, 3, 21, 1],
        [1, 4, 22, 9],
        [1, 5, 23, 5],
        [0, 6, 24, 99],
    ];
    for (const [spec, cell, id, fitness] of elites) {
        seedArchive(archive, { spec, cell, id, sigma: 0.1, weights: new Float32Array(layout.weightCount) });
        welfordAdd(archive.stats, placeOf(spec, cell, ELITE) * WELFORD_STRIDE, fitness);
    }

    it("takes one specialisation's elites, best lower bound first, up to the count", () => {
        expect(bestElites(archive, { spec: 1, count: 2 }).map((e) => e.id)).toEqual([22, 23]);
        expect(bestElites(archive, { spec: 1, count: 8 })).toHaveLength(3);
    });

    it('is empty for a specialisation with no elite', () => {
        expect(bestElites(archive, { spec: 3, count: 8 })).toEqual([]);
    });
});
