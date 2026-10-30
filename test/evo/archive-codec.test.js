import { describe, expect, it } from 'vitest';
import { createArchive, nextClone, offer, selectParent } from '../../js/evo/archive.js';
import { ARCHIVE_VERSION, decodeArchive, encodeArchive } from '../../js/evo/archive-codec.js';
import { descriptorV1, descriptorV7 } from '../../js/evo/descriptors.js';
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
        expect(json).toMatchObject({ version: ARCHIVE_VERSION, descriptor: 'v1', cells: [] });
    });

    it('rejects a mismatched layout field, rulesHash or version by name', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        const oldLayout = { ...json.layout, inputCount: 179 };
        expect(() => decodeArchive({ ...json, layout: oldLayout }, config)).toThrow(/layout\.inputCount/);
        expect(() => decodeArchive(json, createConfig({ rayCount: 2, brainHidden: 5 }))).toThrow(/layout\.brainHidden/);
        expect(() => decodeArchive({ ...json, rulesHash: 'x' }, config)).toThrow(/rulesHash/);
        expect(() => decodeArchive({ ...json, version: ARCHIVE_VERSION - 1 }, config)).toThrow(/archive\.version/);
    });

    it('rejects an archive built under another descriptor, naming the field', () => {
        const json = viaText(encodeArchive(createArchive(layout, { descriptor: descriptorV7 }), config));
        expect(json.descriptor).toBe('v7');
        expect(() => decodeArchive(json, config)).toThrow(/archive\.descriptor/);
        expect(() => decodeArchive(json, config, undefined, descriptorV1)).toThrow(/archive\.descriptor/);
        expect(decodeArchive(json, config, undefined, descriptorV7).descriptor).toBe(descriptorV7);
    });

    it('rejects an archive with no descriptor field', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        delete json.descriptor;
        expect(() => decodeArchive(json, config)).toThrow(/archive\.descriptor/);
    });

    it('logs GenomeRejected with the field, expected and actual when it rejects', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        /** @type {any[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        expect(() => decodeArchive({ ...json, rulesHash: 'x' }, config, log)).toThrow(/rulesHash/);
        const old = { ...json, layout: { ...json.layout, inputCount: 179 } };
        expect(() => decodeArchive(old, config, log)).toThrow(/inputCount/);
        expect(records.map((r) => [r.event, r.level, r.field, r.actual])).toEqual([
            ['GenomeRejected', 'error', 'archive.rulesHash', 'x'],
            ['GenomeRejected', 'error', 'archive.layout.inputCount', 179],
        ]);
        expect(records[1].expected).toBe(brainLayout(config).inputCount);
    });

    it('rejects an unknown specialisation', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        json.cells[0].specialisation = 'wizard';
        expect(() => decodeArchive(json, config)).toThrow(/wizard/);
    });

    it('is version 3: the pooled-v2 genome layout made every earlier archive invalid', () => {
        expect(ARCHIVE_VERSION).toBe(3);
    });

    it('rejects a stored archive from before the layout change by its version, cleanly, whatever else it holds', () => {
        // The shape written at version 2: 179 inputs, descriptor v6, genomes of the old size.
        const stored = {
            version: 2,
            descriptor: 'v6',
            layout: { inputCount: 179, brainHidden: 4, outputCount: 11 },
            rulesHash: 'deadbeefdeadbeef',
            cursors: [0, 0, 0, 0, 0],
            cells: [
                {
                    specialisation: 'forager',
                    cell: 3,
                    elite: { id: 1, sigma: 0.05, weights: 'AAAA' },
                    challenger: null,
                },
            ],
        };
        /** @type {any[]} */
        const records = [];
        const log = createSimLog((r) => records.push(r), { level: 'debug' });
        const stale = viaText(stored);
        expect(() => decodeArchive(stale, config, log)).toThrow(/archive\.version: expected 3, got 2/);
        expect(records.map((r) => [r.event, r.field, r.expected, r.actual])).toEqual([
            ['GenomeRejected', 'archive.version', 3, 2],
        ]);
        expect(() => decodeArchive({ version: 2 }, config)).toThrow(/archive\.version/);
        expect(() => decodeArchive({}, config)).toThrow(/archive\.version/);
    });

    it('rejects a current-version archive stamped with the old 179-input layout by the layout field', () => {
        const json = viaText(encodeArchive(makeArchive(), config));
        const old = { ...json, layout: { ...json.layout, inputCount: 179 } };
        expect(() => decodeArchive(old, config)).toThrow(/archive\.layout\.inputCount: expected 81, got 179/);
    });
});
