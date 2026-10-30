import { describe, expect, it } from 'vitest';
import { LOSS_CAUSE } from '../../js/sim/energy.js';
import { countCollisions, countTick, nearestFoodRay, turnsTowardsFood } from '../../js/evo/observer-tick.js';
import { addBorn, nextTick, observed } from './helpers/observer-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';

/**
 * Sets one ray's proximity and food flag in an agent's inputs row (4 rays, `RAY_CHANNELS` channels each).
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} ray the ray index
 * @param {number} proximity the proximity value
 * @param {number} [food] the food channel
 * @returns {void}
 */
function setRay(world, slot, ray, proximity, food = 1) {
    const base = slot * world.layout.rawInputCount + ray * RAY_CHANNELS;
    world.inputs[base] = proximity;
    world.inputs[base + 1] = food;
}

describe('nearestFoodRay', () => {
    it('picks the highest proximity among food rays and ignores other classes', () => {
        const { world } = observed();
        const slot = addBorn(world);
        setRay(world, slot, 0, 0.9, 0);
        setRay(world, slot, 1, 0.3);
        setRay(world, slot, 3, 0.6);
        expect(nearestFoodRay(world, slot)).toBe(3);
    });

    it('returns -1 without food and the first ray on equal distances', () => {
        const { world } = observed();
        const slot = addBorn(world);
        expect(nearestFoodRay(world, slot)).toBe(-1);
        setRay(world, slot, 1, 0.5);
        setRay(world, slot, 3, 0.5);
        expect(nearestFoodRay(world, slot)).toBe(1);
    });
});

describe('turnsTowardsFood', () => {
    // 4 rays: ray 1 is 90 degrees on the positive side, ray 2 behind, ray 3 on the negative side.
    it.each([
        ['positive turn, food on the positive side', 1, 0.05, true],
        ['negative turn, food on the positive side', 1, -0.05, false],
        ['negative turn, food on the negative side', 3, -0.05, true],
        ['positive turn, food on the negative side', 3, 0.05, false],
        ['food straight ahead', 0, 0.05, false],
        ['food straight behind', 2, 0.05, false],
        ['turn at the threshold (0.1 x maxTurn)', 1, 0.02, false],
        ['turn just above the threshold', 1, 0.0201, true],
    ])('%s', (_n, ray, turn, expected) => {
        const { world } = observed({ maxTurn: 0.2 });
        const slot = addBorn(world);
        setRay(world, slot, ray, 0.5);
        world.turnRate[slot] = turn;
        expect(turnsTowardsFood(world, slot)).toBe(expected);
    });

    it('is false when no ray sees food', () => {
        const { world } = observed();
        const slot = addBorn(world);
        world.turnRate[slot] = 0.1;
        expect(turnsTowardsFood(world, slot)).toBe(false);
    });
});

describe('countTick', () => {
    it('copies age and energy totals and sums distance as speed per tick', () => {
        const { world, observer } = observed();
        const slot = addBorn(world, { ageTicks: 12, foodEnergy: 3, biteEnergy: 4, vx: 3, vy: 4 });
        countTick(observer, world);
        countTick(observer, world);
        expect([observer.ageTicks[slot], observer.foodEnergy[slot], observer.biteEnergy[slot]]).toEqual([12, 3, 4]);
        expect(observer.distance[slot]).toBe(10);
    });

    it('counts a collision on each call that finds lastLoss at collision, and none from countTick', () => {
        const { world, observer } = observed();
        const slot = addBorn(world);
        const other = addBorn(world);
        const seq = [LOSS_CAUSE.COLLISION, LOSS_CAUSE.COLLISION, LOSS_CAUSE.COST, LOSS_CAUSE.COLLISION];
        for (const loss of seq) {
            world.lastLoss[slot] = loss;
            world.lastLoss[other] = LOSS_CAUSE.BITE;
            countCollisions(observer, world);
            countTick(observer, world);
        }
        expect(observer.collisions[slot]).toBe(3);
        expect(observer.collisions[other]).toBe(0);
    });

    it('counts turns towards food each tick', () => {
        const { world, observer } = observed({ maxTurn: 0.2 });
        const slot = addBorn(world);
        setRay(world, slot, 1, 0.5);
        world.turnRate[slot] = 0.1;
        countTick(observer, world);
        countTick(observer, world);
        expect(observer.turnsTowardsFood[slot]).toBe(2);
    });

    it('counts distinct 200 px cells, sampled only on ticks divisible by 10', () => {
        const { world, observer } = observed();
        const slot = addBorn(world);
        const visit = (/** @type {number} */ tick, /** @type {number} */ x, /** @type {number} */ y) => {
            nextTick(world, tick);
            world.x[slot] = x;
            world.y[slot] = y;
            countTick(observer, world);
        };
        visit(10, 50, 50);
        visit(11, 450, 450);
        visit(20, 150, 150);
        visit(30, 450, 50);
        visit(40, 450, 50);
        expect(observer.cellsVisited[slot]).toBe(2);
    });

    it('keeps cells of different slots apart and clamps positions outside the world', () => {
        const { world, observer } = observed();
        const a = addBorn(world);
        const b = addBorn(world);
        nextTick(world, 10);
        world.x[a] = -50;
        world.y[b] = 99999;
        countTick(observer, world);
        expect([observer.cellsVisited[a], observer.cellsVisited[b]]).toEqual([1, 1]);
    });

    it('samples motion every 100 ticks with speed clamped to 1', () => {
        const { world, observer } = observed({ maxVelocity: 8, maxTurn: 0.2 });
        const slot = addBorn(world, { vx: 4, vy: 0 });
        world.turnRate[slot] = -0.1;
        for (const tick of [99, 100, 150]) {
            nextTick(world, tick);
            countTick(observer, world);
        }
        world.vx[slot] = 30;
        nextTick(world, 200);
        countTick(observer, world);
        expect(observer.samples[slot]).toBe(2);
        expect(observer.speedSum[slot]).toBeCloseTo(1.5, 10);
        expect(observer.turnSum[slot]).toBeCloseTo(1, 6);
    });

    it('skips dead slots', () => {
        const { world, observer } = observed();
        world.vx[2] = 5;
        countTick(observer, world);
        expect(observer.distance[2]).toBe(0);
    });
});
