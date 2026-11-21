// The appliers of the social effects that a call site raises (docs/designs/status-effects.md, "The social effects"): each
// is called where its cause happens, in the phase it happens in, and puts a stack on a body with `raiseEffect`. They
// allocate nothing and draw no RNG. No effect pays a body for an act: each is raised on the body that suffers or hears it.

import { EFFECT, SYSTEM } from './effects.js';
import { raiseEffect } from './effect-raise.js';

/**
 * A body that a bite leaves alive is `wounded` and `panicked`, one stack of each a bite (`applyBite`, js/sim/feeding.js).
 * @param {any} world the world
 * @param {number} victim the bitten slot, still alive
 * @param {number} biter the biting slot
 * @returns {void}
 */
export function noteBitten(world, victim, biter) {
    raiseEffect(SYSTEM, world, victim, { effect: EFFECT.WOUNDED, source: biter });
    raiseEffect(SYSTEM, world, victim, { effect: EFFECT.PANICKED, source: biter });
}
