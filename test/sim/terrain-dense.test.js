import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createSnapshotViews, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { REFUGE_ROCKS, refugeCentresOf, terrainProblem, terrainRockCount } from '../../js/sim/terrain.js';
import { createWorld } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const DENSE = { ...SIMPLE_WORLD, worldWidth: 14400, worldHeight: 8100, refugeCluster: 2 };

describe('denser refuge layouts on the default world', () => {
    it.each([16, 24])('builds a valid terrain with refugeCount %i', (refugeCount) => {
        const config = createConfig({ ...DENSE, refugeCount });
        expect(terrainProblem(config)).toBeNull();
        const world = createWorld(config, testPolicy);
        expect(world.obsX).toHaveLength(terrainRockCount(config));
        expect(refugeCentresOf(world)).toHaveLength(2 * refugeCount);
        expect(terrainRockCount(config) - refugeCount * REFUGE_ROCKS).toBeGreaterThan(0);
    });

    it('writes every rock into the snapshot', () => {
        const config = createConfig({ ...DENSE, refugeCount: 24 });
        const world = createWorld(config, testPolicy);
        const layout = snapshotLayout(config);
        const views = createSnapshotViews(new ArrayBuffer(layout.bytes));
        writeSnapshot(world, views);
        expect(views.u32[3]).toBe(terrainRockCount(config));
    });

    it('rejects an overfull count with the terrainProblem message', () => {
        const small = { ...DENSE, worldHeight: 2000, refugeCount: 32, refugeCluster: 1 };
        expect(() => createConfig(small)).toThrow(/32 refuges .* do not fit the basins/);
    });

    it('rejects a count above the bound', () => {
        expect(() => createConfig({ ...DENSE, refugeCount: 33 })).toThrow(/refugeCount/);
    });
});
