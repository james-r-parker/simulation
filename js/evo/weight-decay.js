// Silent-input decay: a birth shrinks the `wIn` rows of inputs that fitness never sees, so their weights cannot walk to
// the clamp unchecked. Only those rows move; every other block of the genome is left alone.

/**
 * Multiplies the input-to-hidden weights of every silent input by `1 - decay`, in place. `wIn` is input-major, so
 * input `i` owns `wIn + i * hidden` up to `hidden` weights. Draws nothing and allocates nothing.
 * @param {Float32Array} row the child's weight row
 * @param {{ layout: Readonly<Record<string, any>>, silent: Uint8Array, decay: number }} context the layout, a mask with
 *   one byte per input (nonzero is silent) and the decay in `[0, 1)`
 * @returns {void}
 */
export function decaySilentInputs(row, context) {
    const { layout, silent, decay } = context;
    const keep = 1 - decay;
    const { hidden } = layout;
    for (let i = 0; i < layout.inputCount; i++) {
        if (silent[i] === 0) {
            continue;
        }
        const start = layout.wIn + i * hidden;
        for (let j = start; j < start + hidden; j++) {
            row[j] *= keep;
        }
    }
}
