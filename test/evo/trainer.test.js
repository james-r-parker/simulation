import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../../js/evo/archive.js';
import { getPolicy, LIVE_POLICY } from '../../js/evo/policies/index.js';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import {
    TRAINER_DESCRIPTOR,
    TRAINER_N_CAP,
    createTrainerArchive,
    episodeSeed,
    runEpisode,
} from '../../js/evo/trainer.js';
import { createConfig } from '../../js/sim/config.js';

describe('episodeSeed', () => {
    it('takes entry (generation x episodes + episode) mod length', () => {
        const seeds = [10, 11, 12, 13, 14];
        expect(episodeSeed(seeds, { generation: 0, episodes: 4, episode: 3 })).toBe(13);
        expect(episodeSeed(seeds, { generation: 2, episodes: 4, episode: 1 })).toBe(seeds[9 % 5]);
    });
});

describe('createTrainerArchive', () => {
    it('is empty, capped at TRAINER_N_CAP, and placed by the descriptor the live policy uses', () => {
        const config = createConfig({ rayCount: 2, brainHidden: 4 });
        const archive = createTrainerArchive(config);
        expect([occupiedCount(archive), archive.nCap]).toEqual([0, TRAINER_N_CAP]);
        const policy = getPolicy(LIVE_POLICY).create({ config });
        expect(policy.archive.descriptor.name).toBe(TRAINER_DESCRIPTOR.name);
    });
});

describe('runEpisode metrics', () => {
    const world = { initialAgents: 10, maxAgents: 20, minAgents: 5 };
    const task = (/** @type {Record<string, any>} */ extra) => ({
        seed: 4,
        overrides: world,
        snapshot: snapshotArchive(createTrainerArchive(createConfig(world))),
        ticks: 10,
        ...extra,
    });

    it('returns none by default, the asked-for ones by name, and null for a name that is not a metric', () => {
        expect(runEpisode(task({})).metrics).toEqual({});
        const { metrics } = runEpisode(task({ metrics: ['eval.food_energy_per_1k', 'eval.not_a_metric'] }));
        expect(Object.keys(metrics)).toEqual(['eval.food_energy_per_1k', 'eval.not_a_metric']);
        expect(metrics['eval.not_a_metric']).toBeNull();
    });
});
