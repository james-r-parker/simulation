import { RAY_CHANNELS } from '../../../js/sim/brain-layout.js';
import { updateIntent } from '../../../js/evo/observer-intent.js';
import { addBlob } from '../../sim/helpers/life-world.js';
import { nextTick, observed } from './observer-world.js';

/** Ray channels, as written by the ray march. */
export const CH = Object.freeze({ FOOD: 1, BIGGER: 2, SMALLER: 3, SMOKE: 8 });

/** Specialisation indices of the default config: a forager and a predator that can hunt. */
export const FORAGER = 0;
export const PREDATOR = 1;

/** Distance, in px, of the hunter `seeThreat` places. */
const HUNTER_DISTANCE = 50;

/** @type {WeakMap<object, Map<number, number>>} hunters placed by `seeThreat`, per world and agent */
const hunters = new WeakMap();

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
 * Shows an agent a threat on ray `k`: a bigger-class hit on the ray, and a hunter of another lineage standing in the
 * ray's direction (one hunter per agent, moved as needed; the agent faces along +x).
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} k the ray index
 * @param {number} [proximity] the hit's proximity
 * @returns {number} the hunter's slot
 */
export function seeThreat(world, slot, k, proximity = 0.6) {
    setRay(world, slot, k, proximity, CH.BIGGER);
    const mine = hunters.get(world) ?? new Map();
    hunters.set(world, mine);
    const hunter = mine.get(slot) ?? addBlob(world, { spec: PREDATOR });
    mine.set(slot, hunter);
    const theta = (2 * Math.PI * k) / world.config.rayCount;
    world.x[hunter] = world.x[slot] + HUNTER_DISTANCE * Math.cos(theta);
    world.y[hunter] = world.y[slot] + HUNTER_DISTANCE * Math.sin(theta);
    return hunter;
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
 * Runs `updateIntent` with a genome id to slot map of the alive agents, as the observer holds one.
 * @param {any} world the world
 * @param {any} intent the intent state
 * @returns {void}
 */
export function runIntent(world, intent) {
    const slotOf = new Map();
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            slotOf.set(world.genomeId[slot], slot);
        }
    }
    updateIntent(intent, world, slotOf);
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
    runIntent(world, intent);
}

/**
 * Runs `count` ticks from the tick after the world's, each with the nearest hit of `channel` on ray `k` and the agent
 * moving along that ray at `speed` (default half `maxVelocity`), calling `before(tick)` first on each tick.
 * @param {{world: any, intent: any}} arena the arena
 * @param {{slot: number, k: number, channel: number, count: number, speed?: number, before?: (tick: number) => void}} f
 *   the run
 * @returns {void}
 */
export function approach(arena, f) {
    const { world, intent } = arena;
    const theta = (2 * Math.PI * f.k) / world.config.rayCount;
    const speed = f.speed ?? 0.5 * world.config.maxVelocity;
    for (let i = 1; i <= f.count; i++) {
        const tick = world.tick + 1;
        nextTick(world, tick);
        setRay(world, f.slot, f.k, i / 20, f.channel);
        world.vx[f.slot] = speed * Math.cos(theta);
        world.vy[f.slot] = speed * Math.sin(theta);
        f.before?.(tick);
        runIntent(world, intent);
    }
}
