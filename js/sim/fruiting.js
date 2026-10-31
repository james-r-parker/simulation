// Computes the seasonal fruiting weight of a plant species.
import { detSin } from './det-math.js';

const PI = 3.141592653589793;

/**
 * A smooth window on a cyclic year: zero outside, one at its midpoint.
 * @param {number} phase year phase in [0, 1)
 * @param {number} start opening phase in [0, 1)
 * @param {number} span window length in (0, 1]
 * @returns {number} the fruiting weight in [0, 1]
 */
export function fruitWeight(phase, start, span) {
    if (span === 1) {
        return 1;
    }
    const delta = phase - start;
    const u = (delta - Math.floor(delta)) / span;
    if (u >= 1) {
        return 0;
    }
    const wave = detSin(PI * u);
    return wave * wave;
}

/**
 * Refreshes patch spawn weights from their stock, yield and the current year phase.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function refreshFruiting(world) {
    for (let i = 0; i < world.patchStock.length; i++) {
        world.patchWeight[i] =
            world.patchStock[i] *
            world.patchYield[i] *
            fruitWeight(world.season[1], world.patchStart[i], world.patchSpan[i]);
    }
}
