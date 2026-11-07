// Runs every alive agent's Elman RNN brain forward one step, in the contract's summation order. The pooling, the
// hidden step, the outputs and Hebbian learning run in the Rust/WASM brain kernel (wasm/src/brain.rs,
// docs/designs/wasm-kernels.md), one call per tick; the JS kernel it replaced was deleted at adoption (T7).

import { wasmForwardAll } from './wasm-brain.js';

/**
 * Runs the brain of every alive agent, slots ascending: pools `inputs` into `pooled`, updates `hidden` (and `fastOut`
 * with Hebbian learning on) and writes `outputs`.
 * @param {Record<string, any>} world the world (every world runs the kernels from birth)
 * @returns {void}
 * @throws {Error} the `detTanh` error when a sum or a learn gene is not finite
 */
export function forwardAll(world) {
    wasmForwardAll(world);
}
