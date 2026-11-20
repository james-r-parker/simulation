// Turns the best genomes of an archive into champion files (the format `validateChampion` reads), so a probe or the
// league can run what an eval run evolved. Pure: no files.

import { CELLS, CELLS_PER_AXIS, ELITE, archiveCv, lowerBound, placeOf, refOf } from './archive.js';
import { encodeWeights } from './base64.js';
import { GENOME_SPECS } from './genome.js';
import { CHAMPION_VERSION } from './league.js';
import { layoutStamp } from '../sim/brain-layout.js';
import { rulesHash } from '../sim/config.js';

/** Halves of the style axis an export takes a champion from (`descriptorV7`'s y axis: short chases and long ones). */
export const STYLE_BANDS = 2;
/** The band names, in band order. */
export const STYLE_NAMES = /** @type {readonly ('low' | 'high')[]} */ (Object.freeze(['low', 'high']));

/**
 * @param {number} cell a cell index (`bin(style) * CELLS_PER_AXIS + bin(roleSkill)`)
 * @returns {number} its style band: 0 for the lower half of the style axis, 1 for the upper
 */
export function styleBandOf(cell) {
    return Math.floor((Math.floor(cell / CELLS_PER_AXIS) * STYLE_BANDS) / CELLS_PER_AXIS);
}

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
export function allElites(archive) {
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
 * @typedef {object} StylePick
 * @property {ReturnType<typeof refOf>} elite the elite (a row is a view into the archive)
 * @property {number} band its style band, 0 or 1 (`STYLE_NAMES` names it)
 * @property {number} bound the elite's fitness lower bound (the pick's rank within its band)
 */

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @returns {StylePick[]} for each specialisation and each style band, the elite with the highest lower bound (the
 *   elites an archive holds are tested; a band with none gives no pick), in specialisation then band order
 */
export function bestElitePerStyle(archive) {
    const cv = archiveCv(archive);
    /** @type {Map<number, {elite: ReturnType<typeof refOf>, bound: number}>} */
    const best = new Map();
    for (const elite of allElites(archive)) {
        const key = elite.spec * STYLE_BANDS + styleBandOf(elite.cell);
        const bound = lowerBound(archive, elite.place, cv);
        if (bound > (best.get(key)?.bound ?? -Infinity)) {
            best.set(key, { elite, bound });
        }
    }
    return [...best.keys()]
        .sort((a, b) => a - b)
        .map((key) => ({ .../** @type {any} */ (best.get(key)), band: key % STYLE_BANDS }));
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {{spec: number, count: number}} pick the specialisation and how many elites
 * @returns {ReturnType<typeof refOf>[]} up to `count` of the specialisation's elites with the highest lower bound, best
 *   first (ties in place order); a row is a view into the archive
 */
export function bestElites(archive, { spec, count }) {
    const cv = archiveCv(archive);
    return allElites(archive)
        .filter((elite) => elite.spec === spec)
        .map((elite) => ({ elite, bound: lowerBound(archive, elite.place, cv) }))
        .sort((a, b) => b.bound - a.bound || a.elite.place - b.elite.place)
        .slice(0, count)
        .map(({ elite }) => elite);
}

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the files are stamped for (the world they will be played in)
 * @param {{label: string}} options the name prefix
 * @returns {Record<string, any>[]} up to `STYLE_BANDS` champion files per specialisation, `bestElitePerStyle`'s picks,
 *   each with its `style` (`low` or `high`); a band with no tested elite gives none, so a specialisation may export one
 */
export function exportBestPerStyle(archive, config, { label }) {
    return bestElitePerStyle(archive).map(({ elite, band }) => ({
        ...championFile(archive, elite, { config, label }),
        style: STYLE_NAMES[band],
    }));
}
