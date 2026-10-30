import { describe, expect, it } from 'vitest';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';

const agent = { x: 1000, y: 2000, angle: 0.5, spec: 0, energy: 800 };

describe('stageWorld', () => {
    it('places the agents in slot order with their position, heading and specialisation', () => {
        const hunter = { x: 1200, y: 2100, angle: -1, spec: 1, energy: 1500 };
        const { world } = stageWorld({ foods: [], rocks: [], agents: [agent, hunter], seed: 3 });
        expect(world.population).toBe(2);
        expect([world.x[0], world.y[0], world.angle[0]].map(Math.fround)).toEqual([1000, 2000, 0.5]);
        expect([world.x[1], world.y[1], world.angle[1]].map(Math.fround)).toEqual([1200, 2100, -1]);
        expect([world.spec[0], world.spec[1]]).toEqual([0, 1]);
        expect(world.energy[1]).toBe(1500);
    });

    it('places the food items and the rocks, and parks the unused rocks out of reach', () => {
        const { world } = stageWorld({
            foods: [{ x: 500, y: 600 }],
            rocks: [{ x: 700, y: 800, r: 50 }],
            agents: [agent],
            seed: 3,
        });
        expect(world.foodCount).toBe(1);
        expect([world.foodX[0], world.foodY[0]]).toEqual([500, 600]);
        expect([world.obsX[0], world.obsY[0], world.obsRadius[0]]).toEqual([700, 800, 50]);
        expect(world.obsX[1]).toBeGreaterThan(world.config.worldWidth);
    });

    it('stays empty of anything the scene did not place: no regrowth', () => {
        const { world, policy } = stageWorld({ foods: [], rocks: [], agents: [agent], seed: 3 });
        expect(world.foodCount).toBe(0);
        expect(policy.initSpec(world, 0)).toBe(0);
    });

    it('refuses more rocks than the world has slots, naming the numbers', () => {
        const rocks = Array.from({ length: 500 }, () => ({ x: 0, y: 0, r: 1 }));
        expect(() => stageWorld({ foods: [], rocks, agents: [agent], seed: 3 })).toThrow(/500 rocks do not fit/);
    });
});
