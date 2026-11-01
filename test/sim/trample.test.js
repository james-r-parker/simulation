import { describe, expect, it } from 'vitest';
import { allocBody } from './helpers/body.js';
import { createConfig } from '../../js/sim/config.js';
import { addEnergy, ENERGY_SOURCE, LOSS_CAUSE } from '../../js/sim/energy.js';
import { DEATH_CAUSE, EVENT_TYPE } from '../../js/sim/events.js';
import { reap } from '../../js/sim/population.js';
import { createWorld } from '../../js/sim/spawn.js';
import { trampleHerds } from '../../js/sim/trample.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

function build(over = {}) {
    return createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 2000,
            worldHeight: 1200,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            maxFood: 8,
            initialFood: 0,
            foodPatchCount: 0,
            floraPatchMax: 4,
            herdCount: 1,
            herdSize: 1,
            ...over,
        }),
        testPolicy,
    );
}

/** @param {import('../../js/sim/world.js').World} world @param {number} [energy] @returns {number} */
function addBlob(world, energy = 100) {
    const slot = allocBody(world);
    world.x[slot] = 400;
    world.y[slot] = 600;
    addEnergy(world, slot, energy, ENERGY_SOURCE.INITIAL);
    return slot;
}

/** @param {import('../../js/sim/world.js').World} world @param {number} slot */
function overlap(world, slot) {
    world.herdAlive[0] = 1;
    world.herdId[0] = 91;
    world.herdX[0] = world.x[slot] + 50;
    world.herdY[0] = world.y[slot];
}

describe('trampleHerds', () => {
    it('pushes a closing blob clear, reflects it and applies relative-speed damage', () => {
        const world = build();
        const slot = addBlob(world);
        overlap(world, slot);
        world.vx[slot] = 1;
        const energy = world.energy[slot];
        const expectedX = world.herdX[0] - world.config.herdRadius - world.size[slot];
        const ratio = 1 / world.config.maxVelocity;
        const amount = world.config.trampleDamage * ratio * ratio * (world.size[slot] / world.baseSize[slot]);
        trampleHerds(world, slot);
        expect(world.x[slot]).toBe(Math.fround(expectedX));
        expect(world.vx[slot]).toBe(-1);
        expect(world.energy[slot]).toBeCloseTo(energy - amount, 7);
        expect(world.lastLoss[slot]).toBe(LOSS_CAUSE.TRAMPLE);
        expect(world.lastHerdId[slot]).toBe(91);
    });

    it('separates an escaping blob without charging damage', () => {
        const world = build();
        const slot = addBlob(world);
        overlap(world, slot);
        world.vx[slot] = -1;
        const energy = world.energy[slot];
        trampleHerds(world, slot);
        expect(world.x[slot]).toBeLessThan(world.herdX[0]);
        expect(world.vx[slot]).toBe(-1);
        expect(world.energy[slot]).toBe(energy);
        expect(world.lastLoss[slot]).toBe(LOSS_CAUSE.NONE);
    });

    it('records the herd id and trampled death cause when contact removes the last energy', () => {
        const world = build({ trampleDamage: 100000 });
        const slot = addBlob(world, 1);
        overlap(world, slot);
        world.vx[slot] = 1;
        trampleHerds(world, slot);
        reap(world, testPolicy);
        expect(world.events.data[0]).toBe(EVENT_TYPE.AGENT_DIED);
        expect(world.events.data[4]).toBe(DEATH_CAUSE.TRAMPLED);
        expect(world.events.data[5]).toBe(91);
    });
});
