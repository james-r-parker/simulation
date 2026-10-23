import { computeMetrics } from '../../../js/evo/metrics.js';
import { observe } from '../../../js/evo/observer.js';
import { CH, intentArena, setRay } from './intent-world.js';
import { nextTick } from './observer-world.js';

/**
 * A small empty arena (16 rays, `PI / 4` bite arc) for the intent metric audits, with its first `observe` at tick 0.
 * Call it after adding the agents with `addBorn`.
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, observer: any, intent: any, start: () => void}}
 */
export function auditArena(over = {}) {
    const arena = intentArena({ maxAgents: 16, ...over });
    return { ...arena, start: () => observe(arena.observer, arena.world) };
}

/**
 * Runs the real `observe` for each tick in `from..to`, calling `onTick` after the clock moves and the event ring clears.
 * @param {{world: any, observer: any}} run the world and observer
 * @param {number} from the first tick
 * @param {number} to the last tick
 * @param {(tick: number) => void} [onTick] sets the world state and pushes the tick's events
 * @returns {void}
 */
export function ticks({ world, observer }, from, to, onTick = () => {}) {
    for (let t = from; t <= to; t++) {
        nextTick(world, t);
        onTick(t);
        observe(observer, world);
    }
}

/**
 * @param {{world: any, observer: any}} run the world and observer
 * @param {string} name the metric without the `eval.` prefix
 * @returns {import('../../../js/evo/metrics-stats.js').MetricResult} the metric
 */
export function metric({ world, observer }, name) {
    return computeMetrics(observer, world)[`eval.${name}`];
}

/**
 * Shows the agent a target dead ahead (ray 0) at a rising proximity and moves it towards it at half `maxVelocity`: a
 * closing tick. Set it on each tick of an approach; 6 ticks make a deliberate meal or bite.
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} channel a `CH` value, `CH.FOOD` or `CH.PREY`
 * @param {number} tick the tick, which sets the proximity
 * @returns {void}
 */
export function closeOn(world, slot, channel, tick) {
    setRay(world, slot, 0, Math.min(1, tick / 20), channel);
    world.vx[slot] = 0.5 * world.config.maxVelocity;
    world.vy[slot] = 0;
}

export { CH };
