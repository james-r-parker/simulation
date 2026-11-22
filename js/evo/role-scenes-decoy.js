// The decoy-reading hunter of the smoke scenes (docs/designs/smoke-decoy.md): it follows what its own rays show on the prey
// channel, as a ray-following brain does, with no memory of a target. A fresh cloud reads on the prey and smoke channels
// together (`isDecoy` of js/sim/ray-march.js), so the nearest such ray is the decoy and the hunter turns to it.

import { CH_PREY, CH_SMOKE, RAY_CHANNELS } from '../sim/brain-layout.js';
import { detCos, detSin } from '../sim/det-math.js';

export { GRIP } from './role-budget-decoy.js';

/**
 * @typedef {object} RayAim
 * @property {boolean} decoy whether any ray holds a decoy (the prey and smoke channels both set)
 * @property {{x: number, y: number} | null} aim the world direction of the strongest prey ray, null when none
 * @property {number} reach the proximity of that ray (1 at the hunter's mouth), 0 when none
 */

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the hunter
 * @returns {RayAim} whether its rays show a decoy and the direction of the strongest prey ray (nearest hit; the ray nearest
 *   its heading on a tie, as a hunter inside a cloud sees every ray at proximity 1)
 */
export function readPreyRays(world, slot) {
    const origin = slot * world.layout.rawInputCount;
    let best = -1;
    let strength = 0;
    let decoy = false;
    for (let k = 0; k < world.config.rayCount; k++) {
        const at = origin + k * RAY_CHANNELS;
        const prey = world.inputs[at + CH_PREY];
        decoy = decoy || (prey > 0 && world.inputs[at + CH_SMOKE] > 0);
        const better = prey > strength || (prey === strength && prey > 0 && world.rayCos[k] > world.rayCos[best]);
        if (better) {
            best = k;
            strength = prey;
        }
    }
    if (best < 0) {
        return { decoy, aim: null, reach: 0 };
    }
    const c = detCos(world.angle[slot]);
    const s = detSin(world.angle[slot]);
    const rc = world.rayCos[best];
    const rs = world.raySin[best];
    return { decoy, aim: { x: c * rc - s * rs, y: s * rc + c * rs }, reach: strength };
}
