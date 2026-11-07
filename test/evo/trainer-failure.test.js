import { describe, expect, it, vi } from 'vitest';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { createConfig } from '../../js/sim/config.js';
import { step } from '../../js/sim/step.js';
import { createTrainerArchive, runEpisode } from '../../js/evo/trainer.js';

vi.mock('../../js/sim/step.js', async (importOriginal) => ({
    ...(await importOriginal()),
    step: vi.fn(),
}));

const world = { initialAgents: 10, maxAgents: 20, minAgents: 5 };
const task = () => ({
    seed: 9,
    overrides: world,
    snapshot: snapshotArchive(createTrainerArchive(createConfig(world))),
    ticks: 10,
});

describe('runEpisode when a step fails', () => {
    it('names the seed and the tick and keeps the original error as the cause', () => {
        const original = new Error('boom');
        vi.mocked(step).mockImplementation(() => {
            throw original;
        });
        let caught = /** @type {any} */ (null);
        try {
            runEpisode(task());
        } catch (error) {
            caught = error;
        }
        expect(caught.message).toBe('seed 9 failed at tick 0: boom');
        expect(caught.cause).toBe(original);
    });

    it('reports a thrown non-error value as text', () => {
        vi.mocked(step).mockImplementation(() => {
            throw 'plain text';
        });
        expect(() => runEpisode(task())).toThrow('seed 9 failed at tick 0: plain text');
    });
});
