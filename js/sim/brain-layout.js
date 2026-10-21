// Computes the input count and the weight-row offsets of the Elman RNN brain from a config.

/** Outputs per brain: thrust, turn, sprint, mate, bite, alarm, smoke, hunt call. */
export const OUTPUT_COUNT = 8;

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
});

/** Values per ray: proximity, food, can bite me, I can bite it, other, kin, wall, obstacle, smoke. */
export const RAY_CHANNELS = 9;

/** Body inputs after the ray block: the 19 of body temperature plus 13 scent and call inputs. */
export const EXTRA_INPUTS = 32;

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
 * @property {number} weightCount floats in one weight row
 */

/**
 * The layout of one agent's weight row, blocks in the order wIn, wRec, bHidden, wOut, bOut.
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
    const weightCount = bOut + OUTPUT_COUNT;
    return Object.freeze({
        inputCount,
        hidden,
        outputCount: OUTPUT_COUNT,
        wIn,
        wRec,
        bHidden,
        wOut,
        bOut,
        weightCount,
    });
}
