// The training curriculum (training.md, Trainer): an ordered list of stages, each a config and a number of generations
// or a gate (training-stages.md), run on one archive. A stage changes the world, never the reward. Pure: no files (the
// script loads the configs).

import { validateAdapt } from './adaptive-difficulty.js';
import { validateGate } from './stage-gate.js';

export {
    checkpointDue,
    currentEntry,
    initialState,
    isGated,
    needsGate,
    nextStage,
    restoreState,
    snapshotState,
    stateAfter,
} from './stage-run.js';

/**
 * @typedef {object} CurriculumEntry
 * @property {string} name the stage's name
 * @property {string | null} config a config overrides file, or null for the default config
 * @property {number} [generations] generations in the stage; the last stage may omit it, and always runs to the end
 * @property {import('./stage-gate.js').Condition[]} [gate] conditions that end the stage when they hold on `GATE_HOLD`
 *   checkpoints in a row; a gated entry has `minGenerations` and `maxGenerations` in place of `generations`
 * @property {number} [minGenerations] a gated stage's least generations before it can pass (default 1)
 * @property {number} [maxGenerations] a gated stage's generations before it stalls
 * @property {boolean} [optional] a gated stage whose stall lets the ladder move on
 * @property {number} [plateauStop] a gated stage's gate checkpoints over which its best progress must rise (`js/evo/stage-progress.js`)
 *   or it stalls on a plateau; 0 or absent: it runs to `maxGenerations`
 * @property {import('./adaptive-difficulty.js').Adapt} [adapt] a gated stage's adaptive difficulty (`js/evo/adaptive-difficulty.js`)
 * @property {boolean} [keepPasser] a gated stage whose best passing elites are kept for its retention reads (`js/evo/stage-run.js`)
 * @property {number} [pool] the share of founders drawn from the opponent pool, 0 to 1 (read from Phase 3 on)
 * @property {number} [preyShare] a stage world's quota of prey specialisations among its seeded agents, 0 to 1 (`quotaSpec`)
 * @property {number} [checkpointEvery] generations between checkpoints in this stage (default: the run's)
 */

/**
 * @typedef {object} Stage
 * @property {string} name the stage's name
 * @property {string | null} config its config overrides file, or null
 * @property {number} from the first generation (0-based) it runs
 * @property {number} to one past the last generation it runs
 */

/** The curriculum of a run without `--curriculum`: the default config for every generation. */
export const DEFAULT_CURRICULUM = Object.freeze([Object.freeze({ name: 'default', config: null })]);

/**
 * @param {unknown} entry a curriculum entry
 * @param {number} index its position
 * @param {number} last the last position
 * @returns {void}
 * @throws {Error} naming the entry when it is malformed, or lacks `generations` and a gate and is not the last
 */
function checkEntry(entry, index, last) {
    const e = /** @type {Record<string, any>} */ (entry);
    const where = `curriculum[${index}]`;
    if (typeof e !== 'object' || e === null || typeof e.name !== 'string' || e.name === '') {
        throw new Error(`${where}: expected an object with a non-empty "name"`);
    }
    if (e.config !== null && typeof e.config !== 'string') {
        throw new Error(`${where} (${e.name}): "config" must be a file path or null`);
    }
    if (e.gate === undefined) {
        checkFixed(e, where, index === last);
    } else {
        checkGated(e, where);
    }
    checkShared(e, where);
}

/**
 * @param {Record<string, any>} e an entry
 * @param {string} where the entry's position, for errors
 * @returns {void}
 * @throws {Error} when `keepPasser` is not a boolean
 */
function checkKeepPasser(e, where) {
    if (e.keepPasser !== undefined && typeof e.keepPasser !== 'boolean') {
        throw new Error(`${where} (${e.name}): "keepPasser" must be true or false`);
    }
}

/**
 * @param {Record<string, any>} e an entry
 * @param {string} where the entry's position, for errors
 * @returns {void}
 * @throws {Error} when `pool`, `preyShare` or `checkpointEvery` is bad
 */
function checkShared(e, where) {
    for (const key of ['pool', 'preyShare']) {
        const v = e[key];
        if (v !== undefined && !(typeof v === 'number' && v >= 0 && v <= 1)) {
            throw new Error(`${where} (${e.name}): "${key}" must be a share from 0 to 1`);
        }
    }
    if (e.checkpointEvery !== undefined && !(Number.isInteger(e.checkpointEvery) && e.checkpointEvery >= 1)) {
        throw new Error(`${where} (${e.name}): "checkpointEvery" must be an integer >= 1`);
    }
    checkKeepPasser(e, where);
}

/**
 * @param {Record<string, any>} e a fixed-length entry
 * @param {string} where the entry's position, for errors
 * @param {boolean} isLast whether it is the last entry (which may omit `generations`)
 * @returns {void}
 * @throws {Error} when `generations` is bad or a gated-stage field is set
 */
function checkFixed(e, where, isLast) {
    const missing = e.generations === undefined;
    if (missing ? !isLast : !(Number.isInteger(e.generations) && e.generations >= 1)) {
        throw new Error(
            `${where} (${e.name}): "generations" must be an integer >= 1 (only the last stage may omit it)`,
        );
    }
    for (const key of ['minGenerations', 'maxGenerations', 'optional', 'plateauStop', 'adapt']) {
        if (e[key] !== undefined) {
            throw new Error(`${where} (${e.name}): "${key}" belongs to a gated stage (one with a "gate")`);
        }
    }
}

/**
 * @param {Record<string, any>} e a gated entry
 * @param {string} where the entry's position, for errors
 * @returns {void}
 * @throws {Error} when `plateauStop` is not a whole number of checkpoints (0: none)
 */
function checkPlateauStop(e, where) {
    if (e.plateauStop !== undefined && !(Number.isInteger(e.plateauStop) && e.plateauStop >= 0)) {
        throw new Error(`${where} (${e.name}): "plateauStop" must be an integer >= 0`);
    }
}

/**
 * @param {Record<string, any>} e a gated entry
 * @param {string} where the entry's position, for errors
 * @returns {void}
 * @throws {Error} when the gate or its generation limits are malformed
 */
function checkGated(e, where) {
    validateGate(e.gate, `${where} (${e.name})`);
    if (e.generations !== undefined) {
        throw new Error(
            `${where} (${e.name}): a gated stage sets "minGenerations" and "maxGenerations", not "generations"`,
        );
    }
    const min = e.minGenerations ?? 1;
    if (!(Number.isInteger(min) && min >= 1)) {
        throw new Error(`${where} (${e.name}): "minGenerations" must be an integer >= 1`);
    }
    if (!(Number.isInteger(e.maxGenerations) && e.maxGenerations >= min)) {
        throw new Error(`${where} (${e.name}): "maxGenerations" must be an integer >= "minGenerations"`);
    }
    if (e.optional !== undefined && typeof e.optional !== 'boolean') {
        throw new Error(`${where} (${e.name}): "optional" must be true or false`);
    }
    checkPlateauStop(e, where);
    if (e.adapt !== undefined) {
        validateAdapt(e.adapt, `${where} (${e.name})`);
    }
}

/**
 * @param {readonly CurriculumEntry[]} entries the stages in order
 * @returns {void}
 * @throws {Error} on an empty or malformed list or a duplicate name
 */
function checkEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('curriculum: expected a non-empty list of stages');
    }
    entries.forEach((entry, i) => checkEntry(entry, i, entries.length - 1));
    if (new Set(entries.map((e) => e.name)).size !== entries.length) {
        throw new Error('curriculum: stage names must be distinct');
    }
}

/**
 * Lays the stages out over the run. The last stage takes whatever is left, whatever its `generations`; a stage that begins
 * at or after `generations` is dropped, and one that crosses it is cut.
 * @param {readonly CurriculumEntry[]} entries the stages in order, none gated
 * @param {number} generations the run's total generations
 * @returns {Stage[]} the stages that run, in order, covering generations 0 to `generations`
 * @throws {Error} on an empty or malformed list, a duplicate name or a gated stage (its length is not planned)
 */
export function planStages(entries, generations) {
    checkEntries(entries);
    const gated = entries.find((e) => e.gate !== undefined);
    if (gated !== undefined) {
        throw new Error(`curriculum: "${gated.name}" is gated, so its length is not planned; run it with nextStage`);
    }
    /** @type {Stage[]} */
    const stages = [];
    let from = 0;
    for (const entry of entries) {
        const isLast = entry === entries[entries.length - 1];
        const to = Math.min(generations, isLast ? generations : from + /** @type {number} */ (entry.generations));
        if (from < to) {
            stages.push({ name: entry.name, config: entry.config, from, to });
        }
        from = to;
    }
    return stages;
}

/**
 * The stages of a run, with each entry's own fields (`gate`, `pool`, `checkpointEvery`, ...). A curriculum with no gated
 * stage is laid out by `planStages`; one with a gated stage has no fixed ranges (`from` and `to` are -1), and
 * `nextStage` decides where each stage ends.
 * @param {readonly CurriculumEntry[]} entries the stages in order
 * @param {number} generations the run's total generations
 * @returns {(CurriculumEntry & Stage)[]} the stages in order
 * @throws {Error} on an empty or malformed list or a duplicate name
 */
export function planRun(entries, generations) {
    checkEntries(entries);
    if (entries.some((e) => e.gate !== undefined)) {
        return entries.map((entry) => ({ ...entry, from: -1, to: -1 }));
    }
    return planStages(entries, generations).map((stage) => ({
        .../** @type {CurriculumEntry} */ (entries.find((e) => e.name === stage.name)),
        ...stage,
    }));
}

/**
 * @param {readonly CurriculumEntry[]} entries the stages in order
 * @param {string} name the stage a run stops after (`--until`)
 * @returns {CurriculumEntry[]} the entries up to and including `name`
 * @throws {Error} when no entry has that name
 */
export function untilStage(entries, name) {
    const at = entries.findIndex((e) => e.name === name);
    if (at < 0) {
        throw new Error(`--until: no stage "${name}"; the stages are ${entries.map((e) => e.name).join(', ')}`);
    }
    return entries.slice(0, at + 1);
}

/**
 * @template {Stage} T
 * @param {readonly T[]} stages a `planStages` result (or stages extended with more fields)
 * @param {number} generation a generation (0-based) inside the run
 * @returns {T} the stage that runs it
 * @throws {RangeError} when the generation is outside the plan
 */
export function stageAt(stages, generation) {
    const stage = stages.find((s) => generation >= s.from && generation < s.to);
    if (stage === undefined) {
        throw new RangeError(`curriculum: generation ${generation} is outside the plan`);
    }
    return stage;
}

/** A stage whose name starts with one of these runs hunters; stage configs cannot switch them off, so the name is the marker. */
const HUNT_STAGE = /^(hunt|evade|arms-race|pack|habitat)/;

/**
 * Checks a curriculum's floors (training.md T29): a training floor (`minAgents` above 0) is a bounded aid that must not
 * become a rescue in the target world. No stage's `minAgents` is above the target's, a stage that runs hunters (its name
 * starts with `hunt`, `evade`, `arms-race`, `pack` or `habitat`) has `minAgents` 0 (no restocking of a role), and the final stage is the target world (no config).
 * @param {readonly CurriculumEntry[]} entries the stages in order (already shape-checked by `planStages`)
 * @param {{overridesOf: (config: string) => Record<string, any>, targetMinAgents: number}} world how to read a stage's
 *   config overrides, and the target world's `minAgents`
 * @returns {void}
 * @throws {Error} naming the stage and the rule it breaks
 */
export function validateStageFloors(entries, { overridesOf, targetMinAgents }) {
    entries.forEach((entry, i) => {
        const floor =
            entry.config === null ? targetMinAgents : (overridesOf(entry.config).minAgents ?? targetMinAgents);
        if (floor > targetMinAgents) {
            throw new Error(
                `curriculum: stage "${entry.name}" has minAgents ${floor}, above the target world's ${targetMinAgents}`,
            );
        }
        if (HUNT_STAGE.test(entry.name) && floor > 0) {
            throw new Error(`curriculum: hunter stage "${entry.name}" has minAgents ${floor}; a hunter stage has none`);
        }
        if (i === entries.length - 1 && entry.config !== null) {
            throw new Error(
                `curriculum: the final stage "${entry.name}" is not the target world (its config must be null)`,
            );
        }
    });
}

/**
 * Whether an archive's saved stages end in the target world, so its champions may be published (training.md T29): the
 * last stage it recorded ran under the target world's rules.
 * @param {ReadonlyArray<{name: string, rulesHash: string}> | undefined} stages the archive's `stages` record
 * @param {string} targetHash the target world's `rulesHash`
 * @returns {boolean} true when the last recorded stage is the target world
 */
export function endsInTargetWorld(stages, targetHash) {
    return stages !== undefined && stages.length > 0 && stages[stages.length - 1].rulesHash === targetHash;
}
