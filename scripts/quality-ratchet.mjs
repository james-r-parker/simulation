// Coverage ratchet: compares measured coverage with scripts/quality-baseline.json; --write raises the baseline.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detailForScopes } from './lib/coverage-detail.mjs';
import { compareMutation, listSurvivors, raiseMutation, scoreScopes } from './lib/mutation-score.mjs';

/** Scopes the ratchet tracks, as repo-relative path prefixes. */
const SCOPES = ['js/sim', 'js/evo', 'js/worker', 'js/app', 'scripts'];
/** Coverage metrics tracked per scope. */
const METRICS = ['lines', 'branches', 'functions', 'statements'];
/** Percentage points a metric may fall below its baseline before the check fails. */
const TOLERANCE = 0.1;

/**
 * @typedef {{total: number, covered: number}} Counts
 * @typedef {Record<string, Record<string, number>>} ScopeMetrics scope -> metric -> percent
 * @typedef {Record<string, Record<string, Counts>>} CoverageSummary file path -> metric -> counts, plus a `total` entry
 */

/**
 * Sums covered and total over each scope's files and turns them into percentages. A scope with no files is absent.
 * @param {CoverageSummary} summary parsed coverage-summary.json
 * @param {string} root repo root the summary's absolute file paths are relative to
 * @returns {ScopeMetrics} measured percent per scope and metric
 */
export function measureScopes(summary, root) {
    /** @type {Record<string, Record<string, Counts>>} */
    const sums = {};
    for (const [file, counts] of Object.entries(summary)) {
        if (file === 'total') {
            continue;
        }
        const rel = relative(root, file).split('\\').join('/');
        const scope = SCOPES.find((s) => rel.startsWith(`${s}/`));
        if (!scope) {
            continue;
        }
        sums[scope] ??= Object.fromEntries(METRICS.map((m) => [m, { total: 0, covered: 0 }]));
        for (const metric of METRICS) {
            sums[scope][metric].total += counts[metric].total;
            sums[scope][metric].covered += counts[metric].covered;
        }
    }
    /** @type {ScopeMetrics} */
    const measured = {};
    for (const [scope, metrics] of Object.entries(sums)) {
        measured[scope] = Object.fromEntries(
            METRICS.map((m) => [m, metrics[m].total === 0 ? 100 : (metrics[m].covered / metrics[m].total) * 100]),
        );
    }
    return measured;
}

/**
 * Lists the metrics that are below a limit.
 * @param {ScopeMetrics} measured percent per scope and metric (a scope with no code is absent)
 * @param {ScopeMetrics} limits limit per scope and metric
 * @param {number} tolerance percentage points a metric may fall below its limit
 * @param {string} kind what the limit is, for the message
 * @returns {{scope: string, metric: string, message: string}[]} one entry per metric below its limit
 */
function belowLimits(measured, limits, tolerance, kind) {
    const failures = [];
    for (const [scope, metrics] of Object.entries(limits)) {
        for (const [metric, limit] of Object.entries(metrics)) {
            const value = measured[scope]?.[metric];
            if (value !== undefined && value < limit - tolerance) {
                const message = `${scope} ${metric} coverage is below its ${kind}: ${kind} ${limit.toFixed(2)}%, measured ${value.toFixed(2)}%`;
                failures.push({ scope, metric, message });
            }
        }
    }
    return failures;
}

/**
 * Compares measured coverage with the baseline and the floors.
 * @param {ScopeMetrics} measured percent per scope and metric (a scope with no code is absent)
 * @param {{coverage?: ScopeMetrics, floors?: ScopeMetrics}} baseline parsed quality-baseline.json
 * @returns {{scope: string, metric: string, message: string}[]} one entry per failure; empty when the ratchet holds
 */
export function failedLimits(measured, baseline) {
    return [
        ...belowLimits(measured, baseline.coverage ?? {}, TOLERANCE, 'baseline'),
        ...belowLimits(measured, baseline.floors ?? {}, 0, 'floor'),
    ];
}

/**
 * Compares measured coverage with the baseline and the floors.
 * @param {ScopeMetrics} measured percent per scope and metric (a scope with no code is absent)
 * @param {{coverage?: ScopeMetrics, floors?: ScopeMetrics}} baseline parsed quality-baseline.json
 * @returns {string[]} one message per failure; empty when the ratchet holds
 */
export function compareScopes(measured, baseline) {
    return failedLimits(measured, baseline).map((failure) => failure.message);
}

/**
 * Raises each coverage baseline to the measured value; never lowers one. Other keys and key order are kept.
 * @param {ScopeMetrics} measured percent per scope and metric
 * @param {{coverage?: ScopeMetrics}} baseline parsed quality-baseline.json
 * @returns {{coverage: ScopeMetrics}} a new baseline object
 */
export function raiseBaseline(measured, baseline) {
    const coverage = structuredClone(baseline.coverage ?? {});
    for (const [scope, metrics] of Object.entries(measured)) {
        coverage[scope] ??= {};
        for (const [metric, value] of Object.entries(metrics)) {
            const rounded = Math.floor(value * 100) / 100;
            coverage[scope][metric] = Math.max(coverage[scope][metric] ?? 0, rounded);
        }
    }
    return { ...baseline, coverage };
}

/**
 * @param {unknown} error a caught value
 * @returns {string} its message
 */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Reads and parses a JSON file, failing with the path when it is missing or unreadable.
 * @param {string} path file to read
 * @param {string} what what the file is, for the message
 * @returns {any} parsed JSON
 */
function readJson(path, what) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        throw new Error(`cannot read ${what} at ${path}: ${errorMessage(error)}`, { cause: error });
    }
}

/**
 * Checks or raises the mutation baselines from the Stryker report.
 * @param {string} mode `--check` or `--write`
 * @param {string} root repo root
 * @returns {number} exit status
 */
function mutationMain(mode, root) {
    const baselinePath = join(root, 'scripts/quality-baseline.json');
    const report = readJson(join(root, 'reports/mutation/mutation.json'), 'mutation report');
    const baseline = readJson(baselinePath, 'quality baseline');
    const scores = scoreScopes(report);
    if (mode === '--write') {
        writeFileSync(baselinePath, `${JSON.stringify(raiseMutation(scores, baseline), null, 2)}\n`);
        return 0;
    }
    const failures = compareMutation(scores, baseline, listSurvivors(report));
    failures.forEach((message) => console.error(message));
    return failures.length === 0 ? 0 : 1;
}

/**
 * Checks or raises the coverage baselines from the coverage summary; a miss also prints each file's detail.
 * @param {string} mode `--check` or `--write`
 * @param {string} root repo root
 * @param {string} coverageDir directory holding coverage-summary.json, relative to `root`
 * @returns {number} exit status
 */
function coverageMain(mode, root, coverageDir) {
    const baselinePath = join(root, 'scripts/quality-baseline.json');
    const summary = readJson(resolve(root, coverageDir, 'coverage-summary.json'), 'coverage summary');
    const baseline = readJson(baselinePath, 'quality baseline');
    const measured = measureScopes(summary, root);
    if (mode === '--write') {
        writeFileSync(baselinePath, `${JSON.stringify(raiseBaseline(measured, baseline), null, 2)}\n`);
        return 0;
    }
    const failures = failedLimits(measured, baseline);
    failures.forEach((failure) => console.error(failure.message));
    if (failures.length > 0) {
        const finalPath = resolve(root, coverageDir, 'coverage-final.json');
        const final = existsSync(finalPath) ? readJson(finalPath, 'coverage detail') : {};
        const files = Object.fromEntries(Object.entries(summary).filter(([file]) => file !== 'total'));
        detailForScopes(files, final, root, failures).forEach((line) => console.error(line));
    }
    return failures.length === 0 ? 0 : 1;
}

/**
 * Splits the options after the mode.
 * @param {string[]} rest arguments after `--check` or `--write`
 * @returns {{mutation: boolean, coverageDir: string} | null} the options, or null when an argument is not understood
 */
function parseOptions(rest) {
    const options = { mutation: false, coverageDir: 'coverage' };
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--mutation') {
            options.mutation = true;
        } else if (rest[i] === '--coverage-dir' && rest[i + 1]) {
            options.coverageDir = rest[++i];
        } else if (rest[i].startsWith('--coverage-dir=') && rest[i].length > '--coverage-dir='.length) {
            options.coverageDir = rest[i].slice('--coverage-dir='.length);
        } else {
            return null;
        }
    }
    return options;
}

/**
 * Runs the CLI.
 * @param {string[]} argv arguments after the script name: `--check | --write`, then `--mutation` or
 *   `--coverage-dir <dir>` (default `coverage`; relative to `root`; `scripts/check.sh` gives each run its own)
 * @param {string} root repo root
 * @returns {number} exit status
 */
export function main(argv, root) {
    const [mode, ...rest] = argv;
    const options = parseOptions(rest);
    if ((mode !== '--check' && mode !== '--write') || options === null || (options.mutation && rest.length > 1)) {
        console.error('usage: quality-ratchet.mjs --check | --write [--mutation | --coverage-dir <dir>]');
        return 2;
    }
    try {
        if (options.mutation) {
            return mutationMain(mode, root);
        }
        return coverageMain(mode, root, options.coverageDir);
    } catch (error) {
        console.error(errorMessage(error));
        return 1;
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2), join(dirname(fileURLToPath(import.meta.url)), '..'));
}
