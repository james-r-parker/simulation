import { describe, expect, it } from 'vitest';
import { feedPolicy } from '../../js/evo/feed-policy.js';
import { createObserver, observerPhases } from '../../js/evo/observer.js';
import { getPolicy, LIVE_POLICY } from '../../js/evo/policies/index.js';
import { createConfig } from '../../js/sim/config.js';
import { createSimLog } from '../../js/sim/log.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const TICKS = 6000;
const SEED = 7;
const SMALL = {
    ...SIMPLE_WORLD,
    maxAgents: 80,
    initialAgents: 40,
    minAgents: 12,
    worldWidth: 2000,
    worldHeight: 1000,
    seed: SEED,
};

/**
 * Runs one world under the live policy, fed by a lean or a full observer.
 * @param {boolean} lean whether the observer is lean
 * @returns {{world: any, observer: any, policy: any}} the run at its end
 */
function run(lean) {
    const config = createConfig(SMALL);
    const observer = createObserver(config, fork(createRng(SEED), 'eval'), { lean });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(LIVE_POLICY).create({ config, log, observer });
    const world = createWorld(config, policy.brain);
    const phases = observerPhases(observer);
    feedPolicy({ policy, observer }, world);
    for (let t = 0; t < TICKS; t++) {
        step(world, policy.brain, phases);
        feedPolicy({ policy, observer }, world);
    }
    return { world, observer, policy };
}

/**
 * @param {any} deaths the death log
 * @param {number} count the rows
 * @param {string[]} columns the columns
 * @returns {Record<string, number[]>} the first `count` rows of each column
 */
function rows(deaths, count, columns) {
    return Object.fromEntries(columns.map((name) => [name, Array.from(deaths[name].subarray(0, count))]));
}

describe('lean observer', () => {
    it(
        'gives the live policy and the panels the same state as the full observer over 6000 ticks',
        () => {
            const full = run(false);
            const lean = run(true);
            expect(lean.observer.lean).toBe(true);
            expect(lean.observer.deathCount).toBeGreaterThan(50);
            const { archive } = full.policy;
            expect(Array.from(archive.occupied).some((cell) => cell === 1)).toBe(true);
            for (const name of ['occupied', 'ids', 'sigmas', 'stats', 'rows']) {
                expect(Array.from(lean.policy.archive[name])).toEqual(Array.from(archive[name]));
            }
            const count = full.observer.deathCount;
            expect(lean.observer.deathCount).toBe(count);
            const columns = ['genomeId', 'lineageId', 'ageTicks', 'foodEnergy', 'biteEnergy', 'children', 'spec'];
            expect(rows(lean.observer.deaths, count, [...columns, 'fitness', 'roleSkill', 'style'])).toEqual(
                rows(full.observer.deaths, count, [...columns, 'fitness', 'roleSkill', 'style']),
            );
            expect(lean.observer.intent.run).toEqual(full.observer.intent.run);
            expect(lean.observer.scenes.style).toEqual(full.observer.scenes.style);
            for (const name of ['combat', 'births', 'birthsAfterBurnIn', 'deathsByCause']) {
                expect(lean.observer[name]).toEqual(full.observer[name]);
            }
            for (const name of ['ticks', 'agentTicks', 'deathCount', 'floorEpisodes', 'foodEnergyDead']) {
                expect(lean.observer[name]).toBe(full.observer[name]);
            }
            expect(hashWorld(lean.world)).toBe(hashWorld(full.world));
        },
        scaleTimeout(120000),
    );
});
