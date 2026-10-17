import { RAY_CHANNELS } from '../../../js/sim/brain-layout.js';
import { updateIntent } from '../../../js/evo/observer-intent.js';
import { nextTick, observed } from './observer-world.js';

/** Ray channels, as written by the ray march. */
export const CH = Object.freeze({ FOOD: 1, BIGGER: 2, SMALLER: 3, SMOKE: 8 });

/** Specialisation indices of the default config: a forager and a predator that can hunt. */
export const FORAGER = 0;
export const PREDATOR = 1;

/**
 * A small empty world with 16 rays and a `PI / 4` bite arc, and an observer for it.
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, observer: any, intent: any}}
 */
export function intentArena(over = {}) {
    const { world, observer } = observed({ rayCount: 16, biteArc: Math.PI / 4, maxAgents: 8, ...over });
    return { world, observer, intent: observer.intent };
}

/**
 * Writes one ray's hit.
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} k the ray index
 * @param {number} proximity the hit's proximity
 * @param {number} channel a `CH` value
 * @returns {void}
 */
export function setRay(world, slot, k, proximity, channel) {
    const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
    world.inputs.fill(0, base, base + RAY_CHANNELS);
    world.inputs[base] = proximity;
    world.inputs[base + channel] = 1;
}

/**
 * Clears every ray of an agent.
 * @param {any} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
export function clearRays(world, slot) {
    const base = slot * world.layout.inputCount;
    world.inputs.fill(0, base, base + world.config.rayCount * RAY_CHANNELS);
}

/**
 * Moves to tick `tick` and updates the intent state.
 * @param {any} world the world
 * @param {any} intent the intent state
 * @param {number} tick the tick
 * @returns {void}
 */
export function tickIntent(world, intent, tick) {
    nextTick(world, tick);
    updateIntent(intent, world);
}

/**
 * Runs `count` ticks from the tick after the world's, each with the nearest hit of `channel` on ray `k` at a rising
 * proximity, and calls `before(tick)` first on each tick.
 * @param {{world: any, intent: any}} arena the arena
 * @param {{slot: number, k: number, channel: number, count: number, before?: (tick: number) => void}} f the run
 * @returns {void}
 */
export function approach(arena, f) {
    const { world, intent } = arena;
    for (let i = 1; i <= f.count; i++) {
        const tick = world.tick + 1;
        nextTick(world, tick);
        setRay(world, f.slot, f.k, i / 20, f.channel);
        f.before?.(tick);
        updateIntent(intent, world);
    }
}
