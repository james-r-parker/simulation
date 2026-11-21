// Per-file coverage detail for the ratchet: which lines, branches and functions of a file no test reached, read from
// the istanbul `coverage-final.json` that vitest writes beside `coverage-summary.json`.
import { relative } from 'node:path';

/** Coverage metrics, in the order the detail prints them. */
export const METRICS = ['lines', 'branches', 'functions', 'statements'];
/** Files a scope-level miss lists before the rest are counted. */
const LISTED_FILES = 15;

/**
 * @typedef {{total: number, covered: number}} Counts
 * @typedef {Record<string, Counts>} FileCounts metric -> counts
 * @typedef {{statementMap?: any, s?: any, branchMap?: any, b?: any, fnMap?: any, f?: any}} FinalEntry istanbul entry
 */

/**
 * Collapses sorted numbers into ranges: 3, 4, 5, 9 -> "3-5, 9".
 * @param {number[]} numbers line numbers
 * @returns {string} the ranges
 */
export function compressLines(numbers) {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < sorted.length;) {
        let end = i;
        while (sorted[end + 1] === sorted[end] + 1) {
            end++;
        }
        parts.push(end === i ? `${sorted[i]}` : `${sorted[i]}-${sorted[end]}`);
        i = end + 1;
    }
    return parts.join(', ');
}

/**
 * @param {FinalEntry} entry istanbul entry
 * @returns {number[]} the line of each statement no test ran
 */
function missedStatements(entry) {
    return Object.entries(entry.s ?? {})
        .filter(([, count]) => count === 0)
        .map(([id]) => entry.statementMap[id].start.line);
}

/**
 * @param {FinalEntry} entry istanbul entry
 * @returns {number[]} the line of each branch arm no test took
 */
function missedBranches(entry) {
    /** @type {number[]} */
    const lines = [];
    for (const [id, counts] of Object.entries(entry.b ?? {})) {
        const { locations, line } = entry.branchMap[id];
        /** @type {number[]} */ (counts).forEach((count, index) => {
            if (count === 0) {
                lines.push(locations[index]?.start?.line ?? line);
            }
        });
    }
    return lines;
}

/**
 * The places in one file that no test reached.
 * @param {FinalEntry | undefined} entry istanbul entry of the file
 * @returns {{lines: number[], branches: number[], functions: string[]}} line numbers, branch lines and function names
 */
export function uncovered(entry) {
    if (!entry) {
        return { lines: [], branches: [], functions: [] };
    }
    const functions = Object.entries(entry.f ?? {})
        .filter(([, count]) => count === 0)
        .map(([id]) => `${entry.fnMap[id].name} (line ${entry.fnMap[id].line})`);
    return { lines: missedStatements(entry), branches: missedBranches(entry), functions };
}

/**
 * Describes what one file misses on one metric.
 * @param {string} rel repo-relative path
 * @param {string} metric `lines`, `branches`, `functions` or `statements`
 * @param {Counts} counts the file's counts for the metric
 * @param {FinalEntry | undefined} entry istanbul entry, when the run wrote one
 * @returns {string} one line, naming the uncovered places when they are known
 */
export function describeMiss(rel, metric, counts, entry) {
    const head = `  ${rel}: ${metric} ${counts.covered}/${counts.total}`;
    if (!entry) {
        return head;
    }
    const found = uncovered(entry);
    if (metric === 'branches') {
        return `${head}, uncovered branches at lines ${compressLines(found.branches)}`;
    }
    if (metric === 'functions') {
        return `${head}, uncovered functions ${found.functions.join(', ')}`;
    }
    return `${head}, uncovered lines ${compressLines(found.lines)}`;
}

/**
 * Lists, for each failing scope and metric, the files that miss the most.
 * @param {Record<string, FileCounts>} summary coverage-summary.json without its `total` entry, keyed by absolute path
 * @param {Record<string, FinalEntry>} final coverage-final.json, or an empty object
 * @param {string} root repo root
 * @param {{scope: string, metric: string}[]} failing the scope and metric pairs that missed
 * @returns {string[]} output lines
 */
export function detailForScopes(summary, final, root, failing) {
    const out = [];
    for (const { scope, metric } of failing) {
        const misses = Object.entries(summary)
            .map(([file, counts]) => ({
                file,
                counts: counts[metric],
                rel: relative(root, file).split('\\').join('/'),
            }))
            .filter((m) => m.rel.startsWith(`${scope}/`) && m.counts.covered < m.counts.total)
            .sort((a, b) => b.counts.total - b.counts.covered - (a.counts.total - a.counts.covered));
        out.push(`${scope} ${metric}: ${misses.length} file(s) not fully covered`);
        for (const m of misses.slice(0, LISTED_FILES)) {
            out.push(describeMiss(m.rel, metric, m.counts, final[m.file]));
        }
        if (misses.length > LISTED_FILES) {
            out.push(`  [... ${misses.length - LISTED_FILES} more files]`);
        }
    }
    return out;
}
