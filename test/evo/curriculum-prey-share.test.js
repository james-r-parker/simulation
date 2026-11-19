import { describe, expect, it } from 'vitest';
import { planRun } from '../../js/evo/curriculum.js';
import { runEpisode, createTrainerArchive } from '../../js/evo/trainer.js';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { createConfig } from '../../js/sim/config.js';

describe('curriculum preyShare', () => {
    const entry = { name: 'a', config: null, generations: 2 };

    it('is kept on the planned stage and refused outside 0 to 1', () => {
        expect(planRun([{ ...entry, preyShare: 0.9 }], 2)[0].preyShare).toBe(0.9);
        for (const bad of [-1, 1.1, '0.5', null]) {
            expect(() => planRun([{ ...entry, preyShare: /** @type {any} */ (bad) }], 2)).toThrow(/preyShare/);
        }
    });
});

describe('runEpisode preyShare', () => {
    it('runs an episode seeded under the prey share of its stage', () => {
        const overrides = {
            worldWidth: 1800,
            worldHeight: 1200,
            hashCellSize: 560,
            foodPatchRadius: 280,
            wallGaps: 1,
            refugeCount: 0,
            herdCount: 0,
            coldMarginWidth: 0,
            initialAgents: 20,
            maxAgents: 40,
            brainHidden: 4,
        };
        const config = createConfig({ ...overrides, seed: 1 });
        const snapshot = snapshotArchive(createTrainerArchive(config));
        const task = { seed: 1, overrides, snapshot, ticks: 1, offerFromTick: 0 };
        for (const preyShare of [0, 1]) {
            expect(runEpisode({ ...task, preyShare }).population).toBeGreaterThanOrEqual(19);
        }
    });
});
