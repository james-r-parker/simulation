// The detector loop: the event table, the order of a death and of a birth, the tick cadence and the error naming.

import { describe, expect, it } from 'vitest';
import {
    compileDetectors,
    createStates,
    detectorMetrics,
    dispatchEvents,
    tickDetectors,
} from '../../js/evo/observer-detectors.js';
import { createEventRing, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';

/** @param {string} name @param {string[]} log @param {Record<string, any>} [over] @returns {any} a detector that logs */
function logging(name, log, over = {}) {
    return {
        name,
        modules: [],
        create: () => ({ name }),
        on: {
            AGENT_DIED: (/** @type {any} */ s) => log.push(`${s.name}:died`),
            AGENT_BORN: (/** @type {any} */ s) => log.push(`${s.name}:born`),
        },
        onSlotFree: (/** @type {any} */ s, /** @type {number} */ slot) => log.push(`${s.name}:free${slot}`),
        onTick: (/** @type {any} */ s, /** @type {any} */ w) => log.push(`${s.name}:tick${w.tick}`),
        metrics: (/** @type {any} */ s) => ({ [`eval.${s.name}`]: { value: 1 } }),
        ...over,
    };
}

/** @param {Array<[number, number]>} events type and slot of each record @returns {any} a world holding them */
function worldWith(events, tick = 5) {
    const ring = createEventRing(16);
    for (const [type, slot] of events) {
        const o = pushEvent(ring, type, tick);
        ring.data[o + 2] = slot;
    }
    return { tick, events: ring };
}

/** @param {any} plan @returns {any} an observer holding the plan's states */
function observerOf(plan) {
    return { scenes: createStates(plan, {}, 0) };
}

describe('dispatchEvents', () => {
    it('runs every death and its resets first, then a birth resets before its handlers', () => {
        const log = /** @type {string[]} */ ([]);
        const plan = compileDetectors([logging('a', log), logging('b', log)]);
        const world = worldWith([
            [EVENT_TYPE.AGENT_BORN, 1],
            [EVENT_TYPE.AGENT_DIED, 2],
        ]);
        dispatchEvents(plan, observerOf(plan), world);
        expect(log).toEqual(['a:died', 'b:died', 'a:free2', 'b:free2', 'a:free1', 'b:free1', 'a:born', 'b:born']);
    });

    it('skips a detector that does not name the event, and runs events nobody names', () => {
        const log = /** @type {string[]} */ ([]);
        const plan = compileDetectors([logging('a', log, { on: undefined, onSlotFree: undefined })]);
        dispatchEvents(plan, observerOf(plan), worldWith([[EVENT_TYPE.AGENT_DIED, 0]]));
        expect(log).toEqual([]);
    });

    it('names the detector and the event when a handler throws', () => {
        const boom = logging('boom', [], {
            on: {
                AGENT_BORN: () => {
                    throw new Error('bad slot');
                },
            },
        });
        const plan = compileDetectors([boom]);
        expect(() => dispatchEvents(plan, observerOf(plan), worldWith([[EVENT_TYPE.AGENT_BORN, 0]]))).toThrow(
            'detector boom reading AGENT_BORN: bad slot',
        );
    });
});

describe('tickDetectors', () => {
    it('runs at tick 0 only the detectors that ask, and each on its own interval', () => {
        const log = /** @type {string[]} */ ([]);
        const plan = compileDetectors([
            logging('every', log),
            logging('start', log, { atStart: true, every: 10 }),
            logging('ten', log, { every: 10 }),
            logging('none', log, { onTick: undefined }),
        ]);
        const observer = observerOf(plan);
        tickDetectors(plan, observer, { tick: 0 });
        tickDetectors(plan, observer, { tick: 5 });
        tickDetectors(plan, observer, { tick: 10 });
        expect(log).toEqual(['start:tick0', 'every:tick5', 'every:tick10', 'start:tick10', 'ten:tick10']);
    });
});

describe('createStates and detectorMetrics', () => {
    it('links the states after all exist and merges the metrics', () => {
        const linked = /** @type {string[]} */ ([]);
        const plan = compileDetectors([
            logging('a', [], { link: (/** @type {any} */ states) => linked.push(Object.keys(states).join()) }),
            logging('b', []),
        ]);
        const observer = observerOf(plan);
        expect(linked).toEqual(['a,b']);
        expect(Object.keys(detectorMetrics(plan, observer, {}))).toEqual(['eval.a', 'eval.b']);
    });
});
