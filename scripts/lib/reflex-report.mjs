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

/** The case whose kinds are printed apart: it is the one where `BITE` decides the pass. */
const KIND_CASE = 'bite-discrimination';

/**
 * @param {readonly ReflexReportRow[]} rows the rows
 * @returns {string[]} a header, then a row per subject that faced `bite-discrimination`: its pass share and the share of
 *   scored ticks with `BITE` above 0 for each staging kind (`prey`, `too-big`, `kin`); empty when no subject did
 */
export function formatKinds(rows) {
    const faced = rows.filter(({ row }) => row?.cases[KIND_CASE]?.kinds !== undefined);
    const kinds = [...new Set(faced.flatMap(({ row }) => Object.keys(row?.cases[KIND_CASE].kinds ?? {})))];
    if (kinds.length === 0) {
        return [];
    }
    const body = faced.map(({ label, row }) => [
        label,
        ...kinds.map((kind) => {
            const cell = row?.cases[KIND_CASE].kinds[kind];
            return cell === undefined ? '-' : `${cell.passShare.toFixed(2)} bite ${cell.biteShare.toFixed(2)}`;
        }),
    ]);
    return columns([[`${KIND_CASE} (pass, bite share)`, ...kinds], ...body]);
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
    const kinds = formatKinds(rows);
    return [
        ...formatRows(cases, rows),
        ...(kinds.length === 0 ? [] : ['', ...kinds]),
        '',
        ...formatBars(cases, bars),
    ].join('\n');
}

/**
 * @param {readonly string[]} cases the case names
 * @param {{rows: readonly ReflexReportRow[], bars: Readonly<Record<string, CaseBars>>}} result the rows and the bars
 * @returns {{cases: string[], rows: ReflexReportRow[], bars: Record<string, CaseBars>}} the report as plain data
 */
export function reportJson(cases, { rows, bars }) {
    return { cases: [...cases], rows: rows.map((r) => ({ label: r.label, row: r.row })), bars: { ...bars } };
}
