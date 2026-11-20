// The yield of a ladder run (docs/designs/training-loop.md, Ladder yield): one score per run, and per stage the share of
// runs that passed it, the generations it took and the CPU hours spent per pass. A detector only, never fitness. Pure:
// the run's `manifest.json` and `curve.jsonl` rows arrive parsed (`scripts/lib/yield-files.mjs` reads them).

import { quantile } from './metrics-stats.js';

/**
 * @typedef {object} RunYield
 * @property {number} offset the run's `--seed-offset`
 * @property {number} reached the index of the last stage the run trained in (0 is the first)
 * @property {{stage: string, generation: number}[]} passed each passed stage and the generation it passed at, in order
 * @property {number} bestProgress the best progress of the stage the run stopped in (1 when the ladder finished)
 * @property {number} score `reached + bestProgress`: one ordinal number per run
 * @property {number} cpuSeconds the summed episode time over the run
 * @property {Record<string, number>} stageCpuSeconds the episode time by stage
 */

/**
 * The episode seconds of each curve row: the row's `cpuSeconds` less the previous row's, or for a row from before that
 * column existed `cpuShare` x `workers` x the wall seconds since the previous row.
 * @param {readonly Record<string, any>[]} rows the curve rows in order
 * @returns {{stage: string, seconds: number}[]} each row's stage and the episode seconds of its interval
 */
function rowSeconds(rows) {
    let previous = { cpuSeconds: 0, wallSeconds: 0 };
    return rows.map((row) => {
        const exact = typeof row.cpuSeconds === 'number';
        const wallSeconds = row.wallSeconds ?? previous.wallSeconds;
        const seconds = exact
            ? row.cpuSeconds - previous.cpuSeconds
            : (row.cpuShare ?? 0) * (row.workers ?? 0) * (wallSeconds - previous.wallSeconds);
        previous = { cpuSeconds: exact ? row.cpuSeconds : previous.cpuSeconds, wallSeconds };
        return { stage: row.stage, seconds: Math.max(0, seconds) };
    });
}

/**
 * @param {readonly Record<string, any>[]} rows the curve rows
 * @param {string} stage a stage's name
 * @returns {number} the highest `bestProgress` any of the stage's rows carries (0 for none)
 */
function stageBest(rows, stage) {
    return rows.reduce(
        (best, row) =>
            row.stage === stage && typeof row.bestProgress === 'number' ? Math.max(best, row.bestProgress) : best,
        0,
    );
}

/**
 * @param {Record<string, any>} manifest a run's `manifest.json`
 * @param {readonly Record<string, any>[]} rows a run's `curve.jsonl` rows
 * @returns {RunYield} the run's yield
 * @throws {Error} when the manifest names no stage that ran
 */
export function runYield(manifest, rows) {
    const stages = /** @type {Record<string, any>[]} */ (manifest.stages ?? []);
    if (stages.length === 0) {
        throw new Error('runYield: the manifest has no stage that ran');
    }
    const ran = (/** @type {Record<string, any>} */ s) =>
        s.generations > 0 || s.passedAt !== undefined || rows.some((row) => row.stage === s.name);
    const reached = Math.max(0, stages.findLastIndex(ran));
    const last = stages[reached];
    const finished = manifest.status === 'done' || (reached === stages.length - 1 && last.passedAt !== undefined);
    const stageCpuSeconds = /** @type {Record<string, number>} */ ({});
    for (const { stage, seconds } of rowSeconds(rows)) {
        stageCpuSeconds[stage] = (stageCpuSeconds[stage] ?? 0) + seconds;
    }
    const bestProgress = finished ? 1 : stageBest(rows, last.name);
    return {
        offset: manifest.options?.seedOffset ?? 0,
        reached,
        passed: stages.filter((s) => s.passedAt !== undefined).map((s) => ({ stage: s.name, generation: s.passedAt })),
        bestProgress,
        score: reached + bestProgress,
        cpuSeconds: Object.values(stageCpuSeconds).reduce((sum, v) => sum + v, 0),
        stageCpuSeconds,
    };
}

/**
 * @typedef {object} StageYield
 * @property {string} stage the stage's name
 * @property {number} passShare the share of runs that passed it
 * @property {number | null} medianGenerations the median generations from the previous pass (or the start) to this one
 *   (null: no run passed it)
 * @property {number | null} cpuHoursPerPass the CPU hours every run spent in the stage over the passes (null: no pass)
 */

/**
 * @param {readonly RunYield[]} runs the runs of one arm
 * @param {readonly string[]} stages the ladder's stage names in order
 * @returns {{runs: number, meanScore: number, passedLast: number, cpuHours: number, stages: StageYield[]}} the arm's yield:
 *   the run count, the mean score, the runs that passed the last stage, the CPU hours of every run and, per stage, the share of runs that passed it, the median generations to
 *   pass and the CPU hours spent per pass
 */
export function ladderYield(runs, stages) {
    const rows = stages.map((stage) => {
        const times = runs.flatMap((run) => {
            const at = run.passed.findIndex((p) => p.stage === stage);
            return at < 0 ? [] : [run.passed[at].generation - (at === 0 ? 0 : run.passed[at - 1].generation)];
        });
        const cpuSeconds = runs.reduce((sum, run) => sum + (run.stageCpuSeconds[stage] ?? 0), 0);
        return {
            stage,
            passShare: runs.length === 0 ? 0 : times.length / runs.length,
            medianGenerations: times.length === 0 ? null : quantile(times, 0.5),
            cpuHoursPerPass: times.length === 0 ? null : cpuSeconds / 3600 / times.length,
        };
    });
    const meanScore = runs.length === 0 ? 0 : runs.reduce((sum, run) => sum + run.score, 0) / runs.length;
    const last = stages[stages.length - 1];
    return {
        runs: runs.length,
        meanScore,
        passedLast: runs.filter((run) => run.passed.some((p) => p.stage === last)).length,
        cpuHours: runs.reduce((sum, run) => sum + run.cpuSeconds, 0) / 3600,
        stages: rows,
    };
}
