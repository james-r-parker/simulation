// The scripted controllers of the discrimination scenes. Each scene has two: one reads the raw rays and may use every
// ray, the other reads only the pooled row (the two strongest hits per channel). Both aim with the same `steer`.

import { HIT_STRIDE, OUTPUT_INDEX, RAY_CHANNELS, inputOffsets } from '../sim/brain-layout.js';
import { setOutput, write } from './scripted-parts.js';

const CH_FOOD = 1;
const CH_THREAT = 2;
const CH_OBSTACLE = 7;
const AIM_GAIN = 4;
const SEEK_THRUST = 0.5;
const CORRIDOR_THRUST = 0.5;
const CORRIDOR_GAIN = 1.5;
const EPSILON = 1e-9;
/** The pooled indices only; the ray count does not move them. */
const POOLED_AT = inputOffsets({ rayCount: 0 }).pooled;

/**
 * @param {number} value a number
 * @returns {number} the value limited to -1 to 1
 */
function clamp1(value) {
    return Math.max(-1, Math.min(1, value));
}

/**
 * The turn output towards a direction given by its cosine and sine in the agent's frame (positive sine is the positive
 * turn side): proportional near the heading, full turn when the direction is behind.
 * @param {number} cos the direction's cosine
 * @param {number} sin the direction's sine
 * @returns {number} the turn output
 */
export function steer(cos, sin) {
    if (cos >= 0) {
        return clamp1(AIM_GAIN * sin);
    }
    return sin >= 0 ? 1 : -1;
}

const sum = { x: 0, y: 0, n: 0 };

/**
 * Sums, over the rays that hit a channel, proximity times the ray's cosine and sine.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} channel a ray channel (1 to 8)
 * @returns {{x: number, y: number, n: number}} the weighted sums and the hits counted; a reused object
 */
function rayVector(world, slot, channel) {
    const row = slot * world.layout.rawInputCount;
    sum.x = 0;
    sum.y = 0;
    sum.n = 0;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = row + k * RAY_CHANNELS;
        if (world.inputs[base + channel] > 0) {
            sum.x += world.inputs[base] * world.rayCos[k];
            sum.y += world.inputs[base] * world.raySin[k];
            sum.n += 1;
        }
    }
    return sum;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} channel a ray channel (1 to 8)
 * @returns {number} the ray index of the strongest hit of the channel, or -1
 */
function strongestRay(world, slot, channel) {
    const row = slot * world.layout.rawInputCount;
    let best = -1;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = row + k * RAY_CHANNELS;
        if (
            world.inputs[base + channel] > 0 &&
            (best < 0 || world.inputs[base] > world.inputs[row + best * RAY_CHANNELS])
        ) {
            best = k;
        }
    }
    return best;
}

const hit = { s: 0, cos: 0, sin: 0 };

/**
 * Reads one hit of a pooled channel: its strength, cosine and sine.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {string} name a pooled channel name
 * @param {number} [which] 0 for the strongest hit, 1 for the second
 * @returns {{s: number, cos: number, sin: number}} the three values; a reused object
 */
function pooledHit(world, slot, name, which = 0) {
    const at = slot * world.layout.inputCount + POOLED_AT[name] + which * HIT_STRIDE;
    hit.s = world.pooled[at];
    hit.cos = world.pooled[at + 1];
    hit.sin = world.pooled[at + 2];
    return hit;
}

/**
 * Seeks the nearest food. Reading the raw rays or the pooled row gives the same aim.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {boolean} pooled whether to read the pooled row
 * @returns {void}
 */
export function seekFood(world, slot, pooled) {
    if (pooled) {
        const food = pooledHit(world, slot, 'food');
        write(world, slot, SEEK_THRUST, food.s > 0 ? steer(food.cos, food.sin) : 0);
        return;
    }
    const k = strongestRay(world, slot, CH_FOOD);
    write(world, slot, SEEK_THRUST, k < 0 ? 0 : steer(world.rayCos[k], world.raySin[k]));
}

/**
 * Flees at full thrust. The raw controller runs away from the proximity-weighted sum of every threat ray, so two
 * threats on different sides cancel into straight ahead; the pooled one runs away from the same sum over its two strongest threat hits.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {boolean} pooled whether to read the pooled row
 * @returns {void}
 */
export function flee(world, slot, pooled) {
    let x;
    let y;
    if (pooled) {
        const first = pooledHit(world, slot, 'threat');
        x = first.s * first.cos;
        y = first.s * first.sin;
        const second = pooledHit(world, slot, 'threat', 1);
        x += second.s * second.cos;
        y += second.s * second.sin;
    } else {
        const v = rayVector(world, slot, CH_THREAT);
        x = v.x;
        y = v.y;
    }
    const length = Math.sqrt(x * x + y * y);
    write(world, slot, 1, length < EPSILON ? 0 : steer(-x / length, -y / length));
    setOutput(world, slot, OUTPUT_INDEX.SPRINT, 1);
}

/**
 * Drives down a passage between two rows of rocks, away from the rocks. The raw controller balances the proximity of
 * every rock ray on each side; the pooled one does the same over its two strongest rock hits.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {boolean} pooled whether to read the pooled row
 * @returns {void}
 */
export function followCorridor(world, slot, pooled) {
    let lateral;
    if (pooled) {
        const first = pooledHit(world, slot, 'obstacle');
        const firstLateral = first.s * first.sin;
        const second = pooledHit(world, slot, 'obstacle', 1);
        lateral = (firstLateral + second.s * second.sin) / (second.s > 0 ? 2 : 1);
    } else {
        const v = rayVector(world, slot, CH_OBSTACLE);
        lateral = v.y / Math.max(1, v.n);
    }
    write(world, slot, CORRIDOR_THRUST, clamp1(-CORRIDOR_GAIN * lateral));
}
