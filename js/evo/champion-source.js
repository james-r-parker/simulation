// The champions `champions-v1` seeds from: parsed champion files checked against the world's config and grouped by
// specialisation. Pure: the files are read elsewhere (`scripts/lib/champion-files.mjs` headless,
// `js/worker/champion-fetch.js` in the browser) and passed in.

import { nextInt } from '../sim/rng.js';
import { validateChampion } from './league.js';

/**
 * @typedef {object} ChampionSource
 * @property {(spec: number, rng: import('../sim/rng.js').Rng) => Float32Array | null} draw the weights of a uniformly
 *   drawn champion of the specialisation, or null (logging `ChampionMissing` once per specialisation) when it has none
 * @property {number} count how many champions the source holds
 */

/**
 * @param {unknown} files parsed champion files (the `validateChampion` format)
 * @param {Readonly<Record<string, any>>} config the running config; a file stamped for other rules or another layout is refused
 * @param {import('../sim/log.js').SimLog} [log] where a specialisation with no champion is logged
 * @returns {ChampionSource} the source
 * @throws {Error} when `files` is not a non-empty array, or a file does not fit the config (naming the file's index)
 */
export function createChampionSource(files, config, log) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error(
            'champions-v1: needs champion files (the `champions` option, or `championsDir` in an eval); got none',
        );
    }
    /** @type {Map<number, Float32Array[]>} */
    const bySpec = new Map();
    files.forEach((file, index) => {
        let champion;
        try {
            champion = validateChampion(file, config);
        } catch (error) {
            throw new Error(`champions-v1: champion file ${index}: ${/** @type {Error} */ (error).message}`, {
                cause: error,
            });
        }
        bySpec.set(champion.specialisation, [...(bySpec.get(champion.specialisation) ?? []), champion.weights]);
    });
    const warned = new Set();
    return {
        count: files.length,
        draw(spec, rng) {
            const held = bySpec.get(spec);
            if (held === undefined) {
                if (!warned.has(spec)) {
                    warned.add(spec);
                    log?.log('warn', 'ChampionMissing', { spec, fallback: 'random' });
                }
                return null;
            }
            return held[held.length === 1 ? 0 : nextInt(rng, held.length)];
        },
    };
}
