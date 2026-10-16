// map-elites-v1: `natural-v1` plus the MAP-Elites archive. Mature agents that die are scored (`fitnessV1`) and
// offered to the archive cell of their specialisation and descriptors (speedMean x crowdingMean); initial agents,
// floor spawns and immigrants are seeded from the archive once it holds `MIN_ARCHIVE_CELLS` cells.
//
// The scorer is the eval observer (`options.observer`): it holds the speed samples and the energy counters that
// `fitnessV1` and the descriptors read. Without one the policy still runs, but never offers, so its archive stays
// empty and its immigrants are random. A run that must reproduce an eval (replay) therefore passes an observer,
// fed the same way the eval runner feeds it; it never changes the world, only the policy's own archive.

import { createArchive } from '../../evo/archive.js';
import { createFitnessV1 } from '../../evo/fitness.js';
import { createLifeCounters, updateLifeCounters } from '../../evo/life-counters.js';
import { createOffers } from './map-elites-offer.js';
import { createSeeder } from './map-elites-seed.js';
import { createBirth } from './natural-birth.js';
import { brainLayout } from '../../sim/brain-layout.js';

/**
 * Builds the map-elites-v1 policy object.
 * @param {Record<string, any>} options the eval runner's `{ config, log, observer }`
 * @returns {Record<string, any>} `{ name, brain, fitnessName, fitness, afterStep, onEvent, archive, sigma,
 *   fatherSigma, archiveRef, refId, isClone, counters }`
 */
export function createMapElitesV1(options) {
    const { config, log, observer } = options;
    const birth = createBirth(config);
    const counters = createLifeCounters(config);
    const archive = createArchive(brainLayout(config));
    const n = config.maxAgents;
    const clones = { isClone: new Uint8Array(n), archiveRef: new Int32Array(n).fill(-1), refId: new Float64Array(n) };
    const { initSpec, initBrain } = createSeeder({ archive, birth, clones, log });
    const { onDeath, onEvent } = createOffers({
        config,
        archive,
        observer,
        counters,
        clones,
        sigma: birth.sigma,
        log,
    });

    /** A child of a clone is an ordinary genome: its clone marks are cleared. */
    function childBrain(/** @type {any} */ world, /** @type {number} */ child, /** @type {any[]} */ ...rest) {
        birth.childBrain(world, child, ...rest);
        clones.isClone[child] = 0;
        clones.archiveRef[child] = -1;
        clones.refId[child] = 0;
    }

    return {
        name: 'map-elites-v1',
        brain: { initSpec, initBrain, onMate: birth.onMate, childBrain, onDeath },
        fitnessName: 'v1',
        fitness: createFitnessV1(counters),
        onEvent,
        afterStep: (/** @type {any} */ world) => updateLifeCounters(counters, world),
        archive,
        sigma: birth.sigma,
        fatherSigma: birth.fatherSigma,
        ...clones,
        counters,
    };
}
