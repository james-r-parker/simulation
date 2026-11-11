// Does a thin prey population still breed (low-density-edge.md, Detectors)? The scene reads the world at the 1000-tick
// checkpoints from `BURN_IN_TICKS` (the alive prey and hunters, the food energy the prey hold) and tallies the prey's
// births and deaths from the `AGENT_BORN` and `AGENT_DIED` events. A span runs from one checkpoint to the next. An edge
// span starts with 1 to `EDGE_PREY - 1` prey; a reference span starts with `REFERENCE_PREY_MIN` to `REFERENCE_PREY_MAX`.
// A span's prey count is the mean of its start and end counts, and a rate is a count over the spans' summed prey counts,
// per 1000 ticks (every span is 1000 ticks). Spans are picked on their start count, so their rates carry some regression
// to the mean. Prey births are `BORN_CAUSE.MATE` and `SPLIT` only: floor and immigrant births are excluded.
//
// - `eval.edge_birth_death_ratio` (higher): prey births over prey deaths, summed over edge spans.
// - `eval.edge_mate_births_per_prey`, `eval.edge_split_births_per_prey` (higher): prey births of each kind per prey per 1000
//   ticks over edge spans.
// - `eval.edge_starve_per_prey`, `eval.edge_eaten_per_prey` (lower): prey deaths by starvation and by a hunter, the same way.
// - `eval.edge_hunters_per_prey` (lower): the spans' mean hunters over their mean prey.
// - `eval.edge_intake_ratio` (higher): food energy per prey per tick in edge spans over the same in reference spans.
//
// The diagnosis (T10) swaps each edge rate for the same seed's reference-span rate, so the reference rates and the edge's
// all-cause death rate are registered beside them as watch metrics (`eval.edge_deaths_per_prey`, `eval.edge_ref_*`): a
// report already carries each metric per seed, where a tally object would need a new report field.
//
// The two share detectors (`eval.edge_mate_unreached_share`, `eval.edge_split_blocked_share.*`) are in scene-edge-gates.js and
// run at every edge checkpoint.
//
// The checkpoint is one pass over the agent slots; an event adds to a few running totals; nothing is allocated per tick.
// The scene reads the world and writes only itself, so no hash can move.

import { BORN_CAUSE, DEATH_CAUSE } from '../sim/events.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createLog, ensureRoom } from './growable-log.js';
import { createEdgeGates, edgeGateMetrics, sampleEdgeGates } from './scene-edge-gates.js';
import { none, ok } from './metrics-stats.js';

/** A span starts under this many prey to be an edge span. */
export const EDGE_PREY = 100;

/** A reference span starts with at least this many prey. */
export const REFERENCE_PREY_MIN = 100;

/** A reference span starts with at most this many prey. */
export const REFERENCE_PREY_MAX = 400;

/** Ticks between the checkpoints (the 1000-tick checkpoint every scene shares). */
const CHECKPOINT_TICKS = 1000;

const NO_EDGE = 'no edge span (a span after burn-in that starts with 1 to 99 prey)';
const NO_REFERENCE = 'no reference span (a span after burn-in that starts with 100 to 400 prey)';

/** The running totals a checkpoint row copies. */
const TOTALS = ['mate', 'split', 'deaths', 'starved', 'eaten'];

/**
 * @returns {Record<string, any>} an empty edge scene: the checkpoint rows (alive prey and hunters, and the running totals
 *   of the prey's mate and split births, deaths, starvation deaths, deaths by a hunter and food energy taken), the totals
 *   and the share detectors' state
 */
export function createEdgeScene() {
    return {
        log: createLog(['prey', 'hunters', 'mate', 'split', 'deaths', 'starved', 'eaten', 'intake']),
        rows: 0,
        mate: 0,
        split: 0,
        deaths: 0,
        starved: 0,
        eaten: 0,
        intakeDead: 0,
        gates: createEdgeGates(EDGE_PREY),
    };
}

/**
 * Adds a birth to the run's totals when it is a prey's mating or split birth.
 * @param {Record<string, any>} scene the edge scene
 * @param {Record<string, any>} world the world
 * @param {{cause: number, spec: number}} birth the `AGENT_BORN` cause and the child's specialisation
 * @returns {void}
 */
export function noteEdgeBirth(scene, world, { cause, spec }) {
    if (world.huntBySpec[spec] === 1) {
        return;
    }
    scene.mate += cause === BORN_CAUSE.MATE ? 1 : 0;
    scene.split += cause === BORN_CAUSE.SPLIT ? 1 : 0;
}

/**
 * Adds a death to the run's totals when it is a prey's.
 * @param {Record<string, any>} scene the edge scene
 * @param {Record<string, any>} world the world
 * @param {{cause: number, spec: number, foodEnergy: number}} death the `AGENT_DIED` cause, the agent's specialisation and
 *   its lifetime `foodEnergy`
 * @returns {void}
 */
export function noteEdgeDeath(scene, world, { cause, spec, foodEnergy }) {
    if (world.huntBySpec[spec] === 1) {
        return;
    }
    scene.deaths += 1;
    scene.starved += cause === DEATH_CAUSE.STARVED ? 1 : 0;
    scene.eaten += cause === DEATH_CAUSE.EATEN ? 1 : 0;
    scene.intakeDead += foodEnergy;
}

/**
 * Writes the checkpoint row: one pass over the agent slots.
 * @param {Record<string, any>} scene the edge scene
 * @param {Record<string, any>} world the world
 * @returns {number} the alive prey
 */
function takeRow(scene, world) {
    let prey = 0;
    let hunters = 0;
    let intake = scene.intakeDead;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            const hunts = world.huntBySpec[world.spec[slot]] === 1;
            hunters += hunts ? 1 : 0;
            prey += hunts ? 0 : 1;
            intake += hunts ? 0 : world.foodEnergy[slot];
        }
    }
    const row = scene.rows++;
    ensureRoom(scene.log, row);
    const { log } = scene;
    log.prey[row] = prey;
    log.hunters[row] = hunters;
    log.intake[row] = intake;
    for (const name of TOTALS) {
        log[name][row] = scene[name];
    }
    return prey;
}

/**
 * Takes the checkpoint at the world's tick, if it is a 1000-tick checkpoint at or after burn-in, and the share detectors'
 * sample when 1 to `EDGE_PREY - 1` prey are alive. Call it after the tick's
 * events are noted.
 * @param {Record<string, any>} scene the edge scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleEdge(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % CHECKPOINT_TICKS !== 0) {
        return;
    }
    const prey = takeRow(scene, world);
    if (prey > 0 && prey < EDGE_PREY) {
        sampleEdgeGates(scene.gates, world);
    }
}

/**
 * Sums the spans of one kind.
 * @param {Record<string, any>} scene the edge scene
 * @param {(startPrey: number) => boolean} starts whether a span that starts with that many prey is of the kind
 * @returns {{spans: number, prey: number, hunters: number, mate: number, split: number, deaths: number, starved: number,
 *   eaten: number, intake: number}} the number of spans, the spans' summed mean prey and mean hunters, and the totals
 *   they hold
 */
export function spanTotals(scene, starts) {
    const { log, rows } = scene;
    const sum = { spans: 0, prey: 0, hunters: 0, mate: 0, split: 0, deaths: 0, starved: 0, eaten: 0, intake: 0 };
    for (let row = 1; row < rows; row++) {
        if (!starts(log.prey[row - 1])) {
            continue;
        }
        sum.spans += 1;
        sum.prey += (log.prey[row - 1] + log.prey[row]) / 2;
        sum.hunters += (log.hunters[row - 1] + log.hunters[row]) / 2;
        for (const name of ['mate', 'split', 'deaths', 'starved', 'eaten', 'intake']) {
            sum[/** @type {'mate'} */ (name)] += log[name][row] - log[name][row - 1];
        }
    }
    return sum;
}

/** @param {number} start prey at a span's start @returns {boolean} whether the span is an edge span */
const isEdge = (start) => start > 0 && start < EDGE_PREY;

/** @param {number} start prey at a span's start @returns {boolean} whether the span is a reference span */
const isReference = (start) => start >= REFERENCE_PREY_MIN && start <= REFERENCE_PREY_MAX;

/**
 * @param {{spans: number, prey: number}} totals the spans' totals
 * @param {number} count a count over the spans
 * @param {string} reason why there is no rate
 * @returns {import('./metrics-stats.js').MetricResult} `count` per prey per 1000 ticks; null with `reason` when the kind has
 *   no span or the spans hold no prey
 */
function rate(totals, count, reason) {
    return totals.spans === 0 || totals.prey === 0 ? none(reason) : ok(count / totals.prey);
}

/**
 * @param {{spans: number, prey: number, deaths: number, mate: number, split: number}} edge the edge spans' totals
 * @returns {import('./metrics-stats.js').MetricResult} births over deaths
 */
function ratio(edge) {
    if (edge.spans === 0) {
        return none(NO_EDGE);
    }
    return edge.deaths === 0 ? none('no prey death in an edge span') : ok((edge.mate + edge.split) / edge.deaths);
}

/**
 * @param {{spans: number, prey: number, intake: number}} edge the edge spans' totals
 * @param {{spans: number, prey: number, intake: number}} ref the reference spans' totals
 * @returns {import('./metrics-stats.js').MetricResult} the food energy per prey per tick, edge over reference
 */
function intakeRatio(edge, ref) {
    if (edge.spans === 0 || edge.prey === 0) {
        return none(NO_EDGE);
    }
    if (ref.spans === 0 || ref.prey === 0) {
        return none(NO_REFERENCE);
    }
    return ref.intake === 0
        ? none('no food energy taken in reference spans')
        : ok(edge.intake / edge.prey / (ref.intake / ref.prey));
}

/**
 * @param {Record<string, any>} scene the edge scene
 * @returns {import('./metrics-stats.js').MetricRecord} the rate and ratio detectors and the reference tallies, null with a
 *   reason when the run has no edge span (or, for the intake ratio and the reference rates, no reference span)
 */
export function edgeMetrics(scene) {
    const edge = spanTotals(scene, isEdge);
    const ref = spanTotals(scene, isReference);
    return {
        'eval.edge_birth_death_ratio': ratio(edge),
        'eval.edge_mate_births_per_prey': rate(edge, edge.mate, NO_EDGE),
        'eval.edge_split_births_per_prey': rate(edge, edge.split, NO_EDGE),
        'eval.edge_starve_per_prey': rate(edge, edge.starved, NO_EDGE),
        'eval.edge_eaten_per_prey': rate(edge, edge.eaten, NO_EDGE),
        'eval.edge_hunters_per_prey': rate(edge, edge.hunters, NO_EDGE),
        'eval.edge_intake_ratio': intakeRatio(edge, ref),
        'eval.edge_deaths_per_prey': rate(edge, edge.deaths, NO_EDGE),
        'eval.edge_ref_mate_births_per_prey': rate(ref, ref.mate, NO_REFERENCE),
        'eval.edge_ref_split_births_per_prey': rate(ref, ref.split, NO_REFERENCE),
        'eval.edge_ref_starve_per_prey': rate(ref, ref.starved, NO_REFERENCE),
        'eval.edge_ref_eaten_per_prey': rate(ref, ref.eaten, NO_REFERENCE),
        ...edgeGateMetrics(scene.gates),
    };
}
