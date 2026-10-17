// Computes the input count and the weight-row offsets of the Elman RNN brain from a config.

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

/** Values per ray: proximity, food, bigger, smaller, similar, kin, wall, obstacle, smoke. */
export const RAY_CHANNELS = 9;

/**
 * Body inputs after the ray block: the 19 of body temperature, 13 scent and call inputs, then `sex` (32) and last
 * tick's `MEMORY_A` and `MEMORY_B` (33 and 34).
 */
export const EXTRA_INPUTS = 35;

/** Body input offsets (from the start of the body block) of the sex input and the two memory read-backs. */
export const BODY_INPUT = Object.freeze({ SEX: 32, MEMORY_A: 33, MEMORY_B: 34 });

/** Trait genes after `bOut`: `sizeGene`, `visionGene`, `childShareGene`, `learnGene`. */
export const TRAIT_GENES = 4;

/** Index of each trait gene within the trait block. */
export const TRAIT_INDEX = Object.freeze({ SIZE: 0, VISION: 1, CHILD_SHARE: 2, LEARN: 3 });

/**
 * @typedef {object} BrainLayout
 * @property {number} inputCount `rayCount x RAY_CHANNELS + EXTRA_INPUTS`
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
    const inputCount = config.rayCount * RAY_CHANNELS + EXTRA_INPUTS;
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
