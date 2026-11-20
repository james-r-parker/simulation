// Fixture training run directories for the yield tests: a `manifest.json` and a `curve.jsonl` with the columns
// `scripts/train.mjs` writes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {object} FixtureRun
 * @property {number} offset the run's seed offset
 * @property {{name: string, passedAt?: number, generations?: number}[]} stages the stages the manifest records
 * @property {Record<string, any>[]} [rows] the curve rows
 * @property {string} [status] the manifest status
 */

/**
 * @param {string} dir the run directory (created)
 * @param {FixtureRun} run the run
 * @returns {string} the directory
 */
export function writeRun(dir, { offset, stages, rows = [], status = 'stalled' }) {
    mkdirSync(dir, { recursive: true });
    const manifest = {
        status,
        options: { seedOffset: offset },
        stages: stages.map((s) => ({ generations: 10, ...s })),
    };
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
    if (rows.length > 0) {
        writeFileSync(join(dir, 'curve.jsonl'), rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
    }
    return dir;
}

/**
 * @param {string} stage the stage of the row
 * @param {number} cpuSeconds cumulative episode seconds
 * @param {number} bestProgress the stage's best progress
 * @returns {Record<string, any>} a curve row
 */
export const row = (stage, cpuSeconds, bestProgress) => ({
    stage,
    cpuSeconds,
    bestProgress,
    progress: bestProgress,
    workers: 8,
    cpuShare: 0.5,
    wallSeconds: cpuSeconds,
});
