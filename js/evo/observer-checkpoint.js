// The observer's checkpoint: population, lineages, dominant lineage, predator share and genome diversity.

import { nextInt } from '../sim/rng.js';
import { ensureRoom } from './growable-log.js';
import { sampleBody } from './metrics-body.js';
import { sampleEnvironment } from './metrics-environment.js';
import { BURN_IN_TICKS } from './observer-events.js';

/** Alive agents are counted per lineage; the dominant lineage must lead by at least this many agents. */
export const DOMINANCE_MARGIN = 2;

/** Most agents compared for diversity. */
export const DIVERSITY_SAMPLE = 64;

/**
 * Updates the dominant lineage: the lineage with the most agents when it leads the runner-up by at least
 * `DOMINANCE_MARGIN`, else the previous one (so ties keep it).
 * @param {Record<string, any>} observer the observer
 * @param {Map<number, number>} counts agents per lineage
 * @returns {number} the dominant lineage id, 0 when none yet
 */
function dominantLineage(observer, counts) {
    let leader = 0;
    let top = 0;
    let second = 0;
    for (const [lineage, n] of counts) {
        if (n > top) {
            second = top;
            top = n;
            leader = lineage;
        } else if (n > second) {
            second = n;
        }
    }
    if (top - second >= DOMINANCE_MARGIN) {
        observer.dominantLineage = leader;
    }
    return observer.dominantLineage;
}

/** Specialisation indices fit this many counters (the checkpoint's `specMask` is a 32-bit set). */
export const SPEC_SLOTS = 32;

/**
 * @returns {{specSamples: Float64Array, lineageSamples: Map<number, number>}} empty dominance pools
 */
export function createDominancePools() {
    return { specSamples: new Float64Array(SPEC_SLOTS), lineageSamples: new Map() };
}

/**
 * Adds one checkpoint's alive agents per lineage to the run-long map that `eval.lineage_dominance` and
 * `eval.lineage_effective` read. Runs once per checkpoint at or after `BURN_IN_TICKS`: it may add map entries, but
 * nothing per tick.
 * @param {{lineageSamples: Map<number, number>}} pools the pools
 * @param {Map<number, number>} counts alive agents per lineage at this checkpoint
 * @returns {void}
 */
function poolLineages(pools, counts) {
    for (const [lineage, n] of counts) {
        pools.lineageSamples.set(lineage, (pools.lineageSamples.get(lineage) ?? 0) + n);
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {import('../sim/rng.js').Rng} rng the stream to draw from
 * @returns {Int32Array} up to `DIVERSITY_SAMPLE` alive slots drawn without replacement
 */
function sampleSlots(world, rng) {
    /** @type {number[]} */
    const alive = [];
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            alive.push(slot);
        }
    }
    const m = Math.min(DIVERSITY_SAMPLE, alive.length);
    for (let i = 0; i < m; i++) {
        const j = i + nextInt(rng, alive.length - i);
        [alive[i], alive[j]] = [alive[j], alive[i]];
    }
    return Int32Array.from(alive.slice(0, m));
}

/**
 * Mean pairwise L2 distance between the weight rows of a sample of alive agents over `sqrt(weightCount)`.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {number} the diversity, NaN when fewer than 2 agents are alive
 */
export function diversity(observer, world) {
    if (world.population < 2) {
        return NaN;
    }
    const slots = sampleSlots(world, observer.rng);
    const n = world.layout.weightCount;
    const w = world.weights;
    let total = 0;
    for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
            let sum = 0;
            for (let k = 0; k < n; k++) {
                const delta = w[slots[i] * n + k] - w[slots[j] * n + k];
                sum += delta * delta;
            }
            total += Math.sqrt(sum);
        }
    }
    const pairs = (slots.length * (slots.length - 1)) / 2;
    return total / pairs / Math.sqrt(n);
}

/**
 * Appends a checkpoint row for the world's current tick.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function checkpoint(observer, world) {
    /** @type {Map<number, number>} */
    const counts = new Map();
    const predator = world.config.specialisations.predator.index;
    let predators = 0;
    let specMask = 0;
    let archiveAgents = 0;
    const pooled = world.tick >= BURN_IN_TICKS;
    const { dominance } = observer;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            counts.set(world.lineageId[slot], (counts.get(world.lineageId[slot]) ?? 0) + 1);
            predators += world.spec[slot] === predator ? 1 : 0;
            specMask |= 1 << world.spec[slot];
            dominance.specSamples[world.spec[slot]] += pooled ? 1 : 0;
            archiveAgents += observer.archiveLineage[slot];
        }
    }
    if (pooled) {
        poolLineages(dominance, counts);
        sampleBody(observer.body, world);
        sampleEnvironment(observer.environment, world);
    }
    const log = observer.series;
    const row = observer.checkpointCount;
    ensureRoom(log, row);
    log.tick[row] = world.tick;
    log.population[row] = world.population;
    log.lineagesAlive[row] = counts.size;
    log.dominantLineage[row] = dominantLineage(observer, counts);
    log.predatorShare[row] = world.population > 0 ? predators / world.population : 0;
    log.diversity[row] = diversity(observer, world);
    log.specMask[row] = specMask;
    log.archiveAgents[row] = archiveAgents;
    observer.checkpointCount = row + 1;
}
