// Computes the input count and the weight-row offsets of the Elman RNN brain (the pooled-v2 layout) from a config.

/** Outputs per brain: thrust, turn, sprint, mate, bite, alarm, smoke, hunt call, split and two memory outputs. */
export const OUTPUT_COUNT = 11;

/** Index of each output in an agent's output row; an action fires when its output is above 0. */
export const OUTPUT_INDEX = Object.freeze({
    THRUST: 0,
    TURN: 1,
    SPRINT: 2,
    MATE: 3,
    BITE: 4,
    ALARM: 5,
    SMOKE: 6,
    HUNT: 7,
    SPLIT: 8,
    MEMORY_A: 9,
    MEMORY_B: 10,
});

/** Values per ray: proximity, food, can bite me, I can bite it, other, kin, wall, obstacle, smoke. */
export const RAY_CHANNELS = 9;

/** Pooled channels, in order: the ray channels 1 to 8 (food, threat, prey, other, kin, wall, obstacle, smoke). */
export const POOLED_CHANNELS = Object.freeze(['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke']);

/** Values per pooled channel: strength, then the cosine and sine of the strongest ray's angle in the agent's frame. */
export const POOLED_STRIDE = 3;

/** Pooled values at the head of the brain's input row: `POOLED_CHANNELS.length x POOLED_STRIDE`. */
export const POOLED_VALUES = POOLED_CHANNELS.length * POOLED_STRIDE;

/** Body inputs after the ray (or pooled) block: 19 of body and temperature, 13 scent and call inputs, `sex`, 2 memory. */
export const EXTRA_INPUTS = 35;

/**
 * Body input offsets, from the start of the body block: the scent block (antennae, hunt scent, heard calls), the sex
 * input and the two memory read-backs (last tick's `MEMORY_A` and `MEMORY_B`).
 */
export const BODY_INPUT = Object.freeze({
    SCENT: 19,
    HUNT_SCENT: 23,
    HEARD_ALARM: 26,
    HEARD_HUNT: 29,
    SEX: 32,
    MEMORY_A: 33,
    MEMORY_B: 34,
});

/** Trait genes after `bOut`: `sizeGene`, `visionGene`, `childShareGene`, `learnGene`. */
export const TRAIT_GENES = 4;

/** Index of each trait gene within the trait block. */
export const TRAIT_INDEX = Object.freeze({ SIZE: 0, VISION: 1, CHILD_SHARE: 2, LEARN: 3 });

/**
 * @typedef {object} BrainLayout
 * @property {number} inputCount the values the brain multiplies (`POOLED_VALUES + EXTRA_INPUTS`): the `pooled` row
 * @property {number} rawInputCount the values in the `inputs` row (`rayCount x RAY_CHANNELS + EXTRA_INPUTS`): the raw
 *   rays and the body block, which the observer and the scripted controllers read
 * @property {number} hidden hidden units
 * @property {number} outputCount outputs (`OUTPUT_COUNT`)
 * @property {number} wIn offset of the input-to-hidden block (`inputCount x hidden`)
 * @property {number} wRec offset of the hidden-to-hidden block (`hidden x hidden`)
 * @property {number} bHidden offset of the hidden biases
 * @property {number} wOut offset of the hidden-to-output block (`hidden x outputCount`)
 * @property {number} bOut offset of the output biases
 * @property {number} traitStart offset of the trait genes (`TRAIT_GENES`)
 * @property {number} leakStart offset of the leak genes (one per hidden unit)
 * @property {number} weightCount floats in one weight row
 */

/**
 * The layout of one agent's weight row, blocks in the order wIn, wRec, bHidden, wOut, bOut,
 * trait genes, leak genes.
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {Readonly<BrainLayout>}
 */
export function brainLayout(config) {
    const inputCount = POOLED_VALUES + EXTRA_INPUTS;
    const hidden = config.brainHidden;
    const wIn = 0;
    const wRec = wIn + inputCount * hidden;
    const bHidden = wRec + hidden * hidden;
    const wOut = bHidden + hidden;
    const bOut = wOut + hidden * OUTPUT_COUNT;
    const traitStart = bOut + OUTPUT_COUNT;
    const leakStart = traitStart + TRAIT_GENES;
    const weightCount = leakStart + hidden;
    return Object.freeze({
        inputCount,
        rawInputCount: config.rayCount * RAY_CHANNELS + EXTRA_INPUTS,
        hidden,
        outputCount: OUTPUT_COUNT,
        wIn,
        wRec,
        bHidden,
        wOut,
        bOut,
        traitStart,
        leakStart,
        weightCount,
    });
}

/**
 * @typedef {object} InputOffsets
 * @property {Readonly<Record<string, number>>} pooled index of each pooled channel's strength in the brain's input
 *   row (its cosine and sine follow); `kin` is among them
 * @property {number} bodyStart index of the body block in the brain's input row
 * @property {number} scentStart index of the first scent input (the danger antennae)
 * @property {number} huntScent index of the hunt scent here (the left and right antennae follow)
 * @property {number} heardAlarm index of the heard alarm loudness (ahead and side follow)
 * @property {number} heardHunt index of the heard hunt call loudness (ahead and side follow)
 * @property {number} sex index of the sex input
 * @property {number} memoryA index of the `MEMORY_A` read-back
 * @property {number} memoryB index of the `MEMORY_B` read-back
 * @property {number} rawBodyStart index of the body block in the raw `inputs` row (after the ray block)
 */

/**
 * The absolute input indices the probes, the observer and the inspector read instead of literals.
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {Readonly<InputOffsets>} indices into the brain's input row, except `rawBodyStart`
 */
export function inputOffsets(config) {
    /** @type {Record<string, number>} */
    const pooled = {};
    POOLED_CHANNELS.forEach((name, c) => {
        pooled[name] = c * POOLED_STRIDE;
    });
    const at = (/** @type {number} */ offset) => POOLED_VALUES + offset;
    return Object.freeze({
        pooled: Object.freeze(pooled),
        bodyStart: POOLED_VALUES,
        scentStart: at(BODY_INPUT.SCENT),
        huntScent: at(BODY_INPUT.HUNT_SCENT),
        heardAlarm: at(BODY_INPUT.HEARD_ALARM),
        heardHunt: at(BODY_INPUT.HEARD_HUNT),
        sex: at(BODY_INPUT.SEX),
        memoryA: at(BODY_INPUT.MEMORY_A),
        memoryB: at(BODY_INPUT.MEMORY_B),
        rawBodyStart: config.rayCount * RAY_CHANNELS,
    });
}
