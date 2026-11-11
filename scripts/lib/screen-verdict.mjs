// Screen verdicts: the Phase 4 collapse criteria per seed and per arm, and each arm's deltas against the reference arm,
// computed from eval reports that carry `traces`. Pure: no files, no clock.

import { keepRule, LOW_POPULATION } from '../../js/evo/keep-rule.js';
import { PAIRED_CRITERIA, seedsVsReference } from './screen-seeds.mjs';
import { statusOf, thresholdReady } from '../../js/evo/compare-rules.js';
import { BURN_IN_TICKS } from '../../js/evo/observer-events.js';
import { quantile } from '../../js/evo/metrics-stats.js';

export const POP_ABOVE_SHARE = 0.8;
export const MIN_LINEAGES = 5;
export const MAX_SPEC_SHARE = 0.7;
export const MIN_MATING_SHARE = 0.2;
export const MIN_BORN_SHARE = 0.5;

/**
 * The hunter gate (T60, user's keep rules 2026-11-05; metric-trust T31): the arm passes when `keepRule` against the
 * reference finds no guard worse (a paired exact test on the seeds with hunters alive at the last tick and on the seeds
 * ending under `LOW_POPULATION`, plus each verified guard metric). The medians of `eval.predators_at_end`,
 * `eval.hunter_ticks_last_quarter` and `eval.hunter_kills_per_life_p50` are reported beside it, not tested: without an
 * interval each failed an inert arm half the time.
 */

/** The Phase 4 Targets, compared against the reference arm. */
export const TARGETS = ['eval.lineages_alive', 'eval.births_per_1k', 'eval.food_energy_per_1k'];

/**
 * The new evolution metrics the screen table shows as each arm's mean over its seeds. They carry no verdict; the table
 * prints them in this order.
 */
export const WATCH_METRICS = [
    'eval.skill_trend',
    'eval.deliberate_food_energy_per_1k',
    'eval.chance_food_energy_per_1k',
    'eval.spec_dominance',
    'eval.lineage_effective',
    'eval.trait_spread',
    'eval.child_survival',
    'eval.lineage_lifespan_p50',
    'eval.predator_presence',
    'eval.predator_births',
    'eval.migration_index',
    'eval.hunter_kill_conversion_by_age.under1k',
    'eval.hunter_kill_conversion_by_age.1k-2k',
    'eval.hunter_kill_conversion_by_age.over2k',
    'eval.hunter_chases_by_age.under1k',
    'eval.hunter_chases_by_age.1k-2k',
    'eval.hunter_chases_by_age.over2k',
    'eval.hunter_first_kill_km_median',
    'eval.hunter_first_kill_rmst',
    'eval.prey_extinctions',
    'eval.boom_bust_count',
    'eval.predator_share_cv',
    'eval.basin_pop_cv',
    'eval.pred_prey_lag_corr',
    'eval.prey_summer_min',
    'eval.mating_share',
    'eval.fed_median_lifespan',
];

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
 * @param {ScreenOptions} [options] the threshold-readiness lookup
 * @returns {Record<string, SeedCheck>} the per-seed criteria
 * @throws {Error} when the report has no traces
 */
export function seedChecks(report, { thresholdReady: ready = thresholdReady } = {}) {
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
    // A threshold criterion needs its metric's arithmetic test, source test and liveness read (T31).
    const catchReady = ready('eval.hunter_catches_per_1k');
    add('catchRate', metricValues(report, 'eval.hunter_catches_per_1k'), (v) => catchReady && v > 0);
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
 * @param {ScreenOptions} options the threshold-readiness lookup
 * @returns {{ value: number | null, pass: boolean, unchecked?: boolean }} the metric's mean over the seeds and whether it
 *   reaches `floor`; a threshold criterion needs the metric's arithmetic test, source test and liveness read, else it
 *   fails with `unchecked: true`
 */
function meanAtLeast(report, metric, floor, { thresholdReady: ready = thresholdReady } = {}) {
    const value = report.metrics[metric]?.mean ?? null;
    return ready(metric) ? { value, pass: value !== null && value >= floor } : { value, pass: false, unchecked: true };
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {string} metric a metric name
 * @returns {number | null} the median over the seeds that decide it, null when none does
 */
function seedMedian(report, metric) {
    const decided = metricValues(report, metric).filter((v) => v !== null && v !== undefined);
    return decided.length === 0 ? null : quantile(decided, 0.5);
}

/**
 * @param {Record<string, any>} report an eval report
 * @returns {number} the seeds whose end population is under `LOW_POPULATION`
 */
function lowSeeds(report) {
    return report.traces.filter((/** @type {any} */ t) => sum(t.spec) < LOW_POPULATION).length;
}

/**
 * @typedef {object} ScreenOptions
 * @property {(metric: string) => string} [status] the status lookup (`statusOf`); a comparison criterion reads only
 *   `verified` metrics
 * @property {(metric: string) => boolean} [thresholdReady] whether a threshold criterion's metric has its arithmetic
 *   test, source test and liveness read (`thresholdReady`)
 */

/**
 * @param {Record<string, any>} report an eval report
 * @param {Record<string, any>} reference the reference arm's report
 * @param {ScreenOptions} [options] the status lookup the keep rule's metric guards read
 * @returns {{ predators: number | null, ticks: number | null, kills: number | null, chaseCatch: number | null,
 *   aliveShare: number, lowSeeds: number, keep: ReturnType<typeof keepRule> | null, pass: boolean }} the seed medians of
 *   `eval.predators_at_end`, `eval.hunter_ticks_last_quarter` and `eval.hunter_kills_per_life_p50` (reported, not
 *   tested), the mean `eval.chase_catch_share`, the share of seeds with a hunter at the last tick, the seeds ending under
 *   `LOW_POPULATION`, the keep rule against the reference (null for the reference itself) and whether no guard is worse
 */
export function hunterGate(report, reference, { status = statusOf } = {}) {
    const ends = metricValues(report, 'eval.predators_at_end');
    const keep = report === reference ? null : keepRule(reference, report, { status });
    return {
        predators: seedMedian(report, 'eval.predators_at_end'),
        ticks: seedMedian(report, 'eval.hunter_ticks_last_quarter'),
        kills: seedMedian(report, 'eval.hunter_kills_per_life_p50'),
        chaseCatch: report.metrics['eval.chase_catch_share']?.mean ?? null,
        aliveShare: ends.filter((v) => v !== null && v !== undefined && v > 0).length / report.seeds.length,
        lowSeeds: lowSeeds(report),
        keep,
        pass: keep === null || !keep.worse,
    };
}

/** The prey count a seed must keep through every summer to be clear of the mating edge (world-balance Phase 6). */
export const SUMMER_PREY_MIN = 100;

/**
 * @param {Record<string, any>} report an eval report
 * @returns {{ above: number, of: number }} the seeds whose `eval.prey_summer_min` is at least `SUMMER_PREY_MIN`, and the seeds
 *   run (a seed with no summer reads null and does not count as above)
 */
export function summerSeeds(report) {
    const values = metricValues(report, 'eval.prey_summer_min');
    return {
        above: values.filter((v) => v !== null && v !== undefined && v >= SUMMER_PREY_MIN).length,
        of: values.length,
    };
}

/**
 * @param {number | null} mean the arm's mean
 * @param {number | null} ref the reference's mean
 * @param {{ verified: boolean }} metric whether the metric is `verified`
 * @returns {{ mean: number | null, delta: number | null, rel: number | null, unverified?: boolean }} the delta, or only
 *   the mean with `unverified: true` for a metric that is not `verified`
 */
function oneDelta(mean, ref, { verified }) {
    if (!verified) {
        return { mean, delta: null, rel: null, unverified: true };
    }
    const delta = mean === null || ref === null ? null : mean - ref;
    return { mean, delta, rel: delta === null || ref === null || ref === 0 ? null : delta / Math.abs(ref) };
}

/**
 * @param {Record<string, any>} report an eval report
 * @param {Record<string, any>} reference the reference arm's report
 * @param {ScreenOptions} [options] the status lookup
 * @returns {Record<string, { mean: number | null, delta: number | null, rel: number | null, unverified?: boolean }>}
 *   per Target: the arm's mean, the difference from the reference's mean and that difference over the reference's
 *   magnitude; a metric that is not `verified` keeps its mean, gets no delta and `unverified: true`
 */
export function targetDeltas(report, reference, { status = statusOf } = {}) {
    /** @type {Record<string, { mean: number | null, delta: number | null, rel: number | null, unverified?: boolean }>} */
    const out = {};
    for (const metric of TARGETS) {
        out[metric] = oneDelta(report.metrics[metric]?.mean ?? null, reference.metrics[metric]?.mean ?? null, {
            verified: status(metric) === 'verified',
        });
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
 * @param {ScreenOptions} [options] the status and threshold-readiness lookups (`statusOf`, `thresholdReady`)
 * @returns {Record<string, any>} the arm's verdict: per-seed criteria, the two mean criteria, the mean population,
 *   `seedsVs` (each of the four per-seed criteria's passing share against the reference, null on the reference),
 *   `hunters` (`hunterGate`), `keep` (`keepRule` against the reference, null on the reference), `pass` (every seed
 *   has the catch rate on every seed and no per-seed criterion worse than the reference's, both means pass and the
 *   hunter gate passes), the Target deltas against the reference
 *   (`verified` metrics only) and the `WATCH_METRICS` means
 */
export function armVerdict(name, report, reference, options = {}) {
    const criteria = seedChecks(report, options);
    const means = {
        matingShare: meanAtLeast(report, 'eval.mating_share', MIN_MATING_SHARE, options),
        bornShare: meanAtLeast(report, 'eval.born_share', MIN_BORN_SHARE, options),
    };
    const hunters = hunterGate(report, reference, options);
    const seedsVs = report === reference ? null : seedsVsReference(criteria, seedChecks(reference, options));
    const pass =
        criteria.catchRate.pass.every(Boolean) &&
        PAIRED_CRITERIA.every((key) => seedsVs === null || !seedsVs[key].worse) &&
        Object.values(means).every((m) => m.pass) &&
        hunters.pass;
    return {
        arm: name,
        seeds: report.seeds.length,
        minAgents: report.config.minAgents,
        maxAgents: report.config.maxAgents,
        criteria,
        seedsVs,
        means,
        hunters,
        summer: summerSeeds(report),
        popMean: report.metrics['eval.population_mean']?.mean ?? null,
        pass,
        deltas: report === reference ? null : targetDeltas(report, reference, options),
        keep: hunters.keep,
        watch: watchMeans(report),
    };
}

/**
 * @param {Record<string, Record<string, any>>} reports arm name to report
 * @param {string} reference the reference arm's name
 * @param {ScreenOptions} [options] the status and threshold-readiness lookups
 * @returns {{ reference: string, arms: Record<string, any>[] }} one verdict per arm, in the order of `reports`
 */
export function screenVerdicts(reports, reference, options = {}) {
    if (!Object.hasOwn(reports, reference)) {
        throw new Error(`reference arm "${reference}" has no report`);
    }
    return {
        reference,
        arms: Object.entries(reports).map(([name, report]) => armVerdict(name, report, reports[reference], options)),
    };
}
