import { describe, expect, it } from 'vitest';
import { rewardHashBytes } from '../../js/sim/reward-hash.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { smallWorld } from './helpers/small-world.js';

describe('rewardHashBytes', () => {
    it('is empty with rewardedHebb off, so that hash has nothing to add', () => {
        expect(rewardHashBytes(smallWorld({ rewardedHebb: false }))).toEqual([]);
    });

    it('views the trace with rewardedHebb on, the same views on every call', () => {
        const world = smallWorld({ rewardedHebb: true });
        const first = rewardHashBytes(world);
        expect(first).toHaveLength(1);
        expect(first[0].byteLength).toBe(world.rewardTrace.byteLength);
        expect(rewardHashBytes(world)).toBe(first);
    });

    it('moves hashWorld when a trace entry changes', () => {
        const world = smallWorld({ rewardedHebb: true });
        const before = hashWorld(world);
        world.rewardTrace[2] = 0.5;
        expect(hashWorld(world)).not.toBe(before);
    });
});
