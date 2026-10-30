// Turns the best genomes of an archive into champion files (the format `validateChampion` reads), so a probe or the
// league can run what an eval run evolved. Pure: no files.

import { CELLS, ELITE, placeOf, refOf } from './archive.js';
import { encodeWeights } from './base64.js';
import { GENOME_SPECS } from './genome.js';
import { CHAMPION_VERSION } from './league.js';
import { layoutStamp } from '../sim/brain-layout.js';
import { rulesHash } from '../sim/config.js';

/**
 * @param {import('./archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the archive's world ran on
 * @param {{count: number, label: string}} options how many files, and the name prefix (a run and seed label)
 * @returns {Record<string, any>[]} up to `count` champion files, the elites with the highest mean fitness first (ties
 *   in place order); `genomeId` and `fitness` are extra fields `validateChampion` ignores
 */
export function exportChampions(archive, config, { count, label }) {
    const layout = archive.layout;
    const elites = [];
    for (let cellIndex = 0; cellIndex < GENOME_SPECS.length * CELLS; cellIndex++) {
        const place = placeOf(Math.floor(cellIndex / CELLS), cellIndex % CELLS, ELITE);
        if (archive.occupied[place] === 1) {
            elites.push(refOf(archive, place));
        }
    }
    elites.sort((a, b) => b.mean - a.mean || a.place - b.place);
    return elites.slice(0, count).map((elite) => ({
        version: CHAMPION_VERSION,
        name: `${label}-${GENOME_SPECS[elite.spec]}-cell${elite.cell}`,
        rulesHash: rulesHash(config),
        layout: layoutStamp(layout),
        specialisation: elite.spec,
        weights: encodeWeights(elite.row),
        cell: elite.cell,
        genomeId: elite.id,
        fitness: elite.mean,
    }));
}
