// Each specialisation's per-ray reach factors (docs/designs/senses-and-motor.md, Phase 5): a ray's share of the
// caster's vision range, full dead ahead and `rearVisionShare` behind, built once per world for the sense kernel.

import { detCos } from './det-math.js';

const PI = Math.PI;

/**
 * @param {number} share the specialisation's `rearVisionShare`, 0 to 1
 * @param {number} theta the ray's angle from the heading
 * @returns {number} the ray's reach factor: `min(1, share + (1 - share) x (1 + cos theta) / 2)`; exactly 1 at share 1
 */
export function reachFactor(share, theta) {
    return Math.min(1, share + ((1 - share) * (1 + detCos(theta))) / 2);
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {{ rayReachBySpec: Float64Array }} one row of `rayCount` reach factors per specialisation, indexed by
 *   `index x rayCount + k`, ray `k` at `2 pi k / rayCount` from the heading as in `rayTables`
 */
export function rayReachTable(config) {
    const { rayCount } = config;
    const specs = Object.values(config.specialisations);
    const rows = Math.max(...specs.map((s) => s.index)) + 1;
    const rayReachBySpec = new Float64Array(rows * rayCount);
    for (const s of specs) {
        for (let k = 0; k < rayCount; k++) {
            rayReachBySpec[s.index * rayCount + k] = reachFactor(s.rearVisionShare, (2 * PI * k) / rayCount);
        }
    }
    return { rayReachBySpec };
}
