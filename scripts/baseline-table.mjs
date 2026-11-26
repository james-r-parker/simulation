// Prints a plan's metrics from the shared baseline report as its Baseline table (`npm run baseline:table`,
// docs/designs/detector-baseline.md): mean, range, power and the seeds a verdict needs. A plan's metrics are the
// registered metric names its design doc writes in backticks.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { withCurrentNames } from '../js/evo/metric-registry/renames.js';
import { pooledEstimate } from '../js/evo/report-pooled.js';
import { newestBaselinePath, readReport } from './lib/baseline-report.mjs';
import { exitCodeOf, parseFlags } from './lib/cli-args.mjs';

const USAGE = 'usage: baseline:table --plan <doc name or path> [--report <report.json>]';
const NAME = /`((?:eval|bench)\.[a-z0-9_@.]+)`/g;
const HEADER = [
    '| Metric | Mean | Range | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
];

/**
 * @param {string} text a design doc
 * @param {Readonly<Record<string, unknown>>} [metrics] the registry
 * @returns {{ names: string[], unknown: string[] }} the registered metric names the doc writes in backticks, in
 *   first-seen order, and the metric-like names it writes that are not registered
 */
export function planMetrics(text, metrics = METRICS) {
    const seen = [...new Set([...text.matchAll(NAME)].map((m) => m[1]))];
    return {
        names: seen.filter((name) => Object.hasOwn(metrics, name)),
        unknown: seen.filter((name) => !Object.hasOwn(metrics, name)),
    };
}

/**
 * @param {number} value a number
 * @returns {string} the value to four significant figures
 */
function num(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(4)));
}

/**
 * @param {number | null | undefined} value a power reading
 * @returns {string} the reading, or `-` when the grid found none
 */
function reading(value) {
    return value === null || value === undefined ? '-' : num(value);
}

/**
 * @param {(number | null)[]} all a metric's values, one per seed
 * @param {import('../js/evo/report-pooled.js').PooledCell[]} [pooled] a pooled metric's per-seed cells; the mean is
 *   then the ratio of sums, the estimate its verdicts read
 * @returns {string[]} the mean, the range and the null share as table cells
 */
function summary(all, pooled) {
    const values = /** @type {number[]} */ (all.filter((v) => v !== null));
    const nulls = all.length > 0 ? num((all.length - values.length) / all.length) : '-';
    if (values.length === 0) {
        return ['-', '-', nulls];
    }
    // A non-null value has a seed with exposure, so the pooled estimate is a number here.
    const pooledMean = pooled === undefined ? null : /** @type {number} */ (pooledEstimate(pooled));
    const mean = num(pooledMean ?? values.reduce((a, b) => a + b, 0) / values.length);
    return [mean, `${num(Math.min(...values))} to ${num(Math.max(...values))}`, nulls];
}

/**
 * @param {string} name the metric
 * @param {Record<string, any>} report a report with current metric names
 * @param {Readonly<Record<string, any>>} metrics the registry
 * @returns {string} one table row
 */
function row(name, report, metrics) {
    const { power, minSeeds } = metrics[name] ?? {};
    const seeds = String(minSeeds ?? 'more than 64');
    const mde = [power?.mde16, power?.mde32, power?.mde64].map(reading);
    return `| \`${name}\` | ${[...summary(report.metrics[name]?.values ?? [], report.metrics[name]?.pooled), ...mde, seeds].join(' | ')} |`;
}

/**
 * @param {Record<string, any>} report a report with current metric names
 * @param {string[]} names metrics to tabulate
 * @param {Readonly<Record<string, any>>} [metrics] the registry
 * @returns {string[]} Markdown table lines: mean, range, null share, the smallest detectable change per arm size and the
 *   seeds a verdict needs
 */
export function baselineTable(report, names, metrics = METRICS) {
    return [...HEADER, ...names.map((name) => row(name, report, metrics))];
}

/**
 * @param {string} plan a design doc name (`sprint-burst`) or a path
 * @returns {string} the doc's path
 * @throws {Error} when no such doc exists
 */
export function planPath(plan) {
    const path = existsSync(plan) ? plan : `docs/designs/${plan.replace(/\.md$/, '')}.md`;
    if (!existsSync(path)) {
        throw new Error(`no plan doc at ${path}\n${USAGE}`);
    }
    return path;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {(line: string) => void} print where lines go
 * @returns {Promise<void>} resolves once the table is printed
 */
export async function runBaselineTable(argv, print) {
    const opts = parseFlags(argv, {
        valueFlags: { '--plan': (v) => ['plan', v], '--report': (v) => ['report', v] },
        defaults: { plan: null, report: null },
        usage: USAGE,
    });
    if (typeof opts.plan !== 'string') {
        throw new Error(USAGE);
    }
    const reportPath = opts.report ?? newestBaselinePath();
    if (reportPath === null || reportPath === undefined) {
        throw new Error('no shared baseline report under evals/power/');
    }
    const report = withCurrentNames(readReport(reportPath));
    const { names, unknown } = planMetrics(readFileSync(planPath(opts.plan), 'utf8'));
    print(`Baseline: ${reportPath} (${report.seeds.length} seeds, ${report.ticks} ticks)`);
    print('');
    baselineTable(report, names).forEach((line) => print(line));
    for (const name of unknown) {
        print(`not registered: ${name}`);
    }
    for (const name of names.filter((n) => report.metrics[n] === undefined)) {
        print(`not in the report: ${name}`);
    }
}

/* v8 ignore start -- thin CLI; runBaselineTable is tested */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = await exitCodeOf(() => runBaselineTable(process.argv.slice(2), console.log));
}
/* v8 ignore stop */
