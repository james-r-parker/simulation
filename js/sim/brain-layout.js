// Computes the input count and the weight-row offsets of the Elman RNN brain (the pooled-v3 layout, top 2 hits per channel) from a config.

/**
 * The name of the brain layout this file defines. Stamped into every genome, archive and champion file and checked on
 * load, so a file written under a layout of the same sizes but different meaning (another channel order, hit count or
 * block order) is refused by name. Change it whenever a gene's meaning or position changes.
 */
export const BRAIN_LAYOUT_NAME = 'pooled-v3';

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

/**
 * The outputs that have genes (weights in `wOut`, a bias in `bOut`, a column in `wSkip`), in column order: every output
 * but `SPLIT`, which has none and reads 0 (the split rule reads energy and age, not the brain). Gene column `g` drives
 * output `GENE_OUTPUTS[g]`.
 */
export const GENE_OUTPUTS = Object.freeze(
    Array.from({ length: OUTPUT_COUNT }, (_, o) => o).filter((o) => o !== OUTPUT_INDEX.SPLIT),
);

/** Outputs with genes: `OUTPUT_COUNT` less the `SPLIT` output (10). */
export const GENE_OUTPUT_COUNT = GENE_OUTPUTS.length;

/** Values per ray: proximity, food, can bite me, I can bite it, other, kin, wall, obstacle, smoke. */
export const RAY_CHANNELS = 9;

/** Pooled channels, in order: the ray channels 1 to 8 (food, threat, prey, other, kin, wall, obstacle, smoke). */
export const POOLED_CHANNELS = Object.freeze(['food', 'threat', 'prey', 'other', 'kin', 'wall', 'obstacle', 'smoke']);

/** Hits kept per pooled channel: the two strongest rays. */
export const POOLED_HITS = 2;

/** Values per hit: strength, then the cosine and sine of the ray's angle in the agent's frame. */
export const HIT_STRIDE = 3;

/** Values per pooled channel: `POOLED_HITS x HIT_STRIDE`, the strongest hit first. */
export const POOLED_STRIDE = POOLED_HITS * HIT_STRIDE;

/** Hue values of the two pooled food hits. */
export const FOOD_HUE_VALUES = 2;

/** Pooled values at the head of the brain's input row: 48 ray values and two food hues (50). */
export const POOLED_VALUES = POOLED_CHANNELS.length * POOLED_STRIDE + FOOD_HUE_VALUES;

/** Body inputs after the ray (or pooled) block: 17 of body and temperature, 13 scent and call inputs, `sex`, 2 memory. */
export const EXTRA_INPUTS = 33;

/**
 * Body input offsets, from the start of the body block: the scent block (antennae, hunt scent, heard calls), the sex
 * input and the two memory read-backs (last tick's `MEMORY_A` and `MEMORY_B`).
 */
export const BODY_INPUT = Object.freeze({
    BITTEN: 10,
    SCENT: 17,
    HUNT_SCENT: 21,
    HEARD_ALARM: 24,
    HEARD_HUNT: 27,
    SEX: 30,
    MEMORY_A: 31,
    MEMORY_B: 32,
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
 * @property {number} outputCount outputs (`OUTPUT_COUNT`, the width of the `outputs` row)
 * @property {number} geneOutputs outputs with genes (`GENE_OUTPUT_COUNT`): the column count of `wOut`, `bOut` and `wSkip`
 * @property {number} wIn offset of the input-to-hidden block (`inputCount x hidden`)
 * @property {number} wRec offset of the hidden-to-hidden block (`hidden x hidden`)
 * @property {number} bHidden offset of the hidden biases
 * @property {number} wOut offset of the hidden-to-output block (`hidden x geneOutputs`, hidden-major)
 * @property {number} bOut offset of the output biases
 * @property {number} wSkip offset of the pooled-to-output skip block (`POOLED_VALUES x geneOutputs`, input-major)
 * @property {number} traitStart offset of the trait genes (`TRAIT_GENES`)
 * @property {number} leakStart offset of the leak genes (one per hidden unit)
 * @property {number} weightCount floats in one weight row
 */

/**
 * The layout of one agent's weight row, blocks in the order wIn, wRec, bHidden, wOut, bOut,
 * wSkip, trait genes, leak genes.
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
    const bOut = wOut + hidden * GENE_OUTPUT_COUNT;
    const wSkip = bOut + GENE_OUTPUT_COUNT;
    const traitStart = wSkip + POOLED_VALUES * GENE_OUTPUT_COUNT;
    const leakStart = traitStart + TRAIT_GENES;
    const weightCount = leakStart + hidden;
    return Object.freeze({
        inputCount,
        rawInputCount: config.rayCount * RAY_CHANNELS + EXTRA_INPUTS,
        hidden,
        outputCount: OUTPUT_COUNT,
        geneOutputs: GENE_OUTPUT_COUNT,
        wIn,
        wRec,
        bHidden,
        wOut,
        bOut,
        wSkip,
        traitStart,
        leakStart,
        weightCount,
    });
}

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout` result
 * @returns {{ name: string, inputCount: number, brainHidden: number, outputCount: number }} the stamp saved files carry
 *   and `assertLayoutStamp` checks: the layout name and the three sizes
 */
export function layoutStamp(layout) {
    return {
        name: BRAIN_LAYOUT_NAME,
        inputCount: layout.inputCount,
        brainHidden: layout.hidden,
        outputCount: layout.outputCount,
    };
}

/**
 * @typedef {object} InputOffsets
 * @property {Readonly<Record<string, number>>} pooled index of each pooled channel's strongest hit in the brain's
 *   input row (its cosine and sine follow, then the second hit's three values); `kin` is among them
 * @property {number} foodHueStart index of the two food hues after the ray values
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
        foodHueStart: POOLED_VALUES - FOOD_HUE_VALUES,
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
