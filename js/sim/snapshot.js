// Packs the renderable part of a world (alive agents, alive food, obstacles, smoke clouds and, when asked, each
// agent's ray proximities) into one ArrayBuffer.

import { OUTPUT_INDEX, RAY_CHANNELS } from './brain-layout.js';
import { FOOD_KIND } from './carcass.js';
import { SEX } from './sex.js';
import { specParams } from './spec-params.js';
import { terrainRockCount } from './terrain.js';

const HEADER_WORDS = 6;
const AGENT_STRIDE = 12;
const FOOD_STRIDE = 3;
const OBSTACLE_STRIDE = 3;
const CLOUD_STRIDE = 3;
const WORD_BYTES = 4;

/** Header word 5: the ray count written per agent, 0 when the ray part is absent. */
const RAY_COUNT_WORD = 5;

/**
 * The bit layout of an agent's `flags` word. `ate` and `bitten` are timers (0 to `TIMER_CAP`, 1 on the tick it
 * happened) in 5-bit fields; the rest are single bits.
 */
export const SNAPSHOT_FLAG = Object.freeze({
    ATE_SHIFT: 0,
    BITTEN_SHIFT: 5,
    TIMER_MASK: 0x1f,
    JAW_OPEN: 1 << 10,
    ALARMING: 1 << 11,
    HUNT_CALLING: 1 << 12,
    PREGNANT: 1 << 13,
    MALE: 1 << 14,
});

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {number} the words every part needs at its maximum
 */
function maxWords(config) {
    return (
        HEADER_WORDS +
        config.maxAgents * (AGENT_STRIDE + config.rayCount) +
        config.maxFood * FOOD_STRIDE +
        terrainRockCount(config) * OBSTACLE_STRIDE +
        config.maxClouds * CLOUD_STRIDE
    );
}

/**
 * Sizes the snapshot buffer for a config.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {{bytes: number, headerWords: number, agentStride: number, foodStride: number, obstacleStride: number, cloudStride: number, rayStride: number}}
 *   `bytes` covers every part at its maximum, rays included; `rayStride` is the words per agent in the ray part
 */
export function snapshotLayout(config) {
    return {
        bytes: maxWords(config) * WORD_BYTES,
        headerWords: HEADER_WORDS,
        agentStride: AGENT_STRIDE,
        foodStride: FOOD_STRIDE,
        obstacleStride: OBSTACLE_STRIDE,
        cloudStride: CLOUD_STRIDE,
        rayStride: config.rayCount,
    };
}

/**
 * Creates the two views `writeSnapshot` writes through. Make them once per buffer: `writeSnapshot` allocates nothing.
 * @param {ArrayBuffer} buffer the snapshot buffer
 * @returns {{f32: Float32Array, u32: Uint32Array}}
 */
export function createSnapshotViews(buffer) {
    return { f32: new Float32Array(buffer), u32: new Uint32Array(buffer) };
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot an alive agent
 * @returns {number} the agent's `flags` word
 */
function agentFlags(world, slot) {
    const { ateTimer, bittenTimer, outputs, alarmTimer, huntTimer, pregnancy, sex } = world;
    let flags = (ateTimer[slot] << SNAPSHOT_FLAG.ATE_SHIFT) | (bittenTimer[slot] << SNAPSHOT_FLAG.BITTEN_SHIFT);
    if (
        outputs[slot * world.layout.outputCount + OUTPUT_INDEX.BITE] > 0 &&
        specParams(world.config, world.spec[slot]).canHunt
    ) {
        flags |= SNAPSHOT_FLAG.JAW_OPEN;
    }
    if (alarmTimer[slot] > 0) {
        flags |= SNAPSHOT_FLAG.ALARMING;
    }
    if (huntTimer[slot] > 0) {
        flags |= SNAPSHOT_FLAG.HUNT_CALLING;
    }
    if (pregnancy[slot] > 0) {
        flags |= SNAPSHOT_FLAG.PREGNANT;
    }
    if (sex[slot] === SEX.MALE) {
        flags |= SNAPSHOT_FLAG.MALE;
    }
    return flags;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {{f32: Float32Array, u32: Uint32Array}} views the buffer views
 * @returns {number} the next free word
 */
function writeAgents(world, { f32, u32 }) {
    const { alive, x, y, angle, size, energy, spec, lineageId, genomeId, temperature, vx, vy } = world;
    const { maxEnergy, temperatureMax } = world.config;
    let w = HEADER_WORDS;
    let count = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            f32[w] = x[slot];
            f32[w + 1] = y[slot];
            f32[w + 2] = angle[slot];
            f32[w + 3] = size[slot];
            f32[w + 4] = energy[slot] / maxEnergy;
            u32[w + 5] = spec[slot];
            u32[w + 6] = lineageId[slot];
            u32[w + 7] = genomeId[slot];
            u32[w + 8] = slot;
            f32[w + 9] = temperature[slot] / temperatureMax;
            f32[w + 10] = Math.sqrt(vx[slot] * vx[slot] + vy[slot] * vy[slot]);
            u32[w + 11] = agentFlags(world, slot);
            w += AGENT_STRIDE;
            count += 1;
        }
    }
    u32[1] = count;
    return w;
}

/**
 * Writes the alive food as `x`, `y`, radius. A carcass has its radius written negative, so the layout is the same
 * with carcasses off.
 * @param {import('./world.js').World} world the world
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word of the section
 * @returns {number} the next free word
 */
function writeFood(world, f32, start) {
    const { foodAlive, foodX, foodY, foodRadius } = world;
    let w = start;
    for (let slot = 0; slot < foodAlive.length; slot++) {
        if (foodAlive[slot] === 1) {
            f32[w] = foodX[slot];
            f32[w + 1] = foodY[slot];
            f32[w + 2] = world.foodKind[slot] === FOOD_KIND.MEAT ? -foodRadius[slot] : foodRadius[slot];
            w += FOOD_STRIDE;
        }
    }
    return w;
}

/**
 * Writes the live clouds in index order: `x`, `y` and the remaining life as a share of `smokeTicks`.
 * @param {import('./world.js').World} world the world
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word of the section
 * @returns {void}
 */
function writeClouds(world, f32, start) {
    const { cloudX, cloudY, cloudTtl, cloudCount } = world;
    const { smokeTicks } = world.config;
    let w = start;
    for (let i = 0; i < cloudCount; i++) {
        f32[w] = cloudX[i];
        f32[w + 1] = cloudY[i];
        f32[w + 2] = cloudTtl[i] / smokeTicks;
        w += CLOUD_STRIDE;
    }
}

/**
 * Writes each alive agent's ray proximities (channel 0 of its inputs row) in agent order.
 * @param {import('./world.js').World} world the world
 * @param {Float32Array} f32 the float view
 * @param {number} start the first word of the section
 * @returns {void}
 */
function writeRays(world, f32, start) {
    const { alive, inputs } = world;
    const { rayCount } = world.config;
    const stride = world.layout.inputCount;
    let w = start;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            const row = slot * stride;
            for (let k = 0; k < rayCount; k++) {
                f32[w + k] = inputs[row + k * RAY_CHANNELS];
            }
            w += rayCount;
        }
    }
}

/**
 * Writes the world into the buffer: header, alive agents by ascending slot, alive food, obstacles, live clouds and,
 * when `withRays` is set, each alive agent's ray proximities in agent order. Header word 5 is the ray count written.
 * @param {import('./world.js').World} world the world
 * @param {{f32: Float32Array, u32: Uint32Array}} views views from `createSnapshotViews`
 * @param {boolean} [withRays] write the ray part
 * @returns {void}
 */
export function writeSnapshot(world, views, withRays = false) {
    const { f32, u32 } = views;
    const { rayCount } = world.config;
    const obstacleCount = terrainRockCount(world.config);
    const need = maxWords(world.config) * WORD_BYTES;
    if (f32.byteLength < need) {
        throw new Error(`writeSnapshot: buffer holds ${f32.byteLength} bytes, the config needs ${need}`);
    }
    u32[0] = world.tick;
    const foodStart = writeAgents(world, views);
    const obstacleStart = writeFood(world, f32, foodStart);
    u32[2] = (obstacleStart - foodStart) / FOOD_STRIDE;
    let w = obstacleStart;
    for (let i = 0; i < obstacleCount; i++) {
        f32[w] = world.obsX[i];
        f32[w + 1] = world.obsY[i];
        f32[w + 2] = world.obsRadius[i];
        w += OBSTACLE_STRIDE;
    }
    u32[3] = obstacleCount;
    u32[4] = world.cloudCount;
    writeClouds(world, f32, w);
    u32[RAY_COUNT_WORD] = withRays ? rayCount : 0;
    if (withRays) {
        writeRays(world, f32, w + world.cloudCount * CLOUD_STRIDE);
    }
}
