// Turns an archive or champion files into drill subjects.
import { STYLE_NAMES, allElites, bestElitePerStyle, styleBandOf } from '../../js/evo/champion-export.js';
import { archiveCv, lowerBound } from '../../js/evo/archive.js';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { validateChampion } from '../../js/evo/league.js';

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {import('../../js/evo/memory-probe-run.js').Subject[]} the champions the archive would export: for each
 *   specialisation, the elite with the highest lower bound in each style band (`bestElitePerStyle`), in specialisation
 *   then band order, each with its `style` and `lowerBound`; the rows are copies
 */
export function eliteSubjects(archive) {
    return bestElitePerStyle(archive).map(({ elite, band, bound }) => ({
        name: `elite-${GENOME_SPECS[elite.spec]}-cell${elite.cell}`,
        id: elite.id,
        spec: elite.spec,
        style: STYLE_NAMES[band],
        lowerBound: bound,
        weights: Float32Array.from(elite.row),
        act: null,
    }));
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @returns {import('../../js/evo/memory-probe-run.js').Subject[]} every occupied elite with its `style` and
 *   `lowerBound`, in specialisation then cell order; the rows are copies
 */
export function allEliteSubjects(archive) {
    const cv = archiveCv(archive);
    return allElites(archive).map((elite) => ({
        name: `elite-${GENOME_SPECS[elite.spec]}-cell${elite.cell}`,
        id: elite.id,
        spec: elite.spec,
        style: STYLE_NAMES[styleBandOf(elite.cell)],
        lowerBound: lowerBound(archive, elite.place, cv),
        weights: Float32Array.from(elite.row),
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
