import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { COVER_TOTALS } from '../../js/sim/cover.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TIMEOUT_MS = scaleTimeout(120_000);
const TICKS = 1500;

// A crowded world with four rings and both cover switches on, so agents meet the rings and the plants are placed round them.
const COVER_WORLD = {
    worldWidth: 4000,
    worldHeight: 2400,
    maxAgents: 150,
    initialAgents: 100,
    minAgents: 30,
    maturityTicks: 200,
    reproductionCooldown: 150,
    pregnancyTicks: 200,
    mateMinEnergy: 100,
    splitMinEnergy: 900,
    wallGaps: 2,
    refugeCount: 4,
    refugeCluster: 1,
    refugeSizeMax: 60,
    coldMarginWidth: 0,
    coverConceals: true,
    coverFoodFree: true,
};

/**
 * @param {boolean} checkEveryTick whether to assert the invariants after every tick
 * @returns {{hash: string, agentTicks: number, rejected: number, concealed: number}} the run's hash and cover counters
 */
function run(checkEveryTick) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...COVER_WORLD, checkInvariants: false }), policy);
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        if (checkEveryTick) {
            assertInvariants(world);
        }
    }
    return {
        hash: hashWorld(world),
        agentTicks: world.coverTotals[COVER_TOTALS.AGENT_TICKS],
        rejected: world.coverTotals[COVER_TOTALS.FOOD_REJECTED],
        concealed: world.coverTotals[COVER_TOTALS.CONCEALED_HITS],
    };
}

describe('cover on a crowded world', () => {
    it(
        'holds every invariant each tick and replays to the same world hash',
        () => {
            const first = run(true);
            const second = run(false);
            expect(second.hash).toBe(first.hash);
            expect(second).toEqual(first);
            expect(first.rejected + first.agentTicks + first.concealed).toBeGreaterThan(0);
        },
        TIMEOUT_MS,
    );
});
