// What `npm run train` keeps on disk and reads back: the stage configs, `archive-<g>.json` and the resume check.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeArchive, encodeArchive } from '../../js/evo/archive-codec.js';
import { DEFAULT_CURRICULUM, planStages, stageAt } from '../../js/evo/curriculum.js';
import { TRAINER_DESCRIPTOR, TRAINER_N_CAP, createTrainerArchive } from '../../js/evo/trainer.js';
import { layoutStamp } from '../../js/sim/brain-layout.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * A planned stage with its loaded config overrides, the config they make and its `rulesHash`.
 * @typedef {import('../../js/evo/curriculum.js').Stage & {overrides: Record<string, any>, built: Readonly<Record<string, any>>, rulesHash: string}} StageInfo
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
 * @returns {StageInfo[]} the run's stages with their configs loaded (config paths in a curriculum are relative to the
 *   repository root)
 * @throws {Error} when the stages' brain layouts differ (one archive cannot span them)
 */
export function loadStages(args) {
    const entries = args.curriculum
        ? readJson(args.curriculum)
        : args.config
          ? [{ name: 'default', config: args.config }]
          : DEFAULT_CURRICULUM;
    const stages = planStages(entries, args.generations).map((stage) => {
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
    }
    return stages;
}

/**
 * @param {StageInfo[]} stages the run's stages
 * @param {number} done generations completed
 * @returns {{name: string, rulesHash: string, generations: number}[]} each stage reached so far with its completed generations
 */
export function stageRecord(stages, done) {
    return stages
        .filter((s) => s.from < done)
        .map((s) => ({ name: s.name, rulesHash: s.rulesHash, generations: Math.min(s.to, done) - s.from }));
}

/**
 * Writes `archive-<g>.json`: the archive JSON plus `generation` (generations completed) and `stages`.
 * @param {string} dir the output directory
 * @param {{archive: import('../../js/evo/archive.js').Archive, stages: StageInfo[], generation: number}} state the archive,
 *   the run's stages and the 0-based index of the generation just completed
 * @returns {string} the file's path
 */
export function saveArchive(dir, { archive, stages, generation }) {
    const stage = stageAt(stages, generation);
    const json = {
        ...encodeArchive(archive, stage.built),
        generation: generation + 1,
        stages: stageRecord(stages, generation + 1),
    };
    const path = join(dir, `archive-${generation}.json`);
    writeFileSync(path, `${JSON.stringify(json)}\n`);
    return path;
}

/**
 * @param {string} path an `archive-<g>.json`
 * @param {StageInfo[]} stages the run's stages
 * @param {import('../../js/sim/log.js').SimLog} log receives `GenomeRejected` before a throw
 * @returns {{archive: import('../../js/evo/archive.js').Archive, done: number}} the archive (with the trainer's `nCap`) and
 *   the generations it has completed
 * @throws {Error} when the file has no `generation`, its layout or the `rulesHash` of the stage that wrote it does not
 *   fit this run, or it has already completed every generation asked for
 */
export function loadResume(path, stages, log) {
    const json = readJson(path);
    if (!Number.isInteger(json.generation) || json.generation < 1) {
        throw new Error(`--resume ${path}: not a trainer archive (no "generation")`);
    }
    if (json.generation >= stages[stages.length - 1].to) {
        throw new Error(`--resume ${path}: ${json.generation} generations are already done; raise --generations`);
    }
    const writer = stageAt(stages, json.generation - 1);
    const archive = decodeArchive(json, writer.built, log, TRAINER_DESCRIPTOR);
    archive.nCap = TRAINER_N_CAP;
    return { archive, done: json.generation };
}
