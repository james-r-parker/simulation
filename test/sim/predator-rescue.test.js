import { describe, expect, it } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { drainEvents } from '../../js/sim/log.js';
import { rescuePredators } from '../../js/sim/predator-rescue.js';
import { addBlob } from './helpers/life-world.js';
import { PREDATOR, foragerPolicy, predators } from './helpers/predator-rescue-world.js';
import { smallWorld } from './helpers/small-world.js';

describe('rescuePredators', () => {
    const ON = { predatorRescueMin: 2, predatorRescueInterval: 100, maxAgents: 8 };

    it('spawns one immigrant predator on the interval and pushes PredatorRescue with the count before it', () => {
        const w = smallWorld(ON);
        addBlob(w, { spec: PREDATOR });
        const specs = /** @type {number[]} */ ([]);
        w.tick = 100;
        rescuePredators(w, foragerPolicy(specs));
        expect(predators(w)).toBe(2);
        expect(specs).toEqual([PREDATOR]);
        const [born, rescue] = [0, 1].map((i) =>
            Array.from(w.events.data.subarray(i * EVENT_STRIDE, (i + 1) * EVENT_STRIDE)),
        );
        expect([born[0], born[5], born[8]]).toEqual([EVENT_TYPE.AGENT_BORN, PREDATOR, 4]);
        expect(rescue.slice(0, 4)).toEqual([EVENT_TYPE.PREDATOR_RESCUE, 100, 1, 4]);
    });

    it.each(
        /** @type {[string, {tick: number, over?: Record<string, number>}][]} */ ([
            ['off the interval', { tick: 101 }],
            ['at tick 0', { tick: 0 }],
            ['with predatorRescueMin 0', { tick: 100, over: { predatorRescueMin: 0 } }],
            ['with enough predators', { tick: 100, over: { predatorRescueMin: 1 } }],
            ['at maxAgents', { tick: 100, over: { maxAgents: 1 } }],
        ]),
    )('does nothing %s and draws nothing', (_name, { tick, over }) => {
        const w = smallWorld({ ...ON, ...over });
        addBlob(w, { spec: PREDATOR });
        const before = [Array.from(w.rng.spawn.s), Array.from(w.rng['brain-init'].s), w.population];
        w.tick = tick;
        rescuePredators(w, foragerPolicy());
        expect([Array.from(w.rng.spawn.s), Array.from(w.rng['brain-init'].s), w.population]).toEqual(before);
        expect(w.events.count).toBe(0);
    });

    it('counts every specialisation that can hunt as a predator', () => {
        const w = smallWorld({
            ...ON,
            specialisations: { scout: { canHunt: true } },
        });
        addBlob(w, { spec: 3 });
        addBlob(w, { spec: PREDATOR });
        w.tick = 100;
        rescuePredators(w, foragerPolicy());
        expect(w.population).toBe(2);
    });

    it('logs PredatorRescue at debug with the tick, the count and the cause', () => {
        const w = smallWorld(ON);
        w.tick = 100;
        rescuePredators(w, foragerPolicy());
        /** @type {any[]} */
        const lines = [];
        drainEvents(w, {
            level: 'debug',
            log: (/** @type {string} */ level, /** @type {string} */ name, /** @type {any} */ f) =>
                lines.push([level, name, f]),
        });
        expect(lines.at(-1)).toEqual(['debug', 'PredatorRescue', { tick: 100, count: 0, cause: 'immigrant' }]);
    });
});

describe('the predator rescue keys', () => {
    it('default off with a 600 tick interval', () => {
        const { config } = smallWorld({});
        expect([config.predatorRescueMin, config.predatorRescueInterval]).toEqual([0, 600]);
    });

    it.each([
        [{ predatorRescueMin: 51 }],
        [{ predatorRescueMin: -1 }],
        [{ predatorRescueMin: 1.5 }],
        [{ predatorRescueInterval: 0 }],
        [{ predatorRescueInterval: 6001 }],
    ])('rejects %j', (over) => {
        expect(() => smallWorld(over)).toThrow(/predatorRescue/);
    });
});
