// The per-slot patch-visit bitset on its own. The metric reading it is tested in metrics-watch.test.js.

import { describe, expect, it } from 'vitest';
import { createVisitPools, noteVisitDeath, resetVisits, sampleVisits } from '../../js/evo/watch-visits.js';

/**
 * @param {number} patches the patch count
 * @returns {{pools: any, world: any}} pools for 3 slots and a world whose patch p is at (1000 p, 0), radius 100
 */
function setup(patches) {
    const pools = createVisitPools({ floraPatchMax: patches, maxAgents: 3, maturityTicks: 10 });
    const world = {
        config: { foodPatchRadius: 100 },
        patchAlive: new Uint8Array(patches).fill(1),
        patchX: Float32Array.from({ length: patches }, (_, p) => 1000 * p),
        patchY: new Float32Array(patches),
        alive: Uint8Array.from([1, 1, 0]),
        x: new Float32Array(3),
        y: new Float32Array(3),
    };
    return { pools, world };
}

describe('watch-visits', () => {
    it('sizes the bitset by patch count: one word up to 32 patches, 8 words at the 256 cap, none at 0', () => {
        expect(setup(0).pools.bits).toHaveLength(0);
        expect(setup(32).pools.words).toBe(1);
        expect(setup(33).pools.words).toBe(2);
        expect(setup(256).pools.bits).toHaveLength(3 * 8);
    });

    it('counts each patch once per slot, across word boundaries, and only for alive slots', () => {
        const { pools, world } = setup(40);
        world.x.set([31000, 39000, 0]); // slot 0 in patch 31, slot 1 in patch 39, slot 2 (dead) in patch 0
        sampleVisits(pools, world);
        sampleVisits(pools, world);
        world.x[0] = 32000; // patch 32: the second word
        sampleVisits(pools, world);
        expect(Array.from(pools.visited)).toEqual([2, 1, 0]);
    });

    it('does not visit a dead patch until that pool slot is occupied', () => {
        const { pools, world } = setup(2);
        world.patchAlive[0] = 0;
        sampleVisits(pools, world);
        expect(pools.visited[0]).toBe(0);
        world.patchAlive[0] = 1;
        sampleVisits(pools, world);
        expect(pools.visited[0]).toBe(1);
    });

    it('tracks a later seedling after the pool starts without live patches', () => {
        const { pools, world } = setup(4);
        world.patchAlive.fill(0);
        sampleVisits(pools, world);
        expect(pools.hadPatches).toBe(false);
        world.patchAlive[3] = 1;
        world.x[0] = 3000;
        sampleVisits(pools, world);
        expect(pools.hadPatches).toBe(true);
        expect(pools.visited[0]).toBe(1);
    });

    it('resets one slot only', () => {
        const { pools, world } = setup(40);
        sampleVisits(pools, world); // both alive slots at (0, 0): patch 0
        resetVisits(pools, 0);
        expect(Array.from(pools.visited)).toEqual([0, 1, 0]);
        sampleVisits(pools, world);
        expect(Array.from(pools.visited)).toEqual([1, 1, 0]);
    });

    it('records a death only from maturityTicks on', () => {
        const { pools, world } = setup(2);
        sampleVisits(pools, world);
        noteVisitDeath(pools, 0, 9);
        expect(pools.deaths).toBe(0);
        noteVisitDeath(pools, 0, 10);
        expect([pools.deaths, pools.visitSum]).toEqual([1, 1]);
    });
});
