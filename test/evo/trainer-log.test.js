import { describe, expect, it, vi } from 'vitest';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { LIVE_POLICY, POLICIES } from '../../js/evo/policies/index.js';
import { createConfig } from '../../js/sim/config.js';
import { createTrainerArchive, runEpisode } from '../../js/evo/trainer.js';

const seen = /** @type {string[]} */ ([]);

vi.mock('../../js/evo/policies/index.js', async (importOriginal) => {
    const original = /** @type {Record<string, any>} */ (await importOriginal());
    return {
        ...original,
        getPolicy: () => ({
            create: (/** @type {Record<string, any>} */ options) => {
                options.log.log('error', 'TestError', { why: 'the trainer keeps no log' });
                options.log.log('info', 'TestInfo', {});
                seen.push('created');
                return original.POLICIES[original.LIVE_POLICY].create(options);
            },
        }),
    };
});

describe('runEpisode log', () => {
    it('gives the policy a log that drops what it is sent, so an error event does not stop the episode', () => {
        const world = { initialAgents: 10, maxAgents: 20, minAgents: 5 };
        const snapshot = snapshotArchive(createTrainerArchive(createConfig(world)));
        const result = runEpisode({ seed: 2, overrides: world, snapshot, ticks: 10 });
        expect(seen).toEqual(['created']);
        expect(result.ticks).toBe(10);
        expect(POLICIES[LIVE_POLICY]).toBeDefined();
    });
});
