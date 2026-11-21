// Active defender repel (prey-guilds.md Phase 2): when a `defender` (spec 4) holds `BITE > 0` with a `canHunt`
// target in its jaws (`inJaws`), it drains `defenderRepelEnergy` from the hunter, knocks it back by
// `defenderRepelImpulse` along the defender-to-hunter vector, and pays `defenderRepelCost`.

import { inJaws } from './bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { SPEC } from './specs.js';

/**
 * Applies knockback velocity along the defender-to-target vector (or defender facing if coincident).
 * @param {Record<string, any>} world the world
 * @param {number} defender the defending slot
 * @param {number} target the repelled slot
 * @param {number} impulse the velocity impulse
 * @returns {void}
 */
function applyImpulse(world, defender, target, impulse) {
    if (impulse <= 0) {
        return;
    }
    const dx = world.x[target] - world.x[defender];
    const dy = world.y[target] - world.y[defender];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dist > 0 ? dx / dist : detCos(world.angle[defender]);
    const ny = dist > 0 ? dy / dist : detSin(world.angle[defender]);
    world.vx[target] += nx * impulse;
    world.vy[target] += ny * impulse;
}

/**
 * Attempts an active defender repel from `defender` onto `target`.
 * @param {Record<string, any>} world the world
 * @param {number} defender the defending slot
 * @param {number} target the contacted slot
 * @returns {boolean} whether a repel fired
 */
export function tryDefenderRepel(world, defender, target) {
    const { lanes } = world;
    if (lanes.defenderRepelEnergy[defender] <= 0 && lanes.defenderRepelImpulse[defender] <= 0) {
        return false;
    }
    if (
        world.spec[defender] !== SPEC.DEFENDER ||
        world.huntBySpec[world.spec[target]] !== 1 ||
        world.outputs[defender * OUTPUT_COUNT + OUTPUT_INDEX.BITE] <= 0 ||
        !inJaws(world, defender, target)
    ) {
        return false;
    }
    if (lanes.defenderRepelCost[defender] > 0) {
        removeEnergy(world, defender, lanes.defenderRepelCost[defender], LOSS_CAUSE.COST);
    }
    if (lanes.defenderRepelEnergy[defender] > 0) {
        removeEnergy(world, target, lanes.defenderRepelEnergy[defender], LOSS_CAUSE.COST);
    }
    applyImpulse(world, defender, target, lanes.defenderRepelImpulse[defender]);
    return true;
}
