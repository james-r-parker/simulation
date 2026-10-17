// How `map-elites-v1` seeds new lineages (initial agents, floor spawns, immigrants): the least-populated
// specialisation, then a genome from the archive, a clone of one, or a random one.

import { occupiedCount, nextClone, selectParent } from '../../evo/archive.js';
import { GENOME_SPECS, rejectGenome } from '../../evo/genome.js';
import { SIGMA_START, mutateSigma, mutateWeights, randomWeights } from '../../evo/mutation.js';
import { nextFloat } from '../../sim/rng.js';
import { biologyOn } from '../../sim/traits.js';
import { rowOf } from './natural-birth.js';

/** Random seeding until the archive has this many occupied cells (all specialisations). */
export const MIN_ARCHIVE_CELLS = 10;
/** Below this draw, a mutated child of `selectParent`. */
export const ARCHIVE_SHARE = 0.5;
/** Below this draw (and from `ARCHIVE_SHARE` up), an unmutated clone from `nextClone`; the rest are random. */
export const CLONE_SHARE_END = 0.8;

/**
 * @param {Record<string, any>} world the world; `slot` is already allocated, so it is not counted
 * @param {number} slot the slot being seeded
 * @param {Int32Array} counts scratch, one entry per specialisation
 * @returns {number} the specialisation with the fewest alive agents, ties to the lowest index
 */
export function leastPopulatedSpec(world, slot, counts) {
    counts.fill(0);
    for (let i = 0; i < world.alive.length; i++) {
        if (world.alive[i] === 1 && i !== slot) {
            counts[world.spec[i]] += 1;
        }
    }
    let best = 0;
    for (let spec = 1; spec < counts.length; spec++) {
        best = counts[spec] < counts[best] ? spec : best;
    }
    return best;
}

/**
 * Draws the source of an immigrant's genome from `rng` (`brain-init`); no draw while the archive is thin.
 * @param {Record<string, any>} archive the archive
 * @param {number} spec the specialisation
 * @param {any} rng the `brain-init` stream
 * @param {number} cellDraws the parent cell tournament size (`selectParent`)
 * @returns {{source: 'archive' | 'clone' | 'random', ref: ReturnType<typeof selectParent>}} the source; `ref` is null for
 *   random, or when the specialisation has no genome to give
 */
function draw(archive, spec, rng, cellDraws) {
    if (occupiedCount(/** @type {any} */ (archive)) < MIN_ARCHIVE_CELLS) {
        return { source: 'random', ref: null };
    }
    const u = nextFloat(rng);
    if (u < ARCHIVE_SHARE) {
        const ref = selectParent(/** @type {any} */ (archive), spec, rng, cellDraws);
        return { source: ref === null ? 'random' : 'archive', ref };
    }
    if (u < CLONE_SHARE_END) {
        const ref = nextClone(/** @type {any} */ (archive), spec);
        return { source: ref === null ? 'random' : 'clone', ref };
    }
    return { source: 'random', ref: null };
}

/**
 * Refuses an archive row that does not fit the world's layout: logs `GenomeRejected`, then throws.
 * @param {Float32Array} row the archive genome's weights
 * @param {{weightCount: number}} layout the world's brain layout
 * @param {import('../../sim/log.js').SimLog | undefined} log the policy's log
 * @returns {void}
 */
function checkRow(row, layout, log) {
    if (row.length !== layout.weightCount) {
        rejectGenome(log, { field: 'weights.length', expected: layout.weightCount, actual: row.length });
    }
}

/**
 * @param {Record<string, any>} options `{ config, archive, birth, clones, log, cellDraws }`: the shared per-slot state in
 *   `birth.sigma` and `clones.isClone`, `clones.archiveRef`, `clones.refId`
 * @returns {{initSpec: Function, initBrain: Function}} the two seeding hooks
 */
export function createSeeder({ archive, birth, clones, log, cellDraws = 1 }) {
    const counts = new Int32Array(GENOME_SPECS.length);
    /** @type {(Float32Array | undefined)[]} */
    const own = [];

    function initSpec(/** @type {any} */ world, /** @type {number} */ slot) {
        return leastPopulatedSpec(world, slot, counts);
    }

    /** Writes the slot's row and sigma; a clone also records what it cloned. */
    function initBrain(/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) {
        const { layout } = world;
        const row = rowOf(own, world.weights, { slot, count: layout.weightCount });
        const { source, ref } = draw(archive, world.spec[slot], rng, cellDraws);
        clones.isClone[slot] = 0;
        clones.archiveRef[slot] = -1;
        clones.refId[slot] = 0;
        if (ref === null) {
            randomWeights(row, layout, rng);
            birth.sigma[slot] = SIGMA_START;
        } else if (source === 'archive') {
            checkRow(ref.row, layout, log);
            row.set(ref.row);
            birth.sigma[slot] = mutateSigma(ref.sigma, layout.weightCount, rng);
            mutateWeights(
                row,
                birth.sigma[slot],
                rng,
                biologyOn(world.config) ? layout.traitStart : layout.weightCount,
            );
        } else {
            checkRow(ref.row, layout, log);
            row.set(ref.row);
            birth.sigma[slot] = ref.sigma;
            clones.isClone[slot] = 1;
            clones.archiveRef[slot] = ref.archiveRef;
            clones.refId[slot] = ref.id;
        }
        log?.log('debug', 'ImmigrantSeeded', {
            spec: world.spec[slot],
            source,
            archiveRef: ref === null ? -1 : ref.archiveRef,
        });
    }

    return { initSpec, initBrain };
}
