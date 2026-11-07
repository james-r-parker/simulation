import { describe, expect, it } from 'vitest';
import { allocBody } from './helpers/body.js';
import { createConfig } from '../../js/sim/config.js';
import { addEnergy, ENERGY_SOURCE, LOSS_CAUSE, removeEnergy } from '../../js/sim/energy.js';
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

    it('skips dead and distant herd slots and handles coincident zero-energy contact', () => {
        const world = build();
        const slot = addBlob(world, 0);
        overlap(world, slot);
        world.herdX[0] = world.x[slot];
        world.herdY[0] = world.y[slot];
        world.vx[slot] = -1;
        trampleHerds(world, slot);
        expect(world.energy[slot]).toBe(0);
        expect(world.lastHerdId[slot]).toBe(0);

        world.herdX[0] = world.x[slot] + 1000;
        trampleHerds(world, slot);
        world.herdAlive[0] = 0;
        trampleHerds(world, slot);
        expect(world.energy[slot]).toBe(0);
    });

    it('matches the all-against-all reference bit for bit on a crowded herd', () => {
        const run = (/** @type {boolean} */ reject) => {
            const world = build({ herdCount: 4, herdSize: 16, maxAgents: 8 });
            const slots = [];
            for (let i = 0; i < 6; i++) {
                const slot = addBlob(world);
                world.x[slot] = 300 + i * 37;
                world.y[slot] = 500 + i * 23;
                world.vx[slot] = 3 - i;
                world.vy[slot] = i - 2;
                slots.push(slot);
            }
            for (let a = 0; a < world.herdMax; a++) {
                world.herdAlive[a] = a % 7 === 3 ? 0 : 1;
                world.herdId[a] = a;
                world.herdX[a] = 300 + ((a * 53) % 260);
                world.herdY[a] = 480 + ((a * 31) % 160);
                world.herdVx[a] = (a % 3) - 1;
                world.herdVy[a] = (a % 5) - 2;
            }
            for (const slot of slots) {
                if (reject) {
                    trampleHerds(world, slot);
                } else {
                    trampleHerdsReference(world, slot);
                }
            }
            return slots.map((s) => [
                world.x[s],
                world.y[s],
                world.vx[s],
                world.vy[s],
                world.energy[s],
                world.lastHerdId[s],
            ]);
        };
        const fast = run(true);
        expect(fast.some((row) => row[4] < 100)).toBe(true);
        expect(fast).toEqual(run(false));
    });
});

/** The pre-reject loop, copied: a full contact response for every live animal in slot order. @param {import('../../js/sim/world.js').World} world @param {number} slot */
function trampleHerdsReference(world, slot) {
    const { x, y, vx, vy, size, herdX, herdY, herdVx, herdVy } = world;
    for (let animal = 0; animal < world.herdMax; animal++) {
        if (world.herdAlive[animal] !== 1) {
            continue;
        }
        const dx = x[slot] - herdX[animal];
        const dy = y[slot] - herdY[animal];
        const reach = size[slot] + world.config.herdRadius;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= reach * reach) {
            continue;
        }
        const distance = Math.sqrt(distanceSq);
        const nx = distance > 0 ? dx / distance : 1;
        const ny = distance > 0 ? dy / distance : 0;
        x[slot] = herdX[animal] + nx * reach;
        y[slot] = herdY[animal] + ny * reach;
        const vn = (vx[slot] - herdVx[animal]) * nx + (vy[slot] - herdVy[animal]) * ny;
        if (vn >= 0) {
            continue;
        }
        vx[slot] -= 2 * vn * nx;
        vy[slot] -= 2 * vn * ny;
        const ratio = -vn / world.config.maxVelocity;
        const amount = world.config.trampleDamage * ratio * ratio * (size[slot] / world.baseSize[slot]);
        if (removeEnergy(world, slot, amount, LOSS_CAUSE.TRAMPLE) > 0) {
            world.lastHerdId[slot] = world.herdId[animal];
        }
    }
}
