// Eval power: how often `eval:compare` is wrong on one 64-seed report, and what change it can see (`npm run eval:power`).
// Resamples the report's seeds into random disjoint splits, so it needs no new sim runs. For each metric and arm size
// (16 v 16 and 32 v 32) it prints the false-positive rate of the verdict on an A/A split and the smallest planted
// relative change the verdict detects in at least 80% of splits. The verdict is `compareReports`'s own.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareReports, metricDirection } from '../js/evo/compare.js';
import { validateReport } from '../js/evo/report.js';
import { createRng, fork, nextInt } from '../js/sim/rng.js';
import { intValue, parseFlags } from './lib/cli-args.mjs';
import { intendedDirection } from './lib/watch-intent.mjs';

const USAGE =
    'usage: eval:power <report.json> [--splits <n>] [--power-splits <n>] [--sizes <n,...>] [--metrics <m,...>] [--include-watch] [--json]';

/** Arm sizes to test: the default and the 32-seed minimum of the noisy metrics. */
export const DEFAULT_SIZES = [16, 32];
/** Planted relative changes tried in order; the first detected in `POWER_TARGET` of splits is the detectable change. */
export const EFFECT_GRID = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1];
export const POWER_TARGET = 0.8;
const NOMINAL_ALPHA = 0.05;

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{ files: string[], splits: number, powerSplits: number, sizes: number[], metrics: string[],
 *   includeWatch: boolean, json: boolean }}
 *   parsed options
 */
export function parseArgs(argv) {
    const valued = /^--(splits|power-splits|sizes|metrics)$/;
    const flagged = argv.filter((arg, i) => arg.startsWith('--') || (i > 0 && valued.test(argv[i - 1])));
    const files = argv.filter((arg) => !flagged.includes(arg));
    const list = (/** @type {string | undefined} */ v) => (v ?? '').split(',').filter((item) => item.length > 0);
    const opts = parseFlags(flagged, {
        valueFlags: {
            '--splits': (v, flag) => ['splits', intValue(flag, v, 1, USAGE)],
            '--power-splits': (v, flag) => ['powerSplits', intValue(flag, v, 1, USAGE)],
            '--sizes': (v, flag) => ['sizes', list(v).map((s) => intValue(flag, s, 16, USAGE))],
            '--metrics': (v) => ['metrics', list(v)],
        },
        booleanFlags: { '--json': 'json', '--include-watch': 'includeWatch' },
        defaults: {
            splits: 1000,
            powerSplits: 200,
            sizes: DEFAULT_SIZES,
            metrics: [],
            includeWatch: false,
            json: false,
        },
        usage: USAGE,
    });
    if (files.length !== 1) {
        throw new Error(`expected one report file, got ${files.length}\n${USAGE}`);
    }
    return /** @type {any} */ ({ ...opts, files });
}

/**
 * @param {number} count how many indices
 * @param {import('../js/sim/rng.js').Rng} rng the stream to shuffle with
 * @returns {number[]} a random permutation of `0 .. count - 1` (Fisher-Yates)
 */
export function shuffled(count, rng) {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
        const j = nextInt(rng, i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

/**
 * @param {Record<string, any>} report the 64-seed report
 * @param {string} metric the metric to carry
 * @param {{ seeds: number[], values: (number | null)[] }} arm one arm's seeds and values
 * @returns {Record<string, any>} a report with that metric alone, so a compare costs one interval
 */
function armReport(report, metric, { seeds, values }) {
    const present = /** @type {number[]} */ (values.filter((v) => v !== null));
    const mean = present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
    return {
        ...report,
        seeds,
        metrics: { [metric]: { values, reasons: values.map(() => null), mean, sd: 0 } },
    };
}

/**
 * Compares two disjoint random arms of `size` seeds with the planted change applied to the second.
 * @param {Record<string, any>} report the 64-seed report
 * @param {string} metric the metric
 * @param {{ order: number[], size: number, shift: number, direction: string }} split a permutation of the seed indices,
 *   the arm size, the absolute shift added to the second arm and the direction to score the metric in
 * @returns {string} the verdict, or `-` when the metric has no verdict here (watch, null, below its seed minimum)
 */
function splitVerdict(report, metric, { order, size, shift, direction }) {
    const all = report.metrics[metric].values;
    const first = order.slice(0, size);
    const second = order.slice(size, 2 * size);
    const arm = (/** @type {number[]} */ idx, /** @type {number} */ add) => ({
        seeds: idx.map((i) => report.seeds[i]),
        values: idx.map((i) => (all[i] === null ? null : all[i] + add)),
    });
    const { rows } = compareReports(
        armReport(report, metric, arm(first, 0)),
        armReport(report, metric, arm(second, shift)),
        { allowSeedDiff: true, direction: () => /** @type {any} */ (direction) },
    );
    return rows[0].verdict;
}

/**
 * @param {Record<string, any>} report the 64-seed report
 * @param {string} metric a metric with a direction
 * @param {{ size: number, splits: number, shift: number, direction: string, rng: import('../js/sim/rng.js').Rng }} options
 *   the arm size, how many random splits, the planted shift, the direction to score in and the stream that draws them
 * @returns {{ better: number, worse: number, valid: number }} the verdicts over the splits that gave one
 */
export function countVerdicts(report, metric, { size, splits, shift, direction, rng }) {
    const tally = { better: 0, worse: 0, valid: 0 };
    for (let s = 0; s < splits; s++) {
        const verdict = splitVerdict(report, metric, {
            order: shuffled(report.seeds.length, rng),
            size,
            shift,
            direction,
        });
        if (verdict !== '-') {
            tally.valid += 1;
            if (verdict === 'better' || verdict === 'worse') {
                tally[verdict] += 1;
            }
        }
    }
    return tally;
}

/**
 * @typedef {object} PowerRow
 * @property {string} metric the metric
 * @property {number} size seeds per arm
 * @property {number | null} falsePositive share of A/A splits with a `better` or `worse` verdict; null when there is none
 * @property {number | null} detectable the smallest grid change (a fraction of the mean) detected in 80% of splits;
 *   null when none up to 100% is, or the metric has no verdict at this size
 * @property {number} [validShare] share of the A/A splits that gave a verdict; the rest had a `null` seed in an
 *   arm, which `eval:compare` refuses to compare
 * @property {string} [direction] the direction the change was planted in, for a `watch` metric measured with
 *   `includeWatch` (its intended direction)
 * @property {string} [note] why the row has no numbers
 */

/**
 * @param {Record<string, any>} report the 64-seed report
 * @param {string} metric a metric with a direction and a non-zero mean
 * @param {{ size: number, powerSplits: number, direction: string, rng: import('../js/sim/rng.js').Rng }} options the
 *   arm size, splits per grid step, the direction to plant in and the stream that draws the splits
 * @returns {number | null} the first `EFFECT_GRID` change detected in `POWER_TARGET` of splits; null when none is
 */
function detectableChange(report, metric, { size, powerSplits, direction, rng }) {
    const reference = Math.abs(report.metrics[metric].mean);
    const sign = direction === 'higher' ? 1 : -1;
    for (const effect of EFFECT_GRID) {
        const shift = sign * effect * reference;
        const tally = countVerdicts(report, metric, { size, splits: powerSplits, shift, direction, rng });
        if (tally.better >= POWER_TARGET * tally.valid) {
            return effect;
        }
    }
    return null;
}

/**
 * @param {Record<string, any>} report the 64-seed report
 * @param {string} metric a metric name
 * @param {{ size: number, splits: number, powerSplits: number, includeWatch?: boolean }} options arm size and split
 *   counts, and whether to measure a `watch` metric in its intended direction (`intendedDirection`) instead of skipping it
 * @returns {PowerRow} the row for this metric and arm size
 */
export function powerRow(report, metric, { size, splits, powerSplits, includeWatch = false }) {
    const base = { metric, size, falsePositive: null, detectable: null };
    const declared = metricDirection(metric);
    if (declared === null || (declared === 'watch' && !includeWatch)) {
        return { ...base, note: declared === null ? 'unknown metric' : 'watch' };
    }
    const direction = declared === 'watch' ? intendedDirection(metric) : declared;
    const rng = fork(createRng(1), `power-${metric}-${size}`);
    const none = countVerdicts(report, metric, { size, splits, shift: 0, direction, rng });
    if (none.valid === 0) {
        return { ...base, note: 'no verdict at this size' };
    }
    const row = {
        ...base,
        falsePositive: (none.better + none.worse) / none.valid,
        validShare: none.valid / splits,
        ...(declared === 'watch' ? { direction } : {}),
    };
    if (Math.abs(report.metrics[metric].mean) === 0) {
        return { ...row, note: 'mean is 0' };
    }
    return { ...row, detectable: detectableChange(report, metric, { size, powerSplits, direction, rng }) };
}

/**
 * @param {Record<string, any>} report the 64-seed report
 * @param {{ splits: number, powerSplits: number, sizes: number[], metrics: string[], includeWatch?: boolean }} options
 *   what to measure
 * @returns {PowerRow[]} one row per metric (all of them when `metrics` is empty) and size
 * @throws {Error} when the report has fewer than twice the largest size in seeds, or a named metric is missing
 */
export function evalPower(report, { splits, powerSplits, sizes, metrics, includeWatch = false }) {
    const largest = Math.max(...sizes);
    if (report.seeds.length < 2 * largest) {
        throw new Error(
            `a ${largest}-v-${largest} split needs ${2 * largest} seeds, the report has ${report.seeds.length}`,
        );
    }
    const names = metrics.length > 0 ? metrics : Object.keys(report.metrics).sort();
    const missing = names.filter((name) => !Object.hasOwn(report.metrics, name));
    if (missing.length > 0) {
        throw new Error(`metrics not in the report: ${missing.join(', ')}`);
    }
    return names.flatMap((metric) =>
        sizes.map((size) => powerRow(report, metric, { size, splits, powerSplits, includeWatch })),
    );
}

/**
 * @param {PowerRow} row a row
 * @returns {string} the note column: why there are no numbers, else `watch?` for a false-positive rate above twice the
 *   nominal 5%, the planted direction of a measured `watch` metric, and the share of splits with a verdict when under 90%
 */
function rowNote(row) {
    if (row.note !== undefined) {
        return row.note;
    }
    const flag = row.falsePositive !== null && row.falsePositive > 2 * NOMINAL_ALPHA ? ['watch?'] : [];
    const planted = row.direction === undefined ? [] : [`watch, planted ${row.direction}`];
    const share =
        row.validShare !== undefined && row.validShare < 0.9
            ? [`verdicts in ${Math.round(row.validShare * 100)}%`]
            : [];
    return [...flag, ...planted, ...share].join('; ');
}

/**
 * @param {PowerRow[]} rows the rows
 * @returns {string[]} the table lines
 */
export function formatPower(rows) {
    const pct = (/** @type {number | null} */ v) => (v === null ? '-' : `${(v * 100).toFixed(1)}%`);
    const head = ['metric', 'seeds', 'false positive', 'detectable at 80%', ''];
    const body = rows.map((r) => [
        r.metric,
        String(r.size),
        pct(r.falsePositive),
        r.detectable === null ? (r.note === undefined ? '>100%' : '-') : `${pct(r.detectable)}`,
        rowNote(r),
    ]);
    const widths = head.map((_, c) => Math.max(...[head, ...body].map((line) => line[c].length)));
    return [head, ...body].map((line) =>
        line
            .map((cell, c) => cell.padEnd(widths[c]))
            .join('  ')
            .trimEnd(),
    );
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{ print?: (line: string) => void, error?: (line: string) => void }} [io] output sinks
 * @returns {number} the exit code: 0 ok, 2 bad input
 */
export function main(argv, { print = console.log, error = console.error } = {}) {
    try {
        const { files, json, ...options } = parseArgs(argv);
        const report = JSON.parse(readFileSync(files[0], 'utf8'));
        validateReport(report);
        const rows = evalPower(report, options);
        print(json ? JSON.stringify({ ...options, rows }, null, 2) : formatPower(rows).join('\n'));
        return 0;
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return 2;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
