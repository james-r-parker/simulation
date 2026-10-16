// Packs the renderable part of a world (alive agents, alive food, obstacles, smoke clouds) into one ArrayBuffer.

const HEADER_WORDS = 5;
const AGENT_STRIDE = 9;
const FOOD_STRIDE = 3;
const OBSTACLE_STRIDE = 3;
const CLOUD_STRIDE = 3;
const WORD_BYTES = 4;

/**
 * Sizes the snapshot buffer for a config.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {{bytes: number, headerWords: number, agentStride: number, foodStride: number, obstacleStride: number, cloudStride: number}}
 */
export function snapshotLayout(config) {
    const words =
        HEADER_WORDS +
        config.maxAgents * AGENT_STRIDE +
        config.maxFood * FOOD_STRIDE +
        config.obstacleCount * OBSTACLE_STRIDE +
        config.maxClouds * CLOUD_STRIDE;
    return {
        bytes: words * WORD_BYTES,
        headerWords: HEADER_WORDS,
        agentStride: AGENT_STRIDE,
        foodStride: FOOD_STRIDE,
        obstacleStride: OBSTACLE_STRIDE,
        cloudStride: CLOUD_STRIDE,
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
 * @param {{f32: Float32Array, u32: Uint32Array}} views the buffer views
 * @returns {number} the next free word
 */
function writeAgents(world, { f32, u32 }) {
    const { alive, x, y, angle, size, energy, spec, lineageId, genomeId } = world;
    const maxEnergy = world.config.maxEnergy;
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
            w += AGENT_STRIDE;
            count += 1;
        }
    }
    u32[1] = count;
    return w;
}

/**
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
            f32[w + 2] = foodRadius[slot];
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
 * Writes the world into the buffer: header, alive agents by ascending slot, alive food, obstacles, live clouds.
 * @param {import('./world.js').World} world the world
 * @param {{f32: Float32Array, u32: Uint32Array}} views views from `createSnapshotViews`
 * @returns {void}
 */
export function writeSnapshot(world, views) {
    const { f32, u32 } = views;
    const { maxAgents, maxFood, obstacleCount, maxClouds } = world.config;
    const need =
        (HEADER_WORDS +
            maxAgents * AGENT_STRIDE +
            maxFood * FOOD_STRIDE +
            obstacleCount * OBSTACLE_STRIDE +
            maxClouds * CLOUD_STRIDE) *
        WORD_BYTES;
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
}
