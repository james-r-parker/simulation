import { describe, expect, it } from 'vitest';
import { runSeed } from '../scripts/eval-worker.mjs';
import { FEATURES_OFF } from '../scripts/lib/features-on.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const SMALL = { ...FEATURES_OFF, maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500, worldHeight: 1000 };
/** Overrides under which the first food item cannot be placed, so the world fails at tick 0. */
const UNPLACEABLE = {
    ...FEATURES_OFF,
    worldWidth: 1000,
    worldHeight: 1000,
    obstacleCount: 100,
    obstacleMinRadius: 120,
    obstacleMaxRadius: 120,
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
        const learned = runSeed({ ...task, policy: 'map-elites-v1' });
        expect(learned.metrics['eval.qd_score'].value).toBe(0);
        expect(learned.metrics['eval.coverage'].value).toBe(0);
    });
});
