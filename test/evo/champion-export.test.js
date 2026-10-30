import { describe, expect, it } from 'vitest';
import { createArchive, seedArchive, refOf, placeOf, ELITE } from '../../js/evo/archive.js';
import { WELFORD_STRIDE, welfordAdd } from '../../js/evo/welford.js';
import { exportChampions } from '../../js/evo/champion-export.js';
import { validateChampion } from '../../js/evo/league.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const config = createConfig({});
const layout = brainLayout(config);

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @param {{spec: number, cell: number, id: number, fill: number, fitness: number}} elite the elite to seed
 * @returns {void}
 */
function seed(archive, { spec, cell, id, fill, fitness }) {
    seedArchive(archive, { spec, cell, id, sigma: 0.1, weights: new Float32Array(layout.weightCount).fill(fill) });
    welfordAdd(archive.stats, placeOf(spec, cell, ELITE) * WELFORD_STRIDE, fitness);
}

describe('exportChampions', () => {
    const archive = createArchive(layout);
    seed(archive, { spec: 0, cell: 5, id: 11, fill: 0.25, fitness: 3 });
    seed(archive, { spec: 1, cell: 7, id: 12, fill: -0.5, fitness: 9 });
    seed(archive, { spec: 0, cell: 2, id: 13, fill: 0.125, fitness: 9 });

    it('writes the best elites first, ties in place order, named by run, specialisation and cell', () => {
        const files = exportChampions(archive, config, { count: 2, label: 'live-s7' });
        expect(files.map((f) => [f.name, f.genomeId])).toEqual([
            ['live-s7-forager-cell2', 13],
            ['live-s7-predator-cell7', 12],
        ]);
    });

    it('writes files validateChampion accepts, with the genome bit for bit', () => {
        const [file] = exportChampions(archive, config, { count: 1, label: 'x' });
        const champion = validateChampion(JSON.parse(JSON.stringify(file)), config);
        expect(champion.specialisation).toBe(0);
        expect(champion.weights.every((w) => w === 0.125)).toBe(true);
    });

    it('returns fewer files than asked for when the archive holds fewer elites', () => {
        expect(exportChampions(archive, config, { count: 10, label: 'x' })).toHaveLength(3);
        expect(exportChampions(createArchive(layout), config, { count: 4, label: 'x' })).toEqual([]);
    });

    it('stamps the layout name with the sizes', () => {
        const [file] = exportChampions(archive, config, { count: 1, label: 'x' });
        expect(file.layout).toEqual({ name: 'pooled-v2', inputCount: 81, brainHidden: 32, outputCount: 11 });
    });

    it('reads the same elites the archive holds', () => {
        const [file] = exportChampions(archive, config, { count: 1, label: 'x' });
        const ref = refOf(archive, placeOf(0, file.cell, ELITE));
        expect(ref.id).toBe(file.genomeId);
    });
});
