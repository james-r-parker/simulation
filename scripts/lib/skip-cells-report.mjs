// Skip-cell reports for `npm run train:export` and `npm run drill --champions` (training.md T34): which weights the
// predator genomes carry from prey, kin and other strength into `BITE`, `THRUST` and `TURN`.
import { bestElitePerSpec, bestElites } from '../../js/evo/champion-export.js';
import { SKIP_CELLS, skipCells } from '../../js/evo/champion-skip-cells.js';
import { GENOME_SPECS } from '../../js/evo/genome.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { padTable } from './drill-report.mjs';

/**
 * @param {number | null} value a number
 * @returns {string} two decimals with a sign, or `-`
 */
function signed(value) {
    return value === null ? '-' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * @param {readonly {label: string, skip: import('../../js/evo/champion-skip-cells.js').SkipCells}[]} sets the labelled sets
 * @returns {string[]} a header, then a line per set: the rows read, each cell as `median / min`, and the share of rows
 *   with prey-to-bite below +1
 */
export function formatSkipCells(sets) {
    return padTable([
        ['skip cells (median / min)', 'rows', ...SKIP_CELLS.map((c) => c.name), 'prey>BITE < +1'],
        ...sets.map(({ label, skip }) => [
            label,
            String(skip.count),
            ...SKIP_CELLS.map((c) => `${signed(skip.cells[c.name].median)} / ${signed(skip.cells[c.name].min)}`),
            skip.preyBiteBelowOne === null ? '-' : skip.preyBiteBelowOne.toFixed(2),
        ]),
    ]);
}

/** Elites of each predator specialisation the export reads beside its champions. */
export const ELITE_COUNT = 8;

/**
 * @param {Readonly<Record<string, any>>} config a config
 * @returns {number[]} the indices of the specialisations that can hunt
 */
export function predatorSpecs(config) {
    return Object.values(config.specialisations)
        .filter((s) => /** @type {any} */ (s).canHunt === true)
        .map((s) => /** @type {any} */ (s).index);
}

/**
 * @typedef {object} SkipCellsReport
 * @property {Record<string, any>} json the data `skip-cells.json` holds: `champions` and `elites` by specialisation
 * @property {string[]} lines the table to print
 */

/**
 * The skip cells of an archive's exported predator champions and of the best elites of each predator specialisation.
 * @param {import('../../js/evo/archive.js').Archive} archive the archive
 * @param {Readonly<Record<string, any>>} config the config the archive fits
 * @returns {SkipCellsReport} the data and the table
 */
export function archiveSkipCells(archive, config) {
    const layout = brainLayout(config);
    const specs = predatorSpecs(config);
    const champions = skipCells(
        bestElitePerSpec(archive)
            .filter((e) => specs.includes(e.spec))
            .map((e) => e.row),
        layout,
    );
    /** @type {Record<string, import('../../js/evo/champion-skip-cells.js').SkipCells>} */
    const elites = {};
    for (const spec of specs) {
        elites[GENOME_SPECS[spec]] = skipCells(
            bestElites(archive, { spec, count: ELITE_COUNT }).map((e) => e.row),
            layout,
        );
    }
    const sets = [
        { label: 'exported champions', skip: champions },
        ...Object.entries(elites).map(([name, skip]) => ({ label: `${name} best ${ELITE_COUNT} elites`, skip })),
    ];
    return { json: { champions, elites }, lines: formatSkipCells(sets) };
}

/**
 * The skip cells of drilled genomes that can hunt (a drill report's `--champions`).
 * @param {readonly {weights: Float32Array | null, spec: number | null}[]} genomes the subjects
 * @param {Readonly<Record<string, any>>} config the config they fit
 * @returns {SkipCellsReport | null} the data and the table; null when no genome is a predator
 */
export function genomeSkipCells(genomes, config) {
    const specs = predatorSpecs(config);
    const rows = genomes.flatMap((g) => (g.weights !== null && specs.includes(g.spec ?? -1) ? [g.weights] : []));
    if (rows.length === 0) {
        return null;
    }
    const champions = skipCells(rows, brainLayout(config));
    return { json: { champions }, lines: formatSkipCells([{ label: 'champions', skip: champions }]) };
}
