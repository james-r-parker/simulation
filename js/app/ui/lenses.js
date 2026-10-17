// The four lenses and what each implies. A lens is a preference-backed toggle; `lensUniforms` writes the flags the
// layers read each frame, and `wantsRays` says whether the worker should put the ray part in its snapshots.

/** The lenses, in key order: `1` to `4`. */
export const LENSES = Object.freeze([
    { id: 'temperature', action: 'lens1', title: 'Temperature lens' },
    { id: 'scent', action: 'lens2', title: 'Scent trails lens' },
    { id: 'territory', action: 'lens3', title: 'Family territories lens' },
    { id: 'vision', action: 'lens4', title: 'Vision and calls lens' },
]);

/**
 * Flips a lens.
 * @param {boolean[]} on which lenses are on, changed in place
 * @param {number} index the lens, 0 to 3
 * @returns {boolean} whether it is on now
 * @throws {Error} when the index is not a lens
 */
export function toggleLens(on, index) {
    if (!Number.isInteger(index) || index < 0 || index >= LENSES.length) {
        throw new Error(`toggleLens: no lens ${index}, expected 0 to ${LENSES.length - 1}`);
    }
    on[index] = !on[index];
    return on[index];
}

/**
 * Writes the flags the layers read. The vision lens turns on both the ray fans and the full-strength call rings.
 * @param {readonly boolean[]} on which lenses are on
 * @param {{temperature: boolean, scent: boolean, territory: boolean, vision: boolean, calls: boolean}} out the frame's
 *   lens flags, rewritten
 * @returns {typeof out} `out`
 */
export function lensUniforms(on, out) {
    out.temperature = on[0];
    out.scent = on[1];
    out.territory = on[2];
    out.vision = on[3];
    out.calls = on[3];
    return out;
}

/**
 * @param {readonly boolean[]} on which lenses are on
 * @param {number} selectedId the selected agent's genome id, 0 for none
 * @returns {boolean} whether snapshots should carry the ray part: the vision lens needs every agent's rays, and the
 *   selection needs its own
 */
export function wantsRays(on, selectedId) {
    return on[3] || selectedId !== 0;
}
