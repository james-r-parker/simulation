// What `npm run train` keeps on disk and reads back: the stage configs, `archive-<g>.json` and the resume check.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive, encodeArchive } from '../../js/evo/archive-codec.js';
import {
    DEFAULT_CURRICULUM,
    isGated,
    planRun,
    restoreState,
    snapshotState,
    stateAfter,
    untilStage,
    validateStageFloors,
} from '../../js/evo/curriculum.js';
import { TRAINER_DESCRIPTOR, TRAINER_N_CAP, createTrainerArchive } from '../../js/evo/trainer.js';
import { layoutStamp } from '../../js/sim/brain-layout.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * A planned stage with its loaded config overrides, the config they make and its `rulesHash`.
 * @typedef {import('../../js/evo/curriculum.js').Stage & import('../../js/evo/curriculum.js').CurriculumEntry & {overrides: Record<string, any>, built: Readonly<Record<string, any>>, rulesHash: string}} StageInfo
 */

/**
 * @param {string} path a JSON file
 * @returns {any} its contents
 */
export function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {import('./train-args.mjs').TrainArgs} args the options
 * @returns {readonly import('../../js/evo/curriculum.js').CurriculumEntry[]} the curriculum entries, cut after `--until`
 */
function entriesOf(args) {
    if (!args.curriculum && !args.config) {
        return args.until === null ? DEFAULT_CURRICULUM : untilStage(DEFAULT_CURRICULUM, args.until);
    }
    const entries = args.curriculum ? readJson(args.curriculum) : [{ name: 'default', config: args.config }];
    if (args.curriculum) {
        validateStageFloors(entries, {
            overridesOf: (config) => readJson(resolve(ROOT, config)),
            targetMinAgents: createConfig({}).minAgents,
        });
    }
    return args.until === null ? entries : untilStage(entries, args.until);
}

/**
 * @param {import('./train-args.mjs').TrainArgs} args the options
 * @returns {StageInfo[]} the run's stages with their configs loaded (config paths in a curriculum are relative to the
 *   repository root); a gated curriculum's stages have no fixed range (`from` and `to` are -1)
 * @throws {Error} when the stages' brain layouts differ (one archive cannot span them), or a gated stage has no checkpoints
 */
export function loadStages(args) {
    const stages = planRun(entriesOf(args), args.generations).map((stage) => {
        const overrides = stage.config === null ? {} : readJson(resolve(ROOT, stage.config));
        const config = createConfig(overrides);
        return { ...stage, overrides, built: config, rulesHash: rulesHash(config) };
    });
    const first = JSON.stringify(layoutStamp(createTrainerArchive(stages[0].built).layout));
    for (const stage of stages) {
        const layout = JSON.stringify(layoutStamp(createTrainerArchive(stage.built).layout));
        if (layout !== first) {
            throw new Error(`stage "${stage.name}" has another brain layout than "${stages[0].name}"`);
        }
        if (isGated(stage) && args.checkpointEvery === 0 && stage.checkpointEvery === undefined) {
            throw new Error(`stage "${stage.name}" is gated, so it needs checkpoints: raise --checkpoint-every`);
        }
    }
    return stages;
}

/**
 * @param {StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/stage-run.js').RunState} state the run's state
 * @returns {Record<string, any>[]} each stage whose world has run, with its generations, and for a gated stage when it
 *   passed (with the gate readings at the pass), its reviews and where it stalled
 */
export function stageRecord(stages, state) {
    return stages
        .filter((s) => (state.ran[s.name] ?? 0) > 0)
        .map((s) => {
            const passed = state.passed[s.name];
            const stalled = state.stalled.find((/** @type {any} */ x) => x.stage === s.name);
            return {
                name: s.name,
                rulesHash: s.rulesHash,
                generations: state.ran[s.name],
                ...(passed === undefined ? {} : { passedAt: passed.passedAt, gate: passed.gate }),
                ...(state.reviews[s.name] === undefined ? {} : { reviews: state.reviews[s.name] }),
                ...(stalled === undefined ? {} : { stalledAt: stalled.generation }),
            };
        });
}

/**
 * Writes `archive-<g>.json`: the archive JSON plus `generation` (generations completed), `stages` and, for a gated run,
 * `trainState` (what `--resume` continues from).
 * @param {string} dir the output directory
 * @param {{archive: import('../../js/evo/archive.js').Archive, stages: StageInfo[], generation: number, state?: import('../../js/evo/stage-run.js').RunState,
 *   pool?: ReturnType<typeof import('./train-pool.mjs').poolIndex>, keepers?: Record<string, any[]>}} run
 *   the archive, the run's stages, the 0-based index of the generation just completed, the run's state after it (a
 *   fixed-length run's is replayed when omitted) and, for a run with an opponent pool, the pool's index (recorded as
 *   `pool` so a resume can rebuild it) and the kept passers by stage (`keepers`, scripts/lib/train-keepers.mjs)
 * @returns {string} the file's path
 */
export function saveArchive(dir, { archive, stages, generation, state, pool, keepers }) {
    const after = state ?? stateAfter(stages, stages[stages.length - 1].to, generation + 1);
    const writer = /** @type {StageInfo} */ (stages.find((s) => s.name === after.lastStage));
    const json = {
        ...encodeArchive(archive, writer.built),
        generation: generation + 1,
        stages: stageRecord(stages, after),
        ...(stages.some(isGated) ? { trainState: snapshotState(after) } : {}),
        ...(pool === undefined ? {} : { pool }),
        ...(keepers === undefined || Object.keys(keepers).length === 0 ? {} : { keepers }),
    };
    const path = join(dir, `archive-${generation}.json`);
    writeFileSync(path, `${JSON.stringify(json)}\n`);
    return path;
}

/**
 * Whether a generation writes its `archive-<g>.json`: encoding and writing the archive is a share of a generation's time,
 * so a run with checkpoints writes it at the checkpoints and at its last generation (a `--resume` continues from one of
 * those); a run with none writes every generation, as the archive is then its only output.
 * @param {{args: {checkpointEvery: number, generations: number}, stages: readonly {checkpointEvery?: number}[],
 *   state: {status: string}, generation: number, checkpointed: boolean}} generation the options, the stages, the state
 *   after the generation, its 0-based index and whether it took a checkpoint
 * @returns {boolean} true when the archive is written
 */
export function archiveDue({ args, stages, state, generation, checkpointed }) {
    const last = state.status !== 'running' || generation + 1 >= args.generations;
    const noCheckpoints = args.checkpointEvery === 0 && stages.every((s) => s.checkpointEvery === undefined);
    return checkpointed || last || noCheckpoints;
}

/**
 * @param {string} path an `archive-<g>.json`
 * @param {{stages: StageInfo[], total: number, log: import('../../js/sim/log.js').SimLog}} run the run's stages and
 *   generations, and the log that receives `GenomeRejected` before a throw
 * @returns {{archive: import('../../js/evo/archive.js').Archive, done: number, state: import('../../js/evo/stage-run.js').RunState, pool: any, keepers: Record<string, any[]>}}
 *   the archive (with the trainer's `nCap`), the generations it has completed, the run's state at that point and the
 *   pool index the file records (null: none) and the kept passers it records
 * @throws {Error} when the file has no `generation`, its layout or the `rulesHash` of the stage that wrote it does not
 *   fit this run, it has already completed every generation asked for, or this run is gated and the file has no state
 */
export function loadResume(path, { stages, total, log }) {
    const json = readJson(path);
    if (!Number.isInteger(json.generation) || json.generation < 1) {
        throw new Error(`--resume ${path}: not a trainer archive (no "generation")`);
    }
    if (json.generation >= total) {
        throw new Error(`--resume ${path}: ${json.generation} generations are already done; raise --generations`);
    }
    if (json.trainState === undefined && stages.some(isGated)) {
        throw new Error(`--resume ${path}: this archive has no gate state, so it cannot continue a gated curriculum`);
    }
    const state =
        json.trainState === undefined
            ? stateAfter(stages, total, json.generation)
            : restoreState(stages, total, json.trainState);
    const writer = /** @type {StageInfo} */ (stages.find((s) => s.name === state.lastStage));
    const archive = decodeArchive(json, writer.built, log, TRAINER_DESCRIPTOR);
    archive.nCap = TRAINER_N_CAP;
    return { archive, done: json.generation, state, pool: json.pool ?? null, keepers: json.keepers ?? {} };
}
