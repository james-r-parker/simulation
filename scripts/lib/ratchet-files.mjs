// The per-file half of the coverage ratchet: a changed source file in a directory whose baseline is 100% must itself
// be at 100%. `scripts/ratchet-related.mjs` runs it on the files of a branch before the push.
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
 * The metrics a file must hold at 100%, from its scope's baseline.
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @param {string} rel repo-relative path
 * @returns {string[]} the metrics whose scope baseline is 100; empty for a file outside a scope or a lower baseline
 */
export function strictMetrics(baseline, rel) {
    const limits = baseline.coverage?.[scopeOf(rel) ?? ''] ?? {};
    return METRICS.filter((metric) => limits[metric] === 100);
}

/**
 * Picks the changed files the gate measures: source files (not tests) that a 100% baseline covers.
 * @param {string[]} changed repo-relative paths changed against the base
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @returns {string[]} the files to measure
 */
export function strictSources(changed, baseline) {
    return changed.filter(
        (rel) => /\.m?js$/.test(rel) && !rel.startsWith('test/') && strictMetrics(baseline, rel).length > 0,
    );
}

/**
 * Compares each measured file with 100% on the metrics its scope's baseline holds there.
 * @param {Record<string, Record<string, {total: number, covered: number}>>} summary coverage-summary.json
 * @param {Record<string, any>} final coverage-final.json, or an empty object
 * @param {{coverage?: Record<string, Record<string, number>>}} baseline parsed quality-baseline.json
 * @param {{root: string, files: string[]}} where repo root, and the repo-relative files to compare
 * @returns {string[]} one line per file and metric that misses, with its uncovered places; empty when all hold
 */
export function fileMisses(summary, final, baseline, { root, files }) {
    const wanted = new Set(files);
    const out = [];
    for (const [file, counts] of Object.entries(summary)) {
        const rel = relative(root, file).split('\\').join('/');
        if (!wanted.has(rel)) {
            continue;
        }
        for (const metric of strictMetrics(baseline, rel)) {
            if (counts[metric].covered < counts[metric].total) {
                out.push(describeMiss(rel, metric, counts[metric], final[file]));
            }
        }
    }
    return out;
}
