import { describe, expect, it } from 'vitest';
import { createArchive, nextClone, offer, selectParent } from '../../js/evo/archive.js';
import { decodeArchive, encodeArchive } from '../../js/evo/archive-codec.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createSimLog } from '../../js/sim/log.js';
import { createRng, nextGaussian } from '../../js/sim/rng.js';

const config = createConfig({ rayCount: 2, brainHidden: 4 });
const layout = brainLayout(config);

/** @returns {import('../../js/evo/archive.js').Archive} an archive with genomes in all five specialisations */
function makeArchive() {
    const archive = createArchive(layout);
    const rng = createRng(11);
    let id = 1;
    for (let spec = 0; spec < 5; spec++) {
        for (const cell of [3, 40, 41]) {
            const row = new Float32Array(layout.weightCount).map(() => nextGaussian(rng));
            offer(archive, { spec, cell, row, sigma: 0.05 * id, id, fitness: 10 * id });
            id++;
        }
        const row = new Float32Array(layout.weightCount).map(() => nextGaussian(rng));
        offer(archive, { spec, cell: 40, row, sigma: 0.2, id, fitness: 1000 });
        id++;
    }
    offer(archive, {
        spec: 0,
        row: archive.rows.slice(0, layout.weightCount),
        sigma: 1,
        id: 99,
        fitness: 7,
        isClone: true,
        archiveRef: 3,
        refId: 1,
    });
    nextClone(archive, 2);
    return archive;
}

/** @param {any} json a JSON-able value @returns {any} a copy through JSON text */
const viaText = (json) => JSON.parse(JSON.stringify(json));

describe('archive codec', () => {
    it('round-trips: encode, decode, encode is equal', () => {
        const archive = makeArchive();
        const json = viaText(encodeArchive(archive, config));
        const again = decodeArchive(json, config);
        expect(encodeArchive(again, config)).toEqual(json);
        expect(json.cells.map((/** @type {any} */ c) => c.specialisation)).toContain('defender');
        expect(json.cells.some((/** @type {any} */ c) => c.challenger)).toBe(true);
        expect(again.rows).toEqual(archive.rows);
        expect(again.stats).toEqual(archive.stats);
    });

    it('behaves the same after decoding', () => {
        const archive = makeArchive();
        const again = decodeArchive(viaText(encodeArchive(archive, config)), config);
        for (let i = 0; i < 20; i++) {
            expect(nextClone(again, 2)).toEqual(nextClone(archive, 2));
        }
        expect(selectParent(again, 4, createRng(5))).toEqual(selectParent(archive, 4, createRng(5)));
    });

    it('decodes a document without cursors to zeroed cursors', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        delete json.cursors;
        expect(Array.from(decodeArchive(json, config).cursors).every((c) => c === 0)).toBe(true);
    });

    it('stores only occupied cells', () => {
        const json = encodeArchive(createArchive(layout), config);
        expect(json).toMatchObject({ version: 1, cells: [] });
    });

    it('rejects a mismatched layout field, rulesHash or version by name', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        expect(() => decodeArchive(json, createConfig({ rayCount: 3, brainHidden: 4 }))).toThrow(/layout\.inputCount/);
        expect(() => decodeArchive(json, createConfig({ rayCount: 2, brainHidden: 5 }))).toThrow(/layout\.brainHidden/);
        expect(() => decodeArchive({ ...json, rulesHash: 'x' }, config)).toThrow(/rulesHash/);
        expect(() => decodeArchive({ ...json, version: 2 }, config)).toThrow(/version/);
    });

    it('logs GenomeRejected with the field, expected and actual when it rejects', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        /** @type {any[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        expect(() => decodeArchive({ ...json, rulesHash: 'x' }, config, log)).toThrow(/rulesHash/);
        expect(() => decodeArchive(json, createConfig({ rayCount: 3, brainHidden: 4 }), log)).toThrow(/inputCount/);
        expect(records.map((r) => [r.event, r.level, r.field, r.actual])).toEqual([
            ['GenomeRejected', 'error', 'archive.rulesHash', 'x'],
            ['GenomeRejected', 'error', 'archive.layout.inputCount', json.layout.inputCount],
        ]);
        expect(records[1].expected).toBe(brainLayout(createConfig({ rayCount: 3, brainHidden: 4 })).inputCount);
    });

    it('rejects an unknown specialisation', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        json.cells[0].specialisation = 'wizard';
        expect(() => decodeArchive(json, config)).toThrow(/wizard/);
    });
});
