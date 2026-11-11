// Trainer: trains genomes by natural selection in whole worlds (`npm run train`; docs/designs/training.md). Each generation
// runs episodes on fixed train seeds from a frozen copy of the archive, then merges their offers in episode order, so the
// archive does not depend on the worker count. Writes `<out>/archive-<g>.json` per generation, `<out>/curve.jsonl` at the
// checkpoints and `<out>/train.jsonl` (the log).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotArchive } from '../js/evo/archive-snapshot.js';
import { coverage, qdScore } from '../js/evo/archive.js';
import { stageAt } from '../js/evo/curriculum.js';
import { seedlessConfig } from '../js/evo/report.js';
import { EPISODE_TICKS, OFFER_FROM_TICK, createTrainerArchive, episodeSeed, mergeEpisode } from '../js/evo/trainer.js';
import { configHash } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { logRunConfig } from './lib/run-config.mjs';
import { parseArgs } from './lib/train-args.mjs';
import { EVAL_TICKS, runCheckpoint } from './lib/train-checkpoint.mjs';
import { loadResume, loadStages, readJson, saveArchive } from './lib/train-state.mjs';
import { resolvePoolSize, runPool } from './lib/worker-pool.mjs';

export { parseArgs };

const WORKER_URL = new URL('./train-worker.mjs', import.meta.url);
const SEEDS_URL = new URL('../evals/train-seeds.json', import.meta.url);

/**
 * @typedef {object} TrainIo
 * @property {(line: string) => void} [print] where the one-line-per-generation summary goes
 * @property {number} [drillTrials] trials per drill at a checkpoint (default 32)
 */

/**
 * Runs the generation's episodes on the pool, in index order.
 * @param {{seeds: number[], stage: import('./lib/train-state.mjs').StageInfo, archive: import('../js/evo/archive.js').Archive}} run
 *   the train seeds, the generation's stage and the archive to freeze
 * @param {{args: import('./lib/train-args.mjs').TrainArgs, generation: number, log: import('../js/sim/log.js').SimLog}} at
 *   the options, the generation and the log
 * @returns {Promise<any[]>} the episode results in index order
 * @throws {Error} after logging `TrainEpisodeFailed` when an episode fails
 */
async function runEpisodes({ seeds, stage, archive }, { args, generation, log }) {
    const snapshot = snapshotArchive(archive);
    const ticks = args.ticks ?? EPISODE_TICKS;
    const tasks = Array.from({ length: args.episodes }, (_, episode) => ({
        seed: episodeSeed(seeds, { generation, episodes: args.episodes, episode, offset: args.seedOffset }),
        overrides: stage.overrides,
        snapshot,
        ticks,
        offerFromTick: args.offerFrom ?? OFFER_FROM_TICK,
    }));
    try {
        return await runPool(tasks, { workerUrl: WORKER_URL, workers: args.workers });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const index = Number(/^task (\d+) failed/.exec(message)?.[1] ?? -1);
        log.log('error', 'TrainEpisodeFailed', {
            generation,
            episode: index,
            seed: tasks[index]?.seed ?? null,
            message,
        });
        throw error;
    }
}

/**
 * @param {Record<string, any>[]} results the generation's episode results
 * @param {{wallSeconds: number, workers: number}} timing the generation's wall time and the pool size
 * @returns {{ticks: number, cpuShare: number}} ticks run and the share of the pool's time spent in episodes
 */
function usage(results, { wallSeconds, workers }) {
    const busy = results.reduce((sum, r) => sum + r.wallMs, 0) / 1000;
    return {
        ticks: results.reduce((sum, r) => sum + r.ticks, 0),
        cpuShare: wallSeconds === 0 ? 0 : busy / (wallSeconds * workers),
    };
}

/**
 * @typedef {object} Run
 * @property {import('./lib/train-args.mjs').TrainArgs} args the options
 * @property {import('./lib/train-state.mjs').StageInfo[]} stages the run's stages
 * @property {number[]} seeds the train seeds
 * @property {import('../js/evo/archive.js').Archive} archive the archive, merged into as generations finish
 * @property {import('../js/sim/log.js').SimLog} log the log
 * @property {number} workers the pool size
 * @property {number} started `performance.now()` when the run began
 * @property {number} trainTicks ticks trained so far
 */

/**
 * Runs the checkpoint when this generation ends a checkpoint interval or the run.
 * @param {Run} run the run
 * @param {{generation: number, drillTrials: number}} at the generation just finished and the drill size
 * @returns {Promise<void>}
 */
async function maybeCheckpoint(run, { generation, drillTrials }) {
    const { args, archive, log } = run;
    const due = (generation + 1) % args.checkpointEvery === 0 || generation === args.generations - 1;
    if (args.checkpointEvery === 0 || !due) {
        return;
    }
    const stage = stageAt(run.stages, generation);
    const wallSeconds = (performance.now() - run.started) / 1000;
    const progress = { generation: generation + 1, trainTicks: run.trainTicks, wallSeconds };
    const options = { workers: args.workers, evalTicks: args.ticks ?? EVAL_TICKS, drillTrials };
    await runCheckpoint({ archive, stage, progress, options, log }, args.out);
}

/**
 * Runs one generation: its episodes, the merge, the log line, the archive file and, when due, the checkpoint.
 * @param {Run} run the run (`trainTicks` is updated)
 * @param {{generation: number, drillTrials: number, print: (line: string) => void}} at the generation and the io
 * @returns {Promise<void>}
 */
async function runGeneration(run, { generation, drillTrials, print }) {
    const { args, stages, archive, log } = run;
    const stage = stageAt(stages, generation);
    const t0 = performance.now();
    const results = await runEpisodes({ seeds: run.seeds, stage, archive }, { args, generation, log });
    const outcomes = results.map((r) => mergeEpisode(archive, r, log));
    const wallSeconds = (performance.now() - t0) / 1000;
    const { ticks, cpuShare } = usage(results, { wallSeconds, workers: run.workers });
    run.trainTicks += ticks;
    const fields = { generation, stage: stage.name, coverage: coverage(archive), qdScore: qdScore(archive) };
    log.log('info', 'TrainGeneration', { ...fields, wallSeconds, cpuShare, offers: outcomes });
    saveArchive(args.out, { archive, stages, generation });
    print(
        `generation ${generation} ${stage.name} coverage ${fields.coverage.toFixed(3)} qd ${fields.qdScore.toFixed(2)} wall ${wallSeconds.toFixed(1)}s cpu ${(cpuShare * 100).toFixed(0)}%`,
    );
    await maybeCheckpoint(run, { generation, drillTrials });
}

/**
 * @param {import('./lib/train-args.mjs').TrainArgs} args the options
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @returns {{run: Run, first: number}} the run, and the first generation to run (after the ones a `--resume` archive holds)
 */
function startRun(args, log) {
    const stages = loadStages(args);
    logRunConfig(log, {
        tool: 'train',
        policy: null,
        configHash: configHash(seedlessConfig(stages[0].built)),
        seeds: null,
        ticks: args.ticks ?? EPISODE_TICKS,
        extra: {
            generations: args.generations,
            episodes: args.episodes,
            seedOffset: args.seedOffset,
            resume: args.resume,
            stages: stages.map((stage) => ({ name: stage.name, rulesHash: stage.rulesHash })),
        },
    });
    const resumed = args.resume === null ? null : loadResume(args.resume, stages, log);
    const archive = resumed?.archive ?? createTrainerArchive(stages[0].built);
    const workers = resolvePoolSize(args.workers, args.episodes);
    const seeds = readJson(fileURLToPath(SEEDS_URL));
    const run = { args, stages, seeds, archive, log, workers, started: performance.now(), trainTicks: 0 };
    return { run, first: resumed?.done ?? 0 };
}

/**
 * Trains.
 * @param {import('./lib/train-args.mjs').TrainArgs} args the options
 * @param {TrainIo} [io] the summary output and the checkpoint drill size
 * @returns {Promise<{archive: import('../js/evo/archive.js').Archive, generations: number}>} the final archive and the generations done
 */
export async function runTraining(args, { print = () => {}, drillTrials = 32 } = {}) {
    mkdirSync(args.out, { recursive: true });
    const sinkFile = createJsonlSink(join(args.out, 'train.jsonl'));
    try {
        const { run, first } = startRun(args, createSimLog(sinkFile.sink, { level: 'info' }));
        for (let generation = first; generation < args.generations; generation++) {
            const stage = stageAt(run.stages, generation);
            if (generation === stage.from || generation === first) {
                run.log.log('info', 'TrainStage', { stage: stage.name, generation, rulesHash: stage.rulesHash });
            }
            await runGeneration(run, { generation, drillTrials, print });
        }
        return { archive: run.archive, generations: args.generations };
    } finally {
        await sinkFile.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    return exitCodeOf(() => runTraining(parseArgs(argv), { print: console.log }));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
