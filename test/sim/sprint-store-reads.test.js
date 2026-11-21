// The reads of the sprint store's factor (docs/designs/fair-chase.md, The store): the thrust in `thrustOf`, the speed cap
// in the physics kernel, the sprint cost in `tickCost`, and the store's place in the world: its lane in the arena, its
// reset on birth, its zeroing on death and its bytes in `hashWorld` only when the switch is on.
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { applyCosts } from '../../js/sim/energy.js';
import { actAll, integrate } from '../../js/sim/physics.js';
import { stepSprintStore } from '../../js/sim/sprint-store.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { allocAgent, allocateWorld, freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const SMALL = {
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 8,
    initialFood: 0,
    fertileZoneMax: 3,
    worldWidth: 1000,
    worldHeight: 1000,
};

/** A forager's sprint boost is 1, so the sprint's factor on thrust and on the cap is `1 + sprintMultiplier x f`. */
const FLOOR = 0.3;

/**
 * @param {Record<string, any>} [extra] config overrides
 * @returns {any} a world with the store on and no agents
 */
const storeWorld = (extra = {}) =>
    allocateWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, sprintStoreEnabled: true, sprintFloor: FLOOR, ...extra }));

/**
 * Births a sprinting forager at rest at the centre, heading +x, with the given store, and writes its factor.
 * @param {any} w the world
 * @param {number} level its store
 * @param {Record<string, number>} [fields] other fields to set
 * @returns {number} its slot
 */
function sprinter(w, level, fields = {}) {
    const slot = allocAgent(w);
    w.size[slot] = 25;
    w.energy[slot] = 100;
    w.temperature[slot] = w.config.temperatureStart;
    w.x[slot] = 500;
    w.y[slot] = 100 + 100 * slot;
    for (const [k, v] of Object.entries(fields)) {
        w[k][slot] = v;
    }
    w.outputs.fill(0, slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 1;
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = 1;
    if (w.sprintStore !== undefined) {
        w.sprintStore.level[slot] = level;
    }
    return slot;
}

/** The store levels of a full, a half (under the floor: factor 0.5) and an empty store, and their factors. */
const LEVELS = [
    [1, 1],
    [FLOOR / 2, 0.5],
    [0, 0],
];

describe('the sprint factor on thrust and the speed cap', () => {
    it('scales the sprint thrust with a full, half and empty store', () => {
        const w = storeWorld();
        const slots = LEVELS.map(([level]) => sprinter(w, level));
        stepSprintStore(w.sprintStore, w);
        actAll(w);
        const { maxThrust, sprintMultiplier } = w.config;
        LEVELS.forEach(([, f], k) => expect(w.vx[slots[k]]).toBeCloseTo(maxThrust * (1 + sprintMultiplier * f), 6));
    });

    it('scales the rise of the sprint cap with a full, half and empty store', () => {
        const w = storeWorld();
        const slots = LEVELS.map(([level]) => sprinter(w, level, { vx: 100 }));
        stepSprintStore(w.sprintStore, w);
        integrate(w);
        const { maxVelocity, sprintMultiplier } = w.config;
        LEVELS.forEach(([, f], k) => expect(w.vx[slots[k]]).toBeCloseTo(maxVelocity * (1 + sprintMultiplier * f), 5));
    });

    it('is the full sprint with the switch off: no store and a lane of 1 in the arena', () => {
        const w = allocateWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL }));
        expect(w.sprintStore).toBeUndefined();
        expect(w.sprintFactor).toBe(w.wasm.views.sprintFactor);
        expect([...w.sprintFactor]).toEqual(new Array(SMALL.maxAgents).fill(1));
        const a = sprinter(w, 0);
        const b = sprinter(w, 0, { vx: 100 });
        actAll(w);
        integrate(w);
        const { maxThrust, maxVelocity, sprintMultiplier, damping } = w.config;
        expect(w.vx[a]).toBeCloseTo(maxThrust * (1 + sprintMultiplier) * damping, 6);
        expect(w.vx[b]).toBeCloseTo(maxVelocity * (1 + sprintMultiplier), 5);
    });
});

describe('the sprint factor on the sprint cost', () => {
    it('charges sprintCost times the factor', () => {
        const costs = LEVELS.map(([level]) => {
            const w = storeWorld({ passiveLoss: 0, sizeEnergyLoss: 0, movementCost: 0, turnCost: 0, visionCost: 0 });
            const slot = sprinter(w, level);
            stepSprintStore(w.sprintStore, w);
            applyCosts(w);
            return 100 - w.energy[slot];
        });
        const { sprintCost } = createConfig({});
        LEVELS.forEach(([, f], k) => expect(costs[k]).toBeCloseTo(sprintCost * f, 9));
    });
});

describe('the store in the world', () => {
    it('fills on birth and zeroes on death', () => {
        const w = storeWorld();
        const slot = sprinter(w, 0.1);
        w.sprintFactor[slot] = 0.2;
        freeAgent(w, slot);
        expect(w.sprintStore.level[slot]).toBe(0);
        expect(allocAgent(w)).toBe(slot);
        expect([w.sprintStore.level[slot], w.sprintFactor[slot]]).toEqual([1, 1]);
    });

    it('is hashed when the switch is on', () => {
        const w = storeWorld();
        createWorldRng(w);
        sprinter(w, 1);
        const before = hashWorld(w);
        w.sprintStore.level[0] = 0.5;
        expect(hashWorld(w)).not.toBe(before);
    });

    it('drains in a stepped world, and a world with the store on replays bit for bit', () => {
        const run = () => {
            const policy = cloneWithNoisePolicy();
            const config = createConfig({
                ...SIMPLE_WORLD,
                sprintStoreEnabled: true,
                maxAgents: 60,
                initialAgents: 40,
            });
            const world = createWorld(config, policy);
            for (let t = 0; t < 60; t++) {
                step(world, policy);
            }
            return world;
        };
        const a = run();
        const levels = [...a.sprintStore.level].filter((v, slot) => a.alive[slot] === 1);
        expect(levels.some((v) => v < 1)).toBe(true);
        expect(hashWorld(run())).toBe(hashWorld(a));
    });
});

/**
 * Gives a bare `allocateWorld` world the RNG streams `hashWorld` needs, from a world `createWorld` made on its config.
 * @param {any} w the world
 * @returns {void}
 */
function createWorldRng(w) {
    w.rng = createWorld(w.config, cloneWithNoisePolicy()).rng;
}
