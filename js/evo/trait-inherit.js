// Inheritance of the trait genes (docs/designs/body-genes.md, "Inheritance"): the cross at mating and the mutation at
// every birth, each a loop over the trait slots using the registry's `inherit` and `sigmaScale`. A slot the registry
// does not name (a spare) draws like a trait, so a trait added later moves no draw.

import { TRAITS } from '../sim/body-traits.js';
import { TRAIT_SLOTS } from '../sim/brain-layout.js';
import { nextFloat, nextGaussian } from '../sim/rng.js';

/** @typedef {readonly Readonly<import('../sim/body-traits.js').Trait>[]} Registry */

/**
 * @param {Registry} traits the registry
 * @param {number} slot a trait slot
 * @returns {Readonly<import('../sim/body-traits.js').Trait> | undefined} the trait in the slot, undefined for a spare
 */
function traitIn(traits, slot) {
    for (let i = 0; i < traits.length; i++) {
        if (traits[i].index === slot) {
            return traits[i];
        }
    }
    return undefined;
}

/**
 * Writes the child's trait genes from its parents', in slot order. An `either` slot (and a spare, and a `raw` trait)
 * draws one `nextFloat`: the mother's gene below 0.5, else the father's. A `blend` slot is the mean and draws nothing.
 * @param {Float32Array} child the child row
 * @param {Float32Array} mother the mother's row
 * @param {Float32Array} father the father's row
 * @param {{layout: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng, traits?: Registry}} context the
 *   layout, the stream and the registry (an options object: the lint limit is 4 parameters)
 * @returns {void}
 */
export function crossTraits(child, mother, father, context) {
    const { layout, rng, traits = TRAITS } = context;
    for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
        const at = layout.traitStart + slot;
        if (traitIn(traits, slot)?.inherit === 'blend') {
            child[at] = (mother[at] + father[at]) / 2;
        } else {
            child[at] = (nextFloat(rng) < 0.5 ? mother : father)[at];
        }
    }
}

/**
 * Mutates the trait genes of a child row in place, in slot order: when `rate` is under 1, one `nextFloat` and the gene
 * is skipped at or above `rate`; then `traitMutationSigma x sigmaScale x nextGaussian` is added and the gene is clamped
 * to plus or minus `traitGeneClamp`.
 * @param {Float32Array} row the child row
 * @param {Readonly<Record<string, any>>} layout the brain layout
 * @param {import('../sim/rng.js').Rng} rng the mutation stream
 * @param {{rate?: number, config: Readonly<Record<string, any>>, traits?: Registry}} options the per-gene probability
 *   (1, the default, mutates every gene), the config (`traitMutationSigma`, `traitGeneClamp`) and the registry
 * @returns {void}
 */
export function mutateTraits(row, layout, rng, options) {
    const { rate = 1, config, traits = TRAITS } = options;
    const clamp = config.traitGeneClamp;
    for (let slot = 0; slot < TRAIT_SLOTS; slot++) {
        if (rate < 1 && nextFloat(rng) >= rate) {
            continue;
        }
        const at = layout.traitStart + slot;
        const step = config.traitMutationSigma * (traitIn(traits, slot)?.sigmaScale ?? 1) * nextGaussian(rng);
        row[at] = Math.min(clamp, Math.max(-clamp, row[at] + step));
    }
}

/**
 * The cross, then the mutation: what one mating does to the trait genes.
 * @param {Float32Array} child the child row
 * @param {Float32Array} mother the mother's row
 * @param {Float32Array} father the father's row
 * @param {{layout: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng, rate?: number,
 *   config: Readonly<Record<string, any>>, traits?: Registry}} context the layout, the stream, the per-gene
 *   probability, the config and the registry
 * @returns {void}
 */
export function inheritTraits(child, mother, father, context) {
    crossTraits(child, mother, father, context);
    mutateTraits(child, context.layout, context.rng, context);
}
