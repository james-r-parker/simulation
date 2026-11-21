// `scripts/experiment.mjs list` and `tally`: the ledger as text.

/** What a record without an `outcome` counts as. */
export const UNSET = 'unrecorded';

/**
 * @typedef {object} Filters
 * @property {string} [plan] only records of this design doc
 * @property {string} [since] only records dated on or after this day, `YYYY-MM-DD`
 * @property {string} [outcome] only records with this outcome
 */

/**
 * @param {Record<string, any>[]} records the ledger
 * @param {Filters} filters the filters
 * @returns {Record<string, any>[]} the records that pass every filter
 */
export function select(records, { plan, since, outcome }) {
    return records.filter(
        (r) =>
            (plan === undefined || r.plan === plan) &&
            (since === undefined || r.date >= since) &&
            (outcome === undefined || (r.outcome ?? UNSET) === outcome),
    );
}

/**
 * @param {Record<string, any>[]} records the ledger
 * @param {Filters} filters the filters
 * @returns {string[]} one line per record: id, date, plan, task, kind, outcome and the first 100 characters of the
 *   hypothesis; `-` stands for a field the record lacks
 */
export function listLines(records, filters) {
    return select(records, filters).map((r) =>
        [
            r.id,
            r.date,
            r.plan ?? '-',
            r.task ?? '-',
            r.kind ?? '-',
            r.outcome ?? UNSET,
            String(r.hypothesis).replace(/\s+/g, ' ').slice(0, 100),
        ].join('  '),
    );
}

/**
 * @param {Record<string, any>[]} records the records to count
 * @param {(record: Record<string, any>) => string} key what to count by
 * @returns {string[]} `<name> <count>` lines, the largest count first, ties by name
 */
function countLines(records, key) {
    const counts = new Map();
    for (const record of records) {
        counts.set(key(record), (counts.get(key(record)) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k} ${n}`);
}

/**
 * @param {Record<string, any>[]} records the ledger
 * @param {Pick<Filters, 'since'>} filters the day to count from
 * @returns {string[]} the count per outcome, then the count per plan
 */
export function tallyLines(records, { since }) {
    const chosen = select(records, { since });
    return [
        `records ${chosen.length}`,
        'outcome',
        ...countLines(chosen, (r) => r.outcome ?? UNSET).map((line) => `  ${line}`),
        'plan',
        ...countLines(chosen, (r) => r.plan ?? '-').map((line) => `  ${line}`),
    ];
}
