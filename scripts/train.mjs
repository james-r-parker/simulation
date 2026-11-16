// Trainer: trains genomes by natural selection in whole worlds (`npm run train`; docs/designs/training.md). Each generation
// runs episodes on fixed train seeds from a frozen copy of the archive, then merges their offers in episode order, so the
// archive does not depend on the worker count. Writes `<out>/archive-<g>.json` per generation, `<out>/curve.jsonl` at the
// checkpoints and `<out>/train.jsonl` (the log).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotArchive } from '../js/evo/archive-snapshot.js';
import { coverage, qdScore } from '../js/evo/archive.js';
import { checkpointDue, currentEntry, initialState, needsGate, nextStage } from '../js/evo/curriculum.js';
import { recordAccess } from '../js/evo/partitions.js';
import { GATE_TRIALS } from '../js/evo/stage-gate.js';
import { seedlessConfig } from '../js/evo/report.js';
import { EPISODE_TICKS, OFFER_FROM_TICK, createTrainerArchive, episodeSeed, mergeEpisode } from '../js/evo/trainer.js';
import { configHash } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { exitCodeOf } from './lib/cli-args.mjs';
import { createJsonlSink } from './lib/jsonl-sink.mjs';
import { logRunConfig } from './lib/run-config.mjs';
import { checkOut, parseArgs } from './lib/train-args.mjs';
import { EVAL_TICKS, GATE_SEED, appendCurveRow, runCheckpoint } from './lib/train-checkpoint.mjs';
import { buildManifest, manifestBase, partitionManifests, startLedger, writeManifest } from './lib/train-manifest.mjs';
import { loadResume, loadStages, readJson, saveArchive } from './lib/train-state.mjs';
import { resolvePoolSize, runPool } from './lib/worker-pool.mjs';

export { parseArgs };

const WORKER_URL = new URL('./train-worker.mjs', import.meta.url);
const SEEDS_URL = new URL('../evals/train-seeds.json', import.meta.url);

/**
 * @typedef {object} TrainIo
 * @property {(line: string) => void} [print] where the one-line-per-generation summary goes
 * @property {number} [drillTrials] trials per drill at a checkpoint (default 32)
 * @property {number} [gateTrials] trials per champion and drill at a gate checkpoint (default `GATE_TRIALS`)
 * @property {string[] | null} [commandLine] the command-line arguments, recorded in the manifest
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
 * @property {import('../js/evo/stage-run.js').RunState} state the stage state machine
 * @property {number[]} seeds the train seeds
 * @property {import('../js/evo/archive.js').Archive} archive the archive, merged into as generations finish
 * @property {import('../js/sim/log.js').SimLog} log the log
 * @property {number} workers the pool size
 * @property {number} started `performance.now()` when the run began
 * @property {number} trainTicks ticks trained so far
 * @property {Record<string, any> | null} lastPoint the last curve row
 * @property {import('./lib/train-manifest.mjs').ManifestBase} manifest the fixed part of `manifest.json`
 * @property {{manifests: object[], uses: import('../js/evo/partitions.js').Access[]}} partitions the seed partitions the run reads
 *   and every use of them
 */

/**
 * Records a use of a seed partition in the ledger and the log.
 * @param {Run} run the run (its partition ledger grows)
 * @param {import('../js/evo/partitions.js').Access} access the use
 * @returns {void}
 * @throws {Error} when the use is not allowed (`recordAccess`)
 */
function usePartition(run, access) {
    run.partitions.uses = recordAccess(run.partitions.uses, access);
    run.log.log('info', 'PartitionUse', { ...access });
}

/**
 * @param {Run} run the run
 * @returns {void} writes `manifest.json`
 */
function saveManifest(run) {
    writeManifest(run.args.out, buildManifest(run.manifest, run.stages, run.state, run.partitions));
}

/**
 * Runs the checkpoint when this generation ends a checkpoint interval, the run, or a gated stage's last generation.
 * @param {Run} run the run
 * @param {{drillTrials: number, gateTrials: number}} sizes trials per drill at a curve checkpoint and at a gate checkpoint
 * @returns {Promise<{point: Record<string, any>, readings: Record<string, any> | null} | null>} the curve row (not yet
 *   written) and the gate readings, or null when no checkpoint is due
 */
async function maybeCheckpoint(run, { drillTrials, gateTrials }) {
    const { args, archive, log, state } = run;
    const stage = /** @type {import('./lib/train-state.mjs').StageInfo} */ (currentEntry(state));
    if (!checkpointDue(state, stage.checkpointEvery ?? args.checkpointEvery)) {
        return null;
    }
    const wallSeconds = (performance.now() - run.started) / 1000;
    const progress = { generation: state.generation + 1, trainTicks: run.trainTicks, wallSeconds };
    const gate = needsGate(state) ? { seed: GATE_SEED, trials: gateTrials } : null;
    if (gate !== null) {
        usePartition(run, { purpose: 'gate', partition: 'validation', generation: state.generation + 1 });
    }
    const options = { workers: args.workers, evalTicks: args.ticks ?? EVAL_TICKS, drillTrials, gate };
    return runCheckpoint({ archive, stage, progress, options, log });
}

/**
 * @param {import('../js/evo/stage-run.js').RunState} state the state before the generation
 * @param {{point: Record<string, any>, readings: Record<string, any> | null} | null} checkpoint the checkpoint, if any
 * @param {import('../js/sim/log.js').SimLog} log receives the stage events
 * @returns {{state: import('../js/evo/stage-run.js').RunState, columns: Record<string, any>}} the state after the generation
 *   and the gate columns of its curve row (none unless a gate was read)
 */
function advance(state, checkpoint, log) {
    const step = nextStage(state, checkpoint?.readings ? { readings: checkpoint.readings } : null);
    for (const { level, event, fields } of step.events) {
        log.log(level, event, fields);
    }
    const gate = step.events.find((e) => e.event === 'TrainGate');
    const regressed = step.events.find((e) => e.event === 'TrainStageRegressed');
    if (gate === undefined && regressed !== undefined) {
        const stage = currentEntry(state).name;
        const columns = {
            stage,
            passed: false,
            conditions: regressed.fields.failing,
            retention: {},
            regressed: regressed.fields.stage,
        };
        return { state: step.state, columns: { gate: columns } };
    }
    if (gate === undefined) {
        return { state: step.state, columns: {} };
    }
    const { stage, passed, conditions, retention } = gate.fields;
    const stagePassed = step.events.some((e) => e.event === 'TrainStagePassed');
    return { state: step.state, columns: { gate: { stage, passed, conditions, retention, stagePassed } } };
}

/**
 * Runs one generation: its episodes, the merge, the log line, the checkpoint, the stage step and the archive file.
 * @param {Run} run the run (`state`, `trainTicks` and `lastPoint` are updated)
 * @param {{drillTrials: number, gateTrials: number, print: (line: string) => void}} io the checkpoint sizes and the output
 * @returns {Promise<void>}
 */
async function runGeneration(run, { drillTrials, gateTrials, print }) {
    const { args, stages, archive, log } = run;
    const generation = run.state.generation;
    const stage = /** @type {import('./lib/train-state.mjs').StageInfo} */ (currentEntry(run.state));
    const t0 = performance.now();
    const results = await runEpisodes({ seeds: run.seeds, stage, archive }, { args, generation, log });
    const outcomes = results.map((r) => mergeEpisode(archive, r, log));
    const wallSeconds = (performance.now() - t0) / 1000;
    const { ticks, cpuShare } = usage(results, { wallSeconds, workers: run.workers });
    run.trainTicks += ticks;
    const fields = { generation, stage: stage.name, coverage: coverage(archive), qdScore: qdScore(archive) };
    log.log('info', 'TrainGeneration', { ...fields, wallSeconds, cpuShare, offers: outcomes });
    const checkpoint = await maybeCheckpoint(run, { drillTrials, gateTrials });
    const { state, columns } = advance(run.state, checkpoint, log);
    run.state = state;
    saveArchive(args.out, { archive, stages, generation, state });
    saveManifest(run);
    if (checkpoint !== null) {
        run.lastPoint = { ...checkpoint.point, ...columns };
        appendCurveRow(args.out, run.lastPoint);
    }
    print(
        `generation ${generation} ${stage.name} coverage ${fields.coverage.toFixed(3)} qd ${fields.qdScore.toFixed(2)} wall ${wallSeconds.toFixed(1)}s cpu ${(cpuShare * 100).toFixed(0)}%`,
    );
}

/**
 * @param {import('./lib/train-args.mjs').TrainArgs} args the options
 * @param {import('../js/sim/log.js').SimLog} log the log
 * @param {string[] | null} commandLine the command-line arguments
 * @returns {Run} the run, its state at the first generation to run (after the ones a `--resume` archive holds)
 */
function startRun(args, log, commandLine) {
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
            until: args.until,
            stages: stages.map((stage) => ({ name: stage.name, rulesHash: stage.rulesHash })),
        },
    });
    const resumed = args.resume === null ? null : loadResume(args.resume, { stages, total: args.generations, log });
    const archive = resumed?.archive ?? createTrainerArchive(stages[0].built);
    const state = resumed?.state ?? initialState(stages, args.generations);
    const workers = resolvePoolSize(args.workers, args.episodes);
    const seeds = readJson(fileURLToPath(SEEDS_URL));
    const started = performance.now();
    const manifest = manifestBase(args, commandLine);
    const partitions = { manifests: partitionManifests(seeds), uses: startLedger(args.resume) };
    const run = {
        args,
        stages,
        state,
        seeds,
        archive,
        log,
        workers,
        started,
        trainTicks: 0,
        lastPoint: null,
        manifest,
        partitions,
    };
    log.log('info', 'PartitionUse', { ...partitions.uses[partitions.uses.length - 1] });
    return run;
}

/** The error of a run that a required stage stopped (`TrainStageStalled`): exit code 3, the archive and curve kept. */
export class TrainStalled extends Error {
    /** @param {string} message what stopped the run */
    constructor(message) {
        super(message);
        this.exitCode = 3;
    }
}

/**
 * @param {Run} run the stalled run
 * @returns {string} the stall's message: the stage, its failing conditions and its drills' lost-trial reasons
 */
function stallMessage(run) {
    const { stage, failing } = run.state.stalled[run.state.stalled.length - 1];
    const bound = (/** @type {any} */ c) => (c.min !== undefined ? `>= ${c.min}` : `<= ${c.max}`);
    const lines = failing.map((/** @type {any} */ c) => `  ${c.read}: ${c.value} (needs ${bound(c)})`);
    const drills = new Set(failing.flatMap((/** @type {any} */ c) => /^drill\.([^.]+)\./.exec(c.read)?.[1] ?? []));
    const reasons = [...drills].map(
        (d) => `  ${d} lost trials: ${JSON.stringify(run.lastPoint?.drillLossReasons?.[d] ?? null)}`,
    );
    return [`TrainStageStalled: stage "${stage}" did not pass its gate`, ...lines, ...reasons].join('\n');
}

/**
 * Trains.
 * @param {import('./lib/train-args.mjs').TrainArgs} args the options
 * @param {TrainIo} [io] the summary output and the checkpoint drill sizes
 * @returns {Promise<{archive: import('../js/evo/archive.js').Archive, generations: number, state: import('../js/evo/stage-run.js').RunState}>}
 *   the final archive, the generations done and the stage state
 * @throws {TrainStalled} (exit code 3) when a required stage stalls, after the archive and curve are written
 */
export async function runTraining(args, io = {}) {
    const { print = () => {}, drillTrials = 32, gateTrials = GATE_TRIALS, commandLine = null } = io;
    mkdirSync(args.out, { recursive: true });
    const sinkFile = createJsonlSink(join(args.out, 'train.jsonl'));
    try {
        const run = startRun(args, createSimLog(sinkFile.sink, { level: 'info' }), commandLine);
        saveManifest(run);
        let logged = null;
        while (run.state.status === 'running' && run.state.generation < args.generations) {
            const stage = /** @type {import('./lib/train-state.mjs').StageInfo} */ (currentEntry(run.state));
            if (stage.name !== logged) {
                logged = stage.name;
                const fields = { stage: stage.name, generation: run.state.generation, rulesHash: stage.rulesHash };
                run.log.log('info', 'TrainStage', fields);
            }
            await runGeneration(run, { drillTrials, gateTrials, print });
        }
        if (run.state.status === 'stalled') {
            throw new TrainStalled(stallMessage(run));
        }
        return { archive: run.archive, generations: run.state.generation, state: run.state };
    } finally {
        await sinkFile.close();
    }
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    return exitCodeOf(() => {
        const args = parseArgs(argv);
        checkOut(args);
        return runTraining(args, { print: console.log, commandLine: argv });
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
