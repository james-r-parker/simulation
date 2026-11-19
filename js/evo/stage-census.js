// A stage world's head count by specialisation at chosen ticks (training-stages T45): do the prey of a hunt stage survive
// long enough for the hunters to meet them? One training-style episode, seeded as `runEpisode` seeds it, run for `ticks`.

import { createConfig } from '../sim/config.js';
import { createSimLog } from '../sim/log.js';
import { createRng, fork } from '../sim/rng.js';
import { createWorld } from '../sim/spawn.js';
import { step } from '../sim/step.js';
import { GENOME_SPECS } from './genome.js';
import { feedPolicy } from './feed-policy.js';
import { createObserver, observerPhases } from './observer.js';
import { LIVE_POLICY, getPolicy } from './policies/index.js';

/**
 * @param {Record<string, any>} world the world
 * @returns {Record<string, number>} the alive agents of each specialisation
 */
export function countBySpec(world) {
    const counts = Object.fromEntries(GENOME_SPECS.map((name) => [name, 0]));
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            counts[GENOME_SPECS[world.spec[slot]]] += 1;
        }
    }
    return counts;
}

/**
 * @param {Record<string, number>} counts a `countBySpec` result
 * @returns {number} the alive agents that are not predators
 */
export function preyCount(counts) {
    return Object.entries(counts).reduce((sum, [name, n]) => sum + (name === 'predator' ? 0 : n), 0);
}

/**
 * @typedef {object} CensusRun
 * @property {Record<string, any>} overrides the stage's config overrides
 * @property {number} seed the seed
 * @property {number} ticks ticks to run
 * @property {readonly number[]} at the ticks to count at
 * @property {number} [preyShare] the stage's prey share
 * @property {import('./archive.js').Archive} [archive] the frozen archive
 */

/**
 * Runs one episode of a stage world and reads the head counts.
 * @param {CensusRun} run the stage's config overrides, the seed, the ticks to run, the ticks to
 *   count at (0 is the seeding) and the stage's `preyShare` and frozen archive (none: a fresh archive, so random brains)
 * @returns {{tick: number, counts: Record<string, number>, prey: number}[]} the counts at each tick of `at` that the run
 *   reached, in order
 */
export function stageCensus({ overrides, seed, ticks, at, preyShare, archive }) {
    const config = createConfig({ initialAgents: 100, ...overrides, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'), { runTicks: ticks, checkpointTicks: 1000 });
    const policy = getPolicy(LIVE_POLICY).create({
        config,
        log: createSimLog(() => {}, { level: 'error' }),
        observer,
        ...(archive === undefined ? {} : { archive }),
        onOffer: () => {},
        ...(preyShare === undefined ? {} : { preyShare }),
    });
    const world = createWorld(config, policy.brain);
    const run = { policy, observer };
    feedPolicy(run, world);
    const phases = observerPhases(observer);
    const rows = [];
    for (let t = 0; t <= ticks; t++) {
        if (at.includes(t)) {
            const counts = countBySpec(world);
            rows.push({ tick: t, counts, prey: preyCount(counts) });
        }
        if (t < ticks) {
            step(world, policy.brain, phases);
            feedPolicy(run, world);
        }
    }
    return rows;
}
