// What a hand-built world needs for the effect readers (docs/designs/status-effects.md): the lane arrays they index and the
// stored stack rows of the registry. A real world has both; a stand-in for one function's arrays gets them here.

import { LANES } from '../../../js/sim/body-lanes.js';
import { allocEffects } from '../../../js/sim/effects.js';
import { createEventRing } from '../../../js/sim/events.js';

/**
 * @param {Record<string, any>} world a hand-built world with a `config` and, optionally, `lanes`
 * @param {number} [slots] the slots a lane the stand-in lacks is sized to
 * @returns {Record<string, any>} the same world, with `laneArrays`, the effect rows, a tick and an event ring
 */
export function withEffectRows(world, slots = 1) {
    world.laneArrays ??= LANES.map((lane) => world.lanes?.[lane.name] ?? new Float64Array(slots).fill(1));
    world.agentRows ??= [];
    world.tick ??= 0;
    world.events ??= createEventRing(64);
    allocEffects(world);
    return world;
}
