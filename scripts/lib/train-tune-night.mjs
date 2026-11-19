// The steps of a tuning night that run trainers and evals (docs/designs/training-loop.md, Tuning lane): the tuning screen,
// the held-out confirmation of each `better` arm, and the champion export and world trial of the finalists.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { armDir, BASE, bestRunDir, isFinalist, screenGrid, verdictOf } from './train-tune-plan.mjs';

/**
 * @param {string} dir a training run directory
 * @returns {string | null} its latest `archive-<g>.json`, or null for none
 */
export function latestArchive(dir) {
    const gens = existsSync(dir)
        ? readdirSync(dir).flatMap((name) => {
              const m = /^archive-(\d+)\.json$/.exec(name);
              return m ? [Number(m[1])] : [];
          })
        : [];
    return gens.length === 0 ? null : join(dir, `archive-${Math.max(...gens)}.json`);
}

/**
 * @param {string} file where the grid goes
 * @param {Record<string, any>} body the grid
 * @returns {string} the file
 */
function writeGrid(file, body) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
    return file;
}

/**
 * @typedef {object} Night
 * @property {Record<string, any>} spec the spec, defaults laid in
 * @property {import('../../js/evo/train-tune.js').TuneArm[]} proposed the arms to screen
 * @property {string} out the results directory
 * @property {string} runs the training runs' directory
 * @property {{workers: number | null, force: boolean, logDir: string}} shared the screen options every screen shares
 */

/**
 * Screens the arms on the tuning offsets, then each `better` arm on the held-out offsets.
 * @param {Night} night the night
 * @param {typeof import('../train-screen.mjs').runTrainScreen} screen runs a ladder screen
 * @returns {Promise<{arms: Record<string, any>[], yielded: Record<string, any>}>} each arm's record, and the tuning
 *   screen's `yield.json`
 */
export async function screenNight({ spec, proposed, out, runs, shared }, screen) {
    const grid = writeGrid(join(out, 'tune.grid.json'), screenGrid(spec, proposed, spec.tuneOffsets));
    const tune = await screen({ ...shared, grid, out: join(out, 'tune'), runs: join(runs, 'tune') });
    const arms = [];
    for (const arm of proposed) {
        const tuneVerdict = verdictOf(tune.report.verdicts, arm.name);
        let holdout = null;
        if (tuneVerdict.verdict === 'better') {
            const body = screenGrid(spec, [arm], spec.holdoutOffsets, { feasible: false });
            const file = writeGrid(join(out, 'holdout', `${armDir(arm.name)}.grid.json`), body);
            const held = await screen({
                ...shared,
                grid: file,
                out: join(out, 'holdout', armDir(arm.name)),
                runs: join(runs, 'holdout'),
            });
            holdout = verdictOf(held.report.verdicts, arm.name);
        }
        const { name, signature, overlay } = arm;
        arms.push({ name, signature, overlay, tune: tuneVerdict, holdout, finalist: isFinalist(tuneVerdict, holdout) });
    }
    return { arms, yielded: tune.report.yield };
}

/**
 * Exports the best run's champions of `base` and each finalist and trials them in whole worlds.
 * @param {{spec: Record<string, any>, arms: Record<string, any>[], yielded: Record<string, any>, out: string, runs: string,
 *   date: string, workers: number | null}} night the night so far
 * @param {{exportChampions: typeof import('../train-export.mjs').runExport, trial: typeof import('./train-tune-world.mjs').worldTrial}} io
 *   the export and the trial
 * @returns {Promise<Record<string, any> | null>} each arm's world readings, or null with no finalist or no trial
 */
export async function worldNight({ spec, arms, yielded, out, runs, date, workers }, { exportChampions, trial }) {
    const finalists = arms.filter((a) => a.finalist);
    if (spec.worldTrial === false || finalists.length === 0) {
        return null;
    }
    const named = [];
    for (const arm of [BASE, ...finalists.map((a) => a.name)]) {
        const run = bestRunDir(yielded[arm]);
        const archive = run === null ? null : latestArchive(run);
        if (archive !== null) {
            const to = join(out, 'champions', armDir(arm));
            exportChampions({ archive, out: to, config: null, label: armDir(arm) });
            named.push({ name: arm, championsDir: to });
        }
    }
    return trial({
        arms: named,
        seeds: spec.worldSeeds,
        ticks: spec.worldTicks,
        workers,
        dir: join(runs, 'world', date),
        liveDir: join(runs, 'world'),
    });
}
