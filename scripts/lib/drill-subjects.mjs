// Turns an archive or champion files into drill subjects.
import { CELLS, ELITE, archiveCv, lowerBound, placeOf, refOf } from '../../js/evo/archive.js';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { validateChampion } from '../../js/evo/league.js';

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {import('../../js/evo/memory-probe-run.js').Subject[]} each specialisation's elite with the highest lower
 *   bound, in specialisation order (a specialisation with no elite has none); the rows are copies
 */
export function eliteSubjects(archive) {
    const cv = archiveCv(archive);
    const subjects = [];
    for (let spec = 0; spec < GENOME_SPECS.length; spec++) {
        let best = null;
        let bestBound = -Infinity;
        for (let cell = 0; cell < CELLS; cell++) {
            const place = placeOf(spec, cell, ELITE);
            if (archive.occupied[place] !== 1) {
                continue;
            }
            const bound = lowerBound(archive, place, cv);
            if (bound > bestBound) {
                best = refOf(archive, place);
                bestBound = bound;
            }
        }
        if (best !== null) {
            subjects.push({
                name: `elite-${GENOME_SPECS[spec]}-cell${best.cell}`,
                id: best.id,
                spec,
                weights: Float32Array.from(best.row),
                act: null,
            });
        }
    }
    return subjects;
}

/**
 * @param {Record<string, any>} file a parsed champion file
 * @param {Readonly<Record<string, any>>} config the config the file is checked against
 * @returns {import('../../js/evo/memory-probe-run.js').Subject} the champion as a subject
 * @throws {Error} when the file does not fit the layout (`validateChampion`'s message)
 */
export function fileSubject(file, config) {
    const champion = validateChampion(file, config);
    return {
        name: champion.name,
        id: file.genomeId ?? 0,
        spec: champion.specialisation,
        weights: champion.weights,
        act: null,
    };
}
