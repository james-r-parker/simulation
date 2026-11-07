// Turns the best genomes of an archive into champion files (the format `validateChampion` reads), so a probe or the
// league can run what an eval run evolved. Pure: no files.

import { CELLS, ELITE, archiveCv, lowerBound, placeOf, refOf } from './archive.js';
import { encodeWeights } from './base64.js';
import { GENOME_SPECS } from './genome.js';
import { CHAMPION_VERSION } from './league.js';
import { layoutStamp } from '../sim/brain-layout.js';
import { rulesHash } from '../sim/config.js';

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {ReturnType<typeof refOf>} elite one of its elites
 * @param {{config: Readonly<Record<string, any>>, label: string}} stamp the config whose `rulesHash` the file carries,
 *   and the name prefix
 * @returns {Record<string, any>} the champion file
 */
function championFile(archive, elite, { config, label }) {
    return {
        version: CHAMPION_VERSION,
        name: `${label}-${GENOME_SPECS[elite.spec]}-cell${elite.cell}`,
        rulesHash: rulesHash(config),
        layout: layoutStamp(archive.layout),
        specialisation: elite.spec,
        weights: encodeWeights(elite.row),
        cell: elite.cell,
        genomeId: elite.id,
        fitness: elite.mean,
    };
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @returns {ReturnType<typeof refOf>[]} every occupied elite, in specialisation then cell order
 */
function allElites(archive) {
    const elites = [];
    for (let cellIndex = 0; cellIndex < GENOME_SPECS.length * CELLS; cellIndex++) {
        const place = placeOf(Math.floor(cellIndex / CELLS), cellIndex % CELLS, ELITE);
        if (archive.occupied[place] === 1) {
            elites.push(refOf(archive, place));
        }
    }
    return elites;
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the archive's world ran on
 * @param {{count: number, label: string}} options how many files, and the name prefix (a run and seed label)
 * @returns {Record<string, any>[]} up to `count` champion files, the elites with the highest mean fitness first (ties
 *   in place order); `genomeId` and `fitness` are extra fields `validateChampion` ignores
 */
export function exportChampions(archive, config, { count, label }) {
    const elites = allElites(archive);
    elites.sort((a, b) => b.mean - a.mean || a.place - b.place);
    return elites.slice(0, count).map((elite) => championFile(archive, elite, { config, label }));
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @returns {ReturnType<typeof refOf>[]} each specialisation's elite with the highest lower bound, in specialisation
 *   order (a specialisation with no elite has none); a row is a view into the archive
 */
export function bestElitePerSpec(archive) {
    const cv = archiveCv(archive);
    /** @type {Map<number, {elite: ReturnType<typeof refOf>, bound: number}>} */
    const best = new Map();
    for (const elite of allElites(archive)) {
        const bound = lowerBound(archive, elite.place, cv);
        if (bound > (best.get(elite.spec)?.bound ?? -Infinity)) {
            best.set(elite.spec, { elite, bound });
        }
    }
    return [...best.keys()].sort((a, b) => a - b).map((spec) => /** @type {any} */ (best.get(spec)).elite);
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the files are stamped for (the world they will be played in)
 * @param {{label: string}} options the name prefix
 * @returns {Record<string, any>[]} one champion file per specialisation that has an elite: `bestElitePerSpec`'s picks
 */
export function exportBestPerSpec(archive, config, { label }) {
    return bestElitePerSpec(archive).map((elite) => championFile(archive, elite, { config, label }));
}
