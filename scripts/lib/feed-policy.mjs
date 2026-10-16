// Feeds a policy and the eval observer one tick of the world, the same way for eval, replay and bench.
import { observe } from '../../js/evo/observer.js';
import { EVENT_STRIDE, readEvents } from '../../js/sim/events.js';

/**
 * Gives the policy each event record of the tick: `onEvent(world, offset)`, where `offset` is the record's start
 * index in `world.events.data` (`offset + 0` is the type, `offset + 1` the tick).
 * @param {Record<string, any>} policy the policy
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function dispatchEvents(policy, world) {
    if (policy.onEvent === undefined) {
        return;
    }
    const count = readEvents(world.events);
    for (let i = 0; i < count; i++) {
        policy.onEvent(world, i * EVENT_STRIDE);
    }
}

/**
 * Feeds the eval observer and the policy's event hooks, so a policy that learns from the run (`map-elites-v1`)
 * behaves the same in eval, replay and bench. Neither touches the world.
 * @param {{policy: any, observer: any}} run the policy object and its observer
 * @param {Record<string, any>} world the world, just stepped (or just created)
 * @returns {void}
 */
export function feedPolicy({ policy, observer }, world) {
    observe(observer, world, policy.fitness);
    dispatchEvents(policy, world);
    if (world.tick > 0) {
        policy.afterStep?.(world);
    }
}
