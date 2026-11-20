// A training episode feeds the live policy a lean observer when it asks for no metrics (training-loop.md T31); the
// episode's offers, cursors and end state must be what the full observer gives.
import { describe, expect, it } from 'vitest';
import { snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { createTrainerArchive, runEpisode } from '../../js/evo/trainer.js';
import { createConfig } from '../../js/sim/config.js';

const world = {
    worldWidth: 2400,
    worldHeight: 1600,
    initialAgents: 40,
    maxAgents: 80,
    minAgents: 20,
    maxFood: 60,
    initialFood: 60,
    maturityTicks: 200,
    herdCount: 0,
    refugeCount: 0,
    wallGaps: 1,
    coldMarginWidth: 0,
};
const task = (/** @type {Record<string, any>} */ extra) => ({
    seed: 4,
    overrides: world,
    snapshot: snapshotArchive(createTrainerArchive(createConfig(world))),
    ticks: 3000,
    offerFromTick: 200,
    ...extra,
});

describe('runEpisode with the lean observer', () => {
    it('returns the offers, cursors and end state the full observer returns', () => {
        const lean = runEpisode(task({}));
        const full = runEpisode(task({ metrics: ['eval.food_energy_per_1k'] }));
        expect(lean.offers.length).toBeGreaterThan(0);
        expect(lean.metrics).toEqual({});
        expect({ ...lean, metrics: null }).toEqual({ ...full, metrics: null });
    });

    it('keeps the full observer for a run that asks for metrics, so its checkpoints still run', () => {
        const { metrics } = runEpisode(task({ metrics: ['eval.food_energy_per_1k'] }));
        expect(metrics['eval.food_energy_per_1k']).not.toBeUndefined();
    });
});
