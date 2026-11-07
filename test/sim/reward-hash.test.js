import { describe, expect, it } from 'vitest';
import { rewardHashBytes } from '../../js/sim/reward-hash.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { smallWorld } from './helpers/small-world.js';

describe('rewardHashBytes', () => {
    it('views the trace, the same views on every call', () => {
        const world = smallWorld();
        const first = rewardHashBytes(world);
        expect(first).toHaveLength(1);
        expect(first[0].byteLength).toBe(world.rewardTrace.byteLength);
        expect(rewardHashBytes(world)).toBe(first);
    });

    it('moves hashWorld when a trace entry changes', () => {
        const world = smallWorld();
        const before = hashWorld(world);
        world.rewardTrace[2] = 0.5;
        expect(hashWorld(world)).not.toBe(before);
    });
});
