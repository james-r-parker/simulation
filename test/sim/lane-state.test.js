import { describe, expect, it } from 'vitest';
import { LANES, LANE_COUNT, laneBases, laneRowName } from '../../js/sim/body-lanes.js';
import { createConfig } from '../../js/sim/config.js';
import { allocLanes, writeLaneBases } from '../../js/sim/lane-state.js';
import { SPEC_NAMES } from '../../js/sim/specs.js';
import { createWorld } from '../../js/sim/spawn.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

describe('world.lanes', () => {
    const world = createWorld(
        createConfig({ ...SIMPLE_WORLD, maxAgents: 6, initialAgents: 4, minAgents: 0 }),
        testPolicy,
    );

    it('holds one array per lane, a slot per agent, written at its spec base by applyGenes', () => {
        expect(Object.keys(world.lanes)).toEqual(LANES.map((lane) => lane.name));
        for (let slot = 0; slot < world.config.maxAgents; slot++) {
            if (world.alive[slot] === 1) {
                const bases = laneBases(world.config, SPEC_NAMES[world.spec[slot]]);
                for (const lane of LANES) {
                    expect(world.lanes[lane.name][slot], `${slot}.${lane.name}`).toBe(bases[lane.name]);
                }
            }
        }
        expect(world.lanes.maxVelocity).toBeInstanceOf(Float64Array);
        expect(world.lanes.maxVelocity).toHaveLength(6);
    });

    it('rewrites a slot at the base of its spec and registers every lane for zeroing', () => {
        const slot = world.alive.indexOf(1);
        world.spec[slot] = 1;
        writeLaneBases(world, slot);
        expect(world.lanes.biteEnergy[slot]).toBe(
            world.config.biteEnergy * world.config.specialisations.predator.biteMultiplier,
        );
        const rows = world.agentRows.map((/** @type {{name: string}} */ row) => row.name);
        expect(rows).toEqual(expect.arrayContaining(LANES.map((lane) => laneRowName(lane.name))));
    });

    it('allocates fresh arrays for each world', () => {
        /** @type {Record<string, any>} */
        const fake = { config: world.config, agentRows: [] };
        allocLanes(fake);
        expect(fake.lanes.maxVelocity).not.toBe(world.lanes.maxVelocity);
        expect(fake.agentRows).toHaveLength(LANE_COUNT);
    });
});
