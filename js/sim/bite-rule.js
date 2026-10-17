// The bite rule: whether one agent is able to bite another. Shared by the feed phase and the ray classes so that what
// an agent senses as "can bite me" and "I can bite it" can never drift from what `feed` does.

import { detCos, detSin } from './det-math.js';
import { isKin } from './kin.js';
import { specParams } from './spec-params.js';

const PI = 3.141592653589793;

/**
 * Whether the victim's centre lies within `biteArc` of the biter's heading. A `biteArc` of PI is any direction.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {boolean}
 */
function inJaws(world, biter, victim) {
    if (world.config.biteArc >= PI) {
        return true;
    }
    const dx = world.x[victim] - world.x[biter];
    const dy = world.y[victim] - world.y[biter];
    const heading = world.angle[biter];
    return dx * detCos(heading) + dy * detSin(heading) >= world.biteCos[0] * Math.sqrt(dx * dx + dy * dy);
}

/**
 * Whether `biter` is able to bite `victim`: its specialisation can hunt, they are not kin, it is bigger than
 * `huntSizeRatio` times the victim and the victim is in its jaws. The brain's wish to bite is not part of it; `feed`
 * adds that.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {boolean}
 */
export function canBite(world, biter, victim) {
    return (
        specParams(world.config, world.spec[biter]).canHunt &&
        !isKin(world, biter, victim) &&
        world.size[biter] > world.config.huntSizeRatio * world.size[victim] &&
        inJaws(world, biter, victim)
    );
}
