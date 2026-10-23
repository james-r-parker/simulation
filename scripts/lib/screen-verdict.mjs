// Screen verdicts: the Phase 4 collapse criteria per seed and per arm, and each arm's deltas against the reference arm,
// computed from eval reports that carry `traces`. Pure: no files, no clock.

import { BURN_IN_TICKS } from '../../js/evo/observer-events.js';

export const POP_ABOVE_SHARE = 0.8;
export const MIN_LINEAGES = 5;
export const MAX_SPEC_SHARE = 0.7;
export const MIN_MATING_SHARE = 0.2;
export const MIN_BORN_SHARE = 0.5;

/** The Phase 4 Targets, compared against the reference arm. */
export const TARGETS = [
    'eval.mating_share',
    'eval.lineages_alive',
    'eval.births_per_1k',
    'eval.food_energy_per_1k',
    'eval.fed_median_lifespan',
];

/**
 * The new evolution metrics the screen table shows as each arm's mean over its seeds. They carry no verdict; the table
 * prints them in this order.
 */
export const WATCH_METRICS = [
    'eval.skill_trend',
    'eval.spec_dominance',
    'eval.lineage_effective',
    'eval.trait_spread',
    'eval.child_survival',
    'eval.lineage_lifespan_p50',
    'eval.predator_presence',
    'eval.predator_births',
    'eval.migration_index',
];

/** Per-seed criteria in table order: key and what it checks. */
export const SEED_CRITERIA = ['popAboveMin', 'catchRate', 'lineages', 'specShare', 'popBelowMax'];

/**
 * @typedef {object} SeedCheck
 * @property {boolean[]} pass one flag per seed
 * @property {(number | null)[]} value the number each flag was decided on, per seed
 */

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their sum
 */
const sum = (values) => values.reduce((total, v) => total + v, 0);

/**
 * @param {Record<string, any>} trace one seed's trace
 * @param {number} floor the arm's `minAgents`
 * @returns {number} the share of post-burn-in samples with the population above `floor` (0 with no such sample)
 */
export function shareAbove(trace, floor) {
    const after = trace.pop.filter(
        (/** @type {number} */ _p, /** @type {number} */ j) => (j + 1) * trace.interval >= BURN_IN_TICKS,
    );
    return after.length === 0 ? 0 : after.filter((/** @type {number} */ p) => p > floor).length / after.length;
}

/**
 * @param {Record<string, any>} trace one seed's trace
 * @returns {number} the largest specialisation's share of the alive agents at the last tick (1 when none are alive)
 */
export function largestSpecShare(trace) {
    const total = sum(trace.spec);
    return total === 0 ? 1 : Math.max(...trace.spec) / total;
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {string} metric a metric name
 * @returns {(number | null)[]} its per-seed values (all null when the report lacks it)
 */
function metricValues(report, metric) {
    return report.metrics[metric]?.values ?? report.seeds.map(() => null);
}

/**
 * @param {Record<string, any>} report an eval report with `traces`
 * @returns {Record<string, SeedCheck>} the per-seed criteria
 * @throws {Error} when the report has no traces
 */
export function seedChecks(report) {
    if (!Array.isArray(report.traces)) {
        throw new Error('report has no traces; rerun the arm with this version of the eval');
    }
    const { minAgents, maxAgents } = report.config;
    /** @type {Record<string, SeedCheck>} */
    const out = {};
    /**
     * @param {string} key the criterion
     * @param {(number | null)[]} value the decided-on numbers
     * @param {(v: number) => boolean} test whether a number passes
     */
    const add = (key, value, test) => {
        out[key] = { value, pass: value.map((v) => v !== null && test(v)) };
    };
    add(
        'popAboveMin',
        report.traces.map((/** @type {any} */ t) => shareAbove(t, minAgents)),
        (v) => v >= POP_ABOVE_SHARE,
    );
    add('catchRate', metricValues(report, 'eval.catch_rate'), (v) => v > 0);
    add(
        'lineages',
        report.traces.map((/** @type {any} */ t) => t.lineages),
        (v) => v >= MIN_LINEAGES,
    );
    add(
        'specShare',
        report.traces.map((/** @type {any} */ t) => largestSpecShare(t)),
        (v) => v <= MAX_SPEC_SHARE,
    );
    add(
        'popBelowMax',
        report.traces.map((/** @type {any} */ t) => sum(t.spec)),
        (v) => v < maxAgents,
    );
    return out;
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {string} metric a metric name
 * @param {number} floor the least mean that passes
 * @returns {{ value: number | null, pass: boolean }} the metric's mean over the seeds and whether it reaches `floor`
 */
function meanAtLeast(report, metric, floor) {
    const value = report.metrics[metric]?.mean ?? null;
    return { value, pass: value !== null && value >= floor };
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {Record<string, any>} reference the reference arm's report
 * @returns {Record<string, { mean: number | null, delta: number | null, rel: number | null }>} per Target: the arm's
 *   mean, the difference from the reference's mean and that difference over the reference's magnitude
 */
export function targetDeltas(report, reference) {
    /** @type {Record<string, { mean: number | null, delta: number | null, rel: number | null }>} */
    const out = {};
    for (const metric of TARGETS) {
        const mean = report.metrics[metric]?.mean ?? null;
        const ref = reference.metrics[metric]?.mean ?? null;
        const delta = mean === null || ref === null ? null : mean - ref;
        out[metric] = { mean, delta, rel: delta === null || ref === 0 ? null : delta / Math.abs(ref) };
    }
    return out;
}

/**
 * @param {Record<string, any>} report an eval report
 * @returns {Record<string, number | null>} per `WATCH_METRICS` name: the metric's mean, `null` when the report lacks it
 */
export function watchMeans(report) {
    /** @type {Record<string, number | null>} */
    const out = {};
    for (const metric of WATCH_METRICS) {
        out[metric] = report.metrics[metric]?.mean ?? null;
    }
    return out;
}

/**
 * @param {string} name the arm name
 * @param {Record<string, any>} report the arm's report
 * @param {Record<string, any>} reference the reference arm's report
 * @returns {Record<string, any>} the arm's verdict: per-seed criteria, the two mean criteria, the mean population,
 *   `pass` (every seed passes every criterion and both means pass), the Target deltas against the reference and the
 *   `WATCH_METRICS` means
 */
export function armVerdict(name, report, reference) {
    const criteria = seedChecks(report);
    const means = {
        matingShare: meanAtLeast(report, 'eval.mating_share', MIN_MATING_SHARE),
        bornShare: meanAtLeast(report, 'eval.born_share', MIN_BORN_SHARE),
    };
    const pass =
        SEED_CRITERIA.every((key) => criteria[key].pass.every(Boolean)) && Object.values(means).every((m) => m.pass);
    return {
        arm: name,
        seeds: report.seeds.length,
        minAgents: report.config.minAgents,
        maxAgents: report.config.maxAgents,
        criteria,
        means,
        popMean: report.metrics['eval.population_mean']?.mean ?? null,
        pass,
        deltas: report === reference ? null : targetDeltas(report, reference),
        watch: watchMeans(report),
    };
}

/**
 * @param {Record<string, Record<string, any>>} reports arm name to report
 * @param {string} reference the reference arm's name
 * @returns {{ reference: string, arms: Record<string, any>[] }} one verdict per arm, in the order of `reports`
 */
export function screenVerdicts(reports, reference) {
    if (!Object.hasOwn(reports, reference)) {
        throw new Error(`reference arm "${reference}" has no report`);
    }
    return {
        reference,
        arms: Object.entries(reports).map(([name, report]) => armVerdict(name, report, reports[reference])),
    };
}
