// The kin trace of `kin-spared` (training-stages.md T18): ticks on which the subject's `BITE` output is above 0 while its
// sibling stands inside its jaws. The sibling cannot be bitten (`couldBite` excludes kin), so this reads the brain's wish
// and not the sim's result: a brain that bites what it touches reads it, a brain that tells kin from prey does not. The
// subject is slot 0 and the sibling slot 2. `noteKin` allocates nothing, so the drill's `done` check can call it every tick.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { inJaws } from '../sim/bite-rule.js';
import { TOUCH_GAP } from './drill-trace.js';

/** The sibling's slot in the staged world. */
export const SIBLING_SLOT = 2;

/**
 * @typedef {object} KinTrace
 * @property {number} biteTicks ticks with `BITE` above 0 while the sibling was in the jaws
 * @property {number} jawTicks ticks with the sibling in the jaws (touching and ahead)
 */

/** @returns {KinTrace} a trace of a trial not yet played */
export function createKinTrace() {
    return { biteTicks: 0, jawTicks: 0 };
}

/**
 * Notes the world after a tick.
 * @param {KinTrace} trace the trace
 * @param {Record<string, any>} world the world, the subject in slot 0 and its sibling in `SIBLING_SLOT`
 * @returns {void}
 */
export function noteKin(trace, world) {
    if (world.alive[0] === 0 || world.alive[SIBLING_SLOT] === 0) {
        return;
    }
    const dx = world.x[SIBLING_SLOT] - world.x[0];
    const dy = world.y[SIBLING_SLOT] - world.y[0];
    const touching = Math.sqrt(dx * dx + dy * dy) <= TOUCH_GAP * (world.size[0] + world.size[SIBLING_SLOT]);
    if (!touching || !inJaws(world, 0, SIBLING_SLOT)) {
        return;
    }
    trace.jawTicks += 1;
    trace.biteTicks += world.outputs[OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
}
