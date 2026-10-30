// The brain instruments in one place: the pools the observer carries, the per-tick, checkpoint, death and slot hooks
// that feed them, and the eighteen metrics they report (brain-capacity-and-memory.md, Metrics). Observational: nothing in
// `js/sim/` reads any of it, and none of it draws.

import { brainLayout } from '../sim/brain-layout.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { createInputActivity, sampleInputActivity } from '../sim/input-activity.js';
import { createHebbPools, HEBB_DIRECTIONS, hebbMetrics, sampleHebb } from './metrics-hebb.js';
import {
    createLeakSkillPools,
    LEAK_SKILL_DIRECTIONS,
    leakSkillMetrics,
    noteLeakSkillDeath,
} from './metrics-leak-skill.js';
import { createMemoryPools, MEMORY_DIRECTIONS, memoryMetrics, sampleMemory, snapshotHidden } from './metrics-memory.js';
import {
    createMemoryOutPools,
    MEMORY_OUT_DIRECTIONS,
    memoryOutMetrics,
    noteMemoryOutDeath,
    resetMemoryOutSlot,
    sampleMemoryOut,
} from './metrics-memory-out.js';
import { createWeightPools, sampleWeights, WEIGHT_DIRECTIONS, weightMetrics } from './metrics-weights.js';
import { createSaturation, resetSaturationSlot, sampleSaturation } from './rare-saturation.js';

/** The direction of each of the eighteen metrics. */
export const BRAIN_DIRECTIONS = Object.freeze({
    ...MEMORY_DIRECTIONS,
    ...MEMORY_OUT_DIRECTIONS,
    ...LEAK_SKILL_DIRECTIONS,
    ...HEBB_DIRECTIONS,
    ...WEIGHT_DIRECTIONS,
});

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{checkpointTicks?: number}} [options] the observer's options; `checkpointTicks` is the run's checkpoint
 *   interval, which times the 16-tick hidden-state snapshot
 * @returns {Record<string, any>} the pools to spread onto the observer, and `sampled`, the checkpoint's sampled slots
 */
export function createBrainPools(config, options = {}) {
    const layout = brainLayout(config);
    return {
        sampled: new Int32Array(0),
        memory: createMemoryPools(config, options),
        memoryOut: createMemoryOutPools(config),
        leakSkill: createLeakSkillPools(),
        hebb: createHebbPools(),
        activity: createInputActivity(layout),
        saturation: createSaturation(config, layout),
        weightPools: createWeightPools(),
    };
}

/**
 * Reads the world's input-activity sample (`world.inputActivity`, filled by the step), so the metric and the silent mask
 * a birth decays come from one sample; a world without one (a test double) is sampled here.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function shareInputActivity(observer, world) {
    if (world.inputActivity === undefined) {
        sampleInputActivity(observer.activity, world);
    } else {
        observer.activity = world.inputActivity;
    }
}

/**
 * The per-tick hooks. Call after every step but the first, with the world's new tick.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function observeBrain(observer, world) {
    snapshotHidden(observer.memory, /** @type {any} */ (observer), world);
    sampleMemoryOut(observer.memoryOut, world);
    shareInputActivity(observer, world);
    sampleSaturation(observer.saturation, { activity: observer.activity, world });
}

/**
 * The checkpoint samplers, over the agents `diversity` sampled. Call once per checkpoint, after `diversity`.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleBrainCheckpoint(observer, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    sampleMemory(observer.memory, observer, world);
    sampleHebb(observer.hebb, observer, world);
    sampleWeights(observer.weightPools, observer, world);
}

/**
 * Takes a death into the life statistics. Call for deaths at or after burn-in, before the slot is reset.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @param {{slot: number, genomeId: number, ageTicks: number}} death the dying agent
 * @returns {void}
 */
export function noteBrainDeath(observer, world, death) {
    noteMemoryOutDeath(observer.memoryOut, death.slot, death.ageTicks);
    noteLeakSkillDeath(observer.leakSkill, { observer, world }, death);
}

/**
 * Clears a slot's brain counters, for a newborn or a reused slot.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetBrainSlot(observer, slot) {
    resetMemoryOutSlot(observer.memoryOut, slot);
    resetSaturationSlot(observer.saturation, slot);
}

/**
 * @param {Record<string, any>} observer the observer, checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the eighteen metrics
 */
export function brainMetrics(observer) {
    return {
        ...memoryMetrics(observer),
        ...memoryOutMetrics(observer),
        ...leakSkillMetrics(observer),
        ...hebbMetrics(observer),
        ...weightMetrics(observer),
    };
}
