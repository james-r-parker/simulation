import { canMatePair } from '../../../js/sim/mate-eligibility.js';
import { nextFloat } from '../../../js/sim/rng.js';

/**
 * Female choice in O(n) per agent: every male in reach that passes `canMatePair` is a candidate, the one with the most
 * energy (ties to the lower slot) is chosen, and one draw against `chance` decides.
 * @param {any} w the world
 * @param {number} a the searching female
 * @param {number} chance the probability that the chosen pair mates
 * @param {{ seed: number, s: Uint32Array }} rng a copy of the lifecycle stream, advanced by the draw
 * @returns {number} the male's slot, or -1
 */
function referenceFindMale(w, a, chance, rng) {
    let best = -1;
    for (let b = 0; b < w.alive.length; b++) {
        const d = Math.hypot(w.x[b] - w.x[a], w.y[b] - w.y[a]);
        const inReach = d < w.size[a] + w.size[b] + w.config.mateRange;
        if (b !== a && w.alive[b] === 1 && w.sex[b] === 1 && inReach && canMatePair(w, a, b)) {
            best = best < 0 || w.energy[b] > w.energy[best] ? b : best;
        }
    }
    return best >= 0 && nextFloat(rng) < chance ? best : -1;
}

/**
 * Female choice in O(n) per agent (see `referenceFindMale`), exported under the name the tests call.
 * @param {any} w the world, with the hash built from its current positions
 * @param {number} a the searching agent
 * @param {number} chance the probability that an eligible pair mates
 * @param {{ seed: number, s: Uint32Array }} rng a copy of the lifecycle stream, advanced by the draw
 * @returns {number} the partner slot, or -1
 */
export function referenceFindMate(w, a, chance, rng) {
    return referenceFindMale(w, a, chance, rng);
}
