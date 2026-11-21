// Cross-play for a training run (docs/designs/training-stages.md, Cross-play): the checkpoints' champions read back from
// a run directory, the matrix over them, and the `crossplay.*` readings a gate reads. A detector only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeArchive } from '../../js/evo/archive-codec.js';
import { restoreArchive } from '../../js/evo/archive-snapshot.js';
import {
    CROSS_TRIALS,
    createMatrix,
    crossplayNumbers,
    extendMatrix,
    playCell,
    preyVsStageLow,
} from '../../js/evo/crossplay.js';
import { currentEntry } from '../../js/evo/curriculum.js';
import { stagePassSnapshot } from '../../js/evo/opponent-pool.js';
import { TRAINER_DESCRIPTOR } from '../../js/evo/trainer.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';
import { eliteSubjects } from './drill-subjects.mjs';
import { SPEC } from '../../js/sim/specs.js';

/**
 * @typedef {object} CrossplayState
 * @property {number[]} generations the generation each player's checkpoint ended
 * @property {import('../../js/evo/crossplay.js').Player[]} players the checkpoints' champions, oldest first
 * @property {import('../../js/evo/crossplay.js').CrossMatrix} matrix the cells played so far
 * @property {Record<string, number>} stageKills the kills of a pass snapshot's predators on its own foragers, by stage
 *   (the first of the two cells of `preyVsStage.<stage>`; it does not change once the snapshot is taken)
 */

/**
 * @param {readonly import('../../js/evo/memory-probe-run.js').Subject[]} subjects an archive's champions
 * @param {number} spec a specialisation
 * @returns {import('../../js/evo/memory-probe-run.js').Subject | undefined} its champion of the highest lower bound
 *   (the first on a tie, the low style band), whichever style band it came from
 */
function bestOf(subjects, spec) {
    /** @type {import('../../js/evo/memory-probe-run.js').Subject | undefined} */
    let best;
    for (const subject of subjects) {
        if (
            subject.spec === spec &&
            (best === undefined || (subject.lowerBound ?? -Infinity) > (best.lowerBound ?? -Infinity))
        ) {
            best = subject;
        }
    }
    return best;
}

/**
 * @param {import('../../js/evo/archive.js').Archive} archive a checkpoint's archive
 * @returns {import('../../js/evo/crossplay.js').Player | null} its best predator and best forager (the elites with the
 *   highest lower bound); null when it holds no tested elite of either
 */
export function playerOf(archive) {
    const subjects = eliteSubjects(archive);
    const predator = bestOf(subjects, SPEC.PREDATOR);
    const forager = bestOf(subjects, SPEC.FORAGER);
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
    return { generations: [...generations], players: [...players], matrix: createMatrix(trials), stageKills: {} };
}

/**
 * @param {readonly import('./train-state.mjs').StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/stage-run.js').RunState} state the stage state
 * @returns {string[]} the `crossplay.*` keys that the current stage's gate and the gates of the stages already passed
 *   (retention) read
 */
function crossplayKeys(stages, state) {
    const names = new Set([currentEntry(state).name, ...Object.keys(state.passed)]);
    return stages
        .flatMap((stage) => (names.has(stage.name) && Array.isArray(stage.gate) ? stage.gate : []))
        .map((/** @type {{read: string}} */ c) => c.read)
        .filter((read) => read.startsWith('crossplay.'));
}

/**
 * @param {readonly import('./train-state.mjs').StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/stage-run.js').RunState} state the stage state
 * @returns {boolean} whether the current stage's gate, or the gate of a stage already passed (retention), reads `crossplay.*`
 */
export function readsCrossplay(stages, state) {
    return crossplayKeys(stages, state).length > 0;
}

/**
 * @param {readonly import('./train-state.mjs').StageInfo[]} stages the run's stages
 * @param {import('../../js/evo/stage-run.js').RunState} state the stage state
 * @returns {string[]} the stages whose `crossplay.preyVsStage.<stage>` reading a gate wants now
 */
export function preyVsStageNames(stages, state) {
    const prefix = 'crossplay.preyVsStage.';
    const wanted = crossplayKeys(stages, state).filter((k) => k.startsWith(prefix));
    return [...new Set(wanted.map((k) => k.slice(prefix.length)))];
}

/**
 * The `preyVsStage.<stage>` readings: the low bound of how much less often the latest foragers die to the hunters of the
 * snapshot taken when the stage passed than that snapshot's own foragers did.
 * @param {{pool: import('../../js/evo/opponent-pool.js').Pool, crossplay: CrossplayState}} run the run
 * @param {{names: readonly string[], latest: import('../../js/evo/memory-probe-run.js').Subject | null, trials: number}} at
 *   the stages read, the latest checkpoint's forager (none: no reading) and the trials per cell
 * @returns {Record<string, number | null>} each stage's reading; null when its pass snapshot or a champion is missing
 */
function preyVsStage(run, { names, latest, trials }) {
    const { stageKills } = run.crossplay;
    return Object.fromEntries(
        names.map((name) => {
            const entry = stagePassSnapshot(run.pool, name);
            const config = createConfig({});
            const held =
                entry === null ? null : restoreArchive(entry.snapshot, config, { descriptor: TRAINER_DESCRIPTOR });
            const stage = held === null ? null : playerOf(held);
            if (stage === null || latest === null) {
                return [name, null];
            }
            stageKills[name] ??= playCell(stage.predator, stage.forager, { trials });
            const against = playCell(stage.predator, latest, { trials });
            return [name, preyVsStageLow({ kills: stageKills[name], trials }, { kills: against, trials })];
        }),
    );
}

/**
 * Adds a checkpoint's champions to the run's cross-play, plays its row and column and reads the numbers. The first call
 * of a run also reads the earlier checkpoints' champions from the run directory.
 * @param {{crossplay: CrossplayState | null, pool: import('../../js/evo/opponent-pool.js').Pool}} run the run
 *   (`crossplay` is created or grown) and its opponent pool
 * @param {{dir: string, archive: import('../../js/evo/archive.js').Archive, generation: number, trials?: number,
 *   preyStages?: readonly string[], log?: import('../../js/sim/log.js').SimLog}} at the run directory, the checkpoint's
 *   archive, the generations completed at it, the trials per cell, the stages whose `preyVsStage` reading is wanted and
 *   the log
 * @returns {Record<string, any>} the `crossplay.*` readings: `hunterProgressLow`, `preyProgressLow`, `cycleShare` (null
 *   until two checkpoints have champions of both roles) and `preyVsStage.<stage>` for each stage in `preyStages`
 */
export function checkpointCrossplay(run, { dir, archive, generation, trials = CROSS_TRIALS, preyStages = [], log }) {
    run.crossplay ??= createCrossplayState(loadPlayers(dir, generation), trials);

    const player = playerOf(archive);
    if (player !== null) {
        run.crossplay.generations.push(generation);
        run.crossplay.players.push(player);
    }
    playMatrix(run.crossplay, { log });
    const preyVs = preyVsStage(/** @type {any} */ (run), {
        names: preyStages,
        latest: player?.forager ?? null,
        trials,
    });
    return { ...crossplayNumbers(run.crossplay.matrix), preyVsStage: preyVs };
}
