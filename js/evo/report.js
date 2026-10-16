// Eval report: the JSON shape `scripts/eval.mjs` writes, and its validation. Pure: no clock, no files.

import { configHash } from '../sim/config.js';

export const REPORT_VERSION = 1;

/**
 * @param {readonly (number | null)[]} values per-seed values in seed order
 * @returns {{ mean: number | null, sd: number | null }} mean and sample sd (n - 1) over the non-null values; sd 0 for
 *   one value; both null when there are none
 */
function summarise(values) {
    const present = /** @type {number[]} */ (values.filter((v) => v !== null));
    if (present.length === 0) {
        return { mean: null, sd: null };
    }
    const mean = present.reduce((sum, v) => sum + v, 0) / present.length;
    if (present.length === 1) {
        return { mean, sd: 0 };
    }
    const squares = present.reduce((sum, v) => sum + (v - mean) * (v - mean), 0);
    return { mean, sd: Math.sqrt(squares / (present.length - 1)) };
}

/**
 * @param {readonly Record<string, { value: number | null, reason?: string }>[]} perSeed one metrics object per seed
 * @returns {Record<string, { values: (number | null)[], reasons: (string | null)[], mean: number | null, sd: number | null }>}
 *   every metric any seed has, keys sorted, values in seed order
 */
function collectMetrics(perSeed) {
    const names = [...new Set(perSeed.flatMap((metrics) => Object.keys(metrics)))].sort();
    /** @type {Record<string, any>} */
    const out = {};
    for (const name of names) {
        const cells = perSeed.map((metrics) => metrics[name]);
        const values = cells.map((cell) => (typeof cell?.value === 'number' ? cell.value : null));
        const reasons = cells.map((cell, i) => (values[i] === null ? (cell?.reason ?? 'not computed') : null));
        out[name] = { values, reasons, ...summarise(values) };
    }
    return out;
}

/**
 * @typedef {object} BuildReportInput
 * @property {string} policy the policy name
 * @property {string} fitnessName the fitness the policy reports
 * @property {Readonly<Record<string, any>>} config the resolved config (`createConfig(overrides)`); `seed` is dropped
 * @property {number} ticks ticks per seed
 * @property {readonly number[]} seeds the seeds, in order
 * @property {string} sha the commit sha
 * @property {readonly Record<string, { value: number | null, reason?: string }>[]} perSeed `computeMetrics` per seed
 */

/**
 * The config as a report stores it: without `seed`, since each seed's world is this config with that seed.
 * @param {Readonly<Record<string, any>>} config a resolved config
 * @returns {Record<string, any>} a copy without `seed`
 */
export function seedlessConfig(config) {
    return Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'seed'));
}

/**
 * Builds the report. Each seed's world is `config` with that seed, so the stored config has no `seed`, and
 * `configHash` is `configHash` of that stored object.
 * @param {BuildReportInput} input the run's results
 * @returns {Record<string, any>} the report
 */
export function buildReport({ policy, fitnessName, config, ticks, seeds, sha, perSeed }) {
    const rest = seedlessConfig(config);
    return {
        version: REPORT_VERSION,
        policy,
        fitnessName,
        config: rest,
        configHash: configHash(rest),
        ticks,
        seeds: [...seeds],
        sha,
        metrics: collectMetrics(perSeed),
    };
}

/**
 * @param {boolean} ok the condition
 * @param {string} path the field path to name on failure
 * @param {string} want what was expected
 * @returns {void}
 * @throws {Error} naming the path
 */
function need(ok, path, want) {
    if (!ok) {
        throw new Error(`invalid report: ${path} must be ${want}`);
    }
}

/**
 * @param {unknown} v a value
 * @returns {boolean} whether it is a non-empty string
 */
const isText = (v) => typeof v === 'string' && v.length > 0;

/**
 * @param {unknown} v a value
 * @returns {boolean} whether it is a non-null, non-array object
 */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * @param {Record<string, any>} metric one metric entry
 * @param {string} path its path
 * @param {number} count the seed count
 * @returns {void}
 */
function checkMetric(metric, path, count) {
    need(isObject(metric), path, 'an object');
    const { values, reasons } = metric;
    need(Array.isArray(values) && values.length === count, `${path}.values`, `an array of ${count}`);
    need(Array.isArray(reasons) && reasons.length === count, `${path}.reasons`, `an array of ${count}`);
    for (let i = 0; i < count; i++) {
        const value = values[i];
        const ok = value === null ? isText(reasons[i]) : Number.isFinite(value) && reasons[i] === null;
        need(ok, `${path}.values[${i}]`, 'a finite number with a null reason, or null with a non-empty reason');
    }
    for (const key of ['mean', 'sd']) {
        need(metric[key] === null || Number.isFinite(metric[key]), `${path}.${key}`, 'a finite number or null');
    }
}

/**
 * Checks a report's shape, throwing at the first bad field.
 * @param {any} report the parsed report
 * @returns {void}
 * @throws {Error} `invalid report: <field path> must be ...`
 */
export function validateReport(report) {
    need(isObject(report), 'report', 'an object');
    need(report.version === REPORT_VERSION, 'version', `${REPORT_VERSION}`);
    need(isText(report.policy), 'policy', 'a non-empty string');
    need(isText(report.fitnessName), 'fitnessName', 'a non-empty string');
    need(isObject(report.config), 'config', 'an object');
    need(isText(report.configHash), 'configHash', 'a non-empty string');
    need(Number.isInteger(report.ticks) && report.ticks > 0, 'ticks', 'a positive integer');
    need(Array.isArray(report.seeds) && report.seeds.length > 0, 'seeds', 'a non-empty array');
    report.seeds.forEach((/** @type {unknown} */ s, /** @type {number} */ i) =>
        need(Number.isInteger(s), `seeds[${i}]`, 'an integer'),
    );
    need(isText(report.sha), 'sha', 'a non-empty string');
    need(isObject(report.metrics), 'metrics', 'an object');
    for (const [name, metric] of Object.entries(report.metrics)) {
        checkMetric(/** @type {any} */ (metric), `metrics.${name}`, report.seeds.length);
    }
}
