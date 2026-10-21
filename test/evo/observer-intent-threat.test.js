import { describe, expect, it } from 'vitest';
import { collectHunters, resolveThreat } from '../../js/evo/observer-intent-threat.js';
import { SCAN, summariseRays } from '../../js/evo/ray-summary.js';
import { CH, FORAGER, PREDATOR, intentArena, seeThreat, setRay } from './helpers/intent-world.js';
import { addBlob } from '../sim/helpers/life-world.js';

/**
 * Summarises the rays of `slot` and resolves its threat.
 * @param {{world: any, intent: any}} arena the arena
 * @param {number} slot the agent
 * @returns {{seen: boolean, scan: Float64Array}}
 */
function resolve({ world, intent }, slot) {
    collectHunters(intent, world);
    summariseRays(world, slot, intent.scan, intent.arc);
    return { seen: resolveThreat(intent, world, slot), scan: intent.scan };
}

describe('collectHunters', () => {
    it('lists the alive canHunt slots only', () => {
        const { world, intent } = intentArena();
        addBlob(world, { spec: FORAGER });
        const h = addBlob(world, { spec: PREDATOR });
        const dead = addBlob(world, { spec: PREDATOR });
        world.alive[dead] = 0;
        collectHunters(intent, world);
        expect([intent.hunterCount, intent.hunters[0]]).toEqual([1, h]);
    });
});

describe('resolveThreat', () => {
    it('is a threat when a hunter of another lineage stands along a ray that hits something bigger', () => {
        const arena = intentArena();
        const slot = addBlob(arena.world, { spec: FORAGER });
        seeThreat(arena.world, slot, 14, 0.7);
        const { seen, scan } = resolve(arena, slot);
        expect(seen).toBe(true);
        expect([scan[SCAN.THREAT], scan[SCAN.THREAT_RAY], scan[SCAN.THREAT_ARC]]).toEqual([expect.closeTo(0.7), 14, 1]);
    });

    it('follows the agent heading and flags a ray off the arc', () => {
        const arena = intentArena();
        const { world } = arena;
        const slot = addBlob(world, { spec: FORAGER });
        world.angle[slot] = Math.PI / 2;
        const hunter = seeThreat(world, slot, 4);
        world.x[hunter] = world.x[slot] - 50;
        world.y[hunter] = world.y[slot];
        const { seen, scan } = resolve(arena, slot);
        expect([seen, scan[SCAN.THREAT_RAY], scan[SCAN.THREAT_ARC]]).toEqual([true, 4, 0]);
    });

    it('is no threat for a bigger hit with no hunter, a same-lineage hunter, or one out of range', () => {
        const arena = intentArena();
        const slot = addBlob(arena.world, { spec: FORAGER });
        setRay(arena.world, slot, 2, 0.6, CH.BIGGER);
        expect(resolve(arena, slot).seen).toBe(false);
        const hunter = seeThreat(arena.world, slot, 2);
        arena.world.lineageId[hunter] = arena.world.lineageId[slot];
        expect(resolve(arena, slot).seen).toBe(false);
        arena.world.lineageId[hunter] = 999;
        expect(resolve(arena, slot).seen).toBe(true);
        arena.world.x[hunter] = arena.world.x[slot] + 5000;
        expect(resolve(arena, slot).seen).toBe(false);
    });

    it('is no threat when the hunter is in a direction whose ray hits something else', () => {
        const arena = intentArena();
        const slot = addBlob(arena.world, { spec: FORAGER });
        seeThreat(arena.world, slot, 2);
        setRay(arena.world, slot, 2, 0.6, CH.FOOD);
        setRay(arena.world, slot, 9, 0.6, CH.BIGGER);
        expect(resolve(arena, slot).seen).toBe(false);
    });
});
