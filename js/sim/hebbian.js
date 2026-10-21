// Hebbian learning: each agent's plastic copy of its hidden-to-output block, `fastOut`, drifts during its life.
// The genome row in `world.weights` never changes, so a child inherits the genome and not what its parent learned.

import { detSigmoid } from './det-math.js';
import { TRAIT_INDEX } from './brain-layout.js';

/** How strongly a plastic weight is pulled back toward its genome value each tick. */
export const HEBB_DECAY = 0.01;

/** Plastic weights are clamped to plus or minus this. */
export const HEBB_CLAMP = 4;

/**
 * Starts a slot's plastic block equal to the genome's hidden-to-output block.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot whose `weights` row was just written
 * @returns {void}
 */
export function resetFastOut(world, slot) {
    const { layout, weights, fastOut } = world;
    const size = layout.hidden * layout.outputCount;
    const from = slot * layout.weightCount + layout.wOut;
    const to = slot * size;
    for (let i = 0; i < size; i++) {
        fastOut[to + i] = weights[from + i];
    }
}

/**
 * @param {number} x a plastic weight before clamping
 * @returns {number} `Math.min(HEBB_CLAMP, Math.max(-HEBB_CLAMP, x))` for a finite x (NaN stays NaN), without the calls
 */
function clamp(x) {
    return x > HEBB_CLAMP ? HEBB_CLAMP : x < -HEBB_CLAMP ? -HEBB_CLAMP : x;
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
    const eta =
        world.config.hebbianRate *
        detSigmoid(weights[slot * layout.weightCount + layout.traitStart + TRAIT_INDEX.LEARN]);
    const genome = slot * layout.weightCount + layout.wOut;
    const plastic = slot * H * OUT;
    const outBase = slot * OUT;
    const hBase = slot * H;
    for (let j = 0; j < H; j++) {
        const h = hidden[hBase + j];
        const row = plastic + j * OUT;
        const gRow = genome + j * OUT;
        let o = 0;
        for (; o + 2 <= OUT; o += 2) {
            const f0 = fastOut[row + o];
            const f1 = fastOut[row + o + 1];
            const n0 = f0 + eta * (h * outputs[outBase + o] - HEBB_DECAY * (f0 - weights[gRow + o]));
            const n1 = f1 + eta * (h * outputs[outBase + o + 1] - HEBB_DECAY * (f1 - weights[gRow + o + 1]));
            fastOut[row + o] = clamp(n0);
            fastOut[row + o + 1] = clamp(n1);
        }
        for (; o < OUT; o++) {
            const f = fastOut[row + o];
            fastOut[row + o] = clamp(f + eta * (h * outputs[outBase + o] - HEBB_DECAY * (f - weights[gRow + o])));
        }
    }
}
