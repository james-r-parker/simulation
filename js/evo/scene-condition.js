// Condition changes the walk (natural-selection.md, Detectors): `eval.condition_gait_shift`. Every 100 ticks after
// burn-in each alive agent's speed and turn rate are added to the sums of its condition: neutral, pregnant
// (`pregnancy` above 0), cold (`temperature` under `temperatureColdModerate`) or starving (`energy` under
// `mateMinEnergy`); an agent in several conditions adds to each. When the agent dies (or at the report, for the living)
// its shift is, over the conditions it has samples in and a neutral mean to compare with, the mean of
// `|speed in the condition - neutral speed| / maxVelocity` and `|turn rate in it - neutral turn rate| / maxTurn`,
// averaged over the conditions. The metric is the mean shift over agents that have both a neutral and a condition
// sample. Per-slot arrays only.

import { none, ok } from './metrics-stats.js';
import { BURN_IN_TICKS } from './burn-in.js';

const NEUTRAL = 0;
const STATES = 4;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty scene: per slot and condition the speed and turn sums and sample counts, and
 *   the shifts of the agents already dead
 */
export function createConditionScene(config) {
    const n = config.maxAgents * STATES;
    return {
        speed: new Float64Array(n),
        turn: new Float64Array(n),
        count: new Uint32Array(n),
        shiftSum: 0,
        agents: 0,
    };
}

/**
 * @param {Record<string, any>} scene the condition scene
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetConditionSlot(scene, slot) {
    scene.speed.fill(0, slot * STATES, (slot + 1) * STATES);
    scene.turn.fill(0, slot * STATES, (slot + 1) * STATES);
    scene.count.fill(0, slot * STATES, (slot + 1) * STATES);
}

/**
 * @param {Record<string, any>} scene the condition scene
 * @param {Readonly<Record<string, any>>} limits the config, for `maxVelocity` and `maxTurn`
 * @param {number} slot the slot
 * @returns {number} the agent's gait shift, or NaN without a neutral sample or a condition sample
 */
export function gaitShift(scene, { maxVelocity, maxTurn }, slot) {
    const base = slot * STATES;
    const neutral = scene.count[base + NEUTRAL];
    let sum = 0;
    let states = 0;
    for (let k = 1; k < STATES; k++) {
        const n = scene.count[base + k];
        if (n > 0 && neutral > 0) {
            const dSpeed = Math.abs(scene.speed[base + k] / n - scene.speed[base] / neutral) / maxVelocity;
            const dTurn = Math.abs(scene.turn[base + k] / n - scene.turn[base] / neutral) / maxTurn;
            sum += (dSpeed + dTurn) / 2;
            states += 1;
        }
    }
    return states > 0 ? sum / states : NaN;
}

/**
 * Moves a dying agent's shift into the totals. Call before the slot is reset.
 * @param {Record<string, any>} scene the condition scene
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} slot the dying agent's slot
 * @returns {void}
 */
export function flushCondition(scene, config, slot) {
    const shift = gaitShift(scene, config, slot);
    if (!Number.isNaN(shift)) {
        scene.shiftSum += shift;
        scene.agents += 1;
    }
}

/**
 * @param {Record<string, any>} scene the condition scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive slot
 * @param {number} k the condition
 * @returns {void}
 */
function add(scene, world, slot, k) {
    const at = slot * STATES + k;
    scene.speed[at] += Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
    scene.turn[at] += world.turnRate[slot];
    scene.count[at] += 1;
}

/**
 * Runs one 100-tick sample at or after burn-in.
 * @param {Record<string, any>} scene the condition scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleCondition(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    const { temperatureColdModerate, mateMinEnergy } = world.config;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const pregnant = world.pregnancy[slot] > 0;
        const cold = world.temperature[slot] < temperatureColdModerate;
        const hungry = world.energy[slot] < mateMinEnergy;
        if (!pregnant && !cold && !hungry) {
            add(scene, world, slot, NEUTRAL);
        }
        if (pregnant) {
            add(scene, world, slot, 1);
        }
        if (cold) {
            add(scene, world, slot, 2);
        }
        if (hungry) {
            add(scene, world, slot, 3);
        }
    }
}

/**
 * @param {Record<string, any>} scene the condition scene
 * @param {Record<string, any>} observer the observer; its tracked slots are the living
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} `eval.condition_gait_shift`
 */
export function conditionMetrics(scene, observer) {
    let sum = scene.shiftSum;
    let agents = scene.agents;
    for (const slot of observer.slotOf.values()) {
        const shift = gaitShift(scene, observer.config, slot);
        sum += Number.isNaN(shift) ? 0 : shift;
        agents += Number.isNaN(shift) ? 0 : 1;
    }
    const reason = 'no agent sampled in both a neutral and a pregnant, cold or starving condition';
    return { 'eval.condition_gait_shift': agents > 0 ? ok(sum / agents) : none(reason) };
}
