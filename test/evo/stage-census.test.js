import { describe, expect, it } from 'vitest';
import { createArchive } from '../../js/evo/archive.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { countBySpec, preyCount, stageCensus } from '../../js/evo/stage-census.js';

describe('countBySpec and preyCount', () => {
    it('counts the alive agents of each specialisation and leaves the predators out of the prey', () => {
        const world = { alive: [1, 1, 0, 1, 1], spec: [0, 1, 1, 1, 4] };
        const counts = countBySpec(world);
        expect(counts).toEqual({ forager: 1, predator: 2, reproducer: 0, scout: 0, defender: 1 });
        expect(preyCount(counts)).toBe(2);
    });
});

describe('stageCensus', () => {
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

    it('reads the seeding at tick 0 and each later tick asked for, in order', () => {
        const rows = stageCensus({ overrides, seed: 3, ticks: 4, at: [0, 2, 4, 9], preyShare: 0.75 });
        expect(rows.map((row) => row.tick)).toEqual([0, 2, 4]);
        expect(rows[0].prey).toBe(15);
        expect(Object.values(rows[0].counts).reduce((a, b) => a + b, 0)).toBe(20);
    });

    it('is deterministic and the prey share changes the seeding', () => {
        const run = (/** @type {number | undefined} */ preyShare) =>
            stageCensus({ overrides, seed: 3, ticks: 0, at: [0], preyShare })[0].prey;
        expect(run(0.5)).toBe(run(0.5));
        expect(run(1)).toBe(20);
        expect(run(0)).toBe(0);
    });

    it('runs with the default seeding when no prey share is given', () => {
        expect(stageCensus({ overrides, seed: 3, ticks: 0, at: [0] })).toHaveLength(1);
    });

    it('takes the offers of agents that die of old age without a hook of its own, and keeps counting', () => {
        const old = { ...overrides, maxAgeTicks: 30, maturityTicks: 5, minAgents: 0 };
        const rows = stageCensus({ overrides: old, seed: 3, ticks: 40, at: [0, 40] });
        expect(rows.map((row) => row.tick)).toEqual([0, 40]);
        expect(Object.values(rows[0].counts).reduce((a, b) => a + b, 0)).toBe(20);
    });

    it('runs from a given archive and keeps the offers of the deaths out of it', () => {
        const old = {
            ...overrides,
            maxAgeTicks: 600,
            maturityTicks: 5,
            splitDeliberateMin: 0,
            splitDeliberateShareMin: 0,
            minAgents: 0,
        };
        const archive = createArchive(brainLayout(createConfig({ ...old, seed: 3 })));
        const before = archive.nCap;
        const rows = stageCensus({ overrides: old, seed: 3, ticks: 900, at: [900], archive });
        expect(rows).toHaveLength(1);
        expect(archive.nCap).toBe(before);
    });
});
