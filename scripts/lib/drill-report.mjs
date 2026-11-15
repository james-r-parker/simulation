// Formats drill results as a text table and as JSON. Pure: no files.

/**
 * @typedef {object} DrillCell
 * @property {number} winShare the win share
 * @property {number} edge the win share minus the random brains' mean
 * @property {number} [winShareLow] the 95% Wilson low bound of the win share
 * @property {number} [edgeLow] `winShareLow` minus the Wilson high bound of the random brains' pooled win share
 * @property {Record<string, number>} [lossReasons] counts by first-match lost-trial reason
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
    return `${cell.winShare.toFixed(2)}${low} (${signed(cell.edge)}${edgeLow}${reasons.length ? `; ${reasons.join(',')}` : ''})`;
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
