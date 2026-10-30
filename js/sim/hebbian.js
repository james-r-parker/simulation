// Hebbian learning: each agent's plastic copy of its hidden-to-output block, `fastOut`, drifts during its life.
// The genome row in `world.weights` never changes, so a child inherits the genome and not what its parent learned.

import { detSigmoid } from './det-math.js';
import { GENE_OUTPUTS, TRAIT_INDEX } from './brain-layout.js';

/** How strongly a plastic weight is pulled back toward its genome value each tick. */
export const HEBB_DECAY = 0.01;

/** Plastic weights are clamped to plus or minus this. */
export const HEBB_CLAMP = 4;

/**
 * The slot's gene outputs, read once per agent instead of through `GENE_OUTPUTS` in the inner loop. Float64 holds each
 * float32 output exactly, so the products are the same.
 */
const geneOut = new Float64Array(GENE_OUTPUTS.length);

/**
 * Starts a slot's plastic block equal to the genome's hidden-to-output block.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot whose `weights` row was just written
 * @returns {void}
 */
export function resetFastOut(world, slot) {
    const { layout, weights, fastOut } = world;
    const size = layout.hidden * layout.geneOutputs;
    const from = slot * layout.weightCount + layout.wOut;
    const to = slot * size;
    for (let i = 0; i < size; i++) {
        fastOut[to + i] = weights[from + i];
    }
}

/**
 * Updates a slot's plastic block after its outputs: `fastOut[j, o] += eta x (h_j x out_o - HEBB_DECAY x (fastOut[j, o]
 * - w[j, o]))` with `eta = hebbianRate x sigmoid(learnGene)`, then clamps to plus or minus `HEBB_CLAMP`.
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot, whose `hidden` row and `outputs` row are this tick's
 * @returns {void}
 */
export function hebbianStep(world, slot) {
    const { layout, weights, hidden, outputs, fastOut } = world;
    const H = layout.hidden;
    const OUT = layout.outputCount;
    const G = layout.geneOutputs;
    const eta =
        world.config.hebbianRate *
        detSigmoid(weights[slot * layout.weightCount + layout.traitStart + TRAIT_INDEX.LEARN]);
    const genome = slot * layout.weightCount + layout.wOut;
    const plastic = slot * H * G;
    const out = geneOut;
    for (let g = 0; g < G; g++) {
        out[g] = outputs[slot * OUT + GENE_OUTPUTS[g]];
    }
    for (let j = 0; j < H; j++) {
        const h = hidden[slot * H + j];
        const row = j * G;
        for (let g = 0; g < G; g++) {
            const f = fastOut[plastic + row + g];
            const next = f + eta * (h * out[g] - HEBB_DECAY * (f - weights[genome + row + g]));
            fastOut[plastic + row + g] = next > HEBB_CLAMP ? HEBB_CLAMP : next < -HEBB_CLAMP ? -HEBB_CLAMP : next;
        }
    }
}
