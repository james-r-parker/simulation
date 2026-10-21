// A child's specialisation: its mother's, except with probability `specMutationRate` a random other one.

import { nextFloat, nextInt } from './rng.js';

const SPEC_COUNT = 5;

/**
 * Picks a child's specialisation from the `mutation` stream. With `specMutationRate` 0 the child keeps its mother's
 * and nothing is drawn; otherwise one float is drawn, and below the rate one more picks uniformly among the other four.
 * @param {import('./world.js').World} world the world
 * @param {number} mother the mother or splitter's slot
 * @returns {number} the child's specialisation index
 */
export function childSpec(world, mother) {
    const rate = world.config.specMutationRate;
    const spec = world.spec[mother];
    if (rate === 0 || nextFloat(world.rng.mutation) >= rate) {
        return spec;
    }
    const other = nextInt(world.rng.mutation, SPEC_COUNT - 1);
    return other >= spec ? other + 1 : other;
}
