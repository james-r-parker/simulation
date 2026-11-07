// Hebbian learning: each agent's plastic copy of its hidden-to-output block, `fastOut`, drifts during its life.
// The genome row in `world.weights` never changes, so a child inherits the genome and not what its parent learned.
// The update itself runs in the brain kernel (`hebbian_step` in wasm/src/brain.rs, docs/designs/wasm-kernels.md):
// `fastOut[j, o] += eta x (h_j x out_o - HEBB_DECAY x (fastOut[j, o] - w[j, o]))` with
// `eta = hebbianRate x sigmoid(learnGene)` (times `rewardScale` with `rewardedHebb`), clamped to plus or minus
// `HEBB_CLAMP`. The constants here are the kernel's, for the metrics that read the plastic block.

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
    const size = layout.hidden * layout.geneOutputs;
    const from = slot * layout.weightCount + layout.wOut;
    const to = slot * size;
    for (let i = 0; i < size; i++) {
        fastOut[to + i] = weights[from + i];
    }
}
