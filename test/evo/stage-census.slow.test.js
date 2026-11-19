import { describe, expect, it } from 'vitest';
import { createArchive } from '../../js/evo/archive.js';
import { stageCensus } from '../../js/evo/stage-census.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

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

describe('stageCensus over a long run', () => {
    it('runs from a given archive and keeps offers out of it', () => {
        const archive = createArchive(brainLayout(createConfig({ ...overrides, seed: 3 })));
        const before = archive.nCap;
        const rows = stageCensus({ overrides, seed: 3, ticks: 6000, at: [6000], archive });
        expect(rows).toHaveLength(1);
        expect(archive.nCap).toBe(before);
    });
});
