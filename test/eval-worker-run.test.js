import { describe, expect, it } from 'vitest';
import { runSeed } from '../scripts/eval-worker.mjs';
import { SIMPLE_WORLD } from './helpers/simple-world.js';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const SMALL = { ...SIMPLE_WORLD, maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500, worldHeight: 1000 };
/** Overrides under which the first food item cannot be placed, so the world fails at tick 0. */
const UNPLACEABLE = {
    ...SIMPLE_WORLD,
    worldWidth: 1000,
    worldHeight: 1000,
    placementTries: 1,
};

describe('runSeed (direct)', () => {
    it('returns the metrics, hash and checkpoints for a seed', { timeout: scaleTimeout(30_000) }, () => {
        const result = runSeed({ seed: 3, ticks: 2100, policy: 'baseline-v5', overrides: SMALL });
        expect(result).toMatchObject({ seed: 3, fitnessName: 'v5' });
        expect(result.worldHash).toEqual(expect.any(String));
        expect(result.wallMs).toBeGreaterThanOrEqual(0);
        expect(result.checkpoints.map((/** @type {{ tick: number }} */ c) => c.tick)).toEqual([1000, 2000]);
        expect(result.checkpoints[0]).toEqual({
            tick: 1000,
            population: expect.any(Number),
            births: expect.any(Number),
            deaths: expect.any(Number),
        });
    });

    it('returns a trace with a population sample per interval', { timeout: scaleTimeout(30_000) }, () => {
        const result = runSeed({ seed: 3, ticks: 2100, policy: 'baseline-v5', overrides: SMALL, traceInterval: 700 });
        expect(result.trace.pop).toHaveLength(3);
        expect(result.trace).toMatchObject({ interval: 700, deaths: expect.any(Array), lineages: expect.any(Number) });
        expect(result.trace.mate).toHaveLength(4);
        expect(result.trace.deaths).toHaveLength(4);
    });

    it('is deterministic for the same task', { timeout: scaleTimeout(30_000) }, () => {
        const task = { seed: 5, ticks: 50, policy: 'baseline-v5', overrides: SMALL };
        expect(runSeed(task).worldHash).toBe(runSeed(task).worldHash);
    });

    it('names the seed and tick when the world fails', () => {
        expect(() => runSeed({ seed: 9, ticks: 50, policy: 'baseline-v5', overrides: UNPLACEABLE })).toThrow(
            /^seed 9 failed at tick 0: /,
        );
    });

    it('reports archive metrics for a policy with an archive and none for one without', () => {
        const task = { seed: 3, ticks: 20, overrides: SMALL };
        const plain = runSeed({ ...task, policy: 'baseline-v5' });
        expect(plain.metrics['eval.qd_score']).toEqual({ value: null, reason: 'no archive' });
        const learned = runSeed({ ...task, policy: 'map-elites-v6' });
        expect(learned.metrics['eval.qd_score'].value).toBe(0);
        expect(learned.metrics['eval.coverage'].value).toBe(0);
    });

    it('returns no champions unless asked', () => {
        expect(runSeed({ seed: 3, ticks: 20, overrides: SMALL, policy: 'map-elites-v6' }).champions).toEqual([]);
    });

    it('refuses --save-champions for a policy without an archive, naming it', () => {
        const task = { seed: 3, ticks: 20, overrides: SMALL, policy: 'baseline-v5', saveChampions: 2 };
        expect(() => runSeed(task)).toThrow('--save-champions needs a policy with an archive; "baseline-v5" has none');
    });

    it('returns at most the asked number of champion files from the archive', { timeout: scaleTimeout(60_000) }, () => {
        const task = { seed: 3, ticks: 3000, overrides: SMALL, policy: 'map-elites-v6', saveChampions: 2 };
        const { champions } = runSeed(task);
        expect(champions.length).toBeGreaterThan(0);
        expect(champions.length).toBeLessThanOrEqual(2);
        expect(champions[0]).toMatchObject({ version: 1, specialisation: expect.any(Number) });
        expect(champions[0].name).toMatch(/^map-elites-v6-s3-/);
    });
});
