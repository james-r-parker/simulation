// Computes the input count and the weight-row offsets of the Elman RNN brain from a config.

/** Outputs per brain: thrust, turn, sprint, mate, bite. */
export const OUTPUT_COUNT = 5;

const RAY_CHANNELS = 8;
const EXTRA_INPUTS = 19;

/**
 * @typedef {object} BrainLayout
 * @property {number} inputCount `rayCount x 8 + 19`
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
