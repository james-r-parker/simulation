// Turns an archive or champion files into drill subjects.
import { bestElitePerSpec } from '../../js/evo/champion-export.js';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { validateChampion } from '../../js/evo/league.js';

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {import('../../js/evo/memory-probe-run.js').Subject[]} each specialisation's elite with the highest lower
 *   bound, in specialisation order (a specialisation with no elite has none); the rows are copies
 */
export function eliteSubjects(archive) {
    return bestElitePerSpec(archive).map((best) => ({
        name: `elite-${GENOME_SPECS[best.spec]}-cell${best.cell}`,
        id: best.id,
        spec: best.spec,
        weights: Float32Array.from(best.row),
        act: null,
    }));
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
