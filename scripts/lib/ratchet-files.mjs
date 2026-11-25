// The per-file half of the coverage ratchet: a changed source file in a directory whose baseline is 100% must itself
// be at 100%, and a new source file in a scope under 100% (`scripts`) must reach that scope's baseline, so it cannot
// pull the whole-suite ratchet on main below it (agent-workflow T50). `scripts/ratchet-related.mjs` runs it on the
// files of a branch before the push.
import { relative } from 'node:path';
import { describeMiss, METRICS } from './coverage-detail.mjs';

/** Directories a baseline can name, as repo-relative path prefixes (the same list as scripts/quality-ratchet.mjs). */
const SCOPES = ['js/sim', 'js/evo', 'js/worker', 'js/app', 'scripts'];

/**
 * @param {string} rel repo-relative path
 * @returns {string | undefined} the baseline scope the file belongs to
 */
function scopeOf(rel) {
    return SCOPES.find((scope) => rel.startsWith(`${scope}/`));
}

/**
 * The coverage each metric of a file must reach: 100 where its scope's baseline is 100, and for a file new on the
 * branch the scope's baseline on every other metric it names.
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @param {string} rel repo-relative path
 * @param {boolean} added whether the branch adds the file
 * @returns {Record<string, number>} the limit per metric, in percent; empty for a file the gate does not hold
 */
export function fileLimits(baseline, rel, added) {
    const limits = baseline.coverage?.[scopeOf(rel) ?? ''] ?? {};
    /** @type {Record<string, number>} */
    const out = {};
    for (const metric of METRICS) {
        if (limits[metric] === 100 || (added && typeof limits[metric] === 'number')) {
            out[metric] = limits[metric];
        }
    }
    return out;
}

/**
 * Picks the changed files the gate measures: source files (not tests) that have a limit (`fileLimits`).
 * @param {string[]} changed repo-relative paths changed against the base
 * @param {Set<string>} added the paths among them that the branch adds
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @returns {string[]} the files to measure
 */
export function measuredSources(changed, added, baseline) {
    return changed.filter(
        (rel) =>
            /\.m?js$/.test(rel) &&
            !rel.startsWith('test/') &&
            Object.keys(fileLimits(baseline, rel, added.has(rel))).length > 0,
    );
}

/**
 * Compares each measured file with its limits. A measured file with no coverage entry was loaded by no related test
 * and misses.
 * @param {Record<string, Record<string, {total: number, covered: number}>>} summary coverage-summary.json
 * @param {Record<string, any>} final coverage-final.json, or an empty object
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @param {{root: string, files: string[], added?: Set<string>}} where repo root, the repo-relative files to compare,
 *   and the ones the branch adds
 * @returns {string[]} one line per file and metric that misses, with its uncovered places; empty when all hold
 */
export function fileMisses(summary, final, baseline, { root, files, added = new Set() }) {
    /** @type {Map<string, string>} */
    const byRel = new Map(Object.keys(summary).map((file) => [relative(root, file).split('\\').join('/'), file]));
    const out = [];
    for (const rel of files) {
        const file = byRel.get(rel);
        if (file === undefined) {
            out.push(`  ${rel}: loaded by no related test`);
            continue;
        }
        for (const [metric, limit] of Object.entries(fileLimits(baseline, rel, added.has(rel)))) {
            const { total, covered } = summary[file][metric];
            if (total > 0 && (covered / total) * 100 < limit) {
                const line = describeMiss(rel, metric, summary[file][metric], final[file]);
                out.push(limit < 100 ? `${line} (a new file needs the scope's ${limit}%)` : line);
            }
        }
    }
    return out;
}
