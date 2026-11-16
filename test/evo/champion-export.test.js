import { describe, expect, it } from 'vitest';
import { createArchive, seedArchive, refOf, placeOf, ELITE } from '../../js/evo/archive.js';
import { WELFORD_STRIDE, welfordAdd } from '../../js/evo/welford.js';
import {
    STYLE_BANDS,
    STYLE_NAMES,
    bestElitePerStyle,
    exportBestPerStyle,
    exportChampions,
    styleBandOf,
} from '../../js/evo/champion-export.js';
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
        expect(file.layout).toEqual({ name: 'pooled-v5', inputCount: 92, brainHidden: 32, outputCount: 11 });
    });

    it('reads the same elites the archive holds', () => {
        const [file] = exportChampions(archive, config, { count: 1, label: 'x' });
        const ref = refOf(archive, placeOf(0, file.cell, ELITE));
        expect(ref.id).toBe(file.genomeId);
    });
});

describe('styleBandOf', () => {
    it('splits the style axis (the cell row) into a low and a high half', () => {
        expect([0, 9, 10, 49, 50, 59, 99].map(styleBandOf)).toEqual([0, 0, 0, 0, 1, 1, 1]);
        expect(STYLE_BANDS).toBe(2);
        expect(STYLE_NAMES).toEqual(['low', 'high']);
    });
});

describe('exportBestPerStyle', () => {
    const archive = createArchive(layout);
    seed(archive, { spec: 0, cell: 5, id: 11, fill: 0.25, fitness: 3 });
    seed(archive, { spec: 0, cell: 2, id: 13, fill: 0.125, fitness: 9 });
    seed(archive, { spec: 1, cell: 7, id: 12, fill: -0.5, fitness: 9 });
    seed(archive, { spec: 1, cell: 71, id: 14, fill: 0.5, fitness: 4 });
    seed(archive, { spec: 1, cell: 55, id: 15, fill: 0.75, fitness: 8 });

    it('picks, per specialisation and style band, the elite with the highest lower bound', () => {
        expect(bestElitePerStyle(archive).map((p) => [p.elite.spec, p.band, p.elite.id])).toEqual([
            [0, 0, 13],
            [1, 0, 12],
            [1, 1, 15],
        ]);
        expect(bestElitePerStyle(archive).every((p) => Number.isFinite(p.bound))).toBe(true);
    });

    it('writes up to two champions per specialisation, each with its style, that validateChampion accepts', () => {
        const files = exportBestPerStyle(archive, config, { label: 'run' });
        expect(files.map((f) => [f.name, f.style])).toEqual([
            ['run-forager-cell2', 'low'],
            ['run-predator-cell7', 'low'],
            ['run-predator-cell55', 'high'],
        ]);
        for (const file of files) {
            const champion = validateChampion(JSON.parse(JSON.stringify(file)), config);
            expect(champion.specialisation).toBe(file.specialisation);
        }
    });

    it('gives no champion for a band with no tested elite, and none at all for an empty archive', () => {
        const forager = exportBestPerStyle(archive, config, { label: 'run' }).filter((f) => f.specialisation === 0);
        expect(forager.map((f) => f.style)).toEqual(['low']);
        expect(exportBestPerStyle(createArchive(layout), config, { label: 'run' })).toEqual([]);
    });

    it('keeps an elite of the high band out of the low band even when it is the best of its specialisation', () => {
        const only = createArchive(layout);
        seed(only, { spec: 1, cell: 90, id: 21, fill: 0.5, fitness: 50 });
        seed(only, { spec: 1, cell: 3, id: 22, fill: 0.25, fitness: 1 });
        expect(bestElitePerStyle(only).map((p) => [p.band, p.elite.id])).toEqual([
            [0, 22],
            [1, 21],
        ]);
    });
});
