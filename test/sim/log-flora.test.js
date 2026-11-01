import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';
import { smallWorld } from './helpers/small-world.js';

describe('flora events', () => {
    it('logs patch death with its species at debug level', () => {
        const world = smallWorld();
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = createSimLog((record) => records.push(record), { level: 'debug' });
        const at = pushEvent(world.events, EVENT_TYPE.PATCH_DIED, 37);
        world.events.data[at + 2] = 2;
        world.events.data[at + 3] = 3;
        drainEvents(world, log);
        expect(records).toContainEqual({ level: 'debug', event: 'PatchDied', tick: 37, patch: 2, species: 3 });
    });
    it('logs seeded parents, inherited hue and position, and names refusal reasons', () => {
        const world = smallWorld();
        /** @type {Record<string, any>[]} */
        const records = [];
        const log = createSimLog((record) => records.push(record), { level: 'debug' });
        const at = pushEvent(world.events, EVENT_TYPE.PATCH_SEEDED, 37);
        world.events.data.set([3, 2, 0, 1, 0.8, 500, 600], at + 2);
        for (let reason = 0; reason < 3; reason++) {
            const refused = pushEvent(world.events, EVENT_TYPE.SEEDING_REFUSED, 38);
            world.events.data.set([3, reason], refused + 2);
        }
        drainEvents(world, log);
        expect(records[0]).toEqual({
            level: 'debug',
            event: 'PatchSeeded',
            tick: 37,
            species: 3,
            patch: 2,
            parentA: 0,
            parentB: 1,
            hue: 0.8,
            x: 500,
            y: 600,
        });
        expect(records.slice(1).map((record) => record.reason)).toEqual(['pool', 'cooldown', 'placement']);
    });

    it('rejects an unknown seed refusal code', () => {
        const world = smallWorld();
        const log = createSimLog(() => {}, { level: 'debug' });
        const at = pushEvent(world.events, EVENT_TYPE.SEEDING_REFUSED, 0);
        world.events.data[at + 3] = 3;
        expect(() => drainEvents(world, log)).toThrow('unknown cause');
    });
});
