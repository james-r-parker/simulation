import { canMatePair } from '../../../js/sim/mate-eligibility.js';

/**
 * Female choice in O(n) per agent: every male in reach that passes `canMatePair` is a candidate, the one with the highest
 * mate rank (ties to the lower slot) is chosen.
 * @param {any} w the world
 * @param {number} a the searching female
 * @returns {number} the male's slot, or -1
 */
function referenceFindMale(w, a) {
    let best = -1;
    for (let b = 0; b < w.alive.length; b++) {
        const d = Math.hypot(w.x[b] - w.x[a], w.y[b] - w.y[a]);
        const inReach = d < w.size[a] + w.size[b] + w.config.mateRange;
        if (b !== a && w.alive[b] === 1 && w.sex[b] === 1 && inReach && canMatePair(w, a, b)) {
            best = best < 0 || w.mateRank[b] > w.mateRank[best] ? b : best;
        }
    }
    return best;
}

/**
 * Female choice in O(n) per agent (see `referenceFindMale`), exported under the name the tests call.
 * @param {any} w the world, with the hash built from its current positions
 * @param {number} a the searching agent
 * @returns {number} the partner slot, or -1
 */
export function referenceFindMate(w, a) {
    return referenceFindMale(w, a);
}
