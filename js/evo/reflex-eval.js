// Scores genomes on reflex tables (brain-reflex-tests.md, Evaluation path). One world holds one slot per genome of a
// batch; for every sequence of a case it copies the table's row into every slot's `inputs`, rewrites the memory
// read-backs, runs `forwardAll` once for the whole batch and scores the outputs. `senseAll` and every other phase are
// never called, so a genome's score is a function of its weights and the table alone, whatever the batch.

import { forwardAll } from '../sim/brain.js';
import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, inputOffsets } from '../sim/brain-layout.js';
import { resetFastOut } from '../sim/hebbian.js';
import { applyGenes } from '../sim/traits.js';
import { arenaConfig } from './memory-probe-run.js';
import { stageWorld } from './pool-discrimination-stage.js';
import { caseNamed } from './reflex-cases.js';
import { SEQUENCE_TICKS, SETTLE_TICKS, readOutputs } from './reflex-stage.js';
import { assertTableFresh } from './reflex-table.js';

/** Slots in one batch. */
export const BATCH_SLOTS = 512;
/** Energy of every slot: only the body inputs read it, and the table rows carry the staged body's. */
const SLOT_ENERGY = 800;

/**
 * @typedef {object} ReflexSubject
 * @property {string} name a label
 * @property {number} id the genome id the log names
 * @property {Float32Array | null} weights the brain row; null for a reference controller
 * @property {((world: Record<string, any>) => void) | null} act a reference controller's `brain` phase body, run on
 *   the rows in place of `forwardAll`; null for a genome
 */

/**
 * @typedef {object} CaseScore
 * @property {number} passes trials passed (every staging of the trial passed every scored tick)
 * @property {number} trials trials played
 * @property {number} passShare `passes / trials`
 * @property {number} fast the share of trials whose first row already passed
 */

/** @typedef {(world: Record<string, any>) => void} Think what runs the brains of a world's slots */

/**
 * Builds the world a batch runs in: `slots` alive agents of one specialisation, in the staged arena, with the Rust
 * brain kernel attached as every world has it.
 * @param {Record<string, any>} config the config overrides
 * @param {number} slots how many genomes the batch holds
 * @param {number} [spec] the specialisation index of every slot
 * @returns {Record<string, any>} the world
 */
export function createReflexWorld(config, slots, spec = 0) {
    const agents = Array.from({ length: slots }, () => ({ x: 1500, y: 2000, angle: 0, spec, energy: SLOT_ENERGY }));
    const sized = { ...config, maxAgents: slots, initialAgents: 0, minAgents: 0 };
    return stageWorld({ foods: [], rocks: [], agents, seed: 1, config: arenaConfig(sized) }).world;
}

/**
 * Writes a genome's weights into a slot and re-derives what depends on them (leak rates, the plastic block).
 * @param {Record<string, any>} world the reflex world
 * @param {number} slot the slot
 * @param {Float32Array} weights the genome's brain row
 * @returns {void}
 */
export function loadGenome(world, slot, weights) {
    world.weights.set(weights, slot * world.layout.weightCount);
    applyGenes(world, slot);
}

/**
 * Starts every slot a sequence from reset: hidden state and outputs 0, and the plastic block back to the genome's.
 * @param {Record<string, any>} world the reflex world
 * @returns {void}
 */
function resetState(world) {
    world.hidden.fill(0);
    world.outputs.fill(0);
    if (world.config.hebbianRate > 0) {
        for (let slot = 0; slot < world.alive.length; slot++) {
            resetFastOut(world, slot);
        }
    }
}

/**
 * Copies one table row into every slot, then sets the two memory read-backs to the slot's own last outputs, as
 * `writeBodyInputs` does.
 * @param {Record<string, any>} world the reflex world
 * @param {{row: Float32Array, hue: Float32Array}} tick the table's `inputs` row and `rayHue` row for the tick
 * @returns {void}
 */
function loadRow(world, { row, hue }) {
    const raw = world.layout.rawInputCount;
    const { rayCount } = world.config;
    const memory = inputOffsets(world.config).rawBodyStart;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const at = slot * raw;
        world.inputs.set(row, at);
        world.rayHue.set(hue, slot * rayCount);
        world.inputs[at + memory + BODY_INPUT.MEMORY_A] = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A];
        world.inputs[at + memory + BODY_INPUT.MEMORY_B] = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_B];
    }
}

/**
 * @typedef {object} Hooks what a caller can watch
 * @property {import('../sim/log.js').SimLog} [log] receives `ReflexCase` at debug level for each trial's first failing
 *   tick: case, trial, genomeId, tick, and the outputs at it
 * @property {(tick: {world: Record<string, any>, table: string, sequence: number, tick: number}) => void} [observe]
 *   called after the brains ran each tick, before the next
 */

/**
 * @typedef {object} Tally the per-slot results of the sequences of one case
 * @property {Uint8Array} passed `slots x trials`: 1 while every sequence of the trial so far passed every scored tick
 * @property {Uint8Array} fast `slots x trials`: 1 while every sequence of the trial so far passed its first row
 */

/**
 * @typedef {object} Run what a case's sequences share
 * @property {Think} think what runs the brains
 * @property {Tally} tally the results so far
 * @property {import('./reflex-stage.js').ReflexCase['check']} check the case's check
 * @property {readonly number[]} ids the genome id of each slot, for the log
 * @property {Hooks} hooks the log and the observer
 */

/**
 * @param {{world: Record<string, any>, table: import('./reflex-table.js').CaseTable, run: Run}} where the world, table and run
 * @param {{slot: number, index: number, tick: number}} at the failing slot, sequence and tick
 * @returns {void}
 */
function logFailure({ world, table, run }, { slot, index, tick }) {
    const o = slot * OUTPUT_COUNT;
    run.hooks.log?.log('debug', 'ReflexCase', {
        case: table.name,
        trial: table.sequences[index].trial,
        kind: table.sequences[index].staging.kind,
        genomeId: run.ids[slot],
        tick: tick + 1,
        outputs: {
            thrust: world.outputs[o + OUTPUT_INDEX.THRUST],
            turn: world.outputs[o + OUTPUT_INDEX.TURN],
            sprint: world.outputs[o + OUTPUT_INDEX.SPRINT],
            bite: world.outputs[o + OUTPUT_INDEX.BITE],
        },
    });
}

/**
 * @typedef {object} Marks the per-slot marks of the sequence being played
 * @property {Uint8Array} ok 1 while the slot passed every scored tick so far
 * @property {Uint8Array} first the slot's first-row pass
 */

/**
 * Scores one tick of every slot, logging a trial's first failing tick.
 * @param {{world: Record<string, any>, table: import('./reflex-table.js').CaseTable, run: Run}} where the world, table and run
 * @param {{index: number, tick: number, marks: Marks}} at the sequence, the tick and the marks to update
 * @returns {void}
 */
function scoreTick({ world, table, run }, { index, tick, marks }) {
    const { trial, staging } = table.sequences[index];
    const outputs = { thrust: 0, turn: 0, sprint: 0, bite: 0 };
    const scored = tick >= SETTLE_TICKS;
    for (let slot = 0; slot < marks.ok.length; slot++) {
        const pass = Number(run.check(readOutputs(world.outputs, slot, outputs), staging));
        marks.first[slot] = tick === 0 ? pass : marks.first[slot];
        const fresh = marks.ok[slot] === 1 && run.tally.passed[slot * table.trials + trial] === 1;
        if (scored && pass === 0 && fresh) {
            logFailure({ world, table, run }, { slot, index, tick });
        }
        marks.ok[slot] &= scored ? pass : 1;
    }
}

/**
 * Runs one sequence for every slot and folds each slot's outcome into the tally.
 * @param {Record<string, any>} world the reflex world
 * @param {import('./reflex-table.js').CaseTable} table the case's table
 * @param {{index: number, run: Run}} sequence the sequence's index and what the case's sequences share
 * @returns {void}
 */
function runSequence(world, table, { index, run }) {
    const { trial } = table.sequences[index];
    const { tally } = run;
    const raw = table.rawInputCount;
    const slots = world.alive.length;
    const marks = { ok: new Uint8Array(slots).fill(1), first: new Uint8Array(slots) };
    resetState(world);
    for (let t = 0; t < SEQUENCE_TICKS; t++) {
        const at = index * SEQUENCE_TICKS + t;
        loadRow(world, {
            row: table.rows.subarray(at * raw, (at + 1) * raw),
            hue: table.hues.subarray(at * table.rayCount, (at + 1) * table.rayCount),
        });
        run.think(world);
        run.hooks.observe?.({ world, table: table.name, sequence: index, tick: t });
        scoreTick({ world, table, run }, { index, tick: t, marks });
    }
    for (let slot = 0; slot < slots; slot++) {
        tally.passed[slot * table.trials + trial] &= marks.ok[slot];
        tally.fast[slot * table.trials + trial] &= marks.first[slot];
    }
}

/**
 * @param {Uint8Array} flags `slots x trials` flags
 * @param {number} slot a slot
 * @param {number} trials trials per slot
 * @returns {number} how many of the slot's trials are 1
 */
function countOf(flags, slot, trials) {
    return flags.subarray(slot * trials, (slot + 1) * trials).reduce((sum, flag) => sum + flag, 0);
}

/**
 * Plays every sequence of a case for every slot.
 * @param {Record<string, any>} world the reflex world
 * @param {import('./reflex-table.js').CaseTable} table the case's table
 * @param {Pick<Run, 'think' | 'ids' | 'hooks'>} how what runs the brains, the genome ids and the hooks
 * @returns {CaseScore[]} one score per slot
 */
function runCase(world, table, { think, ids, hooks }) {
    const slots = world.alive.length;
    const tally = {
        passed: new Uint8Array(slots * table.trials).fill(1),
        fast: new Uint8Array(slots * table.trials).fill(1),
    };
    const run = { think, tally, check: caseNamed(table.name).check, ids, hooks };
    for (let index = 0; index < table.sequences.length; index++) {
        runSequence(world, table, { index, run });
    }
    return Array.from({ length: slots }, (_, slot) => {
        const passes = countOf(tally.passed, slot, table.trials);
        const fast = countOf(tally.fast, slot, table.trials) / table.trials;
        return { passes, trials: table.trials, passShare: passes / table.trials, fast };
    });
}

/**
 * @param {readonly ReflexSubject[]} subjects the genomes of one batch (all brains)
 * @param {readonly import('./reflex-table.js').CaseTable[]} tables the case tables
 * @param {{config: Record<string, any>, hooks: Hooks}} run the config overrides and the hooks
 * @returns {Record<string, CaseScore>[]} each genome's scores by case name
 */
function evalBrains(subjects, tables, { config, hooks }) {
    const world = createReflexWorld(config, subjects.length, tables[0].spec);
    subjects.forEach((s, slot) => loadGenome(world, slot, /** @type {Float32Array} */ (s.weights)));
    const scores = subjects.map(() => /** @type {Record<string, CaseScore>} */ ({}));
    for (const table of tables) {
        runCase(world, table, { think: forwardAll, ids: subjects.map((x) => x.id), hooks }).forEach((score, i) => {
            scores[i][table.name] = score;
        });
    }
    return scores;
}

/**
 * @param {ReflexSubject} subject a reference controller
 * @param {readonly import('./reflex-table.js').CaseTable[]} tables the case tables
 * @param {{config: Record<string, any>, hooks: Hooks}} run the config overrides and the hooks
 * @returns {Record<string, CaseScore>} the controller's scores by case name
 */
function evalReference(subject, tables, { config, hooks }) {
    const world = createReflexWorld(config, 1, tables[0].spec);
    /** @type {Record<string, CaseScore>} */
    const scores = {};
    for (const table of tables) {
        const think = /** @type {Think} */ (subject.act);
        scores[table.name] = runCase(world, table, { think, ids: [subject.id], hooks })[0];
    }
    return scores;
}

/**
 * Scores genomes on case tables, one specialisation per call. Genomes run in batches of up to `batch` slots; a
 * reference controller runs alone on the same rows.
 * @param {readonly ReflexSubject[]} subjects the genomes and references
 * @param {readonly import('./reflex-table.js').CaseTable[]} tables the case tables to run, all of one specialisation
 * @param {{config?: Record<string, any>, batch?: number} & Hooks} [options] the config overrides the tables were built
 *   under (default none), the batch size (default `BATCH_SLOTS`) and the hooks
 * @returns {Record<string, CaseScore>[]} one record per subject, in order, of its scores by case name
 * @throws {Error} `ReflexTableStale` when a table does not fit the layout or the config
 */
export function evalReflex(subjects, tables, options = {}) {
    const { config = {}, batch = BATCH_SLOTS, log, observe } = options;
    const run = { config, hooks: { log, observe } };
    for (const table of tables) {
        assertTableFresh(table, config);
    }
    /** @type {Record<string, CaseScore>[]} */
    const results = new Array(subjects.length);
    const brains = subjects.flatMap((s, i) => (s.act === null ? [i] : []));
    for (let from = 0; from < brains.length; from += batch) {
        const part = brains.slice(from, from + batch);
        evalBrains(
            part.map((i) => subjects[i]),
            tables,
            run,
        ).forEach((score, k) => {
            results[part[k]] = score;
        });
    }
    subjects.forEach((s, i) => {
        if (s.act !== null) {
            results[i] = evalReference(s, tables, run);
        }
    });
    return results;
}
