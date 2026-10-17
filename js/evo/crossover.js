// Neuron-block uniform crossover for mating.

import { TRAIT_GENES } from '../sim/brain-layout.js';
import { nextFloat } from '../sim/rng.js';

/**
 * Writes the child row from two parent rows. Each hidden neuron h, in index order, draws one `nextFloat`; below 0.5
 * its whole block comes from the mother, otherwise from the father. A block is column h of `wIn` (every input into
 * h; `wIn` is input-major, so `wIn + i * hidden + h`), column h of `wRec` (`wRec + k * hidden + h`), `bHidden[h]`
 * row h of `wOut` (h's weights to every output, `wOut + h * outputCount + o`) and leak gene h. `bOut` comes from the
 * mother. After the neurons, each trait gene in order draws one `nextFloat` and is taken whole from the mother (below
 * 0.5) or the father.
 * @param {Float32Array} child the child row, written in full
 * @param {Float32Array} mother the mother's row
 * @param {Float32Array} father the father's row
 * @param {{ layout: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng }} context a `brainLayout(config)`
 *   result and the mutation stream (an options object: the lint limit is 4 parameters)
 * @returns {void}
 */
export function crossNeurons(child, mother, father, context) {
    const { layout, rng } = context;
    const { inputCount, hidden, outputCount } = layout;
    for (let h = 0; h < hidden; h++) {
        const src = nextFloat(rng) < 0.5 ? mother : father;
        for (let i = 0; i < inputCount; i++) {
            child[layout.wIn + i * hidden + h] = src[layout.wIn + i * hidden + h];
        }
        for (let k = 0; k < hidden; k++) {
            child[layout.wRec + k * hidden + h] = src[layout.wRec + k * hidden + h];
        }
        child[layout.bHidden + h] = src[layout.bHidden + h];
        for (let o = 0; o < outputCount; o++) {
            child[layout.wOut + h * outputCount + o] = src[layout.wOut + h * outputCount + o];
        }
        child[layout.leakStart + h] = src[layout.leakStart + h];
    }
    for (let o = 0; o < outputCount; o++) {
        child[layout.bOut + o] = mother[layout.bOut + o];
    }
    for (let t = 0; t < TRAIT_GENES; t++) {
        child[layout.traitStart + t] = (nextFloat(rng) < 0.5 ? mother : father)[layout.traitStart + t];
    }
}
