import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE } from '../../js/sim/events.js';
import { TIMER_CAP, allocAgent, allocateWorld, freeAgent, removeFood } from '../../js/sim/world.js';

const SMALL = {
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 10,
    initialFood: 0,
    obstacleCount: 2,
    fertileZoneMax: 3,
};

/** @returns {ReturnType<typeof allocateWorld>} */
function smallWorld() {
    return allocateWorld(createConfig(SMALL));
}

/**
 * @param {ReturnType<typeof allocateWorld>} world
 * @param {number} slot
 */
function fillSlot(world, slot) {
    for (const { array, stride } of world.agentRows) {
        array.fill(1, slot * stride, (slot + 1) * stride);
    }
    world.alive[slot] = 1;
}

describe('allocateWorld', () => {
    it('sizes the agent arrays from the config', () => {
        const w = smallWorld();
        const { inputCount, weightCount } = w.layout;
        expect(w.alive.length).toBe(8);
        expect(w.inputs.length).toBe(8 * inputCount);
        expect(w.outputs.length).toBe(8 * 5);
        expect(w.weights.length).toBe(8 * weightCount);
        expect(w.fatherWeights.length).toBe(8 * weightCount);
        expect(w.hidden.length).toBe(9 * 3);
        expect(w.weights).toBeInstanceOf(Float32Array);
        expect(w.energy).toBeInstanceOf(Float64Array);
        expect(w.genomeId).toBeInstanceOf(Uint32Array);
    });

    it('sizes food, obstacle, zone and pheromone arrays', () => {
        const w = smallWorld();
        expect(w.foodValue.length).toBe(10);
        expect(w.obsX.length).toBe(2);
        expect(w.zoneAlive.length).toBe(3);
        expect(w.danger.length).toBe(
            Math.ceil(w.config.worldWidth / w.config.pheromoneCellSize) *
                Math.ceil(w.config.worldHeight / w.config.pheromoneCellSize),
        );
    });

    it('allocates an event ring with the configured capacity', () => {
        const w = smallWorld();
        expect(w.events.capacity).toBe(w.config.eventCapacity);
        expect(w.events.data.length).toBe(w.config.eventCapacity * EVENT_STRIDE);
        expect(w.events.count).toBe(0);
    });

    it('starts with zeroed scalars and unset rng', () => {
        const w = smallWorld();
        expect([w.tick, w.nextId, w.population, w.foodCount]).toEqual([0, 1, 0, 0]);
        expect(w.rng).toBeNull();
        expect(w.birthOptions).toEqual({ cause: 0, rng: null });
        expect(w.ledger.length).toBe(2);
        expect(w.point.length).toBe(2);
        expect(w.season.length).toBe(2);
    });

    it('builds the ray tables with ray 0 straight ahead', () => {
        const w = smallWorld();
        expect(w.rayCos.length).toBe(4);
        expect(w.rayCos[0]).toBe(1);
        expect(w.raySin[0]).toBe(0);
        expect(w.rayCos[1]).toBeCloseTo(0, 12);
        expect(w.raySin[1]).toBeCloseTo(1, 12);
    });

    it('exports the timer cap', () => {
        expect(TIMER_CAP).toBe(30);
    });
});

describe('allocAgent and freeAgent', () => {
    it('takes slots in order and counts the population', () => {
        const w = smallWorld();
        expect([allocAgent(w), allocAgent(w), allocAgent(w)]).toEqual([0, 1, 2]);
        expect(w.population).toBe(3);
        expect(w.alive[1]).toBe(1);
    });

    it('reuses the lowest freed slot', () => {
        const w = smallWorld();
        for (let i = 0; i < 4; i++) {
            allocAgent(w);
        }
        freeAgent(w, 2);
        freeAgent(w, 1);
        expect(w.population).toBe(2);
        expect(allocAgent(w)).toBe(1);
        expect(allocAgent(w)).toBe(2);
    });

    it('throws naming maxAgents when full', () => {
        const w = smallWorld();
        for (let i = 0; i < 8; i++) {
            allocAgent(w);
        }
        expect(() => allocAgent(w)).toThrow(/maxAgents \(8\)/);
    });

    it('zeroes every row of the freed slot and leaves neighbours untouched', () => {
        const w = smallWorld();
        for (let i = 0; i < 3; i++) {
            allocAgent(w);
            fillSlot(w, i);
        }
        w.hidden.fill(9, 8 * 3);
        freeAgent(w, 1);
        for (const { array, stride } of w.agentRows) {
            expect([...array.subarray(stride, 2 * stride)].every((/** @type {number} */ v) => v === 0)).toBe(true);
            expect([...array.subarray(0, stride)].every((/** @type {number} */ v) => v === 1)).toBe(true);
            expect([...array.subarray(2 * stride, 3 * stride)].every((/** @type {number} */ v) => v === 1)).toBe(true);
        }
        expect(w.hidden.subarray(3, 6).every((/** @type {number} */ v) => v === 0)).toBe(true);
        expect(w.hidden.subarray(8 * 3).every((/** @type {number} */ v) => v === 9)).toBe(true);
        expect(w.alive[1]).toBe(0);
    });

    it('throws when freeing a dead slot', () => {
        const w = smallWorld();
        expect(() => freeAgent(w, 3)).toThrow(/slot 3 is not alive/);
    });
});

describe('removeFood', () => {
    it('zeroes the food slot and decrements the count', () => {
        const w = smallWorld();
        for (const slot of [0, 1]) {
            w.foodAlive[slot] = 1;
            w.foodX[slot] = 5;
            w.foodValue[slot] = 3;
            w.foodAge[slot] = 2;
        }
        w.foodCount = 2;
        removeFood(w, 0);
        expect([w.foodAlive[0], w.foodX[0], w.foodValue[0], w.foodAge[0]]).toEqual([0, 0, 0, 0]);
        expect(w.foodValue[1]).toBe(3);
        expect(w.foodCount).toBe(1);
    });

    it('throws on a dead food slot', () => {
        expect(() => removeFood(smallWorld(), 0)).toThrow(/not alive/);
    });
});
