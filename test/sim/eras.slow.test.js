import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { EVENT_STRIDE, EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const SEASON = 300;
const TICKS = 1900;
const TIMEOUT_MS = scaleTimeout(120_000);

/**
 * Runs a small patchy world with short eras and collects the era events.
 * @returns {{ types: number[][], world: ReturnType<typeof createWorld> }} the era events as [type, tick, a, b] and the world
 */
function run() {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(
        createConfig({
            ...SIMPLE_WORLD,
            worldWidth: 3000,
            worldHeight: 2000,
            maxAgents: 120,
            initialAgents: 40,
            minAgents: 0,
            maxFood: 300,
            initialFood: 100,
            foodPatchCount: 6,
            foodPatchRadius: 300,
            eraSeasonTicks: SEASON,
            droughtChance: 1,
            checkInvariants: true,
            seed: 11,
        }),
        policy,
    );
    const types = [];
    const wanted = [EVENT_TYPE.SEASON_CHANGED, EVENT_TYPE.DROUGHT_STARTED];
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        for (let i = 0; i < readEvents(world.events); i++) {
            const o = i * EVENT_STRIDE;
            if (wanted.includes(world.events.data[o])) {
                types.push(Array.from(world.events.data.subarray(o, o + 4)));
            }
        }
    }
    return { types, world };
}

describe('eras over a run', () => {
    it(
        'turns the seasons, droughts one basin each summer, with invariants holding',
        () => {
            const { types } = run();
            const seasons = types.filter((e) => e[0] === EVENT_TYPE.SEASON_CHANGED);
            expect(seasons.map((e) => e[1])).toEqual([300, 600, 900, 1200, 1500, 1800]);
            expect(seasons.map((e) => e[2]).slice(0, 4)).toEqual([1, 2, 3, 0]);
            const droughts = types.filter((e) => e[0] === EVENT_TYPE.DROUGHT_STARTED);
            expect(droughts.map((e) => e[1])).toEqual([300, 1500]);
        },
        TIMEOUT_MS,
    );
});
