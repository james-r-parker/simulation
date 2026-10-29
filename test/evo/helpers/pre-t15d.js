import { SIMPLE_WORLD } from '../../helpers/simple-world.js';

/**
 * The combat keys the T15d defaults changed that `SIMPLE_WORLD` does not pin, at their pre-T15d values. The controller
 * duel and anti-exploit tests are defined on that world (hunter against fleer, a hunt-call spammer's cost), so they
 * spread this after `SIMPLE_WORLD`; the defaults they would otherwise follow are the tuned live world.
 */
export const PRE_T15D = Object.freeze({
    huntSizeRatio: 1.01,
    biteArc: Math.PI / 4,
    huntCallCost: 0.5,
    specialisations: { predator: { ...SIMPLE_WORLD.specialisations.predator, biteMultiplier: 4 } },
});
