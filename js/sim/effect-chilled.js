// The `chilled` effect's clock (docs/designs/status-effects.md, "The social effects"): a body under its
// `temperatureOptimalMin` lane gains one stack every `coldStackTicks` ticks; at or above it, one stack leaves every
// `coldRecoverTicks` ticks. Called from `stepTemperature`, once per alive slot per tick. The slot's `effectTicks` row is the
// clock, signed: above 0 it counts the ticks the body has been under the band, below 0 the ticks it has been back in it
// with stacks left to lose, and it restarts at 0 when the body crosses the edge. Allocates nothing, no RNG.

import { EFFECT, SYSTEM } from './effects.js';
import { dropStack, raiseEffect } from './effect-raise.js';

/** The stored row of `chilled`. */
const ROW = SYSTEM.rowOf[EFFECT.CHILLED];

/**
 * Advances one alive slot's `chilled` clock by a tick, after its temperature has stepped.
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function stepChilled(world, slot) {
    const { config } = world;
    const ticks = world.effectTicks[ROW];
    let clock = ticks[slot];
    if (world.temperature[slot] < world.lanes.temperatureOptimalMin[slot]) {
        clock = clock < 0 ? 1 : clock + 1;
        if (clock >= config.coldStackTicks) {
            clock = 0;
            raiseEffect(SYSTEM, world, slot, { effect: EFFECT.CHILLED, source: 0 });
        }
    } else if (world.effectStacks[ROW][slot] > 0) {
        clock = clock > 0 ? -1 : clock - 1;
        if (-clock >= config.coldRecoverTicks) {
            clock = 0;
            dropStack(SYSTEM, world, slot, EFFECT.CHILLED);
        }
    } else {
        clock = 0;
    }
    ticks[slot] = clock;
}
