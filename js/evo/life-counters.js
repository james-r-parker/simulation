// Life counters: per-slot counters beside the evals observer that the v1 fitness and the archive descriptor read.
// Updated in the policy's `afterStep`, after `step` and after `observe`. Pure: reads the world, never steps it.
//
// Births: `updateLifeCounters` reads the tick's `AgentBorn` records and zeroes each newborn's slot first, in record
// order, so a slot freed and refilled in one tick keeps only the last newborn's counters (like the observer).
// `resetLifeSlot` is exported for callers that track births themselves.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { isKin } from '../sim/kin.js';
import { specParams } from '../sim/spec-params.js';
import { clearCells, createCellGrid, markCell } from './cell-grid.js';

/** Grid cell edge, in world px, for `cells300`. */
export const LIFE_CELL_SIZE = 300;
/** `cells300` is sampled when `world.tick` divides by this. */
export const LIFE_CELL_SAMPLE_TICKS = 10;
/** `crowdingMean` is sampled when `world.tick` divides by this. */
export const CROWDING_SAMPLE_TICKS = 100;
/** A kin agent within this distance (px) of a bitten agent makes the bite count as absorbed. */
export const KIN_RANGE = 300;

const FIRST_AGENT_CHANNEL = 2;
const LAST_AGENT_CHANNEL = 5;
/** After a step, `bittenTimer` is 1 exactly when `feed` reset it this tick (`applyCosts` then adds 1). */
const BITTEN_THIS_TICK = 1;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} fresh counters, all zero
 */
export function createLifeCounters(config) {
    const n = config.maxAgents;
    return {
        ...createCellGrid(config, LIFE_CELL_SIZE, n),
        cells300: new Uint32Array(n),
        kinBitesAbsorbed: new Float64Array(n),
        crowdingSum: new Float64Array(n),
        crowdingSamples: new Uint32Array(n),
    };
}

/**
 * Zeroes every counter of a slot.
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetLifeSlot(counters, slot) {
    counters.cells300[slot] = 0;
    counters.kinBitesAbsorbed[slot] = 0;
    counters.crowdingSum[slot] = 0;
    counters.crowdingSamples[slot] = 0;
    clearCells(counters, slot);
}

/**
 * @param {Record<string, any>} observer the eval observer
 * @param {number} slot the slot
 * @returns {number} the mean of the observer's speed samples, each already clamped to 1; 0 with no samples
 */
export function speedMean(observer, slot) {
    const samples = observer.samples[slot];
    return samples === 0 ? 0 : Math.min(1, observer.speedSum[slot] / samples);
}

/**
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot
 * @returns {number} the mean crowding sample in 0..1; 0 with no samples
 */
export function crowdingMean(counters, slot) {
    const samples = counters.crowdingSamples[slot];
    return samples === 0 ? 0 : counters.crowdingSum[slot] / samples;
}

/**
 * Marks the agent's 300 px cell and counts it when new.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {void}
 */
function visitCell(counters, world, slot) {
    if (markCell(counters, slot, world.x[slot], world.y[slot])) {
        counters.cells300[slot] += 1;
    }
}

/**
 * Adds a crowding sample: the highest proximity among rays that hit an agent (channels 2..5), or 0.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {void}
 */
function sampleCrowding(counters, world, slot) {
    const stride = world.layout.rawInputCount;
    let best = 0;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = slot * stride + k * RAY_CHANNELS;
        for (let c = FIRST_AGENT_CHANNEL; c <= LAST_AGENT_CHANNEL; c++) {
            if (world.inputs[base + c] > 0 && world.inputs[base] > best) {
                best = world.inputs[base];
            }
        }
    }
    counters.crowdingSum[slot] += best;
    counters.crowdingSamples[slot] += 1;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a bitten agent
 * @returns {boolean} true when another alive agent that is kin of `slot` is within `KIN_RANGE` px
 */
function kinNear(world, slot) {
    const { alive, x, y } = world;
    for (let other = 0; other < alive.length; other++) {
        if (alive[other] !== 1 || other === slot) {
            continue;
        }
        const dx = x[other] - x[slot];
        const dy = y[other] - y[slot];
        if (dx * dx + dy * dy <= KIN_RANGE * KIN_RANGE && isKin(world, slot, other)) {
            return true;
        }
    }
    return false;
}

/**
 * Credits a bite absorbed with kin near. The core does not expose the victim's loss, so this is the nominal bite
 * (`config.biteEnergy x biteTakenMultiplier`); several bites on one tick count once. Only agents bitten this tick
 * pay for the kin scan.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {void}
 */
function absorbBite(counters, world, slot) {
    if (world.bittenTimer[slot] === BITTEN_THIS_TICK && kinNear(world, slot)) {
        counters.kinBitesAbsorbed[slot] +=
            world.config.biteEnergy * specParams(world.config, world.spec[slot]).biteTakenMultiplier;
    }
}

/**
 * Resets the slot of every `AgentBorn` record of the tick.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function resetNewborns(counters, world) {
    const d = world.events.data;
    for (let i = 0; i < world.events.count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_BORN) {
            resetLifeSlot(counters, d[i * EVENT_STRIDE + 2]);
        }
    }
}

/**
 * Updates the counters of every alive agent from the world after a step (and after `observe`).
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function updateLifeCounters(counters, world) {
    resetNewborns(counters, world);
    if (world.tick === 0) {
        return;
    }
    const cellTick = world.tick % LIFE_CELL_SAMPLE_TICKS === 0;
    const crowdTick = world.tick % CROWDING_SAMPLE_TICKS === 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        absorbBite(counters, world, slot);
        if (cellTick) {
            visitCell(counters, world, slot);
        }
        if (crowdTick) {
            sampleCrowding(counters, world, slot);
        }
    }
}
