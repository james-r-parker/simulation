import { describe, expect, it } from 'vitest';
import { freeAgent } from '../../js/sim/world.js';
import { detSigmoid, detTanh } from '../../js/sim/det-math.js';
import { applyGenes, leakRateOf } from '../../js/sim/traits.js';
import { splitAll } from '../../js/sim/reproduction.js';
import { createWorld, spawnAgent } from '../../js/sim/spawn.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createConfig } from '../../js/sim/config.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';
import { smallWorld } from './helpers/small-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const LEAK_MIN = createConfig().leakMin;

describe('leakRateOf', () => {
    it('runs from LEAK_MIN for a very negative gene to 1 for a very positive one', () => {
        expect(leakRateOf(-60, LEAK_MIN)).toBeCloseTo(LEAK_MIN, 12);
        expect(leakRateOf(60, LEAK_MIN)).toBe(1);
        expect(leakRateOf(0, LEAK_MIN)).toBeCloseTo(LEAK_MIN + (1 - LEAK_MIN) / 2, 12);
    });

    it('is about 0.95 at the starting leak gene 3 and increases with the gene', () => {
        expect(leakRateOf(3, LEAK_MIN)).toBeGreaterThan(0.94);
        expect(leakRateOf(3, LEAK_MIN)).toBeLessThan(0.96);
        expect(leakRateOf(1, LEAK_MIN)).toBeLessThan(leakRateOf(2, LEAK_MIN));
    });
});

describe('leakMin', () => {
    it('defaults to 0.02, the big-bang floor (a half-life of 34 ticks; 0.05 was 13.5)', () => {
        expect(createConfig().leakMin).toBe(0.02);
        expect(Math.log(0.5) / Math.log(1 - 0.02)).toBeCloseTo(34.3, 1);
        expect(createConfig({ leakMin: 0.05 }).leakMin).toBe(0.05);
    });

    it('lowers the floor of the leak rate', () => {
        expect(leakRateOf(-60, 0.02)).toBeCloseTo(0.02, 12);
        expect(leakRateOf(0, 0.02)).toBeCloseTo(0.02 + 0.98 / 2, 12);
    });

    it('reaches applyGenes through the config', () => {
        const world = smallWorld({ leakMin: 0.2 });
        const { layout } = world;
        world.weights.fill(-60, layout.leakStart, layout.weightCount);
        applyGenes(world, 0);
        expect(world.leakRate[0]).toBeCloseTo(0.2, 6);
    });

    it.each([0, 1, -0.1, 1.5, NaN])('rejects %s', (value) => {
        expect(() => createConfig({ leakMin: value })).toThrow(/leakMin/);
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
    it('derives each hidden unit leak rate from its leak gene', () => {
        const world = smallWorld();
        const { layout } = world;
        const genes = [-2, 0, 3];
        world.weights.set(genes, 2 * layout.weightCount + layout.leakStart);
        applyGenes(world, 2);
        const rates = Array.from(world.leakRate.subarray(2 * layout.hidden, 3 * layout.hidden));
        expect(rates).toEqual(genes.map((g) => Math.fround(leakRateOf(g, LEAK_MIN))));
    });
});

describe('applyGenes call sites', () => {
    it('runs after a spawn writes the weight row', () => {
        const config = createConfig({
            ...SIMPLE_WORLD,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 2,
            brainHidden: 3,
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
        const w = lifeWorld({ splitMinEnergy: 500 });
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
