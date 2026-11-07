// Formats reflex results as text and as JSON. Pure: no files.

/**
 * @typedef {import('../../js/evo/reflex-score.js').ReflexRow} ReflexRow
 * @typedef {import('../../js/evo/reflex-score.js').CaseBars} CaseBars
 */

/**
 * @typedef {object} ReflexReportRow
 * @property {string} label the subject's label
 * @property {ReflexRow | null} row its result; null when no selected case is its specialisation's (skipped)
 */

/**
 * @param {number} value a number
 * @returns {string} two decimals with an explicit sign
 */
function signed(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * @param {string[][]} table rows of cells, the first the header
 * @returns {string[]} the rows padded into columns, trailing blanks trimmed
 */
function columns(table) {
    /** @type {number[]} */
    const widths = [];
    for (const line of table) {
        line.forEach((text, col) => {
            widths[col] = Math.max(widths[col] ?? 0, text.length);
        });
    }
    return table.map((line) =>
        line.map((text, col) => (col === line.length - 1 ? text : text.padEnd(widths[col]))).join('  '),
    );
}

/**
 * @param {readonly string[]} cases the case names, in column order
 * @param {readonly ReflexReportRow[]} rows the rows
 * @returns {string[]} a header, then a row per subject: pass share and edge per case (`-` for a case the subject does
 *   not face), then the score, the edge and the first-row share
 */
export function formatRows(cases, rows) {
    const body = rows.map(({ label, row }) => [
        label,
        ...cases.map((name) => {
            const cell = row?.cases[name];
            return cell === undefined ? '-' : `${cell.passShare.toFixed(2)} (${signed(cell.edge)})`;
        }),
        row === null ? '-' : row.score.toFixed(2),
        row === null ? '-' : signed(row.edge),
        row === null ? '-' : row.fast.toFixed(2),
    ]);
    return columns([['subject', ...cases, 'score', 'edge', 'fast'], ...body]);
}

/**
 * @param {readonly string[]} cases the case names
 * @param {Readonly<Record<string, CaseBars>>} bars each case's bars
 * @returns {string[]} a header, then a row per case with the random mean, the constant bar, the reference's pass share
 *   and whether the case is valid
 */
export function formatBars(cases, bars) {
    const body = cases.map((name) => {
        const bar = bars[name];
        return [
            name,
            bar.random.toFixed(2),
            bar.constant.toFixed(2),
            bar.reference.toFixed(2),
            bar.valid ? 'yes' : 'NO',
        ];
    });
    return columns([['case', 'random', 'constant', 'reference', 'valid'], ...body]);
}

/**
 * @param {readonly string[]} cases the case names
 * @param {{rows: readonly ReflexReportRow[], bars: Readonly<Record<string, CaseBars>>}} result the rows and the bars
 * @returns {string} the whole text report: the subjects' table, a blank line, the bars' table
 */
export function formatReport(cases, { rows, bars }) {
    return [...formatRows(cases, rows), '', ...formatBars(cases, bars)].join('\n');
}

/**
 * @param {readonly string[]} cases the case names
 * @param {{rows: readonly ReflexReportRow[], bars: Readonly<Record<string, CaseBars>>}} result the rows and the bars
 * @returns {{cases: string[], rows: ReflexReportRow[], bars: Record<string, CaseBars>}} the report as plain data
 */
export function reportJson(cases, { rows, bars }) {
    return { cases: [...cases], rows: rows.map((r) => ({ label: r.label, row: r.row })), bars: { ...bars } };
}
