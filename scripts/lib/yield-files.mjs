// Reads training run directories for the yield tools (`train:yield`, `train:compare`, `train:screen`): each run's
// `manifest.json` and `curve.jsonl`, and the directories a shell glob or an unexpanded pattern names.
import { existsSync, globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runYield } from '../../js/evo/ladder-yield.js';

/**
 * @param {readonly string[]} patterns directories, or glob patterns over them (`*`, `?`, `[...]`)
 * @returns {string[]} the matching directories (a pattern with no wildcard is itself), sorted and without repeats
 * @throws {Error} when a pattern matches nothing
 */
export function expandDirs(patterns) {
    const dirs = patterns.flatMap((pattern) => {
        const found = /[*?[]/.test(pattern) ? globSync(pattern) : existsSync(pattern) ? [pattern] : [];
        if (found.length === 0) {
            throw new Error(`no run directory matches "${pattern}"`);
        }
        return found;
    });
    return [...new Set(dirs)].sort();
}

/**
 * @param {string} dir a training output directory
 * @returns {{manifest: Record<string, any>, rows: Record<string, any>[]}} its `manifest.json` and the rows of its
 *   `curve.jsonl` (none when the run has not checkpointed)
 * @throws {Error} when the directory has no `manifest.json`
 */
export function readRunDir(dir) {
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) {
        throw new Error(`${dir} is not a training run: no manifest.json`);
    }
    const curvePath = join(dir, 'curve.jsonl');
    const text = existsSync(curvePath) ? readFileSync(curvePath, 'utf8') : '';
    return {
        manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
        rows: text
            .split('\n')
            .filter((line) => line !== '')
            .map((line) => JSON.parse(line)),
    };
}

/**
 * @param {readonly string[]} dirs run directories
 * @returns {{runs: (import('../../js/evo/ladder-yield.js').RunYield & {dir: string})[], stages: string[]}} each run's yield
 *   with its directory, and the ladder's stage names: the longest list of stages a manifest records
 */
export function loadRuns(dirs) {
    let stages = /** @type {string[]} */ ([]);
    const runs = dirs.map((dir) => {
        const { manifest, rows } = readRunDir(dir);
        const names = (manifest.stages ?? []).map((/** @type {{name: string}} */ s) => s.name);
        stages = names.length > stages.length ? names : stages;
        return { dir, ...runYield(manifest, rows) };
    });
    return { runs, stages };
}
