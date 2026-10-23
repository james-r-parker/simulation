import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { playPredatorWorld, predatorPolicy, predatorWorld, runPredatorWorld } from './helpers/predator-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const TICKS = 3000;
const SEEDS = [1, 2, 3, 4, 5, 6];

describe('evals/predator-world.json', () => {
    it('is the micro-world with a larger starting energy, so a sprinting fleer lives long enough to escape', () => {
        const config = createConfig({ ...FEATURES_OFF, ...predatorWorld, seed: 1 });
        expect([config.worldWidth, config.worldHeight, config.initialAgents, config.maxAgents]).toEqual([
            2400, 1600, 40, 80,
        ]);
        expect([config.minAgents, config.immigrationInterval, config.obstacleCount]).toEqual([0, 0, 4]);
        expect([config.maxFood, config.initialFood, config.initialEnergy]).toEqual([60, 60, 3000]);
    });

    it('starts with predators in the even slots and foragers in the odd ones', () => {
        const { world } = playPredatorWorld(1, 0);
        for (let slot = 0; slot < world.config.initialAgents; slot++) {
            expect(world.spec[slot]).toBe(slot % 2 === 0 ? 1 : 0);
        }
        expect(predatorPolicy().initSpec(world, 3)).toBe(0);
    });

    it('gives hunters against fleers a catch rate and an escape rate above 0', () => {
        const runs = SEEDS.map((seed) => runPredatorWorld(seed, TICKS));
        const mean = (/** @type {string} */ name) => {
            const values = runs.map((m) => m[name].value).filter((v) => v !== null);
            return values.reduce((a, b) => a + b, 0) / values.length;
        };
        expect(mean('eval.catch_rate')).toBeGreaterThan(0);
        expect(mean('eval.escape_rate')).toBeGreaterThan(0);
        for (const run of runs) {
            expect(run['eval.catch_rate'].value).toBeGreaterThan(0);
        }
    }, 60_000);

    it('is deterministic: the same seed gives the same metrics', { timeout: 60_000 }, () => {
        expect(runPredatorWorld(2, 1500)).toEqual(runPredatorWorld(2, 1500));
    });
});
