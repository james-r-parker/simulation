// The rules the effect registry replaced (docs/designs/status-effects.md, Phase 1), read back through their effects under
// their old names, so the tests that pinned each rule still pin the same numbers.

import { LANES } from '../../../js/sim/body-lanes.js';
import { EFFECT, effectFactor as factor, levelOf } from '../../../js/sim/effects.js';

/**
 * @param {any} world a world, or a hand-built stand-in with a `lanes` map
 * @param {number} slot the agent slot
 * @param {number} effect an `EFFECT` code
 * @param {string} lane a lane's name
 * @returns {number} the effect's factor on the lane (a stand-in gets its `laneArrays`, which the readers index)
 */
function effectFactor(world, slot, effect, lane) {
    world.laneArrays ??= LANES.map((l) => world.lanes?.[l.name]);
    return factor(world, slot, effect, lane);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} what `thrustEfficiency` returned: the factor of the cold and heat bands on `maxThrust`
 */
export function thrustEfficiency(world, slot) {
    return (
        effectFactor(world, slot, EFFECT.COLD_BAND, 'maxThrust') *
        effectFactor(world, slot, EFFECT.HEAT_BAND, 'maxThrust')
    );
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} what `passiveMultiplier` returned: the factor of the cold and hot ramps on the passive loss
 */
export function passiveMultiplier(world, slot) {
    return (
        effectFactor(world, slot, EFFECT.COLD_RAMP, 'passiveLoss') *
        effectFactor(world, slot, EFFECT.HOT_RAMP, 'passiveLoss')
    );
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {boolean} what `blocksMating` returned: whether the `outOfBand` effect is on
 */
export function blocksMating(world, slot) {
    return levelOf(world, slot, EFFECT.OUT_OF_BAND) > 0;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {boolean} what `isSick` returned: whether the `sick` effect is on
 */
export function isSick(world, slot) {
    return levelOf(world, slot, EFFECT.SICK) > 0;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} what `fatFactor` returned: the factor of `fat` on `maxThrust`
 */
export function fatFactor(world, slot) {
    return effectFactor(world, slot, EFFECT.FAT, 'maxThrust');
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} what `juvenileBurnOf` returned: the factor of `juvenile` on the passive loss
 */
export function juvenileBurnOf(world, slot) {
    return effectFactor(world, slot, EFFECT.JUVENILE, 'passiveLoss');
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} what `storeFactor` returned: the factor of `spent` on `sprintBoost`
 */
export function storeFactor(world, slot) {
    return effectFactor(world, slot, EFFECT.SPENT, 'sprintBoost');
}
