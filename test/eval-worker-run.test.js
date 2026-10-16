import { describe, expect, it } from 'vitest';
import { runSeed } from '../scripts/eval-worker.mjs';

const SMALL = { maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500, worldHeight: 1000 };

describe('runSeed (direct)', () => {
    it('returns the metrics, hash and checkpoints for a seed', () => {
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

    it('is deterministic for the same task', () => {
        const task = { seed: 5, ticks: 50, policy: 'baseline-v5', overrides: SMALL };
        expect(runSeed(task).worldHash).toBe(runSeed(task).worldHash);
    });

    it('names the seed and tick when the world fails', () => {
        expect(() => runSeed({ seed: 9, ticks: 50, policy: 'baseline-v5', overrides: { eventCapacity: 5 } })).toThrow(
            /^seed 9 failed at tick 0: /,
        );
    });
});
