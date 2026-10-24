import { describe, expect, it } from 'vitest';
import {
    CALL_WINDOW_TICKS,
    callsPerKiloTick,
    createCallWindow,
    largestSpec,
    noteCalls,
    predatorCount,
} from '../../js/worker/world-numbers.js';
import { EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} tick the tick to be at
 * @param {number[]} types the event types raised that tick
 * @returns {void}
 */
function at(world, tick, types) {
    world.tick = tick;
    world.events.count = 0;
    for (const type of types) {
        pushEvent(world.events, type, tick);
    }
}

describe('call window', () => {
    it('counts alarm and pack calls and ignores smoke and other events', () => {
        const world = smallWorld();
        const win = createCallWindow();
        const types = [
            EVENT_TYPE.ALARM_CALLED,
            EVENT_TYPE.PACK_CALLED,
            EVENT_TYPE.SMOKE_RELEASED,
            EVENT_TYPE.AGENT_DIED,
        ];
        at(world, 1, types);
        noteCalls(win, world);
        expect(win.total).toBe(2);
        expect(callsPerKiloTick(win, 1)).toBe(2000);
    });

    it('forgets calls older than the window and counts a tick once', () => {
        const world = smallWorld();
        const win = createCallWindow();
        at(world, 5, [EVENT_TYPE.ALARM_CALLED]);
        noteCalls(win, world);
        noteCalls(win, world);
        expect(win.total).toBe(2);
        at(world, 5 + CALL_WINDOW_TICKS, []);
        noteCalls(win, world);
        expect(win.total).toBe(0);
        expect(callsPerKiloTick(win, 5 + CALL_WINDOW_TICKS)).toBe(0);
    });

    it('averages over the ticks run while the window is filling', () => {
        const world = smallWorld();
        const win = createCallWindow();
        for (let tick = 1; tick <= 100; tick++) {
            at(world, tick, tick % 10 === 0 ? [EVENT_TYPE.PACK_CALLED] : []);
            noteCalls(win, world);
        }
        expect(callsPerKiloTick(win, 100)).toBe(100);
    });
});

describe('predatorCount and largestSpec', () => {
    it('sums the specialisations that can hunt', () => {
        const { config } = smallWorld();
        expect(predatorCount(config, [5, 3, 2, 1, 4])).toBe(3);
        expect(predatorCount(config, [5, 0, 2, 1, 4])).toBe(0);
    });

    it('names the most common specialisation, the lowest index on a tie, and is 0 when none are alive', () => {
        expect(largestSpec([1, 2, 0, 8, 1])).toEqual({ index: 3, share: 8 / 12 });
        expect(largestSpec([2, 2, 0, 0, 0])).toEqual({ index: 0, share: 0.5 });
        expect(largestSpec([0, 0, 0, 0, 0])).toEqual({ index: 0, share: 0 });
    });
});
