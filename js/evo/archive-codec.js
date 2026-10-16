// The archive JSON: all five specialisations, stamped with the brain layout and `rulesHash` it was built for.

import { CELLS, CHALLENGER, ELITE, createArchive, placeOf } from './archive.js';
import { decodeWeights, encodeWeights } from './base64.js';
import { GENOME_SPECS } from './genome.js';
import { WELFORD_STRIDE } from './welford.js';
import { brainLayout } from '../sim/brain-layout.js';
import { rulesHash } from '../sim/config.js';

/** The archive format version. */
export const ARCHIVE_VERSION = 1;

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout` result
 * @returns {{ inputCount: number, brainHidden: number, outputCount: number }} the layout stamp
 */
function layoutStamp(layout) {
    return { inputCount: layout.inputCount, brainHidden: layout.hidden, outputCount: layout.outputCount };
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {number} place an occupied place
 * @returns {Record<string, any>} the genome entry: id, sigma, Welford `n`, `mean`, `m2`, base64 weights
 */
function encodePlace(archive, place) {
    const wc = archive.layout.weightCount;
    const o = place * WELFORD_STRIDE;
    return {
        id: archive.ids[place],
        sigma: archive.sigmas[place],
        n: archive.stats[o],
        mean: archive.stats[o + 1],
        m2: archive.stats[o + 2],
        weights: encodeWeights(archive.rows.subarray(place * wc, (place + 1) * wc)),
    };
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the archive was built under
 * @returns {Record<string, any>} JSON-able `{ version, layout, rulesHash, cursors, cells }`; only occupied cells are
 *   listed, in specialisation then cell order, each with its `elite` and `challenger` (or null)
 */
export function encodeArchive(archive, config) {
    const cells = [];
    for (let spec = 0; spec < GENOME_SPECS.length; spec++) {
        for (let cell = 0; cell < CELLS; cell++) {
            const elite = placeOf(spec, cell, ELITE);
            const chal = placeOf(spec, cell, CHALLENGER);
            if (archive.occupied[elite] === 1) {
                cells.push({
                    specialisation: GENOME_SPECS[spec],
                    cell,
                    elite: encodePlace(archive, elite),
                    challenger: archive.occupied[chal] === 1 ? encodePlace(archive, chal) : null,
                });
            }
        }
    }
    return {
        version: ARCHIVE_VERSION,
        layout: layoutStamp(archive.layout),
        rulesHash: rulesHash(config),
        cursors: Array.from(archive.cursors),
        cells,
    };
}

/**
 * @param {import('./archive.js').Archive} archive the archive to fill
 * @param {number} place the place
 * @param {Record<string, any>} entry an `encodePlace` result
 * @returns {void}
 */
function decodePlace(archive, place, entry) {
    const wc = archive.layout.weightCount;
    archive.rows.set(decodeWeights(entry.weights, wc), place * wc);
    archive.sigmas[place] = entry.sigma;
    archive.ids[place] = entry.id;
    archive.occupied[place] = 1;
    archive.stats.set([entry.n, entry.mean, entry.m2], place * WELFORD_STRIDE);
}

/**
 * @param {Record<string, any>} json the object `encodeArchive` returns, after a JSON round trip
 * @param {Readonly<Record<string, any>>} config the running config
 * @returns {void}
 * @throws {Error} naming the mismatched field
 */
function assertFits(json, config) {
    if (json.version !== ARCHIVE_VERSION) {
        throw new Error(`archive.version: expected ${ARCHIVE_VERSION}, got ${json.version}`);
    }
    const want = layoutStamp(brainLayout(config));
    for (const [field, value] of Object.entries(want)) {
        if (json.layout?.[field] !== value) {
            throw new Error(`archive.layout.${field}: expected ${value}, got ${json.layout?.[field]}`);
        }
    }
    if (json.rulesHash !== rulesHash(config)) {
        throw new Error(`archive.rulesHash: expected ${rulesHash(config)}, got ${json.rulesHash}`);
    }
}

/**
 * @param {Record<string, any>} json the object `encodeArchive` returns, after a JSON round trip
 * @param {Readonly<Record<string, any>>} config the running config
 * @returns {import('./archive.js').Archive} an archive that behaves identically to the encoded one
 * @throws {Error} when the layout or `rulesHash` does not match the config (the message names the field), or a
 *   cell is malformed
 */
export function decodeArchive(json, config) {
    assertFits(json, config);
    const archive = createArchive(brainLayout(config));
    for (const entry of json.cells) {
        const spec = GENOME_SPECS.indexOf(entry.specialisation);
        if (spec < 0 || !Number.isInteger(entry.cell) || entry.cell < 0 || entry.cell >= CELLS) {
            throw new Error(`archive.cells: bad specialisation ${entry.specialisation} or cell ${entry.cell}`);
        }
        decodePlace(archive, placeOf(spec, entry.cell, ELITE), entry.elite);
        if (entry.challenger) {
            decodePlace(archive, placeOf(spec, entry.cell, CHALLENGER), entry.challenger);
        }
    }
    archive.cursors.set(json.cursors ?? []);
    return archive;
}
