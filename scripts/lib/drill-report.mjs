// Formats drill results as a text table and as JSON. Pure: no files.

import { armReading } from '../../js/evo/drill-arms.js';
import { ELITE_BAR } from '../../js/evo/elite-skill.js';

/**
 * @typedef {object} DrillCell
 * @property {number} winShare the win share
 * @property {number} edge the win share minus the random brains' mean
 * @property {number} [winShareLow] the 95% Wilson low bound of the win share
 * @property {number} [edgeLow] `winShareLow` minus the Wilson high bound of the random brains' pooled win share
 * @property {number} [wins] trials won (the counts a gate pools over champions)
 * @property {number} [trials] trials played
 * @property {number} [randomWins] wins of the random brains, pooled over their trials
 * @property {number} [randomTrials] trials of the random brains, pooled
 * @property {Record<string, number>} [lossReasons] counts by first-match lost-trial reason
 * @property {Record<string, {wins: number, trials: number}>} [arms] the control arms' scores (`pack-converge`: `solo` and
 *   `kin-blind`; the cell's own wins and trials are the trio's)
 */

/**
 * @typedef {object} DrillRow
 * @property {string} label the subject's label
 * @property {Record<string, DrillCell | null>} cells each drill's cell; null when the subject was skipped
 */

/**
 * @param {DrillRow} row a row
 * @returns {number | null} the mean edge over the drills it ran; null when it ran none
 */
export function meanEdge(row) {
    const edges = Object.values(row.cells).flatMap((cell) => (cell === null ? [] : [cell.edge]));
    return edges.length === 0 ? null : edges.reduce((sum, e) => sum + e, 0) / edges.length;
}

/**
 * @param {number} value a number
 * @returns {string} two decimals with an explicit sign
 */
function signed(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * @param {DrillCell} cell a cell
 * @returns {string} `; solo s, blind b, gain g [low] gap [low]` for a cell with its control arms, else nothing: the lone
 *   hunter's and the kin-blind trio's win shares, the trio's gain over the solo and the low bounds of the gain and of the
 *   gap to the kin-blind trio
 */
function armsText(cell) {
    const reading =
        cell.arms === undefined || cell.wins === undefined || cell.trials === undefined
            ? null
            : armReading({ wins: cell.wins, trials: cell.trials }, cell.arms);
    if (reading === null) {
        return '';
    }
    const { soloShare, blindShare, gain, gainLow, blindGapLow } = reading;
    return `; solo ${soloShare.toFixed(2)}, blind ${blindShare.toFixed(2)}, gain ${signed(gain)} [${signed(gainLow)}], gap [${signed(blindGapLow)}]`;
}

/**
 * @param {DrillCell | null} cell a cell
 * @returns {string} `win [low] (edge, low)` with the lost-trial reasons, or `-` for a skipped drill; a cell without bounds
 *   prints `win (edge)`
 */
function cellText(cell) {
    if (cell === null) {
        return '-';
    }
    const reasons = Object.entries(cell.lossReasons ?? {})
        .filter(([, n]) => n > 0)
        .map(([why, n]) => `${why}:${n}`);
    const low = cell.winShareLow === undefined ? '' : ` [${cell.winShareLow.toFixed(2)}]`;
    const edgeLow = cell.edgeLow === undefined ? '' : `, ${signed(cell.edgeLow)}`;
    const arms = armsText(cell);
    return `${cell.winShare.toFixed(2)}${low} (${signed(cell.edge)}${edgeLow}${reasons.length ? `; ${reasons.join(',')}` : ''}${arms})`;
}

/**
 * @param {string[][]} table rows of cells, the first the header
 * @returns {string[]} the rows padded into columns, trailing blanks trimmed
 */
export function padTable(table) {
    const widths = table[0].map((_, col) => Math.max(...table.map((line) => line[col].length)));
    return table.map((line) =>
        line
            .map((text, col) => text.padEnd(widths[col]))
            .join('  ')
            .trimEnd(),
    );
}

/**
 * @param {readonly string[]} drills the drill names, in column order
 * @param {readonly DrillRow[]} rows the rows
 * @returns {string[]} the table's lines: a header, then one row per subject with the mean edge last
 */
export function formatTable(drills, rows) {
    const body = rows.map((row) => {
        const mean = meanEdge(row);
        return [row.label, ...drills.map((d) => cellText(row.cells[d] ?? null)), mean === null ? '-' : signed(mean)];
    });
    return padTable([['subject', ...drills, 'mean edge'], ...body]);
}

/**
 * @param {readonly string[]} drills the drill names
 * @param {readonly DrillRow[]} rows the rows
 * @returns {{drills: string[], rows: {label: string, cells: Record<string, DrillCell | null>, meanEdge: number | null}[]}}
 *   the report as plain data
 */
export function reportJson(drills, rows) {
    return {
        drills: [...drills],
        rows: rows.map((row) => ({ label: row.label, cells: row.cells, meanEdge: meanEdge(row) })),
    };
}

/**
 * @param {Record<string, import('../../js/evo/elite-skill.js').EliteSkillDrill>} skill the elite-skill read
 * @param {number | null} bar the `--bar` given, or null for the default
 * @returns {string[]} one line per drill: the elites drilled, those clearing the bar, whether the top-lower-bound elite
 *   clears it, and the rank correlation of lower bound against win share
 */
export function eliteSkillLines(skill, bar) {
    const lines = [`elite skill (edgeLow >= ${bar ?? ELITE_BAR})`];
    for (const [drill, read] of Object.entries(skill)) {
        const share = read.clearShare === null ? '-' : read.clearShare.toFixed(2);
        const top = read.topClears === null ? '-' : read.topClears ? 'yes' : 'no';
        const rho = read.spearman === null ? '-' : signed(read.spearman);
        lines.push(
            `  ${drill}: ${read.clearing}/${read.drilled} clear (${share}), top elite clears ${top}, rho ${rho}`,
        );
    }
    return lines;
}
