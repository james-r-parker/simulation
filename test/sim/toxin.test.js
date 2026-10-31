import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { ingestToxin, isSick, stepToxin } from '../../js/sim/toxin.js';
import { canEatNow, feed } from '../../js/sim/feeding.js';
import { actAll } from '../../js/sim/physics.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { allocAgent, freeAgent } from '../../js/sim/world.js';
import { addBlob, imbalance, lifeWorld } from './helpers/life-world.js';

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {{world: any, slot: number}} a healthy agent with room for a meal
 */
function body(over = {}) {
    const world = lifeWorld(over);
    return { world, slot: addBlob(world, { energy: 100 }) };
}

/**
 * @param {any} world the world
 * @param {number} toxicity item toxicity
 * @returns {number} food slot at the agent's place
 */
function meal(world, toxicity) {
    const food = spawnFoodItem(world);
    world.foodX[food] = world.foodY[food] = 500;
    world.foodValue[food] = 100;
    world.foodTox[food] = toxicity;
    buildHash(world.hash, world);
    return food;
}

describe('toxin config', () => {
    it('starts with the planned dose, sickness and recovery values', () => {
        expect(createConfig()).toMatchObject({
            toxinDose: 0.45,
            toxinCost: 1.2,
            sickDose: 0.3,
            sickThrust: 0.4,
            sickDrain: 0.02,
            doseDecay: 0.0008,
            lethalDose: 1,
        });
    });
    for (const key of ['toxinDose', 'toxinCost', 'sickDose', 'sickThrust', 'sickDrain', 'doseDecay', 'lethalDose']) {
        it(`rejects an invalid ${key}`, () => {
            expect(() => createConfig({ [key]: -1 })).toThrow(key);
            expect(() => createConfig({ [key]: Infinity })).toThrow(key);
        });
    }
    it('requires a lethal threshold above sickness and bounds thrust', () => {
        expect(() => createConfig({ lethalDose: 0.2 })).toThrow('sickDose');
        expect(() => createConfig({ sickThrust: 1.1 })).toThrow('sickThrust');
    });
});

describe('toxin dose and meals', () => {
    it('reduces plant energy, adds dose and keeps the energy ledger balanced', () => {
        const { world, slot } = body();
        meal(world, 0.8);
        feed(world, world.hash);
        expect(world.energy[slot]).toBeCloseTo(104, 5);
        expect(world.foodEnergy[slot]).toBeCloseTo(4, 5);
        expect(world.dose[slot]).toBeCloseTo(0.36, 6);
        expect(isSick(world, slot)).toBe(true);
        expect(imbalance(world)).toBeCloseTo(0, 9);
    });
    it('books a negative net meal as a cost instead of negative food intake', () => {
        const { world, slot } = body();
        meal(world, 1);
        feed(world, world.hash);
        expect(world.energy[slot]).toBeCloseTo(80, 9);
        expect(world.foodEnergy[slot]).toBe(0);
        expect(imbalance(world)).toBeCloseTo(0, 9);
    });
    it('keeps a sick agent from eating again and restores eating after recovery', () => {
        const { world, slot } = body({ doseDecay: 0.1 });
        ingestToxin(world, slot, 100, 0.8);
        const food = meal(world, 0);
        const before = world.energy[slot];
        feed(world, world.hash);
        expect(world.energy[slot]).toBe(before);
        expect(world.foodAlive[food]).toBe(1);
        expect(canEatNow(world, slot)).toBe(false);
        stepToxin(world);
        expect(isSick(world, slot)).toBe(false);
        feed(world, world.hash);
        expect(world.foodAlive[food]).toBe(0);
    });
    it('keeps ordinary plant and meat meals free of dose', () => {
        const { world, slot } = body();
        meal(world, 0);
        feed(world, world.hash);
        expect(world.dose[slot]).toBe(0);
        const food = meal(world, 1);
        world.foodKind[food] = 1;
        feed(world, world.hash);
        expect(world.dose[slot]).toBe(0);
    });
});

describe('sickness and recovery', () => {
    it('drains a sick body, decays dose to zero and ignores dead slots', () => {
        const { world, slot } = body({ doseDecay: 0.2 });
        world.dose[slot] = 0.4;
        world.dose[1] = 0.7;
        stepToxin(world);
        expect(world.energy[slot]).toBeCloseTo(100 - 0.02 * 0.4, 6);
        expect(world.dose[slot]).toBeCloseTo(0.2, 6);
        stepToxin(world);
        stepToxin(world);
        expect(world.dose[slot]).toBe(0);
        expect(world.dose[1]).toBeCloseTo(0.7, 6);
    });
    it("multiplies only a sick body's thrust by sickThrust", () => {
        const healthy = body();
        const sick = body();
        for (const { world, slot } of [healthy, sick]) {
            world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 1;
        }
        sick.world.dose[sick.slot] = sick.world.config.sickDose;
        actAll(healthy.world);
        actAll(sick.world);
        expect(sick.world.vx[sick.slot]).toBeCloseTo(healthy.world.vx[healthy.slot] * 0.4, 6);
    });
    it('hashes dose and clears it when a body slot is reused', () => {
        const { world, slot } = body();
        const before = hashWorld(world);
        world.dose[slot] = 0.5;
        expect(hashWorld(world)).not.toBe(before);
        freeAgent(world, slot);
        expect(allocAgent(world)).toBe(slot);
        expect(world.dose[slot]).toBe(0);
    });
    it('rejects negative and nonfinite live dose state', () => {
        const { world, slot } = body();
        world.dose[slot] = -1;
        expect(() => assertInvariants(world)).toThrow('dose');
        world.dose[slot] = NaN;
        expect(() => assertInvariants(world)).toThrow('dose');
    });
});
