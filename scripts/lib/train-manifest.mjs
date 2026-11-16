// The manifest of a training run (`<out>/manifest.json`; docs/designs/training-stages.md, "Runs are kept"): what a reader
// needs to replay the run or to tell it from another - the git sha, the command line, the curriculum file's hash, the seed
// offset, and per stage its `rulesHash`, when it passed and the gate readings at the pass.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageRecord } from './train-state.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * @returns {string | null} the repository's HEAD sha; null when git is not available here
 */
export function gitSha() {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * @param {string | null} file a curriculum file
 * @returns {{file: string, hash: string} | null} the file and the SHA-256 of its bytes; null without a curriculum
 */
export function curriculumFile(file) {
    if (file === null) {
        return null;
    }
    return { file, hash: createHash('sha256').update(readFileSync(file)).digest('hex') };
}

/**
 * The parts of the manifest that do not change during a run.
 * @typedef {object} ManifestBase
 * @property {string | null} gitSha the repository's HEAD
 * @property {string[] | null} commandLine the arguments after the script name (null when started from code)
 * @property {{file: string, hash: string} | null} curriculum the curriculum file and its hash
 * @property {Record<string, any>} options the run's options that decide its result
 */

/**
 * @param {import('./train-args.mjs').TrainArgs} args the options
 * @param {string[] | null} commandLine the arguments after the script name
 * @returns {ManifestBase} the fixed part of the manifest
 */
export function manifestBase(args, commandLine) {
    return {
        gitSha: gitSha(),
        commandLine,
        curriculum: curriculumFile(args.curriculum),
        options: {
            generations: args.generations,
            episodes: args.episodes,
            seedOffset: args.seedOffset,
            until: args.until,
            resume: args.resume,
            ticks: args.ticks ?? null,
            checkpointEvery: args.checkpointEvery,
        },
    };
}

/**
 * @param {ManifestBase} base the fixed part
 * @param {import('./train-state.mjs').StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/curriculum.js').RunState} state the run's state
 * @returns {Record<string, any>} the manifest: the base, the run's status and generations done, and every stage with its
 *   `rulesHash` and, once run, its generations, `passedAt`, gate readings at the pass, reviews and stall
 */
export function buildManifest(base, stages, state) {
    const record = stageRecord(stages, state);
    return {
        ...base,
        status: state.status === 'running' && state.generation >= state.total ? 'done' : state.status,
        generationsDone: state.generation,
        stages: stages.map((s) => record.find((r) => r.name === s.name) ?? { name: s.name, rulesHash: s.rulesHash }),
    };
}

/**
 * @param {string} dir the output directory
 * @param {Record<string, any>} manifest a `buildManifest` result
 * @returns {string} the file's path
 */
export function writeManifest(dir, manifest) {
    const path = join(dir, 'manifest.json');
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    return path;
}
