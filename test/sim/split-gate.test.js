import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { creditIntake } from '../../js/sim/merit.js';
import { splitAll, splitGateOpen } from '../../js/sim/reproduction.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const BASE = { splitDeliberateMin: 0, splitMinEnergy: 200 };

/**
 * @param {Record<string, any>} over config overrides
 * @param {Record<string, number>} [fields] per-slot values of the one blob
 * @returns {{w: any, slot: number}} a world with one ready blob
 */
function blobWorld(over, fields = {}) {
    const w = lifeWorld({ ...BASE, ...over });
    return { w, slot: addBlob(w, { energy: 1000, ...fields }) };
}

/**
 * @param {any} w the world
 * @param {number} slot the eater
 * @param {number} deliberate deliberate meals to credit
 * @param {number} chance chance meals to credit
 * @returns {void}
 */
function eat(w, slot, deliberate, chance) {
    for (let i = 0; i < deliberate; i++) {
        creditIntake(w, slot, 10, true);
    }
    for (let i = 0; i < chance; i++) {
        creditIntake(w, slot, 10, false);
    }
}

describe('the split gate keys at their defaults', () => {
    it('leave the gate as splitDeliberateMin alone decides it', () => {
        const { w, slot } = blobWorld({ splitDeliberateMin: 50 }, { deliberateIntake: 49 });
        expect(splitGateOpen(w, slot)).toBe(false);
        w.deliberateIntake[slot] = 50;
        expect(splitGateOpen(w, slot)).toBe(true);
    });
});

describe('splitDeliberateShareMin', () => {
    it('closes below the share, opens at it, and stays closed with no meals', () => {
        const { w, slot } = blobWorld({ splitDeliberateShareMin: 0.5 });
        expect(splitGateOpen(w, slot)).toBe(false);
        eat(w, slot, 1, 2);
        expect(splitGateOpen(w, slot)).toBe(false);
        eat(w, slot, 1, 0);
        expect(splitGateOpen(w, slot)).toBe(true);
    });

    it('counts meals, not energy', () => {
        const { w, slot } = blobWorld({ splitDeliberateShareMin: 0.5 });
        creditIntake(w, slot, 1000, true);
        creditIntake(w, slot, 1, false);
        creditIntake(w, slot, 1, false);
        creditIntake(w, slot, 1, false);
        expect(splitGateOpen(w, slot)).toBe(false);
    });
});

describe('splitMaxPerLife', () => {
    it('lets a blob split that many times, then closes the gate', () => {
        const { w, slot } = blobWorld({ splitMaxPerLife: 2 });
        const policy = recordingPolicy([]);
        for (let n = 1; n <= 2; n++) {
            w.cooldown[slot] = 0;
            w.energy[slot] = 1000;
            splitAll(w, policy);
            expect(w.splitsDone[slot]).toBe(n);
        }
        expect(splitGateOpen(w, slot)).toBe(false);
    });

    it('does not count mating births, and 0 is unlimited', () => {
        const { w, slot } = blobWorld({ splitMaxPerLife: 0 });
        w.splitsDone[slot] = 1000;
        expect(splitGateOpen(w, slot)).toBe(true);
    });
});

describe('counters at birth', () => {
    it('start at 0 in a child and in a reused slot', () => {
        const { w, slot } = blobWorld({ splitMinEnergy: 600 });
        eat(w, slot, 2, 1);
        w.splitsDone[slot] = 3;
        splitAll(w, recordingPolicy([]));
        const child = w.alive.indexOf(1, slot + 1);
        expect([w.mealsTotal[child], w.mealsDeliberate[child], w.splitsDone[child]]).toEqual([0, 0, 0]);
        expect([w.mealsTotal[slot], w.mealsDeliberate[slot], w.splitsDone[slot]]).toEqual([3, 2, 4]);
        freeAgent(w, slot);
        expect([w.mealsTotal[slot], w.mealsDeliberate[slot], w.splitsDone[slot]]).toEqual([0, 0, 0]);
    });
});

describe('determinism', () => {
    it('gives one hash for one seed and config with the keys on', () => {
        const run = () => {
            const config = createConfig({
                maxAgents: 60,
                initialAgents: 30,
                splitDeliberateShareMin: 0.1,
                splitMaxPerLife: 3,
            });
            const policy = cloneWithNoisePolicy();
            const world = createWorld(config, policy);
            for (let t = 0; t < 150; t++) {
                step(world, policy);
            }
            return hashWorld(world);
        };
        expect(run()).toBe(run());
    });
});

describe('config', () => {
    it('defaults splitDeliberateShareMin to 0.2 and the other keys to no-ops', () => {
        const config = createConfig({});
        expect([config.splitDeliberateShareMin, config.splitMaxPerLife]).toEqual([0.2, 0]);
    });

    it.each([
        ['splitDeliberateShareMin', 1, true],
        ['splitDeliberateShareMin', 1.01, false],
        ['splitDeliberateShareMin', -0.1, false],
        ['splitMaxPerLife', 3, true],
        ['splitMaxPerLife', -1, false],
        ['splitMaxPerLife', 1.5, false],
    ])('%s = %s accepted: %s', (key, value, accepted) => {
        if (accepted) {
            expect(createConfig({ [key]: value })[key]).toBe(value);
        } else {
            expect(() => createConfig({ [key]: value })).toThrow(new RegExp(key));
        }
    });
});
