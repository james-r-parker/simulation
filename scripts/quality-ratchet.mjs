// Coverage ratchet: compares measured coverage with scripts/quality-baseline.json; --write raises the baseline.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
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
 * @returns {string[]} one message per metric below its limit
 */
function belowLimits(measured, limits, tolerance, kind) {
    const failures = [];
    for (const [scope, metrics] of Object.entries(limits)) {
        for (const [metric, limit] of Object.entries(metrics)) {
            const value = measured[scope]?.[metric];
            if (value !== undefined && value < limit - tolerance) {
                failures.push(
                    `${scope} ${metric} coverage is below its ${kind}: ${kind} ${limit.toFixed(2)}%, measured ${value.toFixed(2)}%`,
                );
            }
        }
    }
    return failures;
}

/**
 * Compares measured coverage with the baseline and the floors.
 * @param {ScopeMetrics} measured percent per scope and metric (a scope with no code is absent)
 * @param {{coverage?: ScopeMetrics, floors?: ScopeMetrics}} baseline parsed quality-baseline.json
 * @returns {string[]} one message per failure; empty when the ratchet holds
 */
export function compareScopes(measured, baseline) {
    return [
        ...belowLimits(measured, baseline.coverage ?? {}, TOLERANCE, 'baseline'),
        ...belowLimits(measured, baseline.floors ?? {}, 0, 'floor'),
    ];
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
 * Runs the CLI.
 * @param {string[]} argv arguments after the script name
 * @param {string} root repo root
 * @returns {number} exit status
 */
export function main(argv, root) {
    const [mode, ...rest] = argv;
    const mutation = rest.length === 1 && rest[0] === '--mutation';
    if ((mode !== '--check' && mode !== '--write') || (rest.length > 0 && !mutation)) {
        console.error('usage: quality-ratchet.mjs --check | --write [--mutation]');
        return 2;
    }
    const baselinePath = join(root, 'scripts/quality-baseline.json');
    try {
        if (mutation) {
            return mutationMain(mode, root);
        }
        const summary = readJson(join(root, 'coverage/coverage-summary.json'), 'coverage summary');
        const baseline = readJson(baselinePath, 'quality baseline');
        const measured = measureScopes(summary, root);
        if (mode === '--write') {
            writeFileSync(baselinePath, `${JSON.stringify(raiseBaseline(measured, baseline), null, 2)}\n`);
            return 0;
        }
        const failures = compareScopes(measured, baseline);
        failures.forEach((message) => console.error(message));
        return failures.length === 0 ? 0 : 1;
    } catch (error) {
        console.error(errorMessage(error));
        return 1;
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2), join(dirname(fileURLToPath(import.meta.url)), '..'));
}
