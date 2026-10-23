import { describe, expect, it } from 'vitest';
import { freeAgent } from '../../js/sim/world.js';
import { detSigmoid, detTanh } from '../../js/sim/det-math.js';
import { LEAK_MIN, applyGenes, leakRateOf } from '../../js/sim/traits.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { createWorld, spawnAgent } from '../../js/sim/spawn.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createConfig } from '../../js/sim/config.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';
import { smallWorld } from './helpers/small-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

describe('leakRateOf', () => {
    it('runs from LEAK_MIN for a very negative gene to 1 for a very positive one', () => {
        expect(leakRateOf(-60)).toBeCloseTo(LEAK_MIN, 12);
        expect(leakRateOf(60)).toBe(1);
        expect(leakRateOf(0)).toBeCloseTo(LEAK_MIN + (1 - LEAK_MIN) / 2, 12);
    });

    it('is about 0.95 at the starting leak gene 3 and increases with the gene', () => {
        expect(leakRateOf(3)).toBeGreaterThan(0.94);
        expect(leakRateOf(3)).toBeLessThan(0.96);
        expect(leakRateOf(1)).toBeLessThan(leakRateOf(2));
    });
});

describe('detSigmoid', () => {
    it('matches 1 / (1 + exp(-x)) over [-30, 30]', () => {
        for (let x = -30; x <= 30; x += 0.37) {
            expect(Math.abs(detSigmoid(x) - 1 / (1 + Math.exp(-x)))).toBeLessThan(1e-12);
        }
    });

    it('is built from detTanh', () => {
        expect(detSigmoid(1.5)).toBe(0.5 + 0.5 * detTanh(0.75));
    });
});

describe('applyGenes', () => {
    it('derives each hidden unit leak rate from its leak gene when leakEnabled', () => {
        const world = smallWorld({ leakEnabled: true });
        const { layout } = world;
        const genes = [-2, 0, 3];
        world.weights.set(genes, 2 * layout.weightCount + layout.leakStart);
        applyGenes(world, 2);
        const rates = Array.from(world.leakRate.subarray(2 * layout.hidden, 3 * layout.hidden));
        expect(rates).toEqual(genes.map((g) => Math.fround(leakRateOf(g))));
    });

    it('leaves leakRate alone when leakEnabled is false', () => {
        const world = smallWorld();
        world.weights.fill(1, 0, world.layout.weightCount);
        applyGenes(world, 0);
        expect(world.leakRate.every((/** @type {number} */ v) => v === 0)).toBe(true);
    });
});

describe('applyGenes call sites', () => {
    it('runs after a spawn writes the weight row', () => {
        const config = createConfig({
            ...FEATURES_OFF,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 2,
            brainHidden: 3,
            leakEnabled: true,
        });
        const policy = {
            initBrain(/** @type {any} */ w, /** @type {number} */ slot) {
                w.weights.fill(
                    -40,
                    slot * w.layout.weightCount + w.layout.leakStart,
                    (slot + 1) * w.layout.weightCount,
                );
            },
        };
        const world = createWorld(config, policy);
        const slot = spawnAgent(world, policy, BORN_CAUSE.INITIAL);
        expect(
            Array.from(world.leakRate.subarray(slot * 3, slot * 3 + 3)).every((v) => Math.abs(v - LEAK_MIN) < 1e-6),
        ).toBe(true);
    });

    it('runs after a birth writes the child row, and a freed slot is cleared', () => {
        const w = lifeWorld({ leakEnabled: true, splitMinEnergy: 500 });
        const mother = addBlob(w, { energy: 900 });
        w.weights.fill(-40, mother * w.layout.weightCount + w.layout.leakStart, (mother + 1) * w.layout.weightCount);
        applyGenes(w, mother);
        splitAll(w, recordingPolicy([]));
        const child = 1;
        expect(w.alive[child]).toBe(1);
        expect(w.leakRate[child * 3]).toBeCloseTo(LEAK_MIN, 6);
        w.leakRate[child * 3] = 0.9;
        freeAgent(w, child);
        expect(Array.from(w.leakRate.subarray(child * 3, child * 3 + 3))).toEqual([0, 0, 0]);
    });
});
