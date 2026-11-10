// Neuron-block uniform crossover for mating.

import { GENE_OUTPUTS, OUTPUT_INDEX, POOLED_VALUES, TRAIT_GENES } from '../sim/brain-layout.js';
import { nextFloat } from '../sim/rng.js';

/**
 * Writes the skip block's columns, one `nextFloat` per output with genes: the whole column comes from the mother (below 0.5) or the
 * father.
 * @param {Float32Array} child the child row
 * @param {Float32Array} mother the mother's row
 * @param {Float32Array} father the father's row
 * @param {{ layout: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng }} context the layout and stream
 * @returns {{biteParent: number, thrustParent: number}} parent flags, 0 for mother and 1 for father
 */
function crossSkip(child, mother, father, context) {
    const { layout, rng } = context;
    const { geneOutputs } = layout;
    let biteParent = 0;
    let thrustParent = 0;
    for (let g = 0; g < geneOutputs; g++) {
        const fromFather = nextFloat(rng) >= 0.5;
        const src = fromFather ? father : mother;
        if (g === GENE_OUTPUTS.indexOf(OUTPUT_INDEX.BITE)) {
            biteParent = Number(fromFather);
        }
        if (g === GENE_OUTPUTS.indexOf(OUTPUT_INDEX.THRUST)) {
            thrustParent = Number(fromFather);
        }
        for (let i = 0; i < POOLED_VALUES; i++) {
            child[layout.wSkip + i * geneOutputs + g] = src[layout.wSkip + i * geneOutputs + g];
        }
    }
    return { biteParent, thrustParent };
}

/**
 * Writes the child row from two parent rows. Each hidden neuron h, in index order, draws one `nextFloat`; below 0.5
 * its whole block comes from the mother, otherwise from the father. A block is column h of `wIn` (every input into
 * h; `wIn` is input-major, so `wIn + i * hidden + h`), column h of `wRec` (`wRec + k * hidden + h`), `bHidden[h]`
 * row h of `wOut` (h's weights to every output with genes, `wOut + h * geneOutputs + g`) and leak gene h. `bOut` comes from the
 * mother. After the neurons, each trait gene in order draws one `nextFloat` and is taken whole from the mother (below
 * 0.5) or the father. Last, each output's skip column (`wSkip + i * geneOutputs + g` for every pooled value `i`) draws
 * one `nextFloat` and comes whole from one parent, so a reflex (food ahead to thrust) is inherited as a unit.
 * @param {Float32Array} child the child row, written in full
 * @param {Float32Array} mother the mother's row
 * @param {Float32Array} father the father's row
 * @param {{ layout: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng }} context a `brainLayout(config)`
 *   result and the mutation stream (an options object: the lint limit is 4 parameters)
 * @returns {{biteParent: number, thrustParent: number}} parent flags for the two reflex columns
 */
export function crossNeurons(child, mother, father, context) {
    const { layout, rng } = context;
    const { inputCount, hidden, geneOutputs } = layout;
    for (let h = 0; h < hidden; h++) {
        const src = nextFloat(rng) < 0.5 ? mother : father;
        for (let i = 0; i < inputCount; i++) {
            child[layout.wIn + i * hidden + h] = src[layout.wIn + i * hidden + h];
        }
        for (let k = 0; k < hidden; k++) {
            child[layout.wRec + k * hidden + h] = src[layout.wRec + k * hidden + h];
        }
        child[layout.bHidden + h] = src[layout.bHidden + h];
        for (let g = 0; g < geneOutputs; g++) {
            child[layout.wOut + h * geneOutputs + g] = src[layout.wOut + h * geneOutputs + g];
        }
        child[layout.leakStart + h] = src[layout.leakStart + h];
    }
    for (let g = 0; g < geneOutputs; g++) {
        child[layout.bOut + g] = mother[layout.bOut + g];
    }
    for (let t = 0; t < TRAIT_GENES; t++) {
        child[layout.traitStart + t] = (nextFloat(rng) < 0.5 ? mother : father)[layout.traitStart + t];
    }
    return crossSkip(child, mother, father, context);
}
