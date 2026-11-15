import { describe, expect, it } from 'vitest';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../js/evo/chase-arena.js';

describe('arenaConfig', () => {
    it('empties the world and lets a caller override the knobs', () => {
        const c = arenaConfig({ maxAgents: 4 });
        expect([c.initialFood, c.herdCount, c.refugeCount, c.maxAgents]).toEqual([0, 0, 0, 4]);
    });
});

describe('stageArena', () => {
    it('places the bodies at rest, in order, with their specs and half a store', () => {
        const { world } = stageArena(arenaConfig(), [
            { spec: 1, ...ARENA_CENTRE, angle: 0.5 },
            { spec: 0, x: 4100, y: 4000, angle: -1 },
        ]);
        expect(Array.from(world.spec.subarray(0, 2))).toEqual([1, 0]);
        expect([world.x[1], world.angle[0], world.vx[0]]).toEqual([4100, Math.fround(0.5), 0]);
        expect(world.energy[0]).toBeCloseTo(0.5 * world.maxEnergyBySpec[1], 3);
        expect(world.population).toBe(2);
    });
});
