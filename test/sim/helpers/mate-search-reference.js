import { canMatePair } from '../../../js/sim/mate-eligibility.js';
import { nextFloat } from '../../../js/sim/rng.js';
import { cellOf } from '../../../js/sim/spatial-hash.js';

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
 * The greedy search of `findMate` in O(n) per agent: every candidate is tested directly, then taken in the order of
 * the first scanned cell that holds it (row-major) and slot. With `sexesEnabled` it is female choice instead.
 * @param {any} w the world, with the hash built from its current positions
 * @param {number} a the searching agent
 * @param {number} chance the probability that an eligible pair mates
 * @param {{ seed: number, s: Uint32Array }} rng a copy of the lifecycle stream, advanced by the draws
 * @returns {number} the partner slot, or -1
 */
export function referenceFindMate(w, a, chance, rng) {
    if (w.config.sexesEnabled) {
        return referenceFindMale(w, a, chance, rng);
    }
    const { cellSize, cols, rows } = w.hash;
    const reach = w.size[a] + w.config.mateRange;
    const col0 = cellOf(w.x[a] - reach, cellSize, cols - 1);
    const row0 = cellOf(w.y[a] - reach, cellSize, rows - 1);
    const found = [];
    for (let b = a + 1; b < w.alive.length; b++) {
        const d = Math.hypot(w.x[b] - w.x[a], w.y[b] - w.y[a]);
        if (w.alive[b] === 1 && d < w.size[a] + w.size[b] + w.config.mateRange && canMatePair(w, a, b)) {
            const col = Math.max(cellOf(w.x[b] - w.size[b], cellSize, cols - 1), col0);
            const row = Math.max(cellOf(w.y[b] - w.size[b], cellSize, rows - 1), row0);
            found.push({ b, order: row * cols + col });
        }
    }
    found.sort((p, q) => p.order - q.order || p.b - q.b);
    for (const { b } of found) {
        if (nextFloat(rng) < chance) {
            return b;
        }
    }
    return -1;
}
