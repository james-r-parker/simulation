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

    it('places rocks over every slot, foods before bodies, and a body with its own energy, size, kin and brain', () => {
        const weights = new Float32Array([0.25]);
        const { world } = stageArena(
            arenaConfig(),
            [
                { spec: 0, x: 10, y: 20, angle: 0, energy: 900, baseSize: 30, parents: [4, 5], weights },
                { spec: 0, x: 40, y: 50, angle: 0 },
            ],
            {
                foods: [
                    { x: 1, y: 2, hue: 0.5, toxicity: 0.25 },
                    { x: 3, y: 4 },
                ],
                rocks: [{ x: 7, y: 8, r: 9 }],
                atRest: false,
            },
        );
        expect([world.obsX[0], world.obsY[0], world.obsRadius[0]]).toEqual([7, 8, 9]);
        expect([world.obsX[1], world.obsRadius[1]]).toEqual([20000, 1]);
        expect([world.foodX[0], world.foodHue[0], world.foodTox[0]]).toEqual([1, Math.fround(0.5), 0.25]);
        expect(world.foodX[1]).toBe(3);
        expect(world.energy[0]).toBeCloseTo(900, 3);
        expect(world.lanes.baseSize[0]).toBe(30);
        expect([world.parentA[0], world.parentB[0], world.parentA[1]]).toEqual([4, 5, 0]);
        expect(world.weights[0]).toBe(0.25);
    });

    it('refuses more rocks than the world has slots', () => {
        const rocks = Array.from({ length: 5000 }, () => ({ x: 0, y: 0, r: 1 }));
        expect(() => stageArena(arenaConfig(), [{ spec: 0, x: 1, y: 1, angle: 0 }], { rocks })).toThrow(
            /5000 rocks do not fit/,
        );
    });
});
