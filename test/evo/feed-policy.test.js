import { describe, expect, it } from 'vitest';
import { dispatchEvents, feedPolicy } from '../../js/evo/feed-policy.js';
import { createObserver } from '../../js/evo/observer.js';
import { EVENT_STRIDE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { createRng } from '../../js/sim/rng.js';
import { smallWorld } from '../sim/helpers/small-world.js';

describe('dispatchEvents', () => {
    it('gives the policy the offset of each event record in order', () => {
        const world = smallWorld();
        pushEvent(world.events, EVENT_TYPE.AGENT_BORN, 1);
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 1);
        /** @type {number[]} */
        const offsets = [];
        dispatchEvents({ onEvent: (/** @type {any} */ _world, /** @type {number} */ o) => offsets.push(o) }, world);
        expect(offsets).toEqual([0, EVENT_STRIDE]);
    });

    it('does nothing for a policy without onEvent', () => {
        expect(() => dispatchEvents({}, smallWorld())).not.toThrow();
    });
});

describe('feedPolicy', () => {
    it('observes the tick, dispatches its events, then runs afterStep once the world has ticked', () => {
        const world = smallWorld();
        const observer = createObserver(world.config, createRng(1));
        /** @type {string[]} */
        const calls = [];
        const policy = {
            fitness: undefined,
            onEvent: () => calls.push('event'),
            afterStep: () => calls.push('after'),
        };
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 0);
        feedPolicy({ policy, observer }, world);
        expect(calls).toEqual(['event']);
        world.tick = 1;
        feedPolicy({ policy, observer }, world);
        expect(calls).toEqual(['event', 'event', 'after']);
        expect(observer.ticks).toBe(1);
    });
});
