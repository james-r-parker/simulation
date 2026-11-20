// The shared baseline report of docs/designs/detector-baseline.md: which file it is and what it holds.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateReport } from '../../js/evo/report.js';

/** Where the shared reports live, and the prefix of the floor-on one a plan reads. */
export const BASELINE_DIR = 'evals/power';
export const BASELINE_PREFIX = 'defaults-floor-on-';

/**
 * @param {string} [dir] the directory to look in
 * @returns {string | null} the path of the newest (by modification time) floor-on baseline report there, or `null`
 */
export function newestBaselinePath(dir = BASELINE_DIR) {
    const files = readdirSync(dir).filter((name) => name.startsWith(BASELINE_PREFIX) && name.endsWith('.json'));
    const stamped = files.map((name) => ({ path: join(dir, name), time: statSync(join(dir, name)).mtimeMs }));
    stamped.sort((a, b) => b.time - a.time || (a.path < b.path ? 1 : -1));
    return stamped[0]?.path ?? null;
}

/**
 * @param {string} path a report file
 * @returns {Record<string, any>} the parsed, validated report
 * @throws {Error} when the file is not a valid report
 */
export function readReport(path) {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    validateReport(report);
    return report;
}
