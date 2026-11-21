// Formats the `--genes` readings of `npm run role:budget`: the corner of the trait menus that gives each cell's least and
// most slack, or the row at the best or worst corner pair (docs/designs/body-genes.md, "The calculator reads the menu").
import { readCorners, readExtremes } from '../../js/evo/role-budget-corners.js';
import { padTable } from './drill-report.mjs';
import { formatMatrix } from './role-budget-report.mjs';

export const GENES_MODES = Object.freeze(['none', 'best-vs-worst', 'worst-vs-best', 'corners']);

/**
 * @param {string | undefined} value the value of `--genes`
 * @returns {string} the mode
 * @throws {Error} on a value that is not a mode
 */
export function genesMode(value) {
    if (!GENES_MODES.includes(String(value))) {
        throw new Error(`--genes: "${value}" is not one of ${GENES_MODES.join(', ')}`);
    }
    return String(value);
}

/**
 * @param {Record<string, number>} ratios a corner's trait ratios
 * @returns {string} `trait=ratio` for each trait away from the default, `defaults` for none
 */
export function cornerText(ratios) {
    const parts = Object.entries(ratios).map(([name, value]) => `${name}=${Number(value.toFixed(3))}`);
    return parts.length === 0 ? 'defaults' : parts.join(' ');
}

/**
 * @param {import('../../js/evo/role-budget-corners.js').CornerPick} pick a corner pick
 * @returns {string} its slack and its corner pair
 */
function pickText(pick) {
    const slack = pick.margin === null ? 'X' : String(Math.round(pick.margin));
    return `${slack} (${cornerText(pick.performer)} | ${cornerText(pick.pressure)})`;
}

/**
 * @param {import('../../js/evo/role-budget-corners.js').CornerRead[]} reads each row's cells over every corner pair
 * @returns {string} per row, a line per step: the least and the most slack in ticks and the performer and pressure corner
 *   that gives each
 */
export function formatCorners(reads) {
    return reads
        .map(({ row, pairs, cells }) => {
            const lines = Object.entries(cells).map(([step, { min, max }]) => [step, pickText(min), pickText(max)]);
            return [
                `${row} over ${pairs} corner pair${pairs === 1 ? '' : 's'} (performer | pressure)`,
                ...padTable([['step', 'least slack', 'most slack'], ...lines]),
            ].join('\n');
        })
        .join('\n\n');
}

/**
 * @param {{mode: string, picks: {row: import('../../js/evo/role-budget-matrix.js').Row, performer: Record<string, number>, pressure: Record<string, number>}[]}} extremes
 *   the rows at the chosen corners
 * @returns {string} the matrix of those rows, then the corners each was read at
 */
export function formatExtremes({ mode, picks }) {
    const corners = picks.map(
        (p) => `${p.row.name}: performer ${cornerText(p.performer)}; pressure ${cornerText(p.pressure)}`,
    );
    return [`--genes ${mode}`, formatMatrix(picks.map((p) => p.row)), ...corners].join('\n');
}

/**
 * @param {string} genes a mode of `GENES_MODES` other than `none`
 * @param {import('../../js/evo/role-budget-corners.js').Reading} reading the config, the world config and the model
 * @param {readonly string[]} rows the rows to read
 * @returns {{text: string, data: any}} the report of the rows at the corners of their menus, and its data
 */
export function readGenes(genes, reading, rows) {
    if (genes === 'corners') {
        const reads = rows.map((row) => readCorners(reading, row));
        return { text: formatCorners(reads), data: reads };
    }
    const picks = rows.map((row) => readExtremes(reading, row, /** @type {any} */ (genes)));
    return { text: formatExtremes({ mode: genes, picks }), data: picks };
}
