// The trainer's episode and merge (training.md, Trainer). An episode is one whole world on one train seed, started from
// a frozen copy of the archive; it returns its offers instead of changing any archive, and `mergeEpisode` applies them
// in episode-index order, so the archive after a generation does not depend on how many workers ran the episodes.
// DOM-free and deterministic: no clock (the script times the episode), all randomness through the sim's streams.

import { restoreArchive } from './archive-snapshot.js';
import { createArchive, offer } from './archive.js';
import { DESCRIPTORS } from './descriptors.js';
import { feedPolicy } from './feed-policy.js';
import { computeMetrics } from './metrics.js';
import { checkpoint, createObserver, observerPhases } from './observer.js';
import { LIVE_POLICY, getPolicy } from './policies/index.js';
import { brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createSimLog } from '../sim/log.js';
import { createRng, fork } from '../sim/rng.js';
import { createWorld } from '../sim/spawn.js';
import { step } from '../sim/step.js';

/** The most fitness samples a trainer archive keeps per genome (`createArchive`'s `nCap`). */
export const TRAINER_N_CAP = 8;
/** Ticks one episode runs. */
export const EPISODE_TICKS = 60000;
/** Agents an episode starts with unless its stage config sets `initialAgents`. */
export const EPISODE_AGENTS = 100;
/** Deaths before this tick are not offered: the start is a transient of the frozen archive's founders. */
export const OFFER_FROM_TICK = 10000;
/** The descriptor of the archive the live policy keeps (`map-elites-v6` places by `descriptorV7`). */
export const TRAINER_DESCRIPTOR = DESCRIPTORS.v7;
/** Ticks between observer checkpoints, as in the eval runner. */
const CHECKPOINT_TICKS = 1000;

/**
 * @typedef {object} EpisodeTask
 * @property {number} seed the train seed
 * @property {Record<string, any>} overrides the stage's config overrides (`{}` for the default world)
 * @property {import('./archive-snapshot.js').ArchiveSnapshot} snapshot the frozen archive the episode starts from
 * @property {number} [ticks] ticks to run (default `EPISODE_TICKS`)
 * @property {number} [offerFromTick] the first death tick offered (default `OFFER_FROM_TICK`)
 * @property {string} [policy] a registered policy that keeps an archive (default `LIVE_POLICY`)
 * @property {readonly string[]} [metrics] eval metric names to return (a checkpoint's eval episode); default none
 */

/**
 * @typedef {object} TrainOffer
 * @property {number} spec specialisation index
 * @property {number} cell the cell
 * @property {Float32Array} row the genome's weights
 * @property {number} sigma its sigma
 * @property {number} id its genome id
 * @property {number} fitness its fitness
 * @property {boolean} isClone whether it was an unmutated clone of an archive genome
 * @property {number} archiveRef `spec * 100 + cell` of the genome it cloned
 * @property {number} refId the id of the genome it cloned
 * @property {number} tick the tick of the death that offered it
 */

/**
 * @param {readonly number[]} seeds the train seeds (`evals/train-seeds.json`)
 * @param {{generation: number, episodes: number, episode: number}} at the generation, episodes per generation and the
 *   episode's index in it
 * @returns {number} the train seed of the episode: entry `(generation x episodes + episode + offset) mod seeds.length`
 */
export function episodeSeed(seeds, { generation, episodes, episode, offset = 0 }) {
    return seeds[(generation * episodes + episode + offset) % seeds.length];
}

/**
 * @param {Readonly<Record<string, any>>} config a config
 * @param {number} [nCap] the sample cap (default `TRAINER_N_CAP`)
 * @returns {import('./archive.js').Archive} an empty archive that fits the config's layout and the live policy's descriptor
 */
export function createTrainerArchive(config, nCap = TRAINER_N_CAP) {
    return createArchive(brainLayout(config), { descriptor: TRAINER_DESCRIPTOR, nCap });
}

/**
 * Copies an offer so it outlives the policy's reused object.
 * @param {Record<string, any>} item the policy's offer
 * @param {number} tick the tick of the death
 * @returns {TrainOffer} the copy
 */
function copyOffer(item, tick) {
    return {
        spec: item.spec,
        cell: item.cell,
        row: Float32Array.from(item.row),
        sigma: item.sigma,
        id: item.id,
        fitness: item.fitness,
        isClone: item.isClone === true,
        archiveRef: item.archiveRef,
        refId: item.refId,
        tick,
    };
}

/**
 * @param {ArrayLike<number>} values numbers
 * @returns {number} their sum
 */
function sum(values) {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
        total += values[i];
    }
    return total;
}

/**
 * @param {readonly string[]} names the metrics to read
 * @param {{observer: Record<string, any>, world: Record<string, any>, policy: Record<string, any>}} run the finished run
 * @returns {Record<string, number | null>} each metric's value (null when it has none)
 */
function metricValues(names, { observer, world, policy }) {
    if (names.length === 0) {
        return {};
    }
    const all = computeMetrics(observer, world, {
        fitness: policy.fitness,
        fitnessName: policy.fitnessName,
        archive: policy.archive,
    });
    return Object.fromEntries(names.map((name) => [name, all[name]?.value ?? null]));
}

/**
 * Runs one episode: a world on `seed`, seeded from the frozen archive by the policy, observed like an eval run. The
 * policy's offers are collected, in the order the policy makes them, not applied.
 * @param {EpisodeTask} task the task
 * @returns {{offers: TrainOffer[], cursors: Int32Array, ticks: number, population: number, births: number,
 *   metrics: Record<string, number | null>}} the offers from `offerFromTick` on, the frozen copy's clone cursors after
 *   the episode, the world's end state and the asked-for metrics (`{}` when none)
 * @throws {Error} naming the seed and tick when a step fails
 */
export function runEpisode(task) {
    const { seed, overrides, snapshot, ticks = EPISODE_TICKS, offerFromTick = OFFER_FROM_TICK } = task;
    const config = createConfig({ initialAgents: EPISODE_AGENTS, ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'), {
        runTicks: ticks,
        checkpointTicks: CHECKPOINT_TICKS,
    });
    const archive = restoreArchive(snapshot, config, { descriptor: TRAINER_DESCRIPTOR, nCap: TRAINER_N_CAP });
    /** @type {TrainOffer[]} */
    const offers = [];
    const onOffer = (/** @type {Record<string, any>} */ item, /** @type {number} */ tick) => {
        if (tick >= offerFromTick) {
            offers.push(copyOffer(item, tick));
        }
    };
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(task.policy ?? LIVE_POLICY).create({ config, log, observer, archive, onOffer });
    const world = createWorld(config, policy.brain);
    try {
        feedPolicy({ policy, observer }, world);
        const phases = observerPhases(observer);
        for (let t = 0; t < ticks; t++) {
            step(world, policy.brain, phases);
            feedPolicy({ policy, observer }, world);
            if (world.tick % CHECKPOINT_TICKS === 0) {
                checkpoint(observer, world);
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed} failed at tick ${world.tick}: ${message}`, { cause: error });
    }
    return {
        offers,
        cursors: archive.cursors,
        ticks: world.tick,
        population: world.population,
        births: sum(observer.births),
        metrics: metricValues(task.metrics ?? [], { observer, world, policy }),
    };
}

/**
 * Applies an episode's offers to the archive, in the order they were made, and takes the episode's clone cursors so
 * the next generation's clones do not all start from cell 0.
 * @param {import('./archive.js').Archive} archive the archive
 * @param {{offers: TrainOffer[], cursors: Int32Array}} episode a `runEpisode` result
 * @param {import('../sim/log.js').SimLog} [log] receives the archive's `ArchiveReplaced` and `ChallengerSet`
 * @returns {Record<string, number>} how many offers had each outcome (`offer`'s return values)
 */
export function mergeEpisode(archive, { offers, cursors }, log) {
    /** @type {Record<string, number>} */
    const outcomes = {};
    for (const item of offers) {
        const outcome = offer(archive, item, log);
        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    archive.cursors.set(cursors);
    return outcomes;
}
