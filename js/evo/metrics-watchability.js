// The watchability metrics (fitness-and-selection T48h): the signs that the default world looks like a mess to a viewer
// (agents circling, brain outputs pinned at their limits, alarm spam) and how much energy the living hold against the
// split threshold. Circling is tracked in short windows (`CIRCLE_WINDOW` samples ending every `CIRCLE_PERIOD` ticks)
// over preallocated per-slot arrays; the output and energy samples are taken at each checkpoint after burn-in. All of
// it reads the world and nothing else, so the world hash does not change, and nothing here allocates per tick.

import { OUTPUT_COUNT } from '../sim/brain-layout.js';
import { none, ok, per1k } from './metrics-stats.js';

/** Samples in one circling window (the path has one step fewer). */
export const CIRCLE_WINDOW = 200;

/** A circling window ends when `world.tick` divides by this. */
export const CIRCLE_PERIOD = 10000;

/** A window needs more path than this (px) to count as circling. */
export const CIRCLE_MIN_PATH = 100;

/** Net displacement must be under this share of the path. */
export const CIRCLE_MAX_NET = 0.25;

/** Total signed heading change must exceed this (radians). */
export const CIRCLE_MIN_TURN = 4 * Math.PI;

/** An output is saturated when its magnitude is above this. */
export const SATURATED = 0.95;

/** The direction of each watchability metric, as the metrics table names them. */
export const WATCHABILITY_DIRECTIONS = Object.freeze({
    'eval.circling_share': 'lower',
    'eval.output_saturation': 'lower',
    'eval.alarm_rate': 'lower',
    'eval.mean_energy_share': 'watch',
    'eval.energy_over_split': 'watch',
});

const NO_WINDOW = 'no circling span after burn-in with a tracked agent';
const NO_SAMPLE = 'no checkpoint after burn-in with an alive agent';
const FIRST = CIRCLE_PERIOD - CIRCLE_WINDOW + 1;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} empty pools: the per-slot window state, and the sums the metrics read
 */
export function createWatchabilityPools(config) {
    const n = config.maxAgents;
    return {
        genomeId: new Float64Array(n),
        startX: new Float64Array(n),
        startY: new Float64Array(n),
        lastX: new Float64Array(n),
        lastY: new Float64Array(n),
        lastAngle: new Float64Array(n),
        path: new Float64Array(n),
        turn: new Float64Array(n),
        tracked: 0,
        circling: 0,
        agents: 0,
        saturationSum: 0,
        energyShareSum: 0,
        overSplitSum: 0,
    };
}

/**
 * Starts a window: every alive agent's position and heading, with zero path and turn.
 * @param {Record<string, any>} pools the pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function startWindow(pools, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        pools.genomeId[slot] = world.alive[slot] === 1 ? world.genomeId[slot] : 0;
        pools.startX[slot] = world.x[slot];
        pools.startY[slot] = world.y[slot];
        pools.lastX[slot] = world.x[slot];
        pools.lastY[slot] = world.y[slot];
        pools.lastAngle[slot] = world.angle[slot];
        pools.path[slot] = 0;
        pools.turn[slot] = 0;
    }
}

/**
 * Adds one step to every tracked agent still alive as the same genome: the distance moved and the signed heading change
 * (wrapped to [-pi, pi]). An agent that died or was replaced drops out of the window.
 * @param {Record<string, any>} pools the pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function stepWindow(pools, world) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (pools.genomeId[slot] === 0) {
            continue;
        }
        if (world.alive[slot] !== 1 || world.genomeId[slot] !== pools.genomeId[slot]) {
            pools.genomeId[slot] = 0;
            continue;
        }
        const dx = world.x[slot] - pools.lastX[slot];
        const dy = world.y[slot] - pools.lastY[slot];
        let delta = world.angle[slot] - pools.lastAngle[slot];
        delta -= delta > Math.PI ? 2 * Math.PI : 0;
        delta += delta < -Math.PI ? 2 * Math.PI : 0;
        pools.path[slot] += Math.sqrt(dx * dx + dy * dy);
        pools.turn[slot] += delta;
        pools.lastX[slot] = world.x[slot];
        pools.lastY[slot] = world.y[slot];
        pools.lastAngle[slot] = world.angle[slot];
    }
}

/**
 * Counts the tracked agents of a finished window, and the ones that circled.
 * @param {Record<string, any>} pools the pools
 * @returns {void}
 */
function endWindow(pools) {
    for (let slot = 0; slot < pools.genomeId.length; slot++) {
        if (pools.genomeId[slot] === 0) {
            continue;
        }
        const path = pools.path[slot];
        const nx = pools.lastX[slot] - pools.startX[slot];
        const ny = pools.lastY[slot] - pools.startY[slot];
        const net = Math.sqrt(nx * nx + ny * ny);
        pools.tracked += 1;
        pools.circling +=
            path > CIRCLE_MIN_PATH && net < CIRCLE_MAX_NET * path && Math.abs(pools.turn[slot]) > CIRCLE_MIN_TURN
                ? 1
                : 0;
    }
}

/**
 * Advances the circling windows by one tick; call once after every step. A window starts `CIRCLE_WINDOW - 1` ticks
 * before a multiple of `CIRCLE_PERIOD` and ends on it; only windows ending at or after `burnIn` count. An agent counts
 * only if it lives the whole window as the same genome.
 * @param {Record<string, any>} pools the pools
 * @param {Record<string, any>} world the world
 * @param {number} burnIn the first tick whose windows count
 * @returns {void}
 */
export function trackCircling(pools, world, burnIn) {
    const phase = world.tick % CIRCLE_PERIOD;
    if (phase === FIRST) {
        startWindow(pools, world);
    } else if (phase > FIRST) {
        stepWindow(pools, world);
    } else if (phase === 0) {
        stepWindow(pools, world);
        if (world.tick >= burnIn) {
            endWindow(pools);
        }
    }
}

/**
 * Adds one checkpoint's alive agents: each one's share of outputs with magnitude above `SATURATED`, its energy over
 * `maxEnergy`, and its energy over its specialisation's split threshold.
 * @param {Record<string, any>} pools the pools
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleWatchability(pools, world) {
    const { maxEnergy } = world.config;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        let saturated = 0;
        for (let k = slot * OUTPUT_COUNT; k < (slot + 1) * OUTPUT_COUNT; k++) {
            saturated += Math.abs(world.outputs[k]) > SATURATED ? 1 : 0;
        }
        pools.agents += 1;
        pools.saturationSum += saturated / OUTPUT_COUNT;
        pools.energyShareSum += world.energy[slot] / maxEnergy;
        pools.overSplitSum += world.energy[slot] / world.splitMinBySpec[world.spec[slot]];
    }
}

/**
 * @param {Record<string, any>} observer the observer, fed every tick and checkpointed
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the five watchability metrics, each `null` with
 *   a reason when nothing could feed it
 */
export function watchabilityMetrics(observer) {
    const p = observer.watchability;
    const sampled = (/** @type {number} */ sum) => (p.agents === 0 ? none(NO_SAMPLE) : ok(sum / p.agents));
    return {
        'eval.circling_share': p.tracked === 0 ? none(NO_WINDOW) : ok(p.circling / p.tracked),
        'eval.output_saturation': sampled(p.saturationSum),
        'eval.alarm_rate': per1k(observer.intent.run.alarms, observer.agentTicks),
        'eval.mean_energy_share': sampled(p.energyShareSum),
        'eval.energy_over_split': sampled(p.overSplitSum),
    };
}
