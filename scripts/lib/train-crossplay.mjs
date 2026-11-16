// Cross-play for a training run (docs/designs/training-stages.md, Cross-play): the checkpoints' champions read back from
// a run directory, the matrix over them, and the `crossplay.*` readings a gate reads. A detector only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeArchive } from '../../js/evo/archive-codec.js';
import { createMatrix, crossplayNumbers, extendMatrix } from '../../js/evo/crossplay.js';
import { currentEntry } from '../../js/evo/curriculum.js';
import { FORAGER_SPEC, PREDATOR_SPEC } from '../../js/evo/memory-probe-scenarios.js';
import { TRAINER_DESCRIPTOR } from '../../js/evo/trainer.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { eliteSubjects } from './drill-subjects.mjs';

/**
 * @typedef {object} CrossplayState
 * @property {number[]} generations the generation each player's checkpoint ended
 * @property {import('../../js/evo/crossplay.js').Player[]} players the checkpoints' champions, oldest first
 * @property {import('../../js/evo/crossplay.js').CrossMatrix} matrix the cells played so far
 */

/**
 * @param {import('../../js/evo/archive.js').Archive} archive a checkpoint's archive
 * @returns {import('../../js/evo/crossplay.js').Player | null} its best predator and best forager (the elites with the
 *   highest lower bound); null when it holds no tested elite of either
 */
export function playerOf(archive) {
    const subjects = eliteSubjects(archive);
    const predator = subjects.find((s) => s.spec === PREDATOR_SPEC);
    const forager = subjects.find((s) => s.spec === FORAGER_SPEC);
    return predator === undefined || forager === undefined ? null : { predator, forager };
}

/**
 * @param {string} dir a run directory
 * @returns {number[]} the generation (generations completed) of each checkpoint row of `<dir>/curve.jsonl`, in order
 */
export function checkpointGenerations(dir) {
    const path = join(dir, 'curve.jsonl');
    if (!existsSync(path)) {
        return [];
    }
    return readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line).generation);
}

/**
 * Reads the champions of the run's earlier checkpoints from their `archive-<g>.json` files; a checkpoint whose file is
 * missing or holds no champion of one of the two roles is left out.
 * @param {string} dir a run directory
 * @param {number} [before] only the checkpoints that ended before this generation (default all)
 * @returns {{generations: number[], players: import('../../js/evo/crossplay.js').Player[]}} the players, oldest first
 */
export function loadPlayers(dir, before = Infinity) {
    const config = createConfig({});
    const generations = [];
    const players = [];
    for (const generation of checkpointGenerations(dir).filter((g) => g < before)) {
        const path = join(dir, `archive-${generation - 1}.json`);
        if (existsSync(path)) {
            const json = JSON.parse(readFileSync(path, 'utf8'));
            const archive = decodeArchive(
                { ...json, rulesHash: rulesHash(config) },
                config,
                undefined,
                TRAINER_DESCRIPTOR,
            );
            const player = playerOf(archive);
            if (player !== null) {
                generations.push(generation);
                players.push(player);
            }
        }
    }
    return { generations, players };
}

/**
 * Plays every cell of the matrix the players still lack.
 * @param {CrossplayState} state the state (updated)
 * @param {{trials?: number, group?: boolean, log?: import('../../js/sim/log.js').SimLog}} [options] the trials per cell
 *   (default `CROSS_TRIALS`), whether to play the group cells and the log that gets a `CrossplayCell` per cell
 * @returns {CrossplayState} the state
 */
export function playMatrix(state, options = {}) {
    const { group = false, log } = options;
    const onCell = (/** @type {any} */ cell) =>
        log?.log('debug', 'CrossplayCell', {
            predator: state.generations[cell.predator],
            forager: state.generations[cell.forager],
            trials: cell.trials,
            kills: cell.kills,
            ...(cell.group ? { group: true } : {}),
        });
    for (let index = 0; index < state.players.length; index++) {
        extendMatrix(state.matrix, state.players, { index, group, onCell });
    }
    return state;
}

/**
 * @param {{generations: number[], players: import('../../js/evo/crossplay.js').Player[]}} found players read from a run
 * @param {number} [trials] trials per cell (default `CROSS_TRIALS`)
 * @returns {CrossplayState} a state with no cell played
 */
export function createCrossplayState({ generations, players }, trials) {
    return { generations: [...generations], players: [...players], matrix: createMatrix(trials) };
}

/**
 * @param {readonly import('./train-state.mjs').StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/stage-run.js').RunState} state the stage state
 * @returns {boolean} whether the current stage's gate, or the gate of a stage already passed (retention), reads `crossplay.*`
 */
export function readsCrossplay(stages, state) {
    const names = new Set([currentEntry(state).name, ...Object.keys(state.passed)]);
    return stages.some(
        (stage) =>
            names.has(stage.name) &&
            Array.isArray(stage.gate) &&
            stage.gate.some((/** @type {{read: string}} */ c) => c.read.startsWith('crossplay.')),
    );
}

/**
 * Adds a checkpoint's champions to the run's cross-play, plays its row and column and reads the numbers. The first call
 * of a run also reads the earlier checkpoints' champions from the run directory.
 * @param {{crossplay: CrossplayState | null}} run the run (`crossplay` is created or grown)
 * @param {{dir: string, archive: import('../../js/evo/archive.js').Archive, generation: number, trials?: number,
 *   log?: import('../../js/sim/log.js').SimLog}} at the run directory, the checkpoint's archive, the generations completed
 *   at it, the trials per cell and the log
 * @returns {Record<string, number | null>} the `crossplay.*` readings: `hunterProgressLow`, `preyProgressLow`, `cycleShare`
 *   (null until two checkpoints have champions of both roles)
 */
export function checkpointCrossplay(run, { dir, archive, generation, trials, log }) {
    run.crossplay ??= createCrossplayState(loadPlayers(dir, generation), trials);
    const player = playerOf(archive);
    if (player !== null) {
        run.crossplay.generations.push(generation);
        run.crossplay.players.push(player);
    }
    playMatrix(run.crossplay, { log });
    return crossplayNumbers(run.crossplay.matrix);
}
