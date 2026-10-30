import { EVENT_TYPE, clearEvents, pushEvent } from '../../../js/sim/events.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createObserver } from '../../../js/evo/observer.js';
import { addBlob, lifeWorld } from '../../sim/helpers/life-world.js';

/**
 * A small empty world (8 slots, 4 rays) and an observer for it.
 * @param {Record<string, any>} [over] config overrides
 * @param {{runTicks?: number, checkpointTicks?: number}} [options] the observer's options
 * @returns {{world: any, observer: any}}
 */
export function observed(over = {}, options = {}) {
    const world = lifeWorld(over);
    return { world, observer: createObserver(world.config, fork(createRng(world.config.seed), 'eval'), options) };
}

/**
 * Starts a new tick: clears the event ring and sets `world.tick`.
 * @param {any} world the world
 * @param {number} tick the tick the world reads after the step
 * @returns {void}
 */
export function nextTick(world, tick) {
    clearEvents(world.events);
    world.tick = tick;
}

/**
 * Pushes an `AgentBorn` record.
 * @param {any} world the world
 * @param {Record<string, number>} f slot, genomeId and optional lineageId, spec, parentA, parentB, cause, tick
 * @returns {void}
 */
export function pushBorn(world, f) {
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_BORN, f.tick ?? world.tick - 1);
    const d = world.events.data;
    d.set(
        [f.slot, f.genomeId, f.lineageId ?? f.genomeId, f.spec ?? 0, f.parentA ?? 0, f.parentB ?? 0, f.cause ?? 0],
        o + 2,
    );
}

/**
 * Pushes an `AgentDied` record.
 * @param {any} world the world
 * @param {Record<string, number>} f slot, genomeId and optional cause, by, spec, lineageId, ageTicks, foodEnergy, biteEnergy, prevBiter
 * @returns {void}
 */
export function pushDied(world, f) {
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, world.tick - 1);
    const values = [f.slot, f.genomeId, f.cause ?? 0, f.by ?? 0, f.spec ?? 0, f.lineageId ?? f.genomeId];
    world.events.data.set([...values, f.ageTicks ?? 0, f.foodEnergy ?? 0, f.biteEnergy ?? 0, f.prevBiter ?? 0], o + 2);
}

/**
 * Pushes an `AlarmCalled` or `SmokeReleased` record (fields: slot, genomeId, spec, x, y).
 * @param {any} world the world
 * @param {number} type an `EVENT_TYPE` code
 * @param {number} slot the caller's slot
 * @returns {void}
 */
export function pushCall(world, type, slot) {
    const o = pushEvent(world.events, type, world.tick - 1);
    world.events.data.set([slot, world.genomeId[slot], world.spec[slot], world.x[slot], world.y[slot]], o + 2);
}

/**
 * Adds an alive agent to the world and pushes its `AgentBorn`.
 * @param {any} world the world
 * @param {Record<string, number>} fields `addBlob` fields plus the `pushBorn` fields
 * @returns {number} the slot
 */
export function addBorn(world, fields = {}) {
    const slot = addBlob(world, fields);
    pushBorn(world, { slot, genomeId: world.genomeId[slot], lineageId: world.lineageId[slot], spec: world.spec[slot] });
    return slot;
}
