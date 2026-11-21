import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { step } from '../../js/sim/step.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../js/evo/chase-arena.js';
import {
    foragerBrain,
    nearestFood,
    sitterBrain,
    walkThrust,
    walkerBrain,
    wayfarerBrain,
} from '../../js/evo/forage-oracles.js';

const out = (/** @type {any} */ world, /** @type {number} */ slot, /** @type {string} */ name) =>
    world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX[name]];

/** @param {{x: number, y: number}[]} foods @returns {ReturnType<typeof stageArena>} one forager at the arena's centre */
function arena(foods = []) {
    const config = arenaConfig();
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    return stageArena(config, [{ spec: specs.forager.index, ...ARENA_CENTRE, angle: 0 }], { foods });
}

describe('nearestFood', () => {
    it('finds the nearest alive food within the distance, and none beyond it', () => {
        const { x, y } = ARENA_CENTRE;
        const { world } = arena([
            { x: x + 200, y },
            { x: x - 90, y },
        ]);
        const near = nearestFood(world, 0, 1000);
        expect(near.gap).toBeCloseTo(90, 6);
        expect(world.foodX[near.food]).toBe(x - 90);
        expect(nearestFood(world, 0, 50)).toEqual({ food: -1, gap: Infinity });
    });
});

describe('foragerBrain', () => {
    it('holds THRUST and BITE and steers at the nearest food, a full turn to the side when it is behind', () => {
        const { x, y } = ARENA_CENTRE;
        const { world } = arena([{ x, y: y + 100 }]);
        foragerBrain({ slot: 0 })(world);
        expect([out(world, 0, 'THRUST'), out(world, 0, 'BITE')]).toEqual([1, 1]);
        expect(out(world, 0, 'TURN')).toBeGreaterThan(0);
        const behind = arena([{ x: x - 100, y }]);
        foragerBrain({ slot: 0 })(behind.world);
        expect(Math.abs(out(behind.world, 0, 'TURN'))).toBe(1);
    });

    it('with no food holds THRUST and BITE and no turn', () => {
        const { world } = arena();
        foragerBrain({ slot: 0 })(world);
        expect([out(world, 0, 'TURN'), out(world, 0, 'THRUST')]).toEqual([0, 1]);
    });
});

describe('walkThrust and the walkers', () => {
    it('gives the steady speed wanted: a walker reaches 2 px a tick and holds it', () => {
        const { world, policy } = arena();
        const brain = walkerBrain({ slot: 0, speed: 2 });
        for (let n = 0; n < 150; n++) {
            step(world, policy, { brain });
        }
        expect(Math.hypot(world.vx[0], world.vy[0])).toBeCloseTo(2, 1);
    });

    it('is at most 1 for a speed the body cannot reach', () => {
        const { world } = arena();
        expect(walkThrust(world, 0, 1000)).toBe(1);
        expect(walkThrust(world, 0, 0)).toBe(0);
    });
});

describe('wayfarerBrain', () => {
    it('walks at the given speed on its heading with BITE released while no food is in view (find mode)', () => {
        const { world } = arena();
        const brain = wayfarerBrain({ slot: 0, mode: 'find', speed: 2, view: 300 });
        brain(world);
        expect(out(world, 0, 'BITE')).toBe(0);
        expect(out(world, 0, 'TURN')).toBe(0);
        expect(out(world, 0, 'THRUST')).toBeGreaterThan(0);
        expect(out(world, 0, 'THRUST')).toBeLessThan(0.5);
        expect(brain.state.ateTick).toBe(-1);
    });

    it('steers to food in view and holds BITE close to it, and notes the tick it first ate', () => {
        const { x, y } = ARENA_CENTRE;
        const { world } = arena([{ x, y: y + 40 }]);
        world.patchX[0] = x;
        world.patchY[0] = y;
        const brain = wayfarerBrain({ slot: 0, mode: 'find', speed: 2, view: 300 });
        brain(world);
        expect(out(world, 0, 'BITE')).toBe(1);
        expect(out(world, 0, 'TURN')).toBeGreaterThan(0);
        world.tick = 7;
        world.foodEnergy[0] = 10;
        brain(world);
        expect(brain.state.ateTick).toBe(7);
    });

    it('in reach mode turns to the nearest patch when no food is in view', () => {
        const { x, y } = ARENA_CENTRE;
        const { world } = arena();
        world.patchX[0] = x;
        world.patchY[0] = y + 5000;
        for (let i = 1; i < world.config.foodPatchCount; i++) {
            world.patchX[i] = x + 90000;
            world.patchY[i] = y;
        }
        const reach = wayfarerBrain({ slot: 0, mode: 'reach', speed: 2, view: 300 });
        reach(world);
        expect(out(world, 0, 'TURN')).toBeGreaterThan(0);
        const find = wayfarerBrain({ slot: 0, mode: 'find', speed: 2, view: 300 });
        find(world);
        expect(out(world, 0, 'TURN')).toBe(0);
    });
});

describe('sitterBrain', () => {
    it('holds nothing', () => {
        const { world } = arena();
        world.outputs.fill(1, 0, OUTPUT_COUNT);
        sitterBrain({ slot: 0 })(world);
        expect(Array.from(world.outputs.slice(0, OUTPUT_COUNT)).every((v) => v === 0)).toBe(true);
    });
});
