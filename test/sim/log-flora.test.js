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
});
