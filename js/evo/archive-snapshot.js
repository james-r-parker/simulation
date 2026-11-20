// A snapshot of an archive as plain typed arrays: the cheap way to hand a frozen copy to a worker thread (structured
// clone) without the JSON codec and its `rulesHash` check, which a curriculum stage change would trip. Pure.

import { createArchive } from './archive.js';
import { brainLayout } from '../sim/brain-layout.js';

const ARRAYS = /** @type {const} */ (['rows', 'sigmas', 'ids', 'occupied', 'stats', 'cursors']);

/**
 * @typedef {object} ArchiveSnapshot
 * @property {Float32Array} rows weights per place
 * @property {Float32Array} sigmas sigma per place
 * @property {Float64Array} ids genome id per place
 * @property {Uint8Array} occupied 1 where a place holds a genome
 * @property {Float64Array} stats Welford triple per place
 * @property {Int32Array} cursors `nextClone` cursor per specialisation
 */

/**
 * @template {Float32Array | Float64Array | Uint8Array | Int32Array} T
 * @param {T} source an archive state array
 * @param {boolean} shared whether the copy lives in a `SharedArrayBuffer`
 * @returns {T} a copy of the array
 */
function copyOf(source, shared) {
    if (!shared) {
        return /** @type {T} */ (source.slice());
    }
    const Type = /** @type {any} */ (source.constructor);
    const copy = new Type(new SharedArrayBuffer(source.byteLength));
    copy.set(source);
    return /** @type {T} */ (copy);
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {{shared?: boolean}} [options] `shared`: put the copies in `SharedArrayBuffer`s, so posting the snapshot to a
 *   worker thread shares the memory instead of cloning it (the worker only reads it)
 * @returns {ArchiveSnapshot} copies of the archive's state arrays
 */
export function snapshotArchive(archive, { shared = false } = {}) {
    return {
        rows: copyOf(archive.rows, shared),
        sigmas: copyOf(archive.sigmas, shared),
        ids: copyOf(archive.ids, shared),
        occupied: copyOf(archive.occupied, shared),
        stats: copyOf(archive.stats, shared),
        cursors: copyOf(archive.cursors, shared),
    };
}

/**
 * @param {ArchiveSnapshot} snapshot a `snapshotArchive` result (also after a structured clone)
 * @param {Readonly<Record<string, any>>} config the config whose brain layout the rows fit
 * @param {{descriptor?: import('./descriptors.js').Descriptor, nCap?: number}} [options] the archive's descriptor and nCap
 * @returns {import('./archive.js').Archive} an archive holding a copy of the snapshot
 * @throws {Error} naming the array when its length does not fit the layout
 */
export function restoreArchive(snapshot, config, options = {}) {
    const archive = createArchive(brainLayout(config), options);
    for (const name of ARRAYS) {
        if (snapshot[name].length !== archive[name].length) {
            throw new Error(
                `restoreArchive: ${name} has length ${snapshot[name].length}, the layout needs ${archive[name].length}`,
            );
        }
        /** @type {any} */ (archive[name]).set(snapshot[name]);
    }
    return archive;
}
