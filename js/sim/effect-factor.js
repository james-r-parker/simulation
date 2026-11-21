// The factor one effect rule puts on its lane at a level (docs/designs/status-effects.md, "The registry"): the arithmetic
// that `liveOf` (effects.js) and the group reads (effect-group.js) share, so a lane folds to the same bits either way.
// Pure arithmetic over the world's numbers: no RNG, no allocation.

import { LEVEL, NUMBER, numberInto } from './effect-refs.js';

/** @typedef {import('./effects.js').Rule} Rule */
/** @typedef {import('./effect-refs.js').Compiled} Compiled */

/**
 * Leaves in `NUMBER[0]` the rule's factor at the level in `LEVEL[0]`, above 0: `1 + perStack x level` (times the `by`
 * lane, never below 0), `perStack ^ level` for a `power` rule, or the `levels` entry of the level. The level comes in through
 * `LEVEL`, not an argument, so a share is never boxed for a call the compiler does not inline.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @param {Rule} rule one effect's rule on a lane
 * @returns {void}
 */
export function ruleFactor(world, slot, rule) {
    const level = LEVEL[0];
    if (rule.levels !== null) {
        numberInto(world, slot, rule.levels[level]);
        return;
    }
    numberInto(world, slot, /** @type {Compiled} */ (rule.per));
    if (rule.power) {
        raise(level);
        return;
    }
    NUMBER[0] *= level;
    if (rule.by >= 0) {
        NUMBER[0] *= world.laneArrays[rule.by][slot];
    }
    const factor = 1 + NUMBER[0];
    NUMBER[0] = factor > 0 ? factor : 0;
}

/**
 * Leaves in `NUMBER[0]` its value raised to a whole power, by repeated multiplication (the same bits on every machine).
 * @param {number} level the power
 * @returns {void}
 */
function raise(level) {
    const base = NUMBER[0];
    NUMBER[0] = 1;
    for (let k = 0; k < level; k++) {
        NUMBER[0] *= base;
    }
}
