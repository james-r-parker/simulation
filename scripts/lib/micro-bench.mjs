// Reads, summarises and compares the result files `bench/micro/*.bench.js` write (`npm run bench:micro`).
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { median } from '../bench.mjs';

/** Where the bench files write their results, relative to the tree they ran in (`RESULT_DIR` in `bench/micro/fixture.js`). */
export const RESULT_DIR = '.bench-micro';

/**
 * @typedef {object} MicroResult
 * @property {number} ops operations per second (mean)
 * @property {number} rme the relative margin of error of that mean, in percent
 * @property {number} [spread] across repeated runs, half the range of ops over their median, in percent
 */

/**
 * @param {string} tree the tree a bench run wrote into
 * @returns {void}
 */
export function clearResults(tree) {
    rmSync(join(tree, RESULT_DIR), { recursive: true, force: true });
}

/**
 * @param {string} tree the tree a bench run wrote into
 * @returns {Map<string, MicroResult>} one result per benchmark, keyed `<module>: <benchmark name>`, in name order
 * @throws {Error} when the run wrote no results
 */
export function readResults(tree) {
    const root = join(tree, RESULT_DIR);
    if (!existsSync(root)) {
        throw new Error(`no benchmark results in ${root}: the run wrote none`);
    }
    /** @type {Map<string, MicroResult>} */
    const results = new Map();
    for (const suite of readdirSync(root).sort()) {
        for (const file of readdirSync(join(root, suite)).sort()) {
            const { throughput } = JSON.parse(readFileSync(join(root, suite, file), 'utf8'));
            const name = decodeURIComponent(file.slice(0, -'.json'.length));
            results.set(`${suite}: ${name}`, { ops: throughput.mean, rme: throughput.rme });
        }
    }
    return results;
}

/**
 * @param {number[]} values at least one number
 * @returns {number} half the range over the median, in percent
 */
function spreadOf(values) {
    const mid = median(values);
    return mid === 0 ? 0 : ((Math.max(...values) - Math.min(...values)) / 2 / mid) * 100;
}

/**
 * @param {Array<Map<string, MicroResult>>} runs the results of repeated runs of one tree
 * @returns {Map<string, MicroResult>} per benchmark, the median ops and margin and the spread of ops over the runs
 *   that have it
 */
export function medianResults(runs) {
    /** @type {Map<string, MicroResult[]>} */
    const byName = new Map();
    for (const run of runs) {
        for (const [name, result] of run) {
            byName.set(name, [...(byName.get(name) ?? []), result]);
        }
    }
    return new Map(
        [...byName].map(([name, list]) => [
            name,
            {
                ops: median(list.map((r) => r.ops)),
                rme: median(list.map((r) => r.rme)),
                spread: spreadOf(list.map((r) => r.ops)),
            },
        ]),
    );
}

/**
 * @typedef {object} MicroRow
 * @property {string} name the benchmark
 * @property {MicroResult | null} base the base tree's result, null when it has none
 * @property {MicroResult} head the head tree's result
 * @property {number | null} change head ops over base ops, less 1; null without a base
 * @property {number | null} margin the two trees' errors added in quadrature, in percent; a tree's error is the larger
 *   of its margin of error and its run-to-run spread
 * @property {'faster' | 'slower' | 'same' | 'new'} verdict whether the change is outside the margin
 */

/**
 * @param {MicroResult} result one tree's result
 * @returns {number} the larger of the within-run margin of error and the run-to-run spread, in percent
 */
function errorOf(result) {
    return Math.max(result.rme, result.spread ?? 0);
}

/**
 * @param {Map<string, MicroResult>} base the base tree's medians
 * @param {Map<string, MicroResult>} head the head tree's medians
 * @returns {MicroRow[]} one row per head benchmark, in name order
 */
export function compareRows(base, head) {
    return [...head].map(([name, headResult]) => {
        const baseResult = base.get(name) ?? null;
        if (baseResult === null) {
            return { name, base: null, head: headResult, change: null, margin: null, verdict: 'new' };
        }
        const change = headResult.ops / baseResult.ops - 1;
        const margin = Math.hypot(errorOf(baseResult), errorOf(headResult));
        const outside = Math.abs(change) * 100 > margin;
        const verdict = !outside ? 'same' : change > 0 ? 'faster' : 'slower';
        return { name, base: baseResult, head: headResult, change, margin, verdict };
    });
}

/**
 * @param {number} ops operations per second
 * @returns {string} the number with thousands separators and no decimals below 100 ops/s
 */
function formatOps(ops) {
    return ops >= 100 ? Math.round(ops).toLocaleString('en-US') : ops.toFixed(2);
}

/**
 * @param {MicroRow[]} rows the comparison rows
 * @returns {string[]} an aligned table: benchmark, base and head ops/s, the change and the margin it is judged against
 */
export function formatCompare(rows) {
    const body = rows.map((row) => [
        row.name,
        row.base === null ? '-' : formatOps(row.base.ops),
        formatOps(row.head.ops),
        row.change === null ? 'new' : `${row.change >= 0 ? '+' : ''}${(row.change * 100).toFixed(1)}%`,
        row.margin === null ? '-' : `+-${row.margin.toFixed(1)}%`,
        row.verdict,
    ]);
    return alignTable([['benchmark', 'base ops/s', 'head ops/s', 'change', 'margin', 'verdict'], ...body]);
}

/**
 * @param {Map<string, MicroResult>} results one tree's results
 * @returns {string[]} an aligned table: benchmark, ops/s and the relative margin of error
 */
export function formatResults(results) {
    const body = [...results].map(([name, r]) => [name, formatOps(r.ops), `+-${r.rme.toFixed(2)}%`]);
    return alignTable([['benchmark', 'ops/s', 'margin'], ...body]);
}

/**
 * @param {string[][]} table rows of equally many cells, the first row the header
 * @returns {string[]} the rows as lines: the first column left-aligned, the rest right-aligned
 */
function alignTable(table) {
    const widths = table[0].map((_, col) => Math.max(...table.map((row) => row[col].length)));
    return table.map((row) =>
        row.map((cell, col) => (col === 0 ? cell.padEnd(widths[col]) : cell.padStart(widths[col]))).join('  '),
    );
}
