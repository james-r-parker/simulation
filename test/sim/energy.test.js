import { describe, expect, it } from 'vitest';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy, removeEnergy, transferEnergy, updateSize } from '../../js/sim/energy.js';
import { createConfig } from '../../js/sim/config.js';
import { allocAgent, allocateWorld } from '../../js/sim/world.js';

const SMALL = {
    maxAgents: 4,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    maxEnergy: 100,
    initialEnergy: 10,
    baseSize: 10,
    minSize: 5,
    energyToSize: 10,
};

/**
 * A world with `n` alive agents at slots 0..n-1, all starting at zero energy.
 * @param {number} [n] how many agents to allocate
 * @returns {ReturnType<typeof allocateWorld>}
 */
function worldWith(n = 2) {
    const world = allocateWorld(createConfig(SMALL));
    for (let i = 0; i < n; i++) {
        allocAgent(world);
    }
    return world;
}

/**
 * @param {ReturnType<typeof allocateWorld>} world
 * @returns {number} the energy held by all alive agents
 */
function aliveEnergy(world) {
    let total = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            total += world.energy[slot];
        }
    }
    return total;
}

describe('energy codes', () => {
    it('exports the frozen loss-cause and energy-source sets', () => {
        expect(LOSS_CAUSE).toEqual({ NONE: 0, COST: 1, BITE: 2, COLLISION: 3 });
        expect(ENERGY_SOURCE).toEqual({ FOOD: 0, INITIAL: 1, FLOOR: 2, IMMIGRANT: 3 });
        expect(Object.isFrozen(LOSS_CAUSE)).toBe(true);
        expect(Object.isFrozen(ENERGY_SOURCE)).toBe(true);
    });
});

describe('addEnergy', () => {
    it('stores the full amount below maxEnergy and books it in ledger[0]', () => {
        const world = worldWith();
        expect(addEnergy(world, 0, 30, ENERGY_SOURCE.FOOD)).toBe(30);
        expect(world.energy[0]).toBe(30);
        expect(world.ledger[0]).toBe(30);
        expect(world.ledger[1]).toBe(0);
    });

    it('caps at maxEnergy and records only the stored amount', () => {
        const world = worldWith();
        world.energy[0] = 90;
        expect(addEnergy(world, 0, 50, ENERGY_SOURCE.INITIAL)).toBe(10);
        expect(world.energy[0]).toBe(100);
        expect(world.ledger[0]).toBe(10);
    });

    it('stores nothing when the agent is already full', () => {
        const world = worldWith();
        world.energy[0] = 100;
        expect(addEnergy(world, 0, 5, ENERGY_SOURCE.FLOOR)).toBe(0);
        expect(world.ledger[0]).toBe(0);
    });

    it('books every external source the same way', () => {
        const world = worldWith();
        for (const source of Object.values(ENERGY_SOURCE)) {
            addEnergy(world, 0, 1, source);
        }
        expect(world.ledger[0]).toBe(4);
        expect(world.energy[0]).toBe(4);
    });

    it('throws on an unknown source, naming the slot and the value', () => {
        expect(() => addEnergy(worldWith(), 1, 5, 9)).toThrow(/addEnergy: slot 1 has unknown energy source 9/);
    });

    it('throws on a negative, NaN or infinite amount, naming the function, slot and value', () => {
        const world = worldWith();
        expect(() => addEnergy(world, 0, -1, ENERGY_SOURCE.FOOD)).toThrow(/addEnergy: slot 0 .* got -1/);
        expect(() => addEnergy(world, 0, Number.NaN, ENERGY_SOURCE.FOOD)).toThrow(/addEnergy: slot 0 .* got NaN/);
        expect(() => addEnergy(world, 0, Infinity, ENERGY_SOURCE.FOOD)).toThrow(/got Infinity/);
    });
});

describe('removeEnergy', () => {
    it('removes the amount and books it in ledger[1] and lastLoss', () => {
        const world = worldWith();
        world.energy[0] = 40;
        expect(removeEnergy(world, 0, 15, LOSS_CAUSE.COST)).toBe(15);
        expect(world.energy[0]).toBe(25);
        expect(world.ledger[1]).toBe(15);
        expect(world.lastLoss[0]).toBe(LOSS_CAUSE.COST);
    });

    it('never goes below zero and books only the removed amount', () => {
        const world = worldWith();
        world.energy[0] = 6;
        expect(removeEnergy(world, 0, 50, LOSS_CAUSE.BITE)).toBe(6);
        expect(world.energy[0]).toBe(0);
        expect(world.ledger[1]).toBe(6);
    });

    it('leaves lastLoss alone when nothing was removed', () => {
        const world = worldWith();
        world.lastLoss[0] = LOSS_CAUSE.COLLISION;
        expect(removeEnergy(world, 0, 5, LOSS_CAUSE.COST)).toBe(0);
        expect(world.lastLoss[0]).toBe(LOSS_CAUSE.COLLISION);
        expect(world.ledger[1]).toBe(0);
    });

    it('throws on a NONE or unknown loss cause, naming the slot', () => {
        const world = worldWith();
        world.energy[0] = 10;
        expect(() => removeEnergy(world, 0, 1, LOSS_CAUSE.NONE)).toThrow(
            /removeEnergy: slot 0 has unknown loss cause 0/,
        );
        expect(() => removeEnergy(world, 0, 1, 7)).toThrow(/unknown loss cause 7/);
    });

    it('throws on a negative amount, naming the function, slot and value', () => {
        expect(() => removeEnergy(worldWith(), 1, -2, LOSS_CAUSE.COST)).toThrow(/removeEnergy: slot 1 .* got -2/);
    });
});

describe('transferEnergy', () => {
    it('moves energy from giver to receiver and returns what the giver lost', () => {
        const world = worldWith();
        world.energy[0] = 50;
        expect(transferEnergy(world, 0, 1, 20)).toBe(20);
        expect([world.energy[0], world.energy[1]]).toEqual([30, 20]);
        expect(world.ledger).toEqual(new Float64Array([0, 0]));
    });

    it('records what the receiver stored in transferGained', () => {
        const world = worldWith();
        world.energy[0] = 50;
        world.energy[1] = world.config.maxEnergy - 5;
        expect(transferEnergy(world, 0, 1, 20)).toBe(20);
        expect(world.transferGained).toBe(5);
        expect(world.ledger[1]).toBe(15);
    });

    it('does not set lastLoss', () => {
        const world = worldWith();
        world.energy[0] = 50;
        transferEnergy(world, 0, 1, 20);
        expect([world.lastLoss[0], world.lastLoss[1]]).toEqual([0, 0]);
    });

    it('takes only what the giver has', () => {
        const world = worldWith();
        world.energy[0] = 8;
        expect(transferEnergy(world, 0, 1, 20)).toBe(8);
        expect([world.energy[0], world.energy[1]]).toEqual([0, 8]);
        expect(world.ledger[1]).toBe(0);
    });

    it('books the part the full receiver cannot hold in ledger[1]', () => {
        const world = worldWith();
        world.energy[0] = 50;
        world.energy[1] = 90;
        expect(transferEnergy(world, 0, 1, 30)).toBe(30);
        expect([world.energy[0], world.energy[1]]).toEqual([20, 100]);
        expect(world.ledger[1]).toBe(20);
    });

    it('conserves energy: alive energy plus ledger out is unchanged', () => {
        const world = worldWith();
        world.energy[0] = 70;
        world.energy[1] = 60;
        const before = aliveEnergy(world) + world.ledger[1];
        transferEnergy(world, 0, 1, 50);
        expect(aliveEnergy(world) + world.ledger[1]).toBe(before);
    });

    it('throws when giver and receiver are the same slot', () => {
        expect(() => transferEnergy(worldWith(), 1, 1, 5)).toThrow(/giver and receiver are both slot 1/);
    });

    it('throws on a negative amount, naming the giver', () => {
        expect(() => transferEnergy(worldWith(), 0, 1, -1)).toThrow(/transferEnergy: slot 0 .* got -1/);
    });
});

describe('updateSize', () => {
    it('sets size to baseSize plus energy over energyToSize', () => {
        const world = worldWith();
        world.energy[0] = 50;
        updateSize(world, 0);
        expect(world.size[0]).toBe(15);
    });

    it('is applied after addEnergy, removeEnergy and transferEnergy', () => {
        const world = worldWith();
        addEnergy(world, 0, 40, ENERGY_SOURCE.FOOD);
        expect(world.size[0]).toBe(14);
        removeEnergy(world, 0, 20, LOSS_CAUSE.COST);
        expect(world.size[0]).toBe(12);
        transferEnergy(world, 0, 1, 20);
        expect([world.size[0], world.size[1]]).toEqual([10, 12]);
    });
});

describe('energy ledger balance', () => {
    it('keeps alive energy equal to ledger in minus out over a scripted sequence', () => {
        const world = worldWith(3);
        addEnergy(world, 0, 60, ENERGY_SOURCE.INITIAL);
        addEnergy(world, 1, 45, ENERGY_SOURCE.FOOD);
        addEnergy(world, 2, 30, ENERGY_SOURCE.FLOOR);
        expect(transferEnergy(world, 0, 1, 50)).toBe(50);
        removeEnergy(world, 2, 12, LOSS_CAUSE.COST);
        addEnergy(world, 1, 90, ENERGY_SOURCE.FOOD);
        transferEnergy(world, 1, 2, 80);
        removeEnergy(world, 0, 500, LOSS_CAUSE.COLLISION);
        addEnergy(world, 2, 999, ENERGY_SOURCE.IMMIGRANT);
        transferEnergy(world, 2, 0, 7);
        expect(aliveEnergy(world)).toBe(world.ledger[0] - world.ledger[1]);
    });
});
