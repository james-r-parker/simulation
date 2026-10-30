// map-elites-v1: the engine of the MAP-Elites policies (`map-elites-v6` is built on it, and is the only registered
// one): the birth half plus the archive. Mature agents that die are scored (`fitnessV1` unless a variant brings its own
// scoring) and offered to the archive cell of their specialisation and descriptors (speedMean x crowdingMean); initial agents,
// floor spawns and immigrants are seeded from the archive once it holds `MIN_ARCHIVE_CELLS` cells.
//
// The scorer is the eval observer (`options.observer`): it holds the speed samples and the energy counters that
// `fitnessV1` and the descriptors read. Without one the policy still runs, but never offers, so its archive stays
// empty and its immigrants are random. A run that must reproduce an eval (replay) therefore passes an observer,
// fed the same way the eval runner feeds it; it never changes the world, only the policy's own archive.

import { createArchive } from '../../evo/archive.js';
import { descriptorV1 } from '../../evo/descriptors.js';
import { createFitnessV1 } from '../../evo/fitness.js';
import { createLifeCounters, updateLifeCounters } from '../../evo/life-counters.js';
import { createOffers } from './map-elites-offer.js';
import { createSeeder } from './map-elites-seed.js';
import { createBirth, shareBirth } from './natural-birth.js';
import { brainLayout } from '../../sim/brain-layout.js';

/** the parent cell tournament of `map-elites-v6`: the best elite of this many uniform cell draws. */
export const QUALITY_CELL_DRAWS = 4;

/**
 * @param {number} n `maxAgents`
 * @returns {{isClone: Uint8Array, archiveRef: Int32Array, refId: Float64Array, fromArchive: Uint8Array}} per-slot marks
 *   of where an entrant's genome came from
 */
function createClones(n) {
    return {
        isClone: new Uint8Array(n),
        archiveRef: new Int32Array(n).fill(-1),
        refId: new Float64Array(n),
        fromArchive: new Uint8Array(n),
    };
}

/**
 * Clears a slot's marks: its genome is an ordinary one.
 * @param {ReturnType<typeof createClones>} clones the per-slot marks
 * @param {number} slot the slot
 * @returns {void}
 */
function clearClone(clones, slot) {
    clones.isClone[slot] = 0;
    clones.archiveRef[slot] = -1;
    clones.refId[slot] = 0;
    clones.fromArchive[slot] = 0;
}

/** The `v1` scoring: `fitnessV1` and no extra fields on `FitnessScored`. */
const V1_SCORING = Object.freeze({
    fitnessName: 'v1',
    descriptor: descriptorV1,
    createScoring: (/** @type {Record<string, any>} */ { counters }) => ({ fitness: createFitnessV1(counters) }),
});

/**
 * Builds the map-elites-v1 policy object; the policies that differ only in their fitness, descriptor or immigrant mix
 * (`map-elites-v6`) are built from it.
 * @param {Record<string, any>} options the eval runner's `{ config, log, observer }`, plus for a variant `name`,
 *   `cellDraws`, `archiveShare`, `cloneShareEnd` (the immigrant mix of `createSeeder`) and `scoring`:
 *   `{ fitnessName, descriptor, createScoring({ counters, observer, log }) }`, where `createScoring` returns `{ fitness,
 *   scoreFields }` and `scoreFields(row)` adds fields to the `FitnessScored` log event of the death-log row
 * @returns {Record<string, any>} `{ name, brain, fitnessName, fitness, afterStep, onEvent, archive, sigma,
 *   fatherSigma, archiveRef, refId, isClone, counters }`
 */
export function createMapElitesV1(options) {
    const { config, log, observer } = options;
    const birth = createBirth(config);
    const counters = createLifeCounters(config);
    const scoring = options.scoring ?? V1_SCORING;
    const archive = createArchive(brainLayout(config), { descriptor: scoring.descriptor });
    const clones = createClones(config.maxAgents);
    if (observer !== undefined) {
        // The brain metrics read the step sizes (the silent inputs a birth decays come from the world's input-activity sample).
        shareBirth(observer, birth);
        // An entrant is in the archive lineage when its genome came from the archive or a clone of one.
        observer.archiveDraw = (/** @type {number} */ slot) => clones.fromArchive[slot] === 1;
    }
    const { cellDraws, archiveShare, cloneShareEnd } = options;
    const { initSpec, initBrain } = createSeeder({
        archive,
        birth,
        clones,
        log,
        cellDraws,
        archiveShare,
        cloneShareEnd,
    });
    const { fitness, scoreFields } = scoring.createScoring({ counters, observer, log });
    const { onDeath, onEvent } = createOffers({
        config,
        archive,
        observer,
        counters,
        clones,
        sigma: birth.sigma,
        log,
        scoreFields,
    });

    /** A child of a clone is an ordinary genome: its clone marks are cleared. */
    function childBrain(/** @type {any} */ world, /** @type {number} */ child, /** @type {any[]} */ ...rest) {
        birth.childBrain(world, child, ...rest);
        clearClone(clones, child);
    }

    return {
        name: options.name ?? 'map-elites-v1',
        brain: { initSpec, initBrain, onMate: birth.onMate, childBrain, onDeath },
        fitnessName: scoring.fitnessName,
        fitness,
        onEvent,
        afterStep: (/** @type {any} */ world) => updateLifeCounters(counters, world),
        archive,
        sigma: birth.sigma,
        fatherSigma: birth.fatherSigma,
        ...clones,
        counters,
    };
}
