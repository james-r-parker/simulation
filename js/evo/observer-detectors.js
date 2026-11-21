// The detector loop (docs/designs/registries.md, Detectors): builds the detectors' states, dispatches a tick's events to
// the detectors that name them, runs each detector's `onTick` and gathers their metrics. A detector is a module of one
// shape (`Detector` below); the observer owns only this loop.

import { EVENT, EVENT_BY_CODE, EVENT_STRIDE, EVENT_TYPE, EVENTS } from '../sim/events.js';

/**
 * @typedef {(state: any, world: Record<string, any>, o: number, observer: Record<string, any>) => void} EventHandler
 *   one event's handler: the detector's state, the world, the offset of the record in `world.events.data` and the observer
 */

/**
 * @typedef {object} Detector one scene detector
 * @property {string} name the detector's name, and the key of its state in `observer.scenes`
 * @property {readonly string[]} modules the repo paths its metrics are registered under (`module` of a metric registry
 *   entry); the contract test holds `metrics()` to exactly those entries
 * @property {string} [sourceTest] the one test that is the source test of every metric of those modules
 * @property {boolean} [lean] whether a lean observer (the policy core) builds and feeds it
 * @property {boolean} [atStart] whether `onTick` also runs at tick 0, right after `createWorld`
 * @property {number} [every] ticks between `onTick` runs (default 1)
 * @property {(config: Readonly<Record<string, any>>, context: {runTicks: number}) => any} create the detector's state
 * @property {(states: Record<string, any>) => void} [link] wires the state to the other detectors' states, once all exist
 * @property {(state: any, world: Record<string, any>, observer: Record<string, any>) => void} [onTick] once every
 *   `every` ticks, after the tick's events
 * @property {Readonly<Record<string, EventHandler>>} [on] event name of `EVENTS` to handler; a death's handlers run
 *   before its `onSlotFree`, a birth's after it
 * @property {(state: any, slot: number) => void} [onSlotFree] resets the per-slot state of a slot whose agent died or
 *   was born
 * @property {(state: any, world: Record<string, any>, observer: Record<string, any>) => import('./metrics-stats.js').MetricRecord} metrics
 *   the detector's metrics, by name
 */

/**
 * @typedef {{name: string, fn: EventHandler}} Handler a detector's handler for one event
 */

/**
 * @typedef {object} Plan a detector list compiled for the loop
 * @property {readonly Detector[]} list the detectors, in order
 * @property {readonly (readonly Handler[])[]} byEvent the handlers of each event, indexed by the event's code
 * @property {readonly {name: string, fn: (state: any, slot: number) => void}[]} free the slot resets
 * @property {readonly Detector[]} ticks the detectors with an `onTick`
 */

const DIED = EVENT_TYPE.AGENT_DIED;
const BORN = EVENT_TYPE.AGENT_BORN;

/**
 * @param {readonly Detector[]} list the detectors to run, in order
 * @returns {Plan} the list with its event table built; an event name `EVENTS` does not hold throws
 */
export function compileDetectors(list) {
    /** @type {Handler[][]} */
    const byEvent = [];
    for (const def of EVENTS) {
        byEvent[def.code] = [];
    }
    const free = [];
    for (const detector of list) {
        for (const [event, fn] of Object.entries(detector.on ?? {})) {
            if (!Object.hasOwn(EVENT_TYPE, event)) {
                throw new Error(`detector ${detector.name} names the event ${event}, which EVENTS does not hold`);
            }
            byEvent[EVENT_TYPE[event]].push({ name: detector.name, fn });
        }
        if (detector.onSlotFree !== undefined) {
            free.push({ name: detector.name, fn: detector.onSlotFree });
        }
    }
    return { list, byEvent, free, ticks: list.filter((detector) => detector.onTick !== undefined) };
}

/**
 * Builds every detector's state, then lets each link to the others.
 * @param {Plan} plan the compiled list
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} runTicks the run length in ticks
 * @returns {Record<string, any>} the states by detector name
 */
export function createStates(plan, config, runTicks) {
    /** @type {Record<string, any>} */
    const states = {};
    for (const detector of plan.list) {
        states[detector.name] = detector.create(config, { runTicks });
    }
    for (const detector of plan.list) {
        detector.link?.(states);
    }
    return states;
}

/**
 * Runs the handlers of one event record; a detector that throws is named with the event it was reading.
 * @param {readonly Handler[]} handlers the handlers
 * @param {Record<string, any>} observer the observer, whose `scenes` hold the states
 * @param {Record<string, any>} world the world
 * @param {number} o the record offset
 * @returns {void}
 */
function fire(handlers, observer, world, o) {
    for (const { name, fn } of handlers) {
        try {
            fn(observer.scenes[name], world, o, observer);
        } catch (error) {
            const event = EVENT_BY_CODE[world.events.data[o]];
            throw new Error(`detector ${name} reading ${event.name}: ${/** @type {Error} */ (error).message}`, {
                cause: error,
            });
        }
    }
}

/**
 * @param {Plan} plan the compiled list
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the slot
 * @returns {void}
 */
function freeSlot(plan, observer, slot) {
    for (const { name, fn } of plan.free) {
        fn(observer.scenes[name], slot);
    }
}

/**
 * Dispatches a tick's events: every death first (its handlers, then the slot resets), then the other records in order (a
 * birth resets its slot before its handlers run), as `applyEvents` orders them.
 * @param {Plan} plan the compiled list
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function dispatchEvents(plan, observer, world) {
    const d = world.events.data;
    const end = world.events.count * EVENT_STRIDE;
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] === DIED) {
            fire(plan.byEvent[DIED], observer, world, o);
            freeSlot(plan, observer, d[o + EVENT.AGENT_DIED.SLOT]);
        }
    }
    for (let o = 0; o < end; o += EVENT_STRIDE) {
        if (d[o] === DIED) {
            continue;
        }
        if (d[o] === BORN) {
            freeSlot(plan, observer, d[o + EVENT.AGENT_BORN.SLOT]);
        }
        fire(plan.byEvent[d[o]], observer, world, o);
    }
}

/**
 * Runs each detector's `onTick` on the ticks it asks for; tick 0 only for those with `atStart`.
 * @param {Plan} plan the compiled list
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function tickDetectors(plan, observer, world) {
    const { tick } = world;
    for (const detector of plan.ticks) {
        if (tick === 0 ? detector.atStart !== true : tick % (detector.every ?? 1) !== 0) {
            continue;
        }
        /** @type {NonNullable<Detector['onTick']>} */ (detector.onTick)(
            observer.scenes[detector.name],
            world,
            observer,
        );
    }
}

/**
 * @param {Plan} plan the compiled list
 * @param {Record<string, any>} observer the observer, fed every tick
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {import('./metrics-stats.js').MetricRecord} every detector's metrics, merged
 */
export function detectorMetrics(plan, observer, world) {
    /** @type {import('./metrics-stats.js').MetricRecord} */
    const all = {};
    for (const detector of plan.list) {
        Object.assign(all, detector.metrics(observer.scenes[detector.name], world, observer));
    }
    return all;
}
