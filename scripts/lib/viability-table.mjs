// The viability table of natural-selection.md Phase 4 (Done row "The ecology is viable"), built from one eval report:
// per seed, predators and prey types alive at the last tick, the population by specialisation (from the trace's end
// state), families per basin, child survival, lineage persistence, deliberate food share and the final population;
// then the gate counts over the seeds.

/** The per-seed metrics the table reads, with their column labels. */
export const VIABILITY_METRICS = Object.freeze([
    ['eval.predators_at_end', 'predators'],
    ['eval.prey_types_at_end', 'prey types'],
    ['eval.basin_lineages_alive', 'basin lineages'],
    ['eval.basin_lineage_effective', 'basin effective'],
    ['eval.child_survival', 'child survival'],
    ['eval.lineage_persistence', 'lineage persistence'],
    ['eval.deliberate_food_share', 'deliberate share'],
]);

/** The gate's per-seed bound on `eval.basin_lineage_effective`. */
export const FAMILY_FLOOR = 3;

/**
 * @param {Record<string, any>} config the report's config
 * @returns {string[]} the specialisation names by index
 */
function specNames(config) {
    /** @type {string[]} */
    const names = [];
    for (const [name, spec] of Object.entries(config.specialisations ?? {})) {
        names[spec.index] = name;
    }
    return names;
}

/**
 * @param {number | null | undefined} value a cell
 * @returns {string} the cell as printed: three decimals, an integer as is, `-` for none
 */
function cell(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '-';
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

/**
 * @param {Record<string, any>} report an eval report (`buildReport`)
 * @returns {{header: string[], rows: string[][], gate: {seeds: number, alive: number, families: number}}} the table
 *   and the gate counts: the seeds with predators and a prey type alive at the end, and with basin effective at least
 *   `FAMILY_FLOOR`
 */
export function viabilityTable(report) {
    const names = specNames(report.config);
    const header = ['seed', ...VIABILITY_METRICS.map(([, label]) => label), ...names, 'final population'];
    const gate = { seeds: report.seeds.length, alive: 0, families: 0 };
    const rows = report.seeds.map((/** @type {number} */ seed, /** @type {number} */ i) => {
        const value = (/** @type {string} */ name) => report.metrics[name]?.values[i] ?? null;
        const spec = report.traces?.[i]?.spec ?? null;
        gate.alive += value('eval.predators_at_end') >= 1 && value('eval.prey_types_at_end') >= 1 ? 1 : 0;
        gate.families += value('eval.basin_lineage_effective') >= FAMILY_FLOOR ? 1 : 0;
        return [
            String(seed),
            ...VIABILITY_METRICS.map(([name]) => cell(value(name))),
            ...names.map((_, s) => cell(spec === null ? null : spec[s])),
            cell(spec === null ? null : spec.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0)),
        ];
    });
    return { header, rows, gate };
}

/**
 * @param {ReturnType<typeof viabilityTable>} table the table
 * @param {string} title the run's name
 * @returns {string} the table as Markdown, with the gate counts under it
 */
export function formatViability({ header, rows, gate }, title) {
    const line = (/** @type {string[]} */ cells) => `| ${cells.join(' | ')} |`;
    return [
        `### ${title}`,
        '',
        line(header),
        line(header.map(() => '---')),
        ...rows.map(line),
        '',
        `Predators and a prey type alive at the last tick: ${gate.alive} of ${gate.seeds} seeds.`,
        `Basin effective lineages at least ${FAMILY_FLOOR}: ${gate.families} of ${gate.seeds} seeds.`,
        '',
    ].join('\n');
}
